CREATE TABLE notification_preferences_v2 (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel TEXT NOT NULL CHECK(channel IN ('bark','telegram','discord','ntfy')),
 connection_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1,
 project_ids TEXT NOT NULL DEFAULT 'null',
 events TEXT NOT NULL DEFAULT '["completed","waiting"]',
 PRIMARY KEY(user_id,channel,connection_id)
);

INSERT INTO notification_preferences_v2(user_id,channel,connection_id,enabled,project_ids,events)
 SELECT user_id,channel,connection_id,enabled,project_ids,events FROM notification_preferences;

DROP TABLE notification_preferences;
ALTER TABLE notification_preferences_v2 RENAME TO notification_preferences;

CREATE TABLE ntfy_subscribers (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 topic_url TEXT NOT NULL,
 auth_token TEXT,
 enabled INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
);
