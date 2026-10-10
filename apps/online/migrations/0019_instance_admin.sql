ALTER TABLE users ADD COLUMN disabled_at TEXT;
ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE instance_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
CREATE TABLE admin_events (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX admin_events_created_idx ON admin_events(created_at);
