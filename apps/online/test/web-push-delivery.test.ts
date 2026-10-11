import { sendWebPush } from "../src/web-push-sender.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import pushRoutes from "../src/web-push-routes.js";
import { D1Repository } from "../src/repository.js";
import { notificationRepository } from "../src/notification-service.js";
import { dispatchWebPush } from "../src/web-push-dispatcher.js";
import { pushFixture } from "./web-push-fixture.js";
const actor = { id: "agent", type: "agent" as const };
async function register(f: Awaited<ReturnType<typeof pushFixture>>, name: string, user = "one") {
  const response = await pushRoutes.request(
    "https://instance.test/api/auth/web-push",
    {
      method: "POST",
      headers: { Cookie: `statedock_session=${user}`, "Content-Type": "application/json" },
      body: JSON.stringify(f.subscription(name)),
    },
    f.env,
  );
  assert.equal(response.status, 201);
  return ((await response.json()) as any).data.id as string;
}
test("Task writes dispatch encrypted Web Push without a browser and retry each device independently", async () => {
  const f = await pushFixture(),
    original = globalThis.fetch;
  const sent: { url: string; init: RequestInit }[] = [];
  let fail = true;
  globalThis.fetch = (async (url: any, init: any) => {
    sent.push({ url: String(url), init });
    return new Response(null, { status: String(url).endsWith("desktop") && fail ? 503 : 201 });
  }) as typeof fetch;
  try {
    const phone = await register(f, "phone"),
      desktop = await register(f, "desktop");
    const repo = notificationRepository(f.env, "one"),
      project = await repo.createProject({ slug: "push", name: "Push" }, actor);
    const task = await repo.createPlan(
      project.id,
      { title: "Ship notification", status: "WORKING" },
      actor,
    );
    assert.equal(sent.length, 0);
    await repo.updatePlan(project.id, task.number, { status: "DONE", summary: "Verified" }, actor);
    assert.equal(sent.length, 2);
    for (const request of sent) {
      assert.equal(new Headers(request.init.headers).get("content-encoding"), "aes128gcm");
      assert.match(new Headers(request.init.headers).get("authorization")!, /^vapid t=/);
      assert.equal((request.init.body as Uint8Array).byteLength, 4096);
      assert.ok(
        !Buffer.from(request.init.body as Uint8Array).includes(Buffer.from("Ship notification")),
      );
      assert.equal(request.init.redirect, "manual");
    }
    assert.equal(
      (
        await f.client.execute({
          sql: "SELECT COUNT(*) n FROM web_push_outbox WHERE subscription_id=? AND delivered_at IS NULL",
          args: [phone],
        })
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await f.client.execute({
          sql: "SELECT COUNT(*) n FROM web_push_outbox WHERE subscription_id=? AND delivered_at IS NULL",
          args: [desktop],
        })
      ).rows[0].n,
      1,
    );
    fail = false;
    await f.client.execute(
      "UPDATE web_push_outbox SET available_at='2000-01-01' WHERE delivered_at IS NULL",
    );
    await Promise.all([dispatchWebPush(f.env), dispatchWebPush(f.env)]);
    assert.equal(sent.length, 3);
    assert.ok(sent.at(-1)!.url.endsWith("desktop"));
    await dispatchWebPush(f.env);
    assert.equal(sent.length, 3);
  } finally {
    globalThis.fetch = original;
    f.client.close();
  }
});
test("Project preferences, member removal, account disable and session logout prevent delivery", async () => {
  const f = await pushFixture(),
    original = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = (async () => {
    sends++;
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  try {
    const id = await register(f, "phone");
    const repo = new D1Repository(f.db, "one");
    const p = await repo.createProject({ slug: "filtered", name: "Filtered" }, actor);
    const task = await repo.createPlan(p.id, { title: "Work", status: "WORKING" }, actor);
    await f.client.execute({
      sql: "UPDATE notification_preferences SET enabled=0 WHERE connection_id=?",
      args: [id],
    });
    await repo.updatePlan(p.id, task.number, { status: "WAITING" }, actor);
    await dispatchWebPush(f.env);
    assert.equal(sends, 0);
    await f.client.execute({
      sql: "UPDATE notification_preferences SET enabled=1,project_ids='[]' WHERE connection_id=?",
      args: [id],
    });
    await repo.updatePlan(p.id, task.number, { status: "DONE" }, actor);
    await dispatchWebPush(f.env);
    assert.equal(sends, 0);
    await f.client.execute({
      sql: "UPDATE notification_preferences SET project_ids='null' WHERE connection_id=?",
      args: [id],
    });
    await repo.updatePlan(p.id, task.number, { status: "WAITING" }, actor);
    await f.client.execute("UPDATE users SET disabled_at='now' WHERE id='one'");
    await dispatchWebPush(f.env);
    assert.equal(sends, 0);
    await f.client.execute("UPDATE users SET disabled_at=NULL WHERE id='one'");
    await repo.updatePlan(p.id, task.number, { status: "DONE" }, actor);
    await f.client.execute("UPDATE sessions SET revoked_at='now' WHERE id='one'");
    await dispatchWebPush(f.env);
    assert.equal(sends, 0);
    // A member's pending event cannot reveal a project after removal.
    await f.client.execute({
      sql: "INSERT INTO project_members(id,project_id,user_id,created_at) VALUES('membership',?,'two','now')",
      args: [p.id],
    });
    await register(f, "member", "two");
    await repo.updatePlan(p.id, task.number, { status: "WAITING" }, actor);
    await f.client.execute("DELETE FROM project_members WHERE id='membership'");
    await dispatchWebPush(f.env);
    assert.equal(sends, 0);
  } finally {
    globalThis.fetch = original;
    f.client.close();
  }
});
test("Expired push endpoints are removed without breaking external notifications", async () => {
  const f = await pushFixture(),
    original = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = (async (url: any) => {
    sends++;
    return String(url).includes("api.day.app")
      ? new Response('{"code":200}')
      : new Response(null, { status: 410 });
  }) as typeof fetch;
  try {
    await register(f, "expired");
    await f.client.execute(
      "INSERT INTO bark_subscribers(user_id,device_key,enabled,updated_at) VALUES('one','device',1,'now')",
    );
    const repo = notificationRepository(f.env, "one"),
      p = await repo.createProject({ slug: "expired", name: "Expired" }, actor);
    await repo.createPlan(p.id, { title: "Done", status: "DONE" }, actor);
    assert.equal(sends, 2);
    assert.equal(
      (await f.client.execute("SELECT COUNT(*) n FROM web_push_subscriptions")).rows[0].n,
      0,
    );
    assert.equal(
      (
        await f.client.execute(
          "SELECT COUNT(*) n FROM notification_preferences WHERE channel='webpush'",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    globalThis.fetch = original;
    f.client.close();
  }
});

test("Old queued events expire without sending, and missing VAPID never sends", async () => {
  const f = await pushFixture(),
    original = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = (async () => {
    sends++;
    return new Response(null, { status: 201 });
  }) as typeof fetch;
  try {
    await register(f, "phone");
    const repo = new D1Repository(f.db, "one"),
      p = await repo.createProject({ slug: "offline", name: "Offline" }, actor);
    await repo.createPlan(p.id, { title: "Done", status: "DONE" }, actor);
    await dispatchWebPush({ ...f.env, VAPID_PRIVATE_KEY: undefined });
    assert.equal(sends, 0);
    const now = Date.now;
    Date.now = () => now() + 2 * 86400000;
    try {
      await dispatchWebPush(f.env);
      assert.equal(sends, 0);
      assert.equal((await f.client.execute("SELECT COUNT(*) n FROM web_push_outbox")).rows[0].n, 0);
    } finally {
      Date.now = now;
    }
  } finally {
    globalThis.fetch = original;
    f.client.close();
  }
});

test("Provider rejection is classified without exposing keys, endpoint or provider response", async () => {
  const f = await pushFixture(),
    original = globalThis.fetch,
    warn = console.warn;
  const logs: unknown[][] = [];
  const sub = f.subscription("diagnostic").subscription;
  console.warn = (...values) => {
    logs.push(values);
  };
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ reason: "BadJwtToken", privateDetail: "do-not-log-this" }), {
      status: 403,
    })) as typeof fetch;
  try {
    await assert.rejects(
      sendWebPush(
        f.env,
        { ...sub.keys, endpoint: sub.endpoint, user_id: "one", language: "en" },
        { eventId: "synthetic", userId: "one", title: "Synthetic", body: "Synthetic" },
      ),
      /push_auth_failed/,
    );
    const result = JSON.stringify(logs);
    assert.match(result, /BadJwtToken/);
    assert.match(result, /403/);
    assert.ok(
      !result.includes(sub.endpoint) &&
        !result.includes(sub.keys.auth) &&
        !result.includes("do-not-log-this"),
    );
  } finally {
    globalThis.fetch = original;
    console.warn = warn;
    f.client.close();
  }
});
