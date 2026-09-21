CREATE TABLE IF NOT EXISTS notification_log (
  event_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  error TEXT
);
