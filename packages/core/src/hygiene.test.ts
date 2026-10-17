import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Plan } from "./index.js";
import { findHygieneIssues } from "./hygiene.js";

const now = new Date("2026-10-16T12:00:00Z");
const plan = (over: Partial<Plan>): Plan => ({
  id: over.reference ?? "x",
  projectId: "p",
  number: 1,
  reference: "SD-1",
  title: "A reasonable title",
  body: "",
  summary: null,
  status: "PLAN",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-15T00:00:00Z",
  ...over,
});

describe("project hygiene", () => {
  it("flags stale WORKING tasks but not recent ones", () => {
    const report = findHygieneIssues(
      [
        plan({ reference: "SD-1", status: "WORKING", updatedAt: "2026-10-01T00:00:00Z" }),
        plan({ reference: "SD-2", status: "WORKING", updatedAt: "2026-10-16T00:00:00Z" }),
      ],
      { now },
    );
    assert.deepEqual(
      report.issues.map((i) => [i.kind, i.reference]),
      [["stale_active", "SD-1"]],
    );
  });
  it("flags DONE tasks without a summary or completer", () => {
    const report = findHygieneIssues(
      [
        plan({ reference: "SD-3", status: "DONE", summary: null }),
        plan({
          reference: "SD-4",
          status: "DONE",
          summary: "Changes: ok; Verification: ran node --test",
          completedBy: { id: "a", type: "agent", name: "a" } as never,
        }),
        plan({
          reference: "SD-5",
          status: "DONE",
          summary: "Changes: ok; Verification: ran node --test",
          completedBy: null,
        }),
      ],
      { now },
    );
    assert.deepEqual(
      report.issues.map((i) => i.reference),
      ["SD-3", "SD-5"],
    );
    assert.equal(report.counts.done_without_handoff, 2);
  });
  it("flags DONE tasks whose outcome has no verification evidence", () => {
    const by = { id: "a", type: "agent", name: "a" } as never;
    const report = findHygieneIssues(
      [
        plan({
          reference: "SD-20",
          status: "DONE",
          completedBy: by,
          summary: "Changes: did it; Notes: none",
        }),
        plan({
          reference: "SD-21",
          status: "DONE",
          completedBy: by,
          summary: "变更：做了；验证：；说明：无",
        }),
        plan({
          reference: "SD-22",
          status: "DONE",
          completedBy: by,
          summary: "Changes: did it; Verification: ran node --test, 12 passed; Notes: none",
        }),
        plan({
          reference: "SD-23",
          status: "DONE",
          completedBy: by,
          summary: "变更：做了；验证：单元测试全部通过；说明：无",
        }),
      ],
      { now },
    );
    assert.deepEqual(
      report.issues.filter((i) => i.kind === "done_unverified").map((i) => i.reference),
      ["SD-20", "SD-21"],
    );
  });
  it("flags near-duplicate open tasks, in English and Chinese", () => {
    const report = findHygieneIssues(
      [
        plan({ reference: "SD-6", title: "Add Telegram capture for ideas" }),
        plan({ reference: "SD-7", title: "Add Telegram capture for idea" }),
        plan({ reference: "SD-8", title: "PWA 首页改为需要我决定队列" }),
        plan({ reference: "SD-9", title: "PWA 首页改为需要我决定的队列" }),
        plan({ reference: "SD-10", title: "Completely different work", status: "READY" }),
      ],
      { now },
    );
    assert.deepEqual(
      report.issues.filter((i) => i.kind === "possible_duplicate").map((i) => i.reference),
      ["SD-7", "SD-9"],
    );
  });
  it("does not report finished or dropped tasks as duplicates", () => {
    const report = findHygieneIssues(
      [
        plan({
          reference: "SD-11",
          title: "Same title here",
          status: "DONE",
          summary: "Changes: x; Verification: ran node --test",
          completedBy: { id: "a", type: "agent", name: "a" } as never,
        }),
        plan({ reference: "SD-12", title: "Same title here", status: "PLAN" }),
      ],
      { now },
    );
    assert.equal(report.total, 0);
  });
  it("caps the number of issues and says so", () => {
    const plans = Array.from({ length: 5 }, (_, i) =>
      plan({ reference: `SD-${i}`, status: "DONE", summary: null }),
    );
    const report = findHygieneIssues(plans, { now, limit: 2 });
    assert.equal(report.issues.length, 2);
    assert.equal(report.truncated, true);
    assert.equal(report.total, 5);
  });
});
