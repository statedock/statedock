# StateDock Task Record — v1.0

A tool-neutral format for one unit of work: what was asked, what changed, how it was checked, and what is left. It does not depend on any agent, editor, or vendor. The executor is a replaceable attribute (`completedBy`), not part of the format.

Schemas: [`task-record.v1.schema.json`](task-record.v1.schema.json) (one task) and [`task-bundle.v1.schema.json`](task-bundle.v1.schema.json) (an export of many). JSON Schema draft-07.

## Fields

| Field | Required | Meaning |
|---|---|---|
| `specVersion` | yes | `"1.0"`. |
| `reference` | yes | Stable human-readable ID, e.g. `SD-000042`. |
| `title`, `body` | yes | What is wanted; `body` holds goal, discussion, acceptance criteria. |
| `summary` | yes (nullable) | Outcome. Convention: `Changes: …; Verification: …; Notes: …`. State what was *not* verified. |
| `status` | yes | `PLAN`, `READY`, `WORKING`, `WAITING`, `DONE`, `DROPPED`. |
| `codeReference` | no | `{commit, workingTree, branch, repository}` — the code state the result refers to. |
| `completedBy`, `completedAt` | no | Who finished it and when. Any actor (`human` or `agent`); a replaceable attribute. |
| `deliverables[]` | no | Where results live when they are not code: `{title?, location}` (file path, link, document). StateDock stores the pointer, not the file. Added in 1.0 as an optional field. |
| `reviews[]` | yes | Independent checks: `scope`, `verdict`, `summary`, `limitations`, `evidence`. |
| `feedback[]` | yes | Human or agent replies, decisions, and comments. |
| `project`, `assignedTo`, `number`, `createdAt`, `updatedAt` | no / mixed | Context and timestamps (see schema). |

## Status flow

`PLAN` (undecided) → `READY` (approved) → `WORKING` → `DONE`. A task may go to `WAITING` when it needs a human decision (the reply returns it to `READY`), and to `DROPPED` with a short reason at any point before `DONE`.

## Compatibility

- Minor versions (1.x) are additive only. Readers must ignore unknown fields and must not fail on them.
- A breaking change bumps the major version and a new schema file (`…v2…`).
- Writers should always emit `specVersion`.

## Example

```json
{
  "specVersion": "1.0",
  "reference": "SD-000007",
  "title": "Ship the export",
  "body": "Goal and acceptance criteria",
  "summary": "Changes: added exporter; Verification: node --test passes; not run in a browser; Notes: none",
  "status": "DONE",
  "completedBy": { "id": "agent:1", "type": "agent", "name": "Any agent" },
  "completedAt": "2026-10-16T10:00:00.000Z",
  "codeReference": { "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "workingTree": "clean", "branch": "main" },
  "deliverables": [{ "title": "Final cut", "location": "https://example.com/final.mp4" }],
  "createdAt": "2026-10-15T10:00:00.000Z",
  "updatedAt": "2026-10-16T10:00:00.000Z",
  "reviews": [],
  "feedback": []
}
```

A reference exporter lives in `packages/core` (`toTaskRecord`, `toTaskBundle`). Over MCP, the read-only `export_task_records` tool returns a bundle for a project (optionally filtered by status, up to 100 tasks per call).
