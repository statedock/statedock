import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StateDockService } from "@statedock/core";
import { createDatabase, migrate } from "@statedock/db";
import { createRepository } from "@statedock/db/service";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("stdio MCP tools share API state, record actor notes, and report errors", async () => {
  const directory = mkdtempSync(join(tmpdir(), "statedock-mcp-"));
  const url = `file:${directory}/test.sqlite`;
  const database = createDatabase(url);
  await migrate(database.client);
  const service = new StateDockService(createRepository(database.db));
  const project = await service.createProject(
    { slug: "demo", name: "Demo" },
    { id: "human", type: "human" },
  );
  const plan = await service.createPlan(
    project.id,
    { title: "Implement" },
    { id: "human", type: "human" },
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./index.js", import.meta.url))],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      ),
      DATABASE_URL: url,
      STATEDOCK_ACTOR_ID: "codex-test",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const instructions = client.getInstructions() ?? "";
    for (const rule of [
      "resume_project",
      "create_plan",
      "pause_task",
      "submit_handoff",
      "Rules version",
    ])
      assert.ok(instructions.includes(rule), `instructions mention ${rule}`);
    const tools = await client.listTools();
    for (const name of ["list_projects", "list_attachments", "read_attachment"])
      assert.ok(tools.tools.some((t) => t.name === name));
    assert.deepEqual(tools.tools.find((t) => t.name === "read_attachment")?.annotations, {
      title: "Read attachment",
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
    assert.deepEqual(tools.tools.find((t) => t.name === "write_file")?.annotations, {
      title: "Write file",
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    });
    for (const name of ["update_project", "update_plan"])
      assert.equal(tools.tools.find((t) => t.name === name)?.annotations?.destructiveHint, true);
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      assert.notEqual(result.isError, true, JSON.stringify(result));
      return result;
    };
    await call("get_plan", { project: "demo", number: plan.number });
    await call("start_plan", { reference: plan.reference });
    assert.equal((await service.getPlan(project.id, 1)).status, "WORKING");
    await call("write_file", { project: "demo", path: "docs/result.md", content: "# Completed" });
    assert.equal((await service.getFile(project.id, "docs/result.md")).content, "# Completed");
    await call("add_note", { project: "demo", number: 1, note: "Implemented and checked." });
    // An agent cannot rewrite the task it works on, or close it outside submit_handoff.
    for (const change of [
      { title: "Renamed" },
      { body: "New goal" },
      { summary: "Done" },
      { status: "DONE" },
      { status: "READY" },
    ]) {
      const refusedEdit = await client.callTool({
        name: "update_plan",
        arguments: { project: "demo", number: 1, ...change },
      });
      assert.equal(refusedEdit.isError, true, JSON.stringify(change));
      assert.match(JSON.stringify(refusedEdit.content), /forbidden/);
    }
    const untouched = await service.getPlan(project.id, 1);
    assert.equal(untouched.title, "Implement");
    assert.equal(untouched.status, "WORKING");
    await call("update_plan", { project: "demo", number: 1, status: "WORKING" });
    // A person can edit it, and the replaced text stays in the activity log.
    await service.updatePlan(
      project.id,
      1,
      { title: "Implement it" },
      { id: "human", type: "human" },
    );
    const edit = (await service.listActivity(project.id)).find(
      (a) => a.action === "plan.updated" && (a.details as any)?.before?.title,
    );
    assert.equal((edit?.details as any).before.title, "Implement");
    await service.updatePlan(project.id, 1, { title: "Implement" }, { id: "human", type: "human" });
    await call("submit_handoff", {
      project: "demo",
      number: 1,
      changes: "Implemented it",
      verification: "Integration test",
    });
    assert.equal((await service.getPlan(project.id, 1)).status, "DONE");
    assert.deepEqual(
      (await service.listPlanEvents(0)).events.map((event) => event.kind),
      ["created", "started", "completed"],
    );
    const notes = (await service.listActivity(project.id)).filter((a) => a.action === "plan.note");
    assert.equal(notes[0].actor.id, "codex-test");
    assert.equal(notes[0].details?.note, "Implemented and checked.");
    await call("get_plan", { reference: "demo#1" });
    await call("get_plan", { reference: plan.id });
    await call("add_review", {
      reference: plan.reference,
      scope: "API behavior",
      verdict: "inconclusive",
      summary: "Needs device verification",
      limitations: "No phone available",
    });
    const reviews = await call("list_reviews", { reference: plan.reference });
    assert.equal((reviews.structuredContent as any).data[0].actor.id, "codex-test");
    await call("add_feedback", { reference: plan.reference, body: "Check touch targets" });
    await call("list_feedback", { reference: plan.reference });
    assert.equal((await service.getPlan(project.id, 1)).status, "DONE");
    const refused = await client.callTool({
      name: "start_plan",
      arguments: { reference: plan.reference },
    });
    assert.equal(refused.isError, true);
    const mixed = await client.callTool({
      name: "get_plan",
      arguments: { reference: plan.reference, project: "demo", number: 1 },
    });
    assert.equal(mixed.isError, true);
    const created = await call("create_plan", { project: "demo", title: "Deferred feature" });
    const data = (
      created.structuredContent as {
        data: { reference: string; status: string; creationMessage: string; number: number };
      }
    ).data;
    assert.equal(data.status, "PLAN");
    assert.match(data.creationMessage, /以后可说“开始/);
    await call("get_plan", { reference: data.reference });
    const resumed = await call("resume_project", { project: "demo" });
    const ctx = (resumed.structuredContent as any).data;
    assert.equal(ctx.project.slug, "demo");
    assert.equal(ctx.lastCompletedTask.reference, plan.reference);
    assert.equal(ctx.nextPendingTasks.length, 0);
    assert.equal(
      ((await call("claim_next_task", { project: "demo" })).structuredContent as any).data.claimed,
      false,
    );
    await service.updatePlan(
      project.id,
      data.number,
      { status: "READY" },
      { id: "human", type: "human" },
    );
    const readyCtx = (await call("resume_project", { project: "demo" })).structuredContent as any;
    assert.equal(readyCtx.data.nextPendingTasks.length, 1);
    assert.equal(readyCtx.data.nextPendingTasks[0].reference, data.reference);
    const autoResumed = await call("resume_project", {});
    assert.equal((autoResumed.structuredContent as any).data.project.slug, "demo");
    const claimRes = await call("claim_next_task", { project: "demo" });
    assert.equal((claimRes.structuredContent as any).data.claimed, true);
    assert.equal((claimRes.structuredContent as any).data.plan.reference, data.reference);
    assert.equal((claimRes.structuredContent as any).data.plan.status, "WORKING");
    const paused = await call("pause_task", {
      reference: data.reference,
      reason: "Blocked on credential",
    });
    assert.equal((paused.structuredContent as any).data.status, "WAITING");
    assert.match((paused.structuredContent as any).data.body, /Blocked on credential/);
    const handoff = await call("submit_handoff", {
      reference: data.reference,
      changes: "Fixed credential auth",
      verification: "Auth unit test passed",
      nextSteps: "Ready for production rollout",
    });
    assert.equal((handoff.structuredContent as any).data.status, "DONE");
    assert.match((handoff.structuredContent as any).data.summary, /Changes: Fixed credential auth/);
    assert.match(
      (handoff.structuredContent as any).data.summary,
      /Verification: Auth unit test passed/,
    );
    assert.match(
      (handoff.structuredContent as any).data.summary,
      /Notes: Ready for production rollout/,
    );
    const handoffZh = await call("submit_handoff", {
      reference: data.reference,
      changes: "修复鉴权问题",
      verification: "单测通过",
      nextSteps: "可上线",
    });
    assert.match((handoffZh.structuredContent as any).data.summary, /变更：修复鉴权问题/);
    assert.match((handoffZh.structuredContent as any).data.summary, /验证：单测通过/);
    assert.match((handoffZh.structuredContent as any).data.summary, /注意：可上线/);
    const claimEmpty = await call("claim_next_task", { project: "demo" });
    assert.equal((claimEmpty.structuredContent as any).data.claimed, false);
    const missing = await client.callTool({
      name: "get_plan",
      arguments: { project: "demo", number: 999 },
    });
    assert.equal(missing.isError, true);
    const invalid = await client.callTool({
      name: "write_file",
      arguments: { project: "demo", path: "../escape.md", content: "x" },
    });
    assert.equal(invalid.isError, true);
  } finally {
    await client.close();
    database.client.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
