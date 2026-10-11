import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../src/index.js";
import { notificationRepository } from "../src/notification-service.js";
import { fixture } from "./fixture.js";
import type { OnlineEnv } from "../src/auth.js";

test("composed routes preserve session, origin, API and asset boundaries", async () => {
  const f = await fixture();
  const env = { DB: f.db, ATTACHMENTS: f.bucket, OAUTH_KV: f.oauthKv, APP_ENV: "test", PUBLIC_BASE_URL:"https://dock.example.test", ASSETS: { fetch: async () => new Response("asset") } } as unknown as OnlineEnv;
  const request = (path: string, init?: RequestInit) => app.request(`https://dock.example.test${path}`, init, env);
  try {
    assert.deepEqual(await (await request("/api/health")).json(), { status: "ok", environment: "test" });
    assert.deepEqual(await (await request("/api/auth/session")).json(), { data: null });
    const instance = await request("/api/instance-info");
    assert.equal(instance.headers.get("cache-control"), "no-store");
    assert.deepEqual(await instance.json(), {data:{publicOrigin:"https://dock.example.test",mcpUrl:"https://dock.example.test/mcp"}});
    for (const path of ["/api/auth/mcp-clients", "/api/auth/bark", "/api/auth/ntfy", "/api/auth/telegram", "/api/auth/discord/subscriber", "/api/auth/notifications/bark/default", "/api/projects", "/mcp"]) {
      assert.equal((await request(path)).status, 401, path);
    }
    assert.equal((await request("/api/auth/import-local", { method: "POST" })).status, 401);
    assert.equal((await request("/api/auth/request-code", { method: "POST", headers: { Origin: "https://other.test" } })).status, 403);
    assert.equal((await request("/api/auth/request-code", { method: "POST", body: "{}" })).status, 400);
    assert.equal(await (await request("/manifest.webmanifest")).text(), "asset");

    // /doc returns markdown only when explicitly requested.
    const docRes = await app.request("https://dock.example.test/doc", { headers: { Accept: "text/markdown", "User-Agent": "curl/7.88.1" } }, {
      ...env,
      ASSETS: { fetch: async () => new Response("# StateDock Doc", { headers: { "Content-Type": "text/markdown" } }) }
    } as any);
    assert.equal(docRes.status, 200);
    assert.equal(docRes.headers.get("content-type"), "text/markdown; charset=utf-8");
    assert.match(await docRes.text(), /StateDock Doc/);

    const redirect = await app.request("https://dock.example.test/app?task=SD-000001", {}, env);
    assert.equal(redirect.status,200);
    assert.equal(redirect.headers.get("location"),null);
  } finally { f.client.close(); }
});

test("notification service isolates channel failures and preserves tenant and event context", async () => {
  const f = await fixture();
  const originalFetch = globalThis.fetch;
  const requests: { url: string; body: any }[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    if (String(url).includes("api.day.app")) throw new Error("simulated Bark outage");
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await f.client.execute("INSERT INTO bark_subscribers(user_id,device_key,enabled,updated_at) VALUES('one','device-one',1,'now'),('two','device-two',1,'now')");
    await f.client.execute("INSERT INTO ntfy_subscribers(user_id,topic_url,enabled,updated_at) VALUES('one','https://ntfy.sh/owner-one',1,'now'),('two','https://ntfy.sh/owner-two',1,'now')");
    const env = { DB: f.db, ATTACHMENTS: f.bucket } as OnlineEnv;
    const repo = notificationRepository(env, "one");
    const actor = { id: "test", type: "human" as const };
    const project = await repo.createProject({ slug: "demo", name: "Demo" }, actor);
    await repo.createPlan(project.id, { title: "Quiet plan", status: "PLAN" }, actor);
    assert.equal(requests.length, 0);
    const plan = await repo.createPlan(project.id, { title: "Shipped task", status: "DONE", summary: "Delivered" }, actor);
    assert.equal(requests.length, 2);
    const ntfy = requests.find(r => r.url.includes("ntfy.sh"));
    assert.ok(ntfy);
    assert.match(JSON.stringify(ntfy.body), /Demo/);
    assert.match(JSON.stringify(ntfy.body), /Delivered/);
    assert.equal(ntfy.body.title, `demo-${plan.number} · 任务已完成`);
    assert.match(ntfy.body.message, new RegExp(`demo-${plan.number} · Shipped task`));
    assert.ok(requests.every(r => !JSON.stringify(r).includes("owner-two") && !JSON.stringify(r).includes("device-two")));
    assert.equal((await repo.listPlans(project.id)).length, 2);
  } finally { globalThis.fetch = originalFetch; f.client.close(); }
});
