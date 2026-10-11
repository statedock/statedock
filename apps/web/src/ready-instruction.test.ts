import assert from "node:assert/strict";
import test from "node:test";
import { buildReadyInstruction } from "./ready-instruction.js";
test("Ready directive binds canonical instance and UUID, stops on empty or blockers", () => {
  for (const lang of ["zh", "en"] as const) {
    const s = buildReadyInstruction(
      { publicOrigin: "https://example.test", mcpUrl: "https://example.test/mcp" },
      { id: "uuid-A", slug: "project-a" },
      lang,
    );
    assert.match(s, /uuid-A/);
    assert.match(s, /get_instance_info/);
    assert.match(s, /claim_next_task/);
    assert.match(s, /submit_handoff/);
    assert.match(s, /pause_task/);
    assert.match(s, /PLAN/);
    assert.match(s, /WAITING/);
    assert.match(s, /https:\/\/example.test/);
    assert.doesNotMatch(s, /statedock\.dev/);
  }
  assert.throws(() =>
    buildReadyInstruction(
      { publicOrigin: "https://a.test", mcpUrl: "https://b.test/mcp" },
      { id: "a", slug: "a" },
      "en",
    ),
  );
  assert.throws(() =>
    buildReadyInstruction(
      { publicOrigin: "https://a.test/path", mcpUrl: "https://a.test/mcp" },
      { id: "a", slug: "a" },
      "en",
    ),
  );
});
