CREATE TABLE task_entries (
 id TEXT PRIMARY KEY NOT NULL,
 plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('review','feedback')),
 content TEXT NOT NULL,
 actor_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_name TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX task_entries_plan_idx ON task_entries(plan_id,kind,created_at);
CREATE TRIGGER task_entries_no_update BEFORE UPDATE ON task_entries BEGIN SELECT RAISE(ABORT,'Task entries are append-only'); END;
CREATE TRIGGER task_entries_no_delete BEFORE DELETE ON task_entries WHEN EXISTS (SELECT 1 FROM plans WHERE id=OLD.plan_id) BEGIN SELECT RAISE(ABORT,'Task entries are append-only'); END;
