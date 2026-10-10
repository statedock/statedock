import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase } from "../../../packages/db/dist/index.js";
import handler, { app } from "../src/index.js";
import { fixture } from "./fixture.js";
import { canRegister } from "../src/instance-admin-service.js";
import { type OnlineEnv } from "../src/auth.js";

async function setup() {
  const f = await fixture();
  const messages: { to: string; text: string }[] = [];
  const env = {
    DB: f.db,
    ATTACHMENTS: f.bucket,
    OAUTH_KV: f.oauthKv,
    APP_ENV: "test",
    PUBLIC_BASE_URL: "https://dock.example.test",
    OWNER_EMAIL: "one@example.test",
    SESSION_SECRET: "isolated-admission-tests",
    EMAIL_FROM: "noreply@example.test",
    EMAIL: {
      send: async (m: any) => {
        messages.push(m);
        return { messageId: "fixture" };
      },
    },
    ASSETS: { fetch: async () => new Response("asset") },
  } as OnlineEnv;
  const req = (path: string, method = "GET", data?: unknown, cookie?: string, ip = "192.0.2.1") =>
    app.request(
      `https://dock.example.test${path}`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": ip,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      },
      env,
    );
  async function signIn(email = "one@example.test") {
    const before = messages.length;
    assert.equal((await req("/api/auth/request-code", "POST", { email })).status, 200);
    assert.equal(messages.length, before + 1);
    const code = /code is (\d{6})/.exec(messages.at(-1)!.text)![1];
    const response = await req("/api/auth/verify-code", "POST", { email, code });
    assert.equal(response.status, 200);
    return response.headers.get("Set-Cookie")!.split(";")[0];
  }
  return { ...f, env, messages, req, signIn };
}

test("A approves B; B cannot admit C through projects; only A can approve C", async () => {
  const f = await setup();
  try {
    const a = await f.signIn();
    assert.equal(
      (await f.req("/api/admin/users", "POST", { email: "b@example.test" }, a)).status,
      201,
    );
    const b = await f.signIn("b@example.test");
    const { data: pa } = (await (
      await f.req("/api/projects", "POST", { slug: "private-a", name: "Private A" }, a)
    ).json()) as any;
    const { data: pb } = (await (
      await f.req("/api/projects", "POST", { slug: "private-b", name: "Private B" }, b)
    ).json()) as any;
    assert.equal((await f.req(`/api/projects/${pa.id}/plans`, "GET", undefined, b)).status, 404);
    assert.deepEqual(
      ((await (await f.req("/api/projects", "GET", undefined, a)).json()) as any).data.map(
        (p: any) => p.id,
      ),
      [pa.id],
    );
    assert.equal(
      (await f.req(`/api/projects/${pb.id}/members`, "POST", { email: "c@example.test" }, b))
        .status,
      403,
    );
    assert.equal(
      (await f.client.execute("SELECT id FROM users WHERE email='c@example.test'")).rows.length,
      0,
    );
    assert.equal(
      (await f.req("/api/admin/users", "POST", { email: "c@example.test" }, b)).status,
      403,
    );
    assert.equal(
      (await f.req(`/api/projects/${pa.id}/members`, "POST", { email: "b@example.test" }, a))
        .status,
      201,
    );
    assert.equal(
      (await f.req(`/api/projects/${pa.id}/members`, "POST", { email: "c@example.test" }, b))
        .status,
      403,
    );
    // An account left over from old project invitations is not sufficient admission.
    await f.client.execute(
      "INSERT INTO users(id,email,created_at) VALUES('pending-c','c@example.test','now')",
    );
    assert.equal(await canRegister(f.env, "c@example.test"), false);
    assert.equal(
      (await f.req(`/api/projects/${pb.id}/members`, "POST", { email: "c@example.test" }, b))
        .status,
      403,
    );
    assert.equal(
      (await f.req("/api/admin/users", "POST", { email: "c@example.test" }, a)).status,
      201,
    );
    assert.equal(await canRegister(f.env, "c@example.test"), true);
    assert.equal(
      (await f.req(`/api/projects/${pb.id}/members`, "POST", { email: "c@example.test" }, b))
        .status,
      201,
    );
    const c = await f.signIn("c@example.test");
    const { data: pc } = (await (
      await f.req("/api/projects", "POST", { slug: "private-c", name: "Private C" }, c)
    ).json()) as any;
    assert.equal(
      (await f.req(`/api/projects/${pc.id}/members`, "POST", { email: "d@example.test" }, c))
        .status,
      403,
    );
    assert.equal(
      (await f.client.execute("SELECT id FROM users WHERE email='d@example.test'")).rows.length,
      0,
    );
    assert.equal(
      (await f.req(`/api/projects/${pb.id}/members/pending-c`, "DELETE", undefined, a)).status,
      403,
    );
    assert.equal((await f.req(`/api/projects/${pb.id}`, "DELETE", undefined, a)).status, 404);
    assert.equal((await f.req(`/api/projects/${pb.id}/plans`, "GET", undefined, a)).status, 404);
    const { data: key } = (await (
      await f.req("/api/auth/mcp-clients", "POST", { name: "B agent" }, b)
    ).json()) as any;
    const user = (await f.client.execute("SELECT id FROM users WHERE email='b@example.test'"))
      .rows[0];
    assert.equal(
      (await f.req(`/api/admin/users/${user.id}`, "PUT", { disabled: true }, a)).status,
      200,
    );
    assert.equal((await f.req("/api/projects", "GET", undefined, b)).status, 401);
    assert.equal(await canRegister(f.env, "b@example.test"), false);
    const mcp = await handler.fetch(
      new Request("https://dock.example.test/mcp", {
        method: "POST",
        headers: { Authorization: `Bearer ${key.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      f.env,
      { waitUntil() {}, passThroughOnException() {} } as any,
    );
    assert.equal(mcp.status, 401);
    assert.equal(
      (await f.req(`/api/projects/${pa.id}/members`, "POST", { email: "b@example.test" }, a))
        .status,
      403,
    );
  } finally {
    f.client.close();
  }
});

test("public registration stays closed despite legacy configuration; denied emails create no account or code", async () => {
  const f = await setup();
  try {
    const a = await f.signIn();
    (f.env as any).REGISTRATION_MODE = "open";
    await f.client.execute(
      "INSERT INTO instance_settings(key,value) VALUES('registration_mode','open')",
    );
    assert.equal(
      (await f.req("/api/admin/instance", "PUT", { registrationMode: "open" }, a)).status,
      403,
    );
    assert.equal(
      ((await (await f.req("/api/admin/instance", "GET", undefined, a)).json()) as any).data
        .registrationMode,
      "invite",
    );
    assert.equal(await canRegister(f.env, "stranger@example.test"), false);
    const before = f.messages.length;
    const denied = await f.req("/api/auth/request-code", "POST", {
      email: "stranger@example.test",
    });
    assert.equal(denied.status, 200);
    assert.equal(denied.headers.get("Cache-Control"), "no-store");
    const approved = await f.req("/api/auth/request-code", "POST", { email: "two@example.test" });
    assert.equal(approved.status, 200);
    assert.deepEqual(
      Object.keys(((await denied.json()) as any).data),
      Object.keys(((await approved.json()) as any).data),
    );
    assert.equal(f.messages.length, before + 1);
    assert.equal(
      (await f.client.execute("SELECT id FROM users WHERE email='stranger@example.test'")).rows
        .length,
      0,
    );
    assert.equal(
      (await f.client.execute("SELECT id FROM login_codes WHERE email='stranger@example.test'"))
        .rows.length,
      0,
    );
    assert.equal(
      (
        await f.req("/api/auth/verify-code", "POST", {
          email: "stranger@example.test",
          code: "123456",
        })
      ).status,
      400,
    );
    assert.equal(
      (await f.req("/oauth/authorize?client_id=missing")).headers.has("Set-Cookie"),
      false,
    );
  } finally {
    f.client.close();
  }
});

test("code request limits apply equally to unknown emails and atomically to concurrent approved requests", async () => {
  const f = await setup();
  try {
    const a = await f.signIn();
    await f.req("/api/admin/users", "POST", { email: "approved@example.test" }, a);
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        f.req("/api/auth/request-code", "POST", { email: "approved@example.test" }),
      ),
    );
    assert.equal(responses.filter((r) => r.status === 200).length, 3);
    assert.equal(responses.filter((r) => r.status === 429).length, 5);
    assert.equal(f.messages.filter((m) => m.to === "approved@example.test").length, 3);
    for (let i = 0; i < 3; i++)
      assert.equal(
        (await f.req("/api/auth/request-code", "POST", { email: "unknown@example.test" })).status,
        200,
      );
    const limited = await f.req("/api/auth/request-code", "POST", {
      email: "unknown@example.test",
    });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "900");
    // Source-IP limits stop rotating email addresses from evading the delivery endpoint limit.
    for (let i = 0; i < 30; i++)
      assert.equal(
        (
          await f.req(
            "/api/auth/request-code",
            "POST",
            { email: `unknown-${i}@example.test` },
            undefined,
            "192.0.2.2",
          )
        ).status,
        200,
      );
    assert.equal(
      (
        await f.req(
          "/api/auth/request-code",
          "POST",
          { email: "next@example.test" },
          undefined,
          "192.0.2.2",
        )
      ).status,
      429,
    );
  } finally {
    f.client.close();
  }
});

test("wrong, expired, consumed and over-attempt codes cannot sign in", async () => {
  const f = await setup();
  try {
    await f.req("/api/auth/request-code", "POST", { email: "one@example.test" });
    const code = /code is (\d{6})/.exec(f.messages.at(-1)!.text)![1];
    const wrong = code === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await f.req("/api/auth/verify-code", "POST", { email: "one@example.test", code: wrong }))
          .status,
        400,
      );
    assert.equal(
      (await f.req("/api/auth/verify-code", "POST", { email: "one@example.test", code })).status,
      400,
    );
    assert.equal(await canRegister(f.env, "two@example.test"), false);
    await f.req("/api/auth/request-code", "POST", { email: "one@example.test" });
    const expired = /code is (\d{6})/.exec(f.messages.at(-1)!.text)![1];
    await f.client.execute("UPDATE login_codes SET expires_at='2000-01-01T00:00:00.000Z'");
    assert.equal(
      (await f.req("/api/auth/verify-code", "POST", { email: "one@example.test", code: expired }))
        .status,
      400,
    );
    await f.req("/api/auth/request-code", "POST", { email: "one@example.test" });
    const valid = /code is (\d{6})/.exec(f.messages.at(-1)!.text)![1];
    assert.equal(
      (await f.req("/api/auth/verify-code", "POST", { email: "one@example.test", code: valid }))
        .status,
      200,
    );
    assert.equal(
      (await f.req("/api/auth/verify-code", "POST", { email: "one@example.test", code: valid }))
        .status,
      400,
    );
  } finally {
    f.client.close();
  }
});

test("upgrade approves only the saved administrator and users invited by that administrator", async () => {
  const { client } = createDatabase("file::memory:");
  try {
    const root = new URL("../migrations/", import.meta.url);
    for (const name of readdirSync(root)
      .sort()
      .filter((n) => n < "0020"))
      await client.executeMultiple(readFileSync(new URL(name, root), "utf8"));
    await client.executeMultiple(
      "INSERT INTO users(id,email,created_at) VALUES('a','a@example.test','now'),('b','b@example.test','now'),('c','c@example.test','now'); INSERT INTO instance_settings(key,value) VALUES('admin_user_id','a'); INSERT INTO admin_events(id,actor_id,action,subject_id,created_at) VALUES('event-a','a','user.invited','b@example.test','now'),('event-b','b','user.invited','c@example.test','now');",
    );
    await client.executeMultiple(
      readFileSync(new URL("0020_instance_admission.sql", root), "utf8"),
    );
    const rows = await client.execute("SELECT id,instance_approved_at FROM users ORDER BY id");
    assert.deepEqual(
      rows.rows.map((r) => [r.id, Boolean(r.instance_approved_at)]),
      [
        ["a", true],
        ["b", true],
        ["c", false],
      ],
    );
  } finally {
    client.close();
  }
});
