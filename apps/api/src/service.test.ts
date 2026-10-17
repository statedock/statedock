import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { StateDockService } from "@statedock/core";
import { createDatabase, migrate } from "@statedock/db";
import { createRepository } from "@statedock/db/service";
import { createApp } from "./app.js";

describe("StateDock API", () => {
  let directory: string;
  let client: ReturnType<typeof createDatabase>["client"];
  let app: ReturnType<typeof createApp>;
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), "statedock-test-"));
    const database = createDatabase(`file:${directory}/test.sqlite`);
    client = database.client;
    await migrate(client);
    app = createApp(new StateDockService(createRepository(database.db)));
  });
  afterEach(() => {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  });
  it("creates projects, plans, and appends actor-attributed activity", async () => {
    await migrate(client);
    const p = await app.request("/api/projects", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-id": "tester",
        "x-actor-type": "agent",
      },
      body: JSON.stringify({ slug: "demo", name: "Demo" }),
    });
    assert.equal(p.status, 201);
    const project = ((await p.json()) as any).data;
    const plan = await app.request(`/api/projects/${project.id}/plans`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-actor-id": "tester",
        "x-actor-type": "agent",
      },
      body: JSON.stringify({ title: "First" }),
    });
    assert.equal(plan.status, 201);
    assert.equal(((await plan.json()) as any).data.number, 1);
    const activity = await app.request(`/api/projects/${project.id}/activity`);
    const rows = ((await activity.json()) as any).data;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].actor.type, "agent");
  });
  it("isolates numbering, updates statuses, and round-trips nested Markdown files", async () => {
    const headers = {
      "content-type": "application/json",
      "x-actor-id": "codex",
      "x-actor-type": "agent",
    };
    for (const slug of ["one", "two"]) {
      const p = await app.request("/api/projects", {
        method: "POST",
        headers,
        body: JSON.stringify({ slug, name: slug }),
      });
      assert.equal(p.status, 201);
    }
    for (const slug of ["one", "one", "two"]) {
      const r = await app.request(`/api/projects/${slug}/plans`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "Implement" }),
      });
      assert.equal(r.status, 201);
      assert.equal(
        ((await r.json()) as any).data.number,
        slug === "two"
          ? 1
          : ((await (await app.request(`/api/projects/${slug}/plans`)).json()) as any).data.length,
      );
    }
    const refused = await app.request("/api/projects/one/plans/1", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "DONE" }),
    });
    assert.equal(refused.status, 403);
    assert.equal(((await refused.json()) as any).error, "forbidden");
    const patch = await app.request("/api/projects/one/plans/1", {
      method: "PATCH",
      headers: { ...headers, "x-actor-type": "human" },
      body: JSON.stringify({ status: "DONE" }),
    });
    assert.equal(((await patch.json()) as any).data.status, "DONE");
    const put = await app.request("/api/projects/one/files", {
      method: "PUT",
      headers,
      body: JSON.stringify({ path: "docs/plan.md", content: "# Hello" }),
    });
    assert.equal(put.status, 200);
    const get = await app.request("/api/projects/one/files/docs/plan.md");
    assert.equal(((await get.json()) as any).data.content, "# Hello");
    assert.equal(
      (
        await app.request("/api/projects/one/plans/1", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "BAD" }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await app.request("/api/projects", {
          method: "POST",
          headers,
          body: JSON.stringify({ slug: "one", name: "Duplicate" }),
        })
      ).status,
      409,
    );
  });
  it("keeps activity append-only after project deletion and reruns migration safely", async () => {
    await migrate(client);
    assert.equal((await client.execute("SELECT * FROM schema_migrations")).rows.length, 10);
    const p = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "audit", name: "Audit" }),
    });
    const project = ((await p.json()) as any).data;
    assert.equal(
      (await app.request(`/api/projects/${project.id}`, { method: "DELETE" })).status,
      204,
    );
    const rows = ((await (await app.request(`/api/projects/${project.id}/activity`)).json()) as any)
      .data;
    assert.equal(rows.length, 2);
    await assert.rejects(client.execute("DELETE FROM activities"), /append-only/);
    await assert.rejects(client.execute("UPDATE activities SET action='tampered'"), /append-only/);
  });
  it("persists local directory mapping and rejects stale UI plan edits", async () => {
    const headers = { "content-type": "application/json" };
    const created = await app.request("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "mapped", name: "Mapped", localPath: "/tmp/my-project" }),
    });
    const project = ((await created.json()) as any).data;
    assert.equal(project.localPath, "/tmp/my-project");
    const createdPlan = await app.request("/api/projects/mapped/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Original" }),
    });
    const plan = ((await createdPlan.json()) as any).data;
    const result = await app.request("/api/projects/mapped/plans/1", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "WORKING", expectedUpdatedAt: "stale" }),
    });
    assert.equal(result.status, 409);
    assert.equal(
      ((await (await app.request("/api/projects/mapped/plans/1")).json()) as any).data.status,
      "PLAN",
    );
    assert.equal(
      (
        await app.request("/api/projects/mapped/plans/1", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "WORKING", expectedUpdatedAt: plan.updatedAt }),
        })
      ).status,
      200,
    );
    const invalid = await app.request("/api/projects/mapped", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ localPath: "relative/path" }),
    });
    assert.equal(invalid.status, 400);
    assert.equal(
      (
        await app.request("/api/projects/mapped", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ localPath: null }),
        })
      ).status,
      200,
    );
  });
  it("allocates global references across projects and never reuses deleted numbers", async () => {
    const headers = { "content-type": "application/json" };
    for (const slug of ["alpha", "beta"])
      await app.request("/api/projects", {
        method: "POST",
        headers,
        body: JSON.stringify({ slug, name: slug }),
      });
    const make = async (slug: string) =>
      (
        (await (
          await app.request(`/api/projects/${slug}/plans`, {
            method: "POST",
            headers,
            body: JSON.stringify({ title: "Feature" }),
          })
        ).json()) as any
      ).data;
    const first = await make("alpha"),
      second = await make("beta");
    assert.equal(first.number, 1);
    assert.equal(second.number, 1);
    assert.equal(first.reference, "SD-000001");
    assert.equal(second.reference, "SD-000002");
    assert.equal(second.status, "PLAN");
    assert.match(second.creationMessage, /想法已记录.*开始 SD-000002/);
    for (const ref of [second.reference, second.id, "beta#1"]) {
      const result = await app.request(`/api/plans/${encodeURIComponent(ref)}`);
      assert.equal(result.status, 200);
      assert.equal(((await result.json()) as any).data.id, second.id);
    }
    assert.equal(
      (await app.request(`/api/plans/${second.reference}/start`, { method: "POST" })).status,
      200,
    );
    assert.equal(
      (await app.request(`/api/plans/${second.reference}/start`, { method: "POST" })).status,
      200,
    );
    await app.request("/api/projects/beta", { method: "DELETE" });
    const third = await make("alpha");
    assert.equal(third.reference, "SD-000003");
    assert.equal((await app.request("/api/plans/SD-000002")).status, 404);
    assert.equal((await app.request("/api/plans/SD-9007199254740992")).status, 400);
    await assert.rejects(client.execute("UPDATE plans SET global_number=999"), /immutable/);
  });
  it("rejects invalid project-relative file paths", async () => {
    await migrate(client);
    const p = await app.request("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "demo", name: "Demo" }),
    });
    const project = ((await p.json()) as any).data;
    const response = await app.request(`/api/projects/${project.id}/files`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "../x.md", content: "x" }),
    });
    assert.equal(response.status, 400);
  });
  it("records durable global task events, paginates, and suppresses repeated statuses", async () => {
    const headers = { "content-type": "application/json" };
    const send = async (path: string, method: string, body: unknown) =>
      app.request(path, { method, headers, body: JSON.stringify(body) });
    for (const slug of ["events", "other"])
      await send("/api/projects", "POST", { slug, name: slug });
    await send("/api/projects/events/plans", "POST", { title: "Notify me" });
    await app.request("/api/plans/SD-000001/start", { method: "POST" });
    await app.request("/api/plans/SD-000001/start", { method: "POST" });
    await send("/api/projects/events/plans/1", "PATCH", { status: "DONE" });
    await send("/api/projects/events/plans/1", "PATCH", { status: "DONE", title: "Changed" });
    await send("/api/projects/other/plans", "POST", { title: "Another" });
    const feed = async (query: string) =>
      ((await (await app.request(`/api/plan-events${query}`)).json()) as any).data;
    const baseline = await feed("");
    assert.deepEqual(baseline.events, []);
    assert.equal(baseline.cursor, 4);
    const first = await feed("?after=0&limit=2");
    assert.deepEqual(
      first.events.map((e: any) => e.kind),
      ["created", "started"],
    );
    assert.equal(first.hasMore, true);
    const second = await feed(`?after=${first.cursor}&limit=2`);
    assert.deepEqual(
      second.events.map((e: any) => e.kind),
      ["completed", "created"],
    );
    assert.equal(second.hasMore, false);
    assert.equal(second.events[1].reference, "SD-000002");
    assert.equal((await feed(`?after=${second.cursor}`)).events.length, 0);
    assert.equal((await app.request("/api/plan-events?after=-1")).status, 400);
    assert.equal((await app.request("/api/plan-events?limit=201")).status, 400);
    await assert.rejects(client.execute("DELETE FROM plan_events"), /append-only/);
    await assert.rejects(client.execute("UPDATE plan_events SET title='tampered'"), /append-only/);
    await app.request("/api/projects/events", { method: "DELETE" });
    assert.equal((await feed("?after=0")).events.length, 4);
  });

  it("creates direct work as WORKING and stores a concise outcome and dropped decision", async () => {
    const headers = { "content-type": "application/json" };
    await app.request("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "goals", name: "Goals" }),
    });
    const created = await app.request("/api/projects/goals/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Refresh the website",
        body: "Use a calmer visual direction.",
        status: "WORKING",
      }),
    });
    assert.equal(created.status, 201);
    const task = ((await created.json()) as any).data;
    assert.equal(task.status, "WORKING");
    assert.equal(task.summary, null);
    assert.match(task.creationMessage, /Task 已开始/);
    const saved = await app.request("/api/projects/goals/plans/1", {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        summary: "Updated the site with a calmer visual direction.",
        status: "DONE",
      }),
    });
    const completed = ((await saved.json()) as any).data;
    assert.equal(completed.summary, "Updated the site with a calmer visual direction.");
    assert.equal(completed.status, "DONE");
    const dropped = await app.request("/api/projects/goals/plans/1", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "DROPPED" }),
    });
    assert.equal(((await dropped.json()) as any).data.status, "DROPPED");
  });

  it("stores image attachments, rejects disguised images, and deletes metadata", async () => {
    const headers = { "content-type": "application/json" };
    await app.request("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "images", name: "Images" }),
    });
    await app.request("/api/projects/images/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Screenshot" }),
    });
    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    );
    const response = await app.request("/api/plans/SD-000001/attachments", {
      method: "POST",
      headers: { "content-type": "image/png", "x-file-name": "screen.png" },
      body: image,
    });
    assert.equal(response.status, 201);
    const attachment = ((await response.json()) as any).data;
    const download = await app.request(`/api/attachments/${attachment.id}`);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), image);
    const bad = await app.request("/api/plans/SD-000001/attachments", {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: "<script>bad</script>",
    });
    assert.equal(bad.status, 400);
    const list = ((await (await app.request("/api/plans/SD-000001/attachments")).json()) as any)
      .data;
    assert.equal(list.length, 1);
    assert.equal(list[0].data, undefined);
    assert.equal(
      (await app.request(`/api/attachments/${attachment.id}`, { method: "DELETE" })).status,
      204,
    );
    assert.equal((await app.request(`/api/attachments/${attachment.id}`)).status, 404);
  });

  it("appends separate reviews and feedback without overwriting the implementation or starting work", async () => {
    const headers = {
      "content-type": "application/json",
      "x-actor-id": "reviewer",
      "x-actor-type": "agent",
    };
    await app.request("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "review", name: "Review" }),
    });
    await app.request("/api/projects/review/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Improve playback",
        status: "DONE",
        summary: "Playback controls updated.",
      }),
    });
    const send = async (kind: string, body: unknown) =>
      app.request(`/api/plans/SD-000001/${kind}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    assert.equal(
      (
        await send("reviews", {
          scope: "Offline playback",
          verdict: "changes_requested",
          summary: "Resume fails offline",
          limitations: "Only desktop tested",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await send("reviews", {
          scope: "Offline playback",
          verdict: "passed",
          summary: "Fix verified",
        })
      ).status,
      201,
    );
    assert.equal((await send("feedback", { body: "Mobile play button is too small" })).status, 201);
    assert.equal(
      (await send("reviews", { scope: "", verdict: "passed", summary: "" })).status,
      400,
    );
    const reviews = ((await (await app.request("/api/plans/SD-000001/reviews")).json()) as any)
      .data;
    assert.equal(reviews.length, 2);
    assert.equal(reviews[0].actor.id, "reviewer");
    assert.equal(reviews[0].content.verdict, "changes_requested");
    const plan = ((await (await app.request("/api/plans/SD-000001")).json()) as any).data;
    assert.equal(plan.status, "DONE");
    assert.equal(plan.summary, "Playback controls updated.");
    await assert.rejects(client.execute("UPDATE task_entries SET content='{}'"), /append-only/);
    await assert.rejects(client.execute("DELETE FROM task_entries"), /append-only/);
    assert.equal((await app.request("/api/projects/review", { method: "DELETE" })).status, 204);
  });

  it("moves a plan between projects preserving global reference and renumbering locally", async () => {
    const headers = {
      "content-type": "application/json",
      "x-actor-id": "tester",
      "x-actor-type": "human",
    };
    await app.request("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "inbox", name: "Inbox" }),
    });
    await app.request("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "feature", name: "Feature" }),
    });
    const created = (await (
      await app.request("/api/projects/inbox/plans", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "Quick idea" }),
      })
    ).json()) as any;
    const plan = created.data;
    assert.equal(plan.reference, "SD-000001");
    assert.equal(plan.number, 1);

    const movedRes = await app.request(`/api/plans/${plan.reference}/move`, {
      method: "POST",
      headers,
      body: JSON.stringify({ targetProject: "feature" }),
    });
    assert.equal(movedRes.status, 200);
    const moved = ((await movedRes.json()) as any).data;
    assert.equal(moved.reference, "SD-000001");
    assert.equal(moved.number, 1);
    assert.notEqual(moved.projectId, plan.projectId);

    const inboxPlans = ((await (await app.request("/api/projects/inbox/plans")).json()) as any)
      .data;
    assert.equal(inboxPlans.length, 0);

    const featurePlans = ((await (await app.request("/api/projects/feature/plans")).json()) as any)
      .data;
    assert.equal(featurePlans.length, 1);
    assert.equal(featurePlans[0].reference, "SD-000001");
  });

  it("resumes project context aggregating active tasks, last completed handoff and pending items", async () => {
    const headers = {
      "content-type": "application/json",
      "x-actor-id": "tester",
      "x-actor-type": "human",
    };
    await app.request("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({
        slug: "ctx",
        name: "Context Demo",
        description: "Project context description",
      }),
    });
    await app.request("/api/projects/ctx/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "Done task",
        status: "DONE",
        summary: "Initial setup completed.",
      }),
    });
    await app.request("/api/projects/ctx/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Active work", status: "WORKING" }),
    });
    await app.request("/api/projects/ctx/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Next idea", status: "READY", body: "Plan body" }),
    });

    const res = await app.request("/api/projects/ctx/resume");
    assert.equal(res.status, 200);
    const data = ((await res.json()) as any).data;
    assert.equal(data.project.slug, "ctx");
    assert.equal(data.activeTasks.length, 1);
    assert.equal(data.activeTasks[0].title, "Active work");
    assert.equal(data.lastCompletedTask.title, "Done task");
    assert.equal(data.lastCompletedTask.summary, "Initial setup completed.");
    assert.equal(data.nextPendingTasks.length, 1);
    assert.equal(data.nextPendingTasks[0].title, "Next idea");
  });

  it("claims next pending task atomically and pauses task with blocker reason", async () => {
    const headers = {
      "content-type": "application/json",
      "x-actor-id": "agent-1",
      "x-actor-type": "agent",
    };
    await app.request("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "queue", name: "Queue Demo" }),
    });
    await app.request("/api/projects/queue/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Task A", status: "READY" }),
    });
    await app.request("/api/projects/queue/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Task B", status: "READY" }),
    });

    const claimRes = await app.request("/api/projects/queue/claim-next", {
      method: "POST",
      headers,
    });
    assert.equal(claimRes.status, 200);
    const claimed = ((await claimRes.json()) as any).data;
    assert.equal(claimed.title, "Task A");
    assert.equal(claimed.status, "WORKING");

    const pauseRes = await app.request(`/api/plans/${claimed.reference}/pause`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason: "Missing API keys" }),
    });
    assert.equal(pauseRes.status, 200);
    const paused = ((await pauseRes.json()) as any).data;
    assert.equal(paused.status, "WAITING");
    assert.match(paused.body, /Missing API keys/);

    const claimB = await app.request("/api/projects/queue/claim-next", { method: "POST", headers });
    const taskB = ((await claimB.json()) as any).data;
    assert.equal(taskB.title, "Task B");
    assert.equal(taskB.status, "WORKING");

    const claimEmpty = await app.request("/api/projects/queue/claim-next", {
      method: "POST",
      headers,
    });
    assert.equal(((await claimEmpty.json()) as any).data, null);
  });

  it("submits handoff and completes plan with structured summary", async () => {
    const headers = {
      "content-type": "application/json",
      "x-actor-id": "agent-1",
      "x-actor-type": "agent",
    };
    await app.request("/api/projects", {
      method: "POST",
      headers,
      body: JSON.stringify({ slug: "handoff-proj", name: "Handoff Project" }),
    });
    const createRes = await app.request("/api/projects/handoff-proj/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "Build feature", status: "WORKING" }),
    });
    const plan = ((await createRes.json()) as any).data;

    const handoffRes = await app.request(`/api/plans/${plan.reference}/handoff`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        changes: "Implemented feature and updated tests",
        verification: "All unit tests pass",
        nextSteps: "No migrations needed",
      }),
    });
    assert.equal(handoffRes.status, 200);
    const result = ((await handoffRes.json()) as any).data;
    assert.equal(result.status, "DONE");
    assert.match(result.summary, /Changes: Implemented feature and updated tests/);
    assert.match(result.summary, /Verification: All unit tests pass/);
    assert.match(result.summary, /Notes: No migrations needed/);
    const createZhRes = await app.request("/api/projects/handoff-proj/plans", {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "开发功能", status: "WORKING" }),
    });
    const planZh = ((await createZhRes.json()) as any).data;
    const handoffZhRes = await app.request(`/api/plans/${planZh.reference}/handoff`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        changes: "实现功能并更新测试",
        verification: "全部单测通过",
        nextSteps: "无需数据库迁移",
      }),
    });
    assert.equal(handoffZhRes.status, 200);
    const resultZh = ((await handoffZhRes.json()) as any).data;
    assert.match(resultZh.summary, /变更：实现功能并更新测试/);
    assert.match(resultZh.summary, /验证：全部单测通过/);
    assert.match(resultZh.summary, /注意：无需数据库迁移/);
  });
});
