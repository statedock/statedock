CREATE TABLE notification_preferences (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel TEXT NOT NULL CHECK(channel IN ('bark','telegram','discord')),
 connection_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1,
 project_ids TEXT NOT NULL DEFAULT 'null',
 events TEXT NOT NULL DEFAULT '["completed","waiting"]',
 PRIMARY KEY(user_id,channel,connection_id)
);
CREATE TABLE discord_connections (
 id TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 webhook_url TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX discord_connections_user_idx ON discord_connections(user_id);
INSERT INTO notification_preferences(user_id,channel,connection_id,enabled)
 SELECT user_id,'bark','default',enabled FROM bark_subscribers;
UPDATE bark_subscribers SET enabled=1;
