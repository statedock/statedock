-- Upgrade bark_subscribers and ntfy_subscribers to support multiple endpoints per user

-- 1. bark_subscribers
CREATE TABLE bark_subscribers_v2 (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Bark',
  device_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO bark_subscribers_v2 (id, user_id, name, device_key, enabled, created_at, updated_at)
  SELECT
    'default',
    user_id,
    'Bark',
    device_key,
    enabled,
    updated_at,
    updated_at
  FROM bark_subscribers;

DROP TABLE bark_subscribers;
ALTER TABLE bark_subscribers_v2 RENAME TO bark_subscribers;
CREATE INDEX IF NOT EXISTS idx_bark_subscribers_user ON bark_subscribers(user_id);

-- 2. ntfy_subscribers
CREATE TABLE ntfy_subscribers_v2 (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'ntfy',
  topic_url TEXT NOT NULL,
  auth_token TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO ntfy_subscribers_v2 (id, user_id, name, topic_url, auth_token, enabled, created_at, updated_at)
  SELECT
    'default',
    user_id,
    'ntfy',
    topic_url,
    auth_token,
    enabled,
    updated_at,
    updated_at
  FROM ntfy_subscribers;

DROP TABLE ntfy_subscribers;
ALTER TABLE ntfy_subscribers_v2 RENAME TO ntfy_subscribers;
CREATE INDEX IF NOT EXISTS idx_ntfy_subscribers_user ON ntfy_subscribers(user_id);
