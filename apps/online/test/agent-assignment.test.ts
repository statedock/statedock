import assert from "node:assert/strict";
import test from "node:test";
import { StateDockService } from "@statedock/core";
import handler from "../src/index.js";
import { digest, type OnlineEnv } from "../src/auth.js";
import { D1Repository } from "../src/repository.js";
import { fixture } from "./fixture.js";

const human = { id: "one", type: "human" as const };
test("deleting an identity protects working tasks, unbinds pending work and preserves history", async () => {
  const f = await fixture();
  const env = {
    DB: f.db,
    ATTACHMENTS: f.bucket,
    OAUTH_KV: f.oauthKv,
    APP_ENV: "test",
    PUBLIC_BASE_URL: "https://instance.example.test",
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as OnlineEnv;
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as ExecutionContext;
  try {
    await f.client.execute({
      sql: "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES('delete-session','one',?,'2099-01-01','now')",
      args: [await digest("delete-token")],
    });
    await f.client.execute(
      "INSERT INTO agent_profiles(id,user_id,name,created_at) VALUES('retire','one','Retire me','now'),('foreign','two','Foreign','now')",
    );
    await f.client.execute(
      "INSERT INTO mcp_clients(id,user_id,name,token_hash,token_prefix,created_at,agent_id) VALUES('bound','one','Key','key-hash','prefix','now','retire')",
    );
    const request = (path: string, method = "GET", body?: unknown) =>
      handler.fetch(
        new Request(`https://instance.example.test/api${path}`, {
          method,
          headers: {
            Cookie: "statedock_session=delete-token",
            Origin: "https://instance.example.test",
            "Content-Type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        env,
        ctx,
      );
    assert.equal((await request("/auth/agents/foreign", "DELETE")).status, 404);
    const repo = new D1Repository(f.db, "one");
    const service = new StateDockService(repo);
    const project = await repo.createProject({ slug: "delete-agent", name: "Delete Agent" }, human);
    const working = await repo.createPlan(project.id, { title: "Working", status: "READY" }, human);
    const done = await repo.createPlan(project.id, { title: "Completed", status: "DONE" }, human);
    for (const p of [working, done])
      await repo.updatePlan(project.id, p.number, { assignedAgentId: "retire" }, human);
    const actor = { id: "agent:retire", type: "agent" as const, agentId: "retire" };
    await service.claimNextTask(project.id, actor);
    assert.equal((await request("/auth/agents/retire", "DELETE")).status, 409);
    assert.equal(
      (await f.client.execute("SELECT agent_id FROM mcp_clients WHERE id='bound'")).rows[0]
        .agent_id,
      "retire",
    );
    assert.equal(
      (await f.client.execute("SELECT deleted_at FROM agent_profiles WHERE id='retire'")).rows[0]
        .deleted_at,
      null,
    );
    await repo.updatePlan(project.id, working.number, { status: "WAITING" }, human);
    const events = (await f.client.execute("SELECT * FROM plan_events")).rows;
    assert.equal((await request("/auth/agents/retire", "DELETE")).status, 204);
    assert.deepEqual(((await request("/auth/agents").then((r) => r.json())) as any).data, []);
    assert.equal(
      (await f.client.execute("SELECT agent_id FROM mcp_clients WHERE id='bound'")).rows[0]
        .agent_id,
      null,
    );
    const waiting = await repo.getPlan(project.id, working.number);
    assert.equal(waiting.assignedAgentId, null);
    assert.equal(waiting.claimedAgentId, "retire");
    assert.equal(waiting.status, "WAITING");
    assert.equal((await repo.getPlan(project.id, done.number)).assignedAgentId, "retire");
    assert.deepEqual((await f.client.execute("SELECT * FROM plan_events")).rows, events);
    await assert.rejects(service.claimNextTask(project.id, actor), /not available/);
    assert.equal(
      (await request("/auth/mcp-clients/bound", "PATCH", { agentId: "retire" })).status,
      400,
    );
    await assert.rejects(
      repo.updatePlan(project.id, working.number, { assignedAgentId: "retire" }, human),
      /project member/,
    );
    await assert.rejects(
      f.client.execute("UPDATE mcp_clients SET agent_id='retire' WHERE id='bound'"),
    );
    assert.equal((await f.client.execute("PRAGMA foreign_key_check")).rows.length, 0);
  } finally {
    f.client.close();
  }
});
test("repository claims record the actor, history and notifications; handoff is explicit", async () => {
  const f = await fixture();
  try {
    await f.client.execute(
      "INSERT INTO agent_profiles(id,user_id,name,created_at) VALUES('codex','one','Codex','now'),('deepseek','one','DeepSeek','now')",
    );
    const events: string[] = [];
    const repo = new D1Repository(f.db, "one", (e) => {
      events.push(e.kind);
    });
    const service = new StateDockService(repo);
    const project = await repo.createProject({ slug: "handoff", name: "Handoff" }, human);
    const plans = [];
    for (const title of ["A", "B", "C", "D"])
      plans.push(await service.createPlan(project.id, { title, status: "READY" }, human));
    for (const [i, agent] of [
      [0, "codex"],
      [1, "deepseek"],
      [2, "codex"],
    ] as const)
      await service.updatePlan(project.id, plans[i].number, { assignedAgentId: agent }, human);
    const codex = { id: "agent:codex", type: "agent" as const, agentId: "codex" };
    const deepseek = { id: "agent:deepseek", type: "agent" as const, agentId: "deepseek" };
    assert.deepEqual(
      (await service.listReadyTasks(project.id, codex)).map((p) => p.title),
      ["A", "C"],
    );
    await assert.rejects(
      service.claimNextTask(project.id, { id: "legacy", type: "agent" }),
      /绑定/,
    );
    const claimed = await Promise.all([
      service.claimNextTask(project.id, codex),
      service.claimNextTask(project.id, codex),
    ]);
    assert.deepEqual(claimed.map((p) => p?.title).sort(), ["A", "C"]);
    assert.equal((await service.claimNextTask(project.id, deepseek))?.title, "B");
    assert.equal(await service.claimNextTask(project.id, codex), null);
    assert.equal((await service.listReadyTasks(project.id, codex, "unassigned"))[0].title, "D");
    assert.equal((await repo.getPlan(project.id, plans[0].number)).claimedAgentId, "codex");
    const activities = (await repo.listActivity(project.id, 100)).filter(
      (a) => a.action === "plan.claimed",
    );
    assert.equal(activities.length, 3);
    assert.equal(events.filter((e) => e === "started").length, 3);
    await assert.rejects(
      service.updatePlan(project.id, plans[0].number, { assignedAgentId: "deepseek" }, human),
      /Ready/,
    );
    await assert.rejects(
      service.updatePlan(project.id, plans[0].number, { status: "DONE" }, deepseek),
      /another Agent/,
    );
    const returned = await service.updatePlan(
      project.id,
      plans[0].number,
      { status: "READY", assignedAgentId: "deepseek" },
      human,
    );
    assert.equal(returned.claimedAgentId, null);
    assert.equal((await service.claimNextTask(project.id, deepseek))?.title, "A");
    assert.equal((await repo.getPlan(project.id, plans[3].number)).status, "READY");
  } finally {
    f.client.close();
  }
});

test("HTTP credential bindings determine MCP queue identity; supplied identities cannot impersonate", async () => {
  const f = await fixture();
  const env = {
    DB: f.db,
    ATTACHMENTS: f.bucket,
    OAUTH_KV: f.oauthKv,
    APP_ENV: "test",
    PUBLIC_BASE_URL: "https://instance.example.test",
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as OnlineEnv;
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as ExecutionContext;
  try {
    await f.client.execute({
      sql: "INSERT INTO sessions(id,user_id,token_hash,expires_at,created_at) VALUES('session','one',?,'2099-01-01','now')",
      args: [await digest("session-token")],
    });
    const request = (path: string, method = "GET", body?: unknown) =>
      handler.fetch(
        new Request(`https://instance.example.test/api${path}`, {
          method,
          headers: {
            Cookie: "statedock_session=session-token",
            Origin: "https://instance.example.test",
            "Content-Type": "application/json",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        env,
        ctx,
      );
    const create = await request("/auth/agents", "POST", { name: "Codex" });
    assert.equal(create.status, 201);
    const agent = ((await create.json()) as any).data;
    const tokenRes = await request("/auth/mcp-clients", "POST", {
      name: "Label is not identity",
      agentId: agent.id,
    });
    assert.equal(tokenRes.status, 201);
    const client = ((await tokenRes.json()) as any).data;
    const repo = new D1Repository(f.db, "one");
    const project = await repo.createProject({ slug: "credential", name: "Credential" }, human);
    const own = await repo.createPlan(project.id, { title: "Own", status: "READY" }, human);
    await repo.updatePlan(project.id, own.number, { assignedAgentId: agent.id }, human);
    await f.client.execute(
      "INSERT INTO agent_profiles(id,user_id,name,created_at) VALUES('other','one','DeepSeek','now'),('foreign','two','Foreign','now')",
    );
    const other = await repo.createPlan(project.id, { title: "Other", status: "READY" }, human);
    await repo.updatePlan(project.id, other.number, { assignedAgentId: "other" }, human);
    const call = async (name: string, args: unknown) => {
      const res = await handler.fetch(
        new Request("https://instance.example.test/mcp", {
          method: "POST",
          headers: { Authorization: `Bearer ${client.token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        }),
        env,
        ctx,
      );
      assert.equal(res.status, 200);
      return ((await res.json()) as any).result;
    };
    const list = await call("list_ready_tasks", {
      project: project.id,
      agentId: "other",
      agent_name: "DeepSeek",
    });
    assert.deepEqual(
      JSON.parse(list.content[0].text).data.map((p: any) => p.title),
      ["Own"],
    );
    const claim = await call("claim_next_task", { project: project.id, agentId: "other" });
    assert.equal(JSON.parse(claim.content[0].text).data.plan.claimedAgentId, agent.id);
    assert.equal(
      (await request(`/auth/mcp-clients/${client.id}`, "PATCH", { agentId: "foreign" })).status,
      400,
    );
    assert.equal(
      (await request(`/auth/mcp-clients/${client.id}`, "PATCH", { agentId: "other" })).status,
      200,
    );
    assert.equal(
      JSON.parse((await call("claim_next_task", { project: project.id })).content[0].text).data.plan
        .title,
      "Other",
    );
    assert.equal(
      (await request(`/auth/mcp-clients/${client.id}`, "PATCH", { agentId: null })).status,
      200,
    );
    assert.equal((await call("claim_next_task", { project: project.id })).isError, true);
    assert.equal((await request("/auth/agents?project=not-accessible")).status, 404);
  } finally {
    f.client.close();
  }
});
