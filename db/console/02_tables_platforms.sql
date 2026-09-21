CREATE TABLE platforms (
  platform_id TEXT PRIMARY KEY,
  platform_name TEXT NOT NULL,
  platform_type TEXT NOT NULL DEFAULT 'generic',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  total_events INTEGER NOT NULL DEFAULT 0,
  total_pageviews INTEGER NOT NULL DEFAULT 0,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  total_visitors INTEGER NOT NULL DEFAULT 0,
  api_key_hash TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE platform_visitors (
  platform_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  last_ip TEXT,
  country TEXT,
  city TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  PRIMARY KEY(platform_id, visitor_id)
);

CREATE TABLE platform_sessions (
  platform_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  max_scroll INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  country TEXT,
  city TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  PRIMARY KEY(platform_id, session_id)
);
