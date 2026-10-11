import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { IDBFactory } from "fake-indexeddb";
const script = readFileSync(new URL("../sw-push.template.js", import.meta.url), "utf8");
function worker(indexedDB: IDBFactory, show: (...args: any[]) => Promise<void>) {
  const listeners: Record<string, (event: any) => void> = {};
  runInNewContext(script, {
    indexedDB,
    Date,
    Number,
    Promise,
    self: {
      addEventListener: (kind: string, handler: any) => (listeners[kind] = handler),
      registration: { showNotification: show },
    },
  });
  const emit = (kind: string, data: any) => {
    let pending = Promise.resolve();
    listeners[kind]({
      data: kind === "push" ? { json: () => data } : data,
      waitUntil: (p: Promise<void>) => (pending = p),
    });
    return pending;
  };
  return {
    push: (notice: any) => emit("push", notice),
    account: (userId: string | null) => emit("message", { type: "PUSH_ACCOUNT", userId }),
  };
}
const notice = {
  eventId: "42",
  userId: "one",
  title: "Task completed",
  body: "project-4 · Done",
  projectId: "project",
  reference: "SD-000004",
};
test("Concurrent and retried pushes show once, including after a Service Worker restart", async () => {
  const db = new IDBFactory();
  const shown: any[] = [];
  const show = async (...args: any[]) => {
    shown.push(args);
  };
  const sw = worker(db, show);
  await Promise.all([sw.push(notice), sw.push(notice)]);
  assert.equal(shown.length, 1);
  const restarted = worker(db, show);
  await restarted.push(notice);
  assert.equal(shown.length, 1);
  await restarted.push({ ...notice, eventId: "43" });
  assert.equal(shown.length, 2);
  assert.equal(shown[0][1].renotify, false);
  assert.equal(shown[0][1].data.reference, "SD-000004");
});
test("Push display failure can retry; switched and signed-out accounts cannot display old notices", async () => {
  const db = new IDBFactory();
  let fail = true,
    count = 0;
  const sw = worker(db, async () => {
    if (fail) throw new Error("display failed");
    count++;
  });
  await assert.rejects(sw.push(notice));
  fail = false;
  await sw.push(notice);
  assert.equal(count, 1);
  await sw.account("two");
  await sw.push({ ...notice, eventId: "43" });
  assert.equal(count, 1);
  await sw.account(null);
  await sw.push({ ...notice, eventId: "44" });
  assert.equal(count, 1);
  await sw.account("one");
  await sw.push({ ...notice, eventId: "45" });
  assert.equal(count, 2);
});

test("Notification clicks focus a task or open it on the self-hosted origin", async () => {
  const clickScript = readFileSync(new URL("../sw.template.js", import.meta.url), "utf8").split(
    "// OS Notification click handler:",
  )[1];
  let handler: any,
    focused = 0,
    closed = 0;
  const opened: string[] = [],
    messages: any[] = [];
  let clients: any[] = [];
  runInNewContext("// OS Notification click handler:" + clickScript, {
    URL,
    encodeURIComponent,
    self: {
      location: { origin: "https://independent.example.test" },
      addEventListener: (_kind: string, listener: any) => (handler = listener),
      clients: {
        matchAll: async () => clients,
        openWindow: async (url: string) => opened.push(url),
      },
    },
  });
  async function click() {
    let pending: Promise<void> = Promise.resolve();
    handler({
      notification: { data: notice, close: () => closed++ },
      waitUntil: (value: Promise<void>) => (pending = value),
    });
    await pending;
  }
  await click();
  assert.equal(opened[0], "/?project=project&task=SD-000004");
  clients = [
    {
      url: "https://independent.example.test/",
      postMessage: (m: any) => messages.push(m),
      focus: async () => focused++,
    },
  ];
  await click();
  assert.equal(focused, 1);
  assert.equal(opened.length, 1);
  assert.equal(messages[0].type, "NAVIGATE_TO_PLAN");
  assert.equal(messages[0].data.reference, notice.reference);
  assert.equal(closed, 2);
});
