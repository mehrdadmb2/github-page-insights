CREATE TABLE IF NOT EXISTS sites (
  site_id TEXT PRIMARY KEY,
  site_name TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0
);

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
  duration_ms INTEGER NOT NULL DEFAULT 0,
  max_scroll INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  outbound_clicks INTEGER NOT NULL DEFAULT 0,
  exported INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visitor_sessions (
  site_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  max_scroll INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(site_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_events_site_received ON events(site_id, received_at);
CREATE INDEX IF NOT EXISTS idx_events_ip ON events(ip);
CREATE INDEX IF NOT EXISTS idx_events_site_ip ON events(site_id, ip);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(site_id, visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(site_id, session_id);

## Collector API

### `POST /collect`

The collector accepts JSON. The endpoint is public.

Example:
