import type { PlanEvent } from "@statedock/core";
import assert from "node:assert/strict";
import { test } from "node:test";
import { freshEvents, notificationText } from "./notification-events";
const event = (
  sequence: number,
  kind: PlanEvent["kind"] = "created",
  projectSlug = "statedock",
): PlanEvent => ({
  sequence,
  kind,
  reference: "SD-000004",
  number: 3,
  projectId: "project",
  projectSlug,
  title: "通知",
  createdAt: "now",
});
test("notification feed filters old events, deduplicates and keeps lifecycle order", () => {
  assert.deepEqual(
    freshEvents([event(3, "completed"), event(2, "started"), event(2, "started"), event(1)], 1).map(
      (e) => e.sequence,
    ),
    [2, 3],
  );
});
test("notifications include the natural project id, title and lifecycle label", () => {
  for (const [kind, label] of [
    ["created", "新任务"],
    ["started", "开始执行"],
    ["completed", "已完成"],
    ["dropped", "决定不做"],
  ] as const) {
    assert.deepEqual(notificationText(event(1, kind), "zh"), {
      title: `StateDock · ${label}`,
      body: "statedock-3 · 通知",
    });
  }
  for (const [kind, label] of [
    ["created", "New Task"],
    ["started", "Started"],
    ["completed", "Completed"],
    ["dropped", "Dropped"],
  ] as const) {
    assert.deepEqual(notificationText(event(1, kind), "en"), {
      title: `StateDock · ${label}`,
      body: "statedock-3 · 通知",
    });
  }
});
test("notifications fallback to reference when projectSlug is not present", () => {
  assert.deepEqual(notificationText(event(1, "created", ""), "zh"), {
    title: "StateDock · 新任务",
    body: "SD-000004 · 通知",
  });
  assert.deepEqual(notificationText(event(1, "created", ""), "en"), {
    title: "StateDock · New Task",
    body: "SD-000004 · 通知",
  });
});
