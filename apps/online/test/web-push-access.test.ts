import { test } from "node:test";
import assert from "node:assert/strict";
import app from "../src/index.js";
import { validPushEndpoint } from "../src/web-push-config.js";
import { pushFixture } from "./web-push-fixture.js";

test("Web Push subscriptions are multi-device, owner-only, origin checked and independent of Cloud quotas", async () => {
  const f = await pushFixture();
  const request = (
    path: string,
    method = "GET",
    user = "one",
    body?: unknown,
    origin = "https://instance.test",
  ) =>
    app.request(
      `https://instance.test/api${path}`,
      {
        method,
        headers: {
          Origin: origin,
          Cookie: `statedock_session=${user}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      f.env,
    );
  try {
    assert.equal((await request("/auth/web-push", "GET", "missing")).status, 401);
    assert.equal(
      (await request("/auth/web-push", "POST", "one", f.subscription("phone"), "https://evil.test"))
        .status,
      403,
    );
    const first = await request("/auth/web-push", "POST", "one", f.subscription("phone"));
    assert.equal(first.status, 201);
    const id = ((await first.json()) as any).data.id;
    assert.equal(
      (await request("/auth/web-push", "POST", "one", f.subscription("desktop"))).status,
      201,
    );
    assert.equal(
      (await request("/auth/web-push", "POST", "two", f.subscription("phone"))).status,
      409,
    );
    const list = await request("/auth/web-push");
    assert.equal(list.headers.get("cache-control"), "no-store");
    const data = ((await list.json()) as any).data;
    assert.equal(data.devices.length, 2);
    assert.equal(data.publicKey, f.env.VAPID_PUBLIC_KEY);
    assert.ok(!JSON.stringify(data).includes(f.subscription("phone").subscription.keys.auth));
    assert.equal(
      (
        await request(`/auth/notifications/webpush/${id}`, "PUT", "two", {
          enabled: true,
          projectIds: null,
          events: ["completed"],
        })
      ).status,
      404,
    );
    // Free quota can already be occupied by an external channel; built-in push still works.
    await f.client.execute(
      "INSERT INTO bark_subscribers(user_id,device_key,enabled,updated_at) VALUES('one','device',1,'now')",
    );
    assert.equal(
      (
        await request(`/auth/notifications/webpush/${id}`, "PUT", "one", {
          enabled: true,
          projectIds: null,
          events: ["completed", "waiting"],
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await request(`/auth/notifications/webpush/${id}`, "PUT", "one", {
          enabled: true,
          projectIds: ["00000000-0000-4000-8000-000000000001"],
          events: ["completed"],
        })
      ).status,
      400,
    );
    await request(`/auth/web-push/${id}`, "DELETE", "two");
    assert.equal(
      ((await request("/auth/web-push").then((r) => r.json())) as any).data.devices.length,
      2,
    );
    await request(`/auth/web-push/${id}`, "DELETE");
    assert.equal(
      ((await request("/auth/web-push").then((r) => r.json())) as any).data.devices.length,
      1,
    );
    await f.client.execute("UPDATE users SET disabled_at='now' WHERE id='one'");
    assert.equal((await request("/auth/web-push")).status, 401);
  } finally {
    f.client.close();
  }
});
test("Push endpoints reject arbitrary hosts, insecure URLs and lookalike service domains", () => {
  for (const url of [
    "http://fcm.googleapis.com/wp/x",
    "https://localhost/x",
    "https://127.0.0.1/x",
    "https://fcm.googleapis.com.evil.test/x",
    "https://user:pass" + "@" + "fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://fcm.googleapis.com/x#fragment",
  ])
    assert.equal(validPushEndpoint(url), false, url);
  for (const url of [
    "https://fcm.googleapis.com/wp/a",
    "https://web.push.apple.com/a",
    "https://updates.push.services.mozilla.com/wpush/a",
    "https://wns.notify.windows.com/a",
  ])
    assert.equal(validPushEndpoint(url), true, url);
});
