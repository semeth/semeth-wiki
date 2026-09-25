CREATE TABLE users (
  discord_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  avatar TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (discord_id) REFERENCES users(discord_id)
);

CREATE INDEX idx_sessions_discord ON sessions(discord_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_kind TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  minecraft_version TEXT,
  mod_version TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  hidden INTEGER NOT NULL DEFAULT 0,
  author_discord_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (author_discord_id) REFERENCES users(discord_id)
);

CREATE INDEX idx_reports_project ON reports(project_kind, project_slug, hidden, created_at);
