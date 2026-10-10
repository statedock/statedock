CREATE TABLE IF NOT EXISTS discord_subscribers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL UNIQUE,
  discord_username TEXT,
  default_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discord_subscribers_user ON discord_subscribers(user_id);
CREATE INDEX IF NOT EXISTS idx_discord_subscribers_discord_user ON discord_subscribers(discord_user_id);

CREATE TABLE IF NOT EXISTS discord_link_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_discord_link_tokens_expires ON discord_link_tokens(expires_at);
