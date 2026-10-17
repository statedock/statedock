import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import type { Plan, TaskEntry } from "./index.js";
import { parseDeliverables, toTaskBundle, toTaskRecord } from "./task-record.js";

const plan: Plan = {
  id: "1",
  projectId: "p",
  number: 7,
  reference: "SD-000007",
  title: "Ship the export",
  body: "Goal and acceptance criteria",
  summary: "Changes: done; Verification: ran node --test; Notes: none",
  status: "DONE",
  completedBy: { id: "agent:1", type: "agent", name: "Any agent" },
  completedAt: "2026-10-16T10:00:00.000Z",
  codeReference: { commit: "a".repeat(40), workingTree: "clean", branch: "main" },
  createdAt: "2026-10-15T10:00:00.000Z",
  updatedAt: "2026-10-16T10:00:00.000Z",
};
const entries: TaskEntry[] = [
  {
    id: "e1",
    planId: "1",
    kind: "review",
    content: { scope: "behavior", verdict: "passed", summary: "ok", limitations: "", evidence: "" },
    actor: { id: "agent:2", type: "agent" },
    createdAt: "2026-10-16T11:00:00.000Z",
  },
  {
    id: "e2",
    planId: "1",
    kind: "feedback",
    content: { body: "thanks" },
    actor: { id: "u", type: "human" },
    createdAt: "2026-10-16T12:00:00.000Z",
  },
];

describe("task record export", () => {
  it("maps a task and its entries without product-specific fields", () => {
    const record = toTaskRecord(plan, { project: { slug: "demo", name: "Demo" }, entries });
    assert.equal(record.specVersion, "1.0");
    assert.equal(record.reviews.length, 1);
    assert.equal(record.feedback[0].body, "thanks");
    assert.equal("assignedAgentId" in record, false);
    assert.equal("claimedAgentId" in record, false);
  });

  it("reads deliverables from the handoff summary", () => {
    const summary =
      "Changes: made video; Verification: watched it; Deliverables: Final cut — https://example.com/v.mp4 | /exports/v.srt; Notes: none";
    assert.deepEqual(parseDeliverables(summary), [
      { title: "Final cut", location: "https://example.com/v.mp4" },
      { location: "/exports/v.srt" },
    ]);
    assert.deepEqual(parseDeliverables("成果：成片 — /out/a.mp4；注意：无"), [
      { title: "成片", location: "/out/a.mp4" },
    ]);
    assert.deepEqual(parseDeliverables("Changes: x"), []);
    const record = toTaskRecord({ ...plan, summary });
    assert.equal(record.deliverables?.length, 2);
  });

  it("wraps records in a bundle", () => {
    const bundle = toTaskBundle([toTaskRecord(plan)], {
      source: { name: "StateDock" },
      exportedAt: "2026-10-16T12:00:00.000Z",
    });
    assert.equal(bundle.tasks.length, 1);
    assert.equal(bundle.specVersion, "1.0");
  });

  it("conforms to the published JSON Schema (skipped when ajv is not installed)", async (t) => {
    const ajvModule = await import(["aj", "v"].join("")).catch(() => null);
    const formatsModule = await import(["ajv", "formats"].join("-")).catch(() => null);
    if (!ajvModule || !formatsModule)
      return t.skip("ajv and ajv-formats are not installed in this package");
    const Ajv = (ajvModule as any).default.default ?? (ajvModule as any).default;
    const addFormats = (formatsModule as any).default.default ?? (formatsModule as any).default;
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    const schemaPath = new URL("../../../docs/spec/task-record.v1.schema.json", import.meta.url);
    const validate = ajv.compile(JSON.parse(await readFile(schemaPath, "utf8")));
    assert.equal(
      validate(toTaskRecord(plan, { project: { slug: "demo", name: "Demo" }, entries })),
      true,
      JSON.stringify(validate.errors),
    );
    assert.equal(validate({ ...toTaskRecord(plan), status: "FINISHED" }), false);
  });
});
