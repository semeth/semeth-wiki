CREATE TABLE replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  author_discord_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id),
  FOREIGN KEY (author_discord_id) REFERENCES users(discord_id)
);

CREATE INDEX idx_replies_report ON replies(report_id, created_at);
