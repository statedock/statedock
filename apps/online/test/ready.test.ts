import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { createDatabase } from "../../../packages/db/dist/index.js";
import { StateDockService } from "@statedock/core";
import { D1Repository } from "../src/repository.js";
import { fixture } from "./fixture.js";
const actor = { id: "one", type: "agent" as const };

test("Ready queue excludes ideas, preserves project isolation and supports demotion", async () => {
  const f = await fixture();
  try {
    const repo = new D1Repository(f.db, "one");
    const service = new StateDockService(repo);
    const a = await repo.createProject({ slug: "ready-a", name: "A" }, actor);
    const b = await repo.createProject({ slug: "ready-b", name: "B" }, actor);
    const idea = await service.createPlan(a.id, { title: "Undecided" }, actor);
    const ready = await service.createPlan(a.id, { title: "Approved", status: "READY" }, actor);
    const other = await service.createPlan(
      b.id,
      { title: "Other project", status: "READY" },
      actor,
    );
    const ctx = await service.resumeProject(a.id);
    assert.equal(ctx.nextPendingTasks[0].reference, ready.reference);
    assert.equal(ctx.plannedIdeas[0].reference, idea.reference);
    assert.equal((await service.claimNextTask(a.id, actor))?.id, ready.id);
    assert.equal(await service.claimNextTask(a.id, actor), null);
    assert.equal((await repo.getPlan(b.id, other.number)).status, "READY");
    await repo.updatePlan(a.id, idea.number, { status: "READY" }, actor);
    await repo.updatePlan(a.id, idea.number, { status: "PLAN" }, actor);
    assert.equal(await service.claimNextTask(a.id, actor), null);
    // Moving an Inbox idea changes only its project, not its execution authorization.
    const moved = await service.movePlan({ reference: idea.reference }, b.id, actor);
    assert.equal(moved.status, "PLAN");
  } finally {
    f.client.close();
  }
});

test("Ready migration preserves populated attachments, feedback, events", async () => {
  const { client } = createDatabase("file::memory:");
  try {
    await client.execute("PRAGMA foreign_keys=ON");
    for (const name of readdirSync(new URL("../migrations/", import.meta.url)).sort()) {
      if (name === "0021_ready_tasks.sql") continue;
      await client.executeMultiple(
        readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8"),
      );
    }
    await client.execute(
      "INSERT INTO users(id,email,created_at) VALUES('one','one@example.test','now')",
    );
    await client.execute(
      "INSERT INTO projects(id,owner_id,slug,name,created_at,updated_at) VALUES('p','one','p','P','now','now')",
    );
    await client.execute(
      "INSERT INTO plans(id,project_id,number,global_number,title,status,created_at,updated_at) VALUES('t','p',1,1,'Idea','PLAN','now','now')",
    );
    await client.execute(
      "INSERT INTO attachments(id,plan_id,name,mime_type,size,object_key,created_at) VALUES('a','t','screen.png','image/png',1,'private/object','now')",
    );
    await client.execute(
      "INSERT INTO task_entries(id,plan_id,kind,content,actor_id,actor_type,created_at) VALUES('f','t','feedback','Keep me','one','human','now')",
    );
    const events = (await client.execute("SELECT * FROM plan_events")).rows;
    await client.executeMultiple(
      readFileSync(new URL("../migrations/0021_ready_tasks.sql", import.meta.url), "utf8"),
    );
    assert.equal((await client.execute("SELECT status FROM plans")).rows[0].status, "PLAN");
    assert.equal(
      (await client.execute("SELECT object_key FROM attachments")).rows[0].object_key,
      "private/object",
    );
    assert.equal(
      (await client.execute("SELECT content FROM task_entries")).rows[0].content,
      "Keep me",
    );
    assert.deepEqual((await client.execute("SELECT * FROM plan_events")).rows, events);
    assert.equal((await client.execute("PRAGMA foreign_key_check")).rows.length, 0);
    await client.execute("UPDATE plans SET status='READY',updated_at='later' WHERE id='t'");
    assert.deepEqual((await client.execute("SELECT * FROM plan_events")).rows, events);
    await client.execute("UPDATE plans SET status='WORKING' WHERE id='t'");
    assert.equal(
      (await client.execute("SELECT kind FROM plan_events ORDER BY sequence DESC LIMIT 1")).rows[0]
        .kind,
      "started",
    );
    await assert.rejects(client.execute("DELETE FROM task_entries WHERE id='f'"));
    await assert.rejects(client.execute("UPDATE plans SET global_number=2 WHERE id='t'"));
  } finally {
    client.close();
  }
});
