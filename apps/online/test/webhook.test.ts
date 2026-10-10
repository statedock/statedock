import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createDatabase } from "../../../packages/db/dist/index.js";
import {
  validateWebhookUrl,
  signWebhookPayload,
  sendWebhook,
  notifyWebhookSubscribers,
} from "../src/webhook.js";
import type { NotificationEvent } from "../src/notification-preferences.js";

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
    "INSERT INTO users(id,email,created_at,instance_approved_at) VALUES('user-1','user@example.test','now','now')"
  );
  return { client, db };
}

test("validateWebhookUrl accepts http(s) and rejects invalid formats", () => {
  assert.equal(validateWebhookUrl("https://example.com/webhook"), "https://example.com/webhook");
  assert.equal(validateWebhookUrl("http://localhost:8080/events"), "http://localhost:8080/events");
  assert.equal(
    validateWebhookUrl("  https://api.domain.io/v1/hook?token=123  "),
    "https://api.domain.io/v1/hook?token=123"
  );

  assert.equal(validateWebhookUrl("ftp://example.com"), null);
  assert.equal(validateWebhookUrl("javascript:alert(1)"), null);
  assert.equal(validateWebhookUrl("not a url"), null);
  assert.equal(validateWebhookUrl(""), null);
  assert.equal(validateWebhookUrl("https://  "), null);
});

test("signWebhookPayload computes HMAC-SHA256 signature", async () => {
  const secret = "test-secret-123";
  const payload = JSON.stringify({ hello: "world" });
  const signature = await signWebhookPayload(secret, payload);

  assert.match(signature, /^sha256=[0-9a-f]{64}$/);

  // Deterministic
  const signature2 = await signWebhookPayload(secret, payload);
  assert.equal(signature, signature2);

  // Different payload yields different signature
  const signature3 = await signWebhookPayload(secret, JSON.stringify({ hello: "other" }));
  assert.notEqual(signature, signature3);
});

test("sendWebhook formats payload and handles headers and responses", async () => {
  const originalFetch = globalThis.fetch;
  try {
    let capturedUrl = "";
    let capturedOptions: RequestInit | undefined;

    globalThis.fetch = (async (url: any, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedOptions = init;
      return new Response("OK", { status: 200 });
    }) as any;

    // Test connectivity event
    const testResult = await sendWebhook(
      { url: "https://hook.example.com/endpoint" },
      undefined,
      "https://dock.example.test",
    );
    assert.equal(testResult.ok, true);
    assert.equal(testResult.status, 200);
    assert.equal(capturedUrl, "https://hook.example.com/endpoint");
    assert.equal(capturedOptions?.method, "POST");

    const headers = capturedOptions?.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["User-Agent"], "StateDock-Webhook/1.0 (+https://dock.example.test)");
    assert.equal(headers["X-StateDock-Event"], "test");
    assert.ok(headers["X-StateDock-Delivery"]);
    assert.equal(headers["X-StateDock-Signature-256"], undefined);

    const testPayload = JSON.parse(capturedOptions?.body as string);
    assert.equal(testPayload.event, "test");
    assert.equal(testPayload.data.url, "https://dock.example.test");
    assert.equal(testPayload.action, "连通性测试");
    assert.match(testPayload.data.message, /连通性测试成功/);

    // Event with secret and task details
    const event: NotificationEvent = {
      kind: "completed",
      reference: "SD-000042",
      projectId: "proj-1",
      projectName: "EchoLangs",
      number: 42,
      title: "修复播放器后台恢复进度归零",
      summary: "播放器切回 App 后已正常恢复播放进度。",
      localPath: null,
    };

    const taskResult = await sendWebhook(
      { url: "https://hook.example.com/endpoint", secret: "super-secret" },
      event
    );
    assert.equal(taskResult.ok, true);

    const taskHeaders = capturedOptions?.headers as Record<string, string>;
    assert.equal(taskHeaders["X-StateDock-Event"], "task.completed");
    assert.match(taskHeaders["X-StateDock-Signature-256"], /^sha256=[0-9a-f]{64}$/);

    const expectedSig = await signWebhookPayload("super-secret", capturedOptions?.body as string);
    assert.equal(taskHeaders["X-StateDock-Signature-256"], expectedSig);

    const taskPayload = JSON.parse(capturedOptions?.body as string);
    assert.equal(taskPayload.event, "task.completed");
    assert.equal(taskPayload.action, "任务已完成");
    assert.equal(taskPayload.data.reference, "SD-000042");
    assert.equal(taskPayload.data.project.name, "EchoLangs");
    assert.equal(taskPayload.data.task.title, "修复播放器后台恢复进度归零");
    assert.equal(taskPayload.data.task.summary, "播放器切回 App 后已正常恢复播放进度。");

    // HTTP Error handling
    globalThis.fetch = (async () => new Response("Unauthorized", { status: 401 })) as any;
    const errorResult = await sendWebhook({ url: "https://hook.example.com/endpoint" });
    assert.equal(errorResult.ok, false);
    assert.equal(errorResult.status, 401);
    assert.match(errorResult.error || "", /HTTP 401/);

    // Network error handling
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as any;
    const networkResult = await sendWebhook({ url: "https://hook.example.com/endpoint" });
    assert.equal(networkResult.ok, false);
    assert.match(networkResult.error || "", /连接 Webhook 服务器失败/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("notifyWebhookSubscribers respects connections and preferences", async () => {
  const f = await fixture();
  const originalFetch = globalThis.fetch;
  try {
    // Insert two webhook connections
    await f.client.execute(
      "INSERT INTO webhook_connections(id, user_id, name, url, secret, created_at) VALUES('hook-1', 'user-1', 'Hook 1', 'https://hook1.example.com/events', 'sec1', 'now')"
    );
    await f.client.execute(
      "INSERT INTO webhook_connections(id, user_id, name, url, secret, created_at) VALUES('hook-2', 'user-1', 'Hook 2', 'https://hook2.example.com/events', null, 'now')"
    );

    // Disable completed events for hook-2
    await f.client.execute(
      "INSERT INTO notification_preferences(user_id, channel, connection_id, enabled, project_ids, events) VALUES('user-1', 'webhook', 'hook-2', 0, 'null', '[\"completed\",\"waiting\"]')"
    );

    const calledUrls: string[] = [];
    globalThis.fetch = (async (url: any) => {
      calledUrls.push(url.toString());
      return new Response("OK", { status: 200 });
    }) as any;

    const env: any = { DB: f.db };
    const event: NotificationEvent = {
      kind: "completed",
      reference: "SD-000045",
      projectId: "proj-1",
      projectName: "EchoLangs",
      number: 45,
      title: "优化出站 Webhook 通知推送",
      summary: "已实现标准出站 Webhook 并通过测试。",
      localPath: null,
    };

    await notifyWebhookSubscribers(env, "user-1", event);

    // Only hook-1 should receive the notification; hook-2 was disabled in preferences
    assert.equal(calledUrls.length, 1);
    assert.equal(calledUrls[0], "https://hook1.example.com/events");
  } finally {
    globalThis.fetch = originalFetch;
    f.client.close();
  }
});
