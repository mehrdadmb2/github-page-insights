CREATE TABLE IF NOT EXISTS event_archives (
  event_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  archive_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  commit_sha TEXT,
  file_sha TEXT,
  last_error TEXT
);
