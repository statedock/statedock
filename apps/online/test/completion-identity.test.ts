import assert from "node:assert/strict";
import test from "node:test";
import { D1Repository } from "../src/repository.js";
import { fixture } from "./fixture.js";
const human = { id: "one", type: "human" as const, name: "User One" };
test("completion reflects the last explicit DONE actor, preserves identity history and respects task access", async () => {
  const f = await fixture();
  try {
    await f.client.execute(
      "INSERT INTO agent_profiles(id,user_id,name,created_at) VALUES('codex','one','Codex','now'),('harness','one','Harness','now')",
    );
    const repo = new D1Repository(f.db, "one");
    const p = await repo.createProject({ slug: "completion", name: "Completion" }, human);
    const task = await repo.createPlan(p.id, { title: "Example", status: "WORKING" }, human);
    const codex = {
      id: "agent:codex",
      agentId: "codex",
      type: "agent" as const,
      name: "Token display label",
    };
    await repo.updatePlan(p.id, task.number, { status: "DONE" }, codex);
    let done = await repo.getPlan(p.id, task.number);
    assert.equal(done.completedBy?.agentId, "codex");
    assert.equal(done.completedBy?.name, "Codex");
    await repo.updatePlan(
      p.id,
      task.number,
      { summary: "Edited without setting status", status: "DONE" },
      human,
    );
    assert.equal((await repo.getPlan(p.id, task.number)).completedBy?.agentId, "codex");
    await repo.updatePlan(p.id, task.number, { status: "READY" }, human);
    await repo.updatePlan(p.id, task.number, { status: "DONE" }, human);
    assert.equal((await repo.getPlan(p.id, task.number)).completedBy?.id, "one");
    await repo.updatePlan(p.id, task.number, { status: "READY" }, human);
    assert.equal((await repo.getPlan(p.id, task.number)).completedBy, undefined);
    await repo.updatePlan(
      p.id,
      task.number,
      { status: "DONE" },
      { ...codex, id: "agent:harness", agentId: "harness" },
    );
    await f.client.execute("UPDATE agent_profiles SET deleted_at='later' WHERE id='harness'");
    done = (await repo.listPlans(p.id))[0];
    assert.equal(done.completedBy?.name, "Harness");
    assert.equal(done.completedBy?.agentId, "harness");
    assert.ok(done.completedAt);
    const createdDone = await repo.createPlan(
      p.id,
      { title: "Created done", status: "DONE" },
      human,
    );
    assert.equal(createdDone.completedBy?.id, "one");
    await f.client.execute({
      sql: "INSERT INTO plans(id,project_id,number,global_number,title,status,created_at,updated_at) VALUES('legacy-done',?,3,3,'Legacy','DONE','old','old')",
      args: [p.id],
    });
    assert.equal((await repo.getPlan(p.id, 3)).completedBy, null);
    await assert.rejects(new D1Repository(f.db, "two").getPlan(p.id, task.number));
  } finally {
    f.client.close();
  }
});
