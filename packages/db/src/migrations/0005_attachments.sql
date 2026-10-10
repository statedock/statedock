CREATE TABLE attachments (
 id TEXT PRIMARY KEY NOT NULL,
 plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
 data TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX attachments_plan_idx ON attachments(plan_id);
