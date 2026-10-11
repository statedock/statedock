import { test } from "node:test";
import assert from "node:assert/strict";
import { createRefreshRunner, freshCached, startVisiblePolling } from "./workspace-sync";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("slow reads coalesce ticks and queue one post-mutation refresh", async () => {
  const run = createRefreshRunner();
  const first = deferred();
  let calls = 0;
  const action = async () => {
    calls++;
    if (calls === 1) await first.promise;
  };
  const initial = run("project", action);
  await Promise.resolve();
  assert.equal(run("project", action, true), initial);
  const manual = run("project", action);
  assert.equal(run("project", action), manual);
  assert.equal(calls, 1);
  first.resolve();
  await manual;
  assert.equal(calls, 2);
});

test("failed refreshes release the lock and permit recovery", async () => {
  const run = createRefreshRunner();
  const first = deferred();
  const pending = run("project", async () => {
    await first.promise;
    throw new Error("offline");
  });
  const manual = run("project", async () => {});
  first.resolve();
  await assert.rejects(pending, /offline/);
  await manual;
  let recovered = false;
  await run("project", async () => {
    recovered = true;
  });
  assert.ok(recovered);
});

test("reusing cached project data does not extend its network freshness", () => {
  const entry = { value: ["old task"], at: 1000 };
  for (let now = 6000; now < 31000; now += 5000)
    assert.equal(freshCached(entry, now, 30000), entry.value);
  assert.equal(freshCached(entry, 31000, 30000), undefined);
  assert.equal(entry.at, 1000);
});

test("hidden pages pause reads, visibility and focus restore them, cleanup removes polling", async () => {
  const page = new EventTarget() as Document;
  Object.defineProperty(page, "visibilityState", { value: "hidden", writable: true });
  const host = new EventTarget() as Window;
  let tick!: () => void;
  let cleared = false;
  host.setInterval = ((fn: () => void) => {
    tick = fn;
    return 1;
  }) as typeof host.setInterval;
  host.clearInterval = () => {
    cleared = true;
  };
  let calls = 0;
  const stop = startVisiblePolling(
    async () => {
      calls++;
    },
    page,
    host,
  );
  tick();
  assert.equal(calls, 0);
  Object.defineProperty(page, "visibilityState", { value: "visible" });
  page.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls, 1);
  tick();
  assert.equal(calls, 2);
  host.dispatchEvent(new Event("focus"));
  assert.equal(calls, 3);
  stop();
  assert.ok(cleared);
  page.dispatchEvent(new Event("visibilitychange"));
  host.dispatchEvent(new Event("focus"));
  assert.equal(calls, 3);
});
