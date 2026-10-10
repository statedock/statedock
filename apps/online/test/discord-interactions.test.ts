import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase } from "../../../packages/db/dist/index.js";
import {
  verifyDiscordSignature,
  handleDiscordInteraction,
} from "../src/discord-interactions.js";
import { D1Repository } from "../src/repository.js";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fixture() {
  const { client } = createDatabase("file::memory:");
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).sort()) {
    await client.executeMultiple(
      readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8")
    );
  }
  function prepare(sql: string) {
    let args: any[] = [];
    const execute = () => client.execute({ sql, args });
    return {
      bind(...v: any[]) {
        args = v;
        return this;
      },
      async first() {
        return (await execute()).rows[0] ?? null;
      },
      async all() {
        return { results: (await execute()).rows };
      },
      async run() {
        const r = await execute();
        return { success: true, meta: { changes: r.rowsAffected }, results: r.rows };
      },
    };
  }
  const db = {
    prepare,
    async batch(items: any[]) {
      return Promise.all(items.map((i) => i.run()));
    },
  } as any;
  await client.execute(
    "INSERT INTO users(id,email,created_at,instance_approved_at) VALUES('one','one@example.test','now','now'),('two','two@example.test','now','now')"
  );
  return { client, db };
}

test("verifyDiscordSignature validates Ed25519 signatures", async () => {
  const keyPair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  const rawPub = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const pubHex = bytesToHex(new Uint8Array(rawPub));

  const timestamp = "1728420000";
  const body = JSON.stringify({ type: 1 });
  const data = new TextEncoder().encode(timestamp + body);

  const sig = await crypto.subtle.sign("Ed25519", keyPair.privateKey, data);
  const sigHex = bytesToHex(new Uint8Array(sig));

  const valid = await verifyDiscordSignature(pubHex, sigHex, timestamp, body);
  assert.equal(valid, true);

  const invalid = await verifyDiscordSignature(pubHex, sigHex, timestamp, body + "tampered");
  assert.equal(invalid, false);
});

test("Discord interaction handles PING, linking, and slash commands", async () => {
  const f = await fixture();
  const repoFactory = (env: any, userId: string) => new D1Repository(env.DB, userId);

  try {
    const env = { DB: f.db } as any;

    // 1. PING -> PONG
    const pingRes = await handleDiscordInteraction(env, { id: "1", type: 1, token: "t1" }, repoFactory);
    assert.equal(pingRes.type, 1);

    // 2. Unbound user trying /todo
    const unboundRes = await handleDiscordInteraction(
      env,
      {
        id: "2",
        type: 2,
        token: "t2",
        data: { id: "c1", name: "todo" },
        user: { id: "discord-user-1", username: "tester" },
      },
      repoFactory
    );
    assert.equal(unboundRes.type, 4);
    assert.match(unboundRes.data?.content ?? "", /尚未绑定 StateDock 账号/);

    // 3. Link account with token
    const tokenExpires = new Date(Date.now() + 10 * 60_000).toISOString();
    const tokenCreated = new Date().toISOString();
    await f.client.execute({
      sql: "INSERT INTO discord_link_tokens(token, user_id, expires_at, created_at) VALUES('valid-token-123', 'one', ?, ?)",
      args: [tokenExpires, tokenCreated],
    });

    const linkRes = await handleDiscordInteraction(
      env,
      {
        id: "3",
        type: 2,
        token: "t3",
        data: {
          id: "c2",
          name: "link",
          options: [{ name: "token", value: "valid-token-123", type: 3 }],
        },
        user: { id: "discord-user-1", username: "tester" },
      },
      repoFactory
    );
    assert.equal(linkRes.type, 4);
    assert.match(linkRes.data?.embeds?.[0]?.title ?? "", /绑定成功/);

    // Check token was consumed
    const tokenCheck = await f.client.execute("SELECT * FROM discord_link_tokens WHERE token='valid-token-123'");
    assert.equal(tokenCheck.rows.length, 0);

    // 4. Create a project and test /projects
    await f.client.execute(
      "INSERT INTO projects(id, owner_id, slug, name, local_path, created_at, updated_at) VALUES('p1', 'one', 'app', 'Mobile App', '/tmp/app', 'now', 'now')"
    );

    const projectsRes = await handleDiscordInteraction(
      env,
      {
        id: "4",
        type: 2,
        token: "t4",
        data: { id: "c3", name: "projects" },
        user: { id: "discord-user-1", username: "tester" },
      },
      repoFactory
    );
    assert.equal(projectsRes.type, 4);
    assert.match(projectsRes.data?.embeds?.[0]?.description ?? "", /Mobile App/);

    // 5. Test /plan to create a new idea
    const planRes = await handleDiscordInteraction(
      env,
      {
        id: "5",
        type: 2,
        token: "t5",
        data: {
          id: "c4",
          name: "plan",
          options: [
            { name: "content", value: "Support Dark Mode in settings\nDetails about colors", type: 3 },
          ],
        },
        user: { id: "discord-user-1", username: "tester" },
      },
      repoFactory
    );
    assert.equal(planRes.type, 4);
    assert.match(planRes.data?.embeds?.[0]?.title ?? "", /已记录新想法 #1/);
    assert.match(planRes.data?.embeds?.[0]?.description ?? "", /Support Dark Mode/);

    // 6. Test /todo to query PLAN tasks
    const todoRes = await handleDiscordInteraction(
      env,
      {
        id: "6",
        type: 2,
        token: "t6",
        data: { id: "c5", name: "todo" },
        user: { id: "discord-user-1", username: "tester" },
      },
      repoFactory
    );
    assert.equal(todoRes.type, 4);
    assert.match(todoRes.data?.embeds?.[0]?.description ?? "", /#1.*Support Dark Mode/);

    // 7. Update status to WORKING and test /doing
    await f.client.execute("UPDATE plans SET status='WORKING' WHERE number=1");
    const doingRes = await handleDiscordInteraction(
      env,
      {
        id: "7",
        type: 2,
        token: "t7",
        data: { id: "c6", name: "doing" },
        user: { id: "discord-user-1", username: "tester" },
      },
      repoFactory
    );
    assert.equal(doingRes.type, 4);
    assert.match(doingRes.data?.embeds?.[0]?.description ?? "", /#1.*Support Dark Mode/);

    // 8. Test /unlink
    const unlinkRes = await handleDiscordInteraction(
      env,
      {
        id: "8",
        type: 2,
        token: "t8",
        data: { id: "c7", name: "unlink" },
        user: { id: "discord-user-1", username: "tester" },
      },
      repoFactory
    );
    assert.equal(unlinkRes.type, 4);
    assert.match(unlinkRes.data?.content ?? "", /已成功解除/);

    const subCheck = await f.client.execute("SELECT * FROM discord_subscribers WHERE discord_user_id='discord-user-1'");
    assert.equal(subCheck.rows.length, 0);
  } finally {
    f.client.close();
  }
});
