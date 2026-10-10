CREATE TABLE attachments (
 id TEXT PRIMARY KEY NOT NULL, plan_id TEXT NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
 name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL, object_key TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX attachments_plan_idx ON attachments(plan_id);
ALTER TABLE telegram_subscribers ADD COLUMN default_project_id TEXT;
ALTER TABLE telegram_subscribers ADD COLUMN telegram_user_id TEXT;
CREATE TABLE telegram_updates(update_id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE integration_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
