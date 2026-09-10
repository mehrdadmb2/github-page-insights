CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  site_id TEXT NOT NULL,
  site_name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  page_url TEXT,
  path TEXT,
  title TEXT,
  referrer TEXT,
  referrer_host TEXT,
  language TEXT,
  timezone TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  continent TEXT,
  colo TEXT,
  asn INTEGER,
  ip TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  viewport_width INTEGER,
  viewport_height INTEGER,
  duration_ms INTEGER DEFAULT 0,
  max_scroll INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  outbound_clicks INTEGER DEFAULT 0,
  exported INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sites (
  site_id TEXT PRIMARY KEY,
  site_name TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visitor_sessions (
  site_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  duration_ms INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  max_scroll INTEGER DEFAULT 0,
  PRIMARY KEY(site_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_events_site_received ON events(site_id, received_at);
CREATE INDEX IF NOT EXISTS idx_events_exported ON events(exported, received_at);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(site_id, visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_site_last ON visitor_sessions(site_id, last_seen);
