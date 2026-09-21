-- Universal Event Insights / D1 schema v7
-- Intended for a fresh database or a deliberate reset.
-- The Cloudflare Dashboard D1 console may require each statement
-- to be executed separately; Wrangler migrations can run the file as a migration.

DROP TABLE IF EXISTS notification_log;
DROP TABLE IF EXISTS platform_sessions;
DROP TABLE IF EXISTS platform_visitors;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS platforms;

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

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL,

  platform_id TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  platform_type TEXT NOT NULL DEFAULT 'generic',

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
  as_organization TEXT,
  latitude TEXT,
  longitude TEXT,
  postal_code TEXT,
  metro_code TEXT,

  tls_version TEXT,
  client_tcp_rtt INTEGER,
  client_quic_rtt INTEGER,

  ip TEXT,
  ip_hash TEXT,

  user_agent TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  device TEXT,

  screen_width INTEGER,
  screen_height INTEGER,
  viewport_width INTEGER,
  viewport_height INTEGER,
  device_pixel_ratio REAL,
  color_depth INTEGER,

  connection_type TEXT,
  connection_downlink REAL,
  connection_rtt INTEGER,
  connection_save_data INTEGER NOT NULL DEFAULT 0,

  duration_ms INTEGER NOT NULL DEFAULT 0,
  max_scroll INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  outbound_clicks INTEGER NOT NULL DEFAULT 0,

  data_json TEXT NOT NULL DEFAULT '{}',
  payload_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  raw_event_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE notification_log (
  event_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  error TEXT
);

CREATE INDEX idx_events_platform_received ON events(platform_id, received_at);
CREATE INDEX idx_events_received ON events(received_at);
CREATE INDEX idx_events_platform_type ON events(platform_id, event_type);
CREATE INDEX idx_events_platform_ip ON events(platform_id, ip);
CREATE INDEX idx_events_ip ON events(ip);
CREATE INDEX idx_events_platform_visitor ON events(platform_id, visitor_id);
CREATE INDEX idx_events_platform_session ON events(platform_id, session_id);
CREATE INDEX idx_events_country ON events(country);
CREATE INDEX idx_events_browser ON events(browser);
CREATE INDEX idx_events_os ON events(os);
CREATE INDEX idx_events_device ON events(device);
CREATE INDEX idx_events_path ON events(platform_id, path);
CREATE INDEX idx_sessions_last_seen ON platform_sessions(platform_id, last_seen);
CREATE INDEX idx_sessions_visitor ON platform_sessions(platform_id, visitor_id);
CREATE INDEX idx_visitors_last_seen ON platform_visitors(platform_id, last_seen);
CREATE INDEX idx_notifications_platform ON notification_log(platform_id, sent_at);
