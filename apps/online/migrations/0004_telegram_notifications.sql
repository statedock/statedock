CREATE TABLE IF NOT EXISTS telegram_subscribers (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  notify_on_complete INTEGER NOT NULL DEFAULT 1,
  notify_on_create INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, chat_id)
);
CREATE INDEX IF NOT EXISTS telegram_subscribers_user_idx ON telegram_subscribers(user_id);
CREATE INDEX IF NOT EXISTS telegram_subscribers_chat_idx ON telegram_subscribers(chat_id);

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS telegram_link_tokens_user_idx ON telegram_link_tokens(user_id);
