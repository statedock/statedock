CREATE TABLE web_push_subscriptions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
 name TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'en', created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL, last_test_at TEXT
);
CREATE INDEX web_push_user ON web_push_subscriptions(user_id);
CREATE TRIGGER web_push_device_limit BEFORE INSERT ON web_push_subscriptions
 WHEN NOT EXISTS(SELECT 1 FROM web_push_subscriptions WHERE id=NEW.id)
 AND (SELECT COUNT(*) FROM web_push_subscriptions WHERE user_id=NEW.user_id)>=20
 BEGIN SELECT RAISE(ABORT,'push_device_limit'); END;
CREATE TABLE notification_preferences_push (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel TEXT NOT NULL CHECK(channel IN ('bark','telegram','discord','ntfy','webhook','webpush')),
 connection_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
 project_ids TEXT NOT NULL DEFAULT 'null', events TEXT NOT NULL DEFAULT '["completed","waiting"]',
 PRIMARY KEY(user_id,channel,connection_id)
);
INSERT INTO notification_preferences_push SELECT * FROM notification_preferences;
DROP TABLE notification_preferences;
ALTER TABLE notification_preferences_push RENAME TO notification_preferences;
CREATE TABLE web_push_outbox (
 event_id INTEGER NOT NULL, subscription_id TEXT NOT NULL REFERENCES web_push_subscriptions(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 available_at TEXT NOT NULL, lease TEXT, delivered_at TEXT,
 PRIMARY KEY(event_id,subscription_id)
);
CREATE INDEX web_push_pending ON web_push_outbox(delivered_at,available_at);
CREATE TRIGGER plan_event_web_push AFTER INSERT ON plan_events BEGIN
 INSERT INTO web_push_outbox(event_id,subscription_id,project_id,payload,available_at)
 SELECT NEW.sequence,s.id,NEW.project_id,
 json_object('projectId',NEW.project_id,'projectName',pr.name,'projectSlug',pr.slug,'number',NEW.number,'reference',NEW.reference,'title',NEW.title,'kind',NEW.kind,'summary',p.summary,'reason',substr(p.body,1,1000)),NEW.created_at
 FROM projects pr JOIN plans p ON p.project_id=pr.id AND p.number=NEW.number
 JOIN (SELECT owner_id user_id,id project_id FROM projects UNION SELECT user_id,project_id FROM project_members) recipient ON recipient.project_id=pr.id
 JOIN web_push_subscriptions s ON s.user_id=recipient.user_id
 JOIN users u ON u.id=s.user_id AND u.disabled_at IS NULL
 JOIN sessions ss ON ss.id=s.session_id AND ss.revoked_at IS NULL AND ss.expires_at>NEW.created_at
 WHERE pr.id=NEW.project_id;
END;
