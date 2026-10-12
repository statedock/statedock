import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase } from "../../../packages/db/dist/index.js";
import { readyQueueClaim, readyQueuePredicate } from "../../../packages/core/src/agent-queue.js";
import { fixture } from "./fixture.js";

test("Agent migration preserves legacy credentials, tasks, attachments and history", async () => {
  const { client } = createDatabase("file::memory:");
  try {
    await client.execute("PRAGMA foreign_keys=ON");
    for (const file of readdirSync(new URL("../migrations/", import.meta.url)).sort()) {
      if (file >= "0024_agent_assignment.sql") continue;
      await client.executeMultiple(
        readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
      );
    }
    await client.execute(
      "INSERT INTO users(id,email,created_at) VALUES('one','one@example.test','now')",
    );
    await client.execute(
      "INSERT INTO projects(id,owner_id,slug,name,created_at,updated_at) VALUES('p','one','p','P','now','now')",
    );
    await client.execute(
      "INSERT INTO plans(id,project_id,number,global_number,title,status,created_at,updated_at) VALUES('t','p',1,1,'Ready','READY','now','now')",
    );
    await client.execute(
      "INSERT INTO mcp_clients(id,user_id,name,token_hash,token_prefix,created_at) VALUES('key','one','Codex','hash','prefix','now')",
    );
    await client.execute(
      "INSERT INTO attachments VALUES('a','t','image.png','image/png',1,'private/key','now')",
    );
    await client.execute(
      "INSERT INTO task_entries(id,plan_id,kind,content,actor_id,actor_type,created_at) VALUES('e','t','feedback','Keep me','one','human','now')",
    );
    const events = (await client.execute("SELECT * FROM plan_events")).rows;
    await client.executeMultiple(
      readFileSync(new URL("../migrations/0024_agent_assignment.sql", import.meta.url), "utf8"),
    );
    assert.equal((await client.execute("SELECT agent_id FROM mcp_clients")).rows[0].agent_id, null);
    assert.equal(
      (await client.execute("SELECT assigned_agent_id FROM plans")).rows[0].assigned_agent_id,
      null,
    );
    assert.equal(
      (await client.execute("SELECT object_key FROM attachments")).rows[0].object_key,
      "private/key",
    );
    assert.equal(
      (await client.execute("SELECT content FROM task_entries")).rows[0].content,
      "Keep me",
    );
    assert.deepEqual((await client.execute("SELECT * FROM plan_events")).rows, events);
    assert.equal((await client.execute("PRAGMA foreign_key_check")).rows.length, 0);
  } finally {
    client.close();
  }
});

test("legacy credentials cannot select any queue; mode cannot broaden scope", () => {
  for (const mode of ["mine", "unassigned"] as const)
    assert.throws(() => readyQueuePredicate({ userId: "one", agentId: null }, mode), /Bind/);
  assert.throws(() => readyQueuePredicate({ userId: "one", agentId: "codex" }, "all" as any));
});

test("atomic claims isolate agents, unassigned tasks, projects and account permissions", async () => {
  const f = await fixture();
  try {
    await f.client.execute("PRAGMA foreign_keys=ON");
    await f.client.execute(
      "INSERT INTO agent_profiles(id,user_id,name,created_at) VALUES('codex','one','Codex','now'),('deepseek','one','DeepSeek','now'),('foreign','two','Other','now')",
    );
    await f.client.execute(
      "INSERT INTO projects(id,owner_id,slug,name,created_at,updated_at) VALUES('p','one','p','P','now','now'),('private','two','private','Private','now','now')",
    );
    for (const [id, number, assignee, project, status] of [
      ["a", 1, "codex", "p", "READY"],
      ["b", 2, "deepseek", "p", "READY"],
      ["c", 3, "codex", "p", "READY"],
      ["d", 4, null, "p", "READY"],
      ["idea", 5, "codex", "p", "PLAN"],
      ["private-task", 1, "foreign", "private", "READY"],
    ] as const)
      await f.client.execute({
        sql: "INSERT INTO plans(id,project_id,number,global_number,title,status,assigned_agent_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'now','now')",
        args: [id, project, number, id === "private-task" ? 6 : number, id, status, assignee],
      });
    const claim = async (
      agentId: string,
      projectId = "p",
      mode: "mine" | "unassigned" = "mine",
      userId = "one",
    ) => {
      const query = readyQueueClaim(projectId, { userId, agentId }, new Date().toISOString(), mode);
      return (await f.client.execute({ sql: query.sql, args: query.bindings })).rows;
    };
    const concurrent = await Promise.all([claim("codex"), claim("codex")]);
    assert.deepEqual(
      concurrent
        .flat()
        .map((r) => r.id)
        .sort(),
      ["a", "c"],
    );
    assert.equal((await claim("codex")).length, 0);
    assert.equal((await claim("deepseek"))[0].id, "b");
    assert.equal((await claim("codex", "private")).length, 0);
    assert.equal((await claim("codex", "p", "unassigned", "two")).length, 0);
    assert.equal(
      (await f.client.execute("SELECT status FROM plans WHERE id='d'")).rows[0].status,
      "READY",
    );
    const unassigned = (await claim("codex", "p", "unassigned"))[0];
    assert.equal(unassigned.id, "d");
    assert.equal(unassigned.claimed_agent_id, "codex");
    assert.equal(
      (await f.client.execute("SELECT status FROM plans WHERE id='idea'")).rows[0].status,
      "PLAN",
    );
    // A human explicitly returns a task to Ready and changes its assignment.
    await f.client.execute(
      "UPDATE plans SET status='READY',assigned_agent_id='deepseek',claimed_agent_id=NULL WHERE id='a'",
    );
    assert.equal((await claim("codex")).length, 0);
    assert.equal((await claim("deepseek"))[0].id, "a");
    assert.equal((await f.client.execute("PRAGMA foreign_key_check")).rows.length, 0);
  } finally {
    f.client.close();
  }
});

test("multiple credentials retain profile identity and cannot bind another account's profile", async () => {
  const f = await fixture();
  try {
    await f.client.execute(
      "INSERT INTO agent_profiles(id,user_id,name,created_at) VALUES('codex','one','Codex','now'),('foreign','two','Other','now')",
    );
    for (const token of ["old", "rotated"])
      await f.client.execute({
        sql: "INSERT INTO mcp_clients(id,user_id,name,token_hash,token_prefix,created_at,agent_id) VALUES(?,'one','Display label',?,?,'now','codex')",
        args: [token, token, token],
      });
    await assert.rejects(
      f.client.execute("UPDATE mcp_clients SET agent_id='foreign' WHERE id='old'"),
    );
    await assert.rejects(
      f.client.execute("UPDATE agent_profiles SET user_id='two' WHERE id='codex'"),
    );
    assert.equal(
      (await f.client.execute("SELECT DISTINCT agent_id FROM mcp_clients")).rows.length,
      1,
    );
  } finally {
    f.client.close();
  }
});
