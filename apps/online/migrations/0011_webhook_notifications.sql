CREATE TABLE IF NOT EXISTS webhook_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhook_connections_user ON webhook_connections(user_id);

CREATE TABLE notification_preferences_v3 (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('bark','telegram','discord','ntfy','webhook')),
  connection_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  project_ids TEXT NOT NULL DEFAULT 'null',
  events TEXT NOT NULL DEFAULT '["completed","waiting"]',
  PRIMARY KEY(user_id,channel,connection_id)
);

INSERT INTO notification_preferences_v3(user_id,channel,connection_id,enabled,project_ids,events)
  SELECT user_id,channel,connection_id,enabled,project_ids,events FROM notification_preferences;

DROP TABLE notification_preferences;
ALTER TABLE notification_preferences_v3 RENAME TO notification_preferences;
