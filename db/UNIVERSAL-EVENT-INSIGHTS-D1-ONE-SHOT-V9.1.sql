-- ============================================================
-- UNIVERSAL EVENT INSIGHTS D1 — ONE SHOT RESET + INSTALL v9.1
-- ============================================================
-- WARNING: THIS IS A DESTRUCTIVE FRESH-INSTALL SCRIPT.
-- It removes this project's old analytics tables and their data.
-- It intentionally does NOT touch Cloudflare's internal _cf_KV table.
--
-- Designed for Cloudflare D1 Console / D1 multi-statement execution.
-- No BEGIN TRANSACTION / COMMIT are used.
-- ============================================================


-- 1) Remove previous project tables (legacy + v9)


DROP TABLE IF EXISTS notification_log;

DROP TABLE IF EXISTS event_archives;

DROP TABLE IF EXISTS events;

DROP TABLE IF EXISTS platform_sessions;

DROP TABLE IF EXISTS platform_visitors;

DROP TABLE IF EXISTS platforms;

DROP TABLE IF EXISTS schema_meta;

DROP TABLE IF EXISTS visitor_sessions;

DROP TABLE IF EXISTS sessions;

DROP TABLE IF EXISTS sites;


-- 2) Re-create canonical v9 tables


CREATE TABLE schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE platforms (
  platform_id TEXT PRIMARY KEY,
  platform_name TEXT NOT NULL,
  platform_type TEXT NOT NULL DEFAULT 'generic',
  platform_url TEXT,
  platform_domain TEXT,
  environment TEXT,
  app_version TEXT,
  sdk_name TEXT,
  sdk_version TEXT,
  source TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  total_events INTEGER NOT NULL DEFAULT 0,
  total_pageviews INTEGER NOT NULL DEFAULT 0,
  total_sessions INTEGER NOT NULL DEFAULT 0,
  total_visitors INTEGER NOT NULL DEFAULT 0,
  last_ip TEXT,
  last_ip_hash TEXT,
  last_platform_ip TEXT,
  last_country TEXT,
  last_region TEXT,
  last_city TEXT,
  last_event_id TEXT,
  last_event_type TEXT,
  api_key_hash TEXT,
  api_key_updated_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  capabilities_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE platform_visitors (
  platform_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  user_id TEXT,
  anonymous_id TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  last_ip TEXT,
  last_ip_hash TEXT,
  country TEXT,
  region TEXT,
  region_code TEXT,
  city TEXT,
  continent TEXT,
  colo TEXT,
  asn INTEGER,
  as_organization TEXT,
  latitude TEXT,
  longitude TEXT,
  postal_code TEXT,
  timezone TEXT,
  language TEXT,
  user_agent TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  device TEXT,
  device_vendor TEXT,
  device_model TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  viewport_width INTEGER,
  viewport_height INTEGER,
  device_pixel_ratio REAL,
  color_depth INTEGER,
  last_page_url TEXT,
  last_path TEXT,
  last_referrer TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(platform_id, visitor_id)
);

CREATE TABLE platform_sessions (
  platform_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  user_id TEXT,
  anonymous_id TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  max_scroll INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  outbound_clicks INTEGER NOT NULL DEFAULT 0,
  ip TEXT,
  ip_hash TEXT,
  platform_ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  continent TEXT,
  colo TEXT,
  asn INTEGER,
  as_organization TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  device TEXT,
  last_page_url TEXT,
  last_path TEXT,
  last_referrer TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(platform_id, session_id)
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT,
  platform_id TEXT NOT NULL,
  platform_name TEXT NOT NULL,
  platform_type TEXT NOT NULL DEFAULT 'generic',
  platform_url TEXT,
  platform_domain TEXT,
  environment TEXT,
  app_version TEXT,
  sdk_name TEXT,
  sdk_version TEXT,
  source TEXT,
  user_id TEXT,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  anonymous_id TEXT,
  trace_id TEXT,
  request_id TEXT,
  page_url TEXT,
  path TEXT,
  query_string TEXT,
  title TEXT,
  referrer TEXT,
  referrer_host TEXT,
  language TEXT,
  accept_language TEXT,
  timezone TEXT,
  country TEXT,
  region TEXT,
  region_code TEXT,
  city TEXT,
  continent TEXT,
  colo TEXT,
  asn INTEGER,
  as_organization TEXT,
  latitude TEXT,
  longitude TEXT,
  postal_code TEXT,
  metro_code TEXT,
  ip TEXT,
  ip_hash TEXT,
  platform_ip TEXT,
  forwarded_for TEXT,
  ip_source TEXT,
  user_agent TEXT,
  browser TEXT,
  browser_version TEXT,
  os TEXT,
  os_version TEXT,
  device TEXT,
  device_vendor TEXT,
  device_model TEXT,
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
  http_method TEXT,
  request_url TEXT,
  request_scheme TEXT,
  request_host TEXT,
  request_path TEXT,
  request_query TEXT,
  cf_ray TEXT,
  tls_version TEXT,
  client_tcp_rtt INTEGER,
  client_quic_rtt INTEGER,
  bot_score INTEGER,
  verified_bot INTEGER NOT NULL DEFAULT 0,
  ja3 TEXT,
  ja4 TEXT,
  response_status INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  max_scroll INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  outbound_clicks INTEGER NOT NULL DEFAULT 0,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  data_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  headers_json TEXT NOT NULL DEFAULT '{}',
  cf_json TEXT NOT NULL DEFAULT '{}',
  request_json TEXT NOT NULL DEFAULT '{}',
  payload_json TEXT NOT NULL DEFAULT '{}',
  raw_event_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE event_archives (
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

CREATE TABLE notification_log (
  event_id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  error TEXT
);


-- 3) Re-create all indexes + schema/service seed


CREATE INDEX IF NOT EXISTS idx_events_received ON events(received_at);

CREATE INDEX IF NOT EXISTS idx_events_platform_received ON events(platform_id,received_at);

CREATE INDEX IF NOT EXISTS idx_events_platform_type ON events(platform_id,event_type);

CREATE INDEX IF NOT EXISTS idx_events_ip ON events(ip);

CREATE INDEX IF NOT EXISTS idx_events_platform_ip ON events(platform_id,ip);

CREATE INDEX IF NOT EXISTS idx_events_platform_platform_ip ON events(platform_id,platform_ip);

CREATE INDEX IF NOT EXISTS idx_events_platform_visitor ON events(platform_id,visitor_id);

CREATE INDEX IF NOT EXISTS idx_events_platform_session ON events(platform_id,session_id);

CREATE INDEX IF NOT EXISTS idx_events_user ON events(platform_id,user_id);

CREATE INDEX IF NOT EXISTS idx_events_trace ON events(trace_id);

CREATE INDEX IF NOT EXISTS idx_events_country ON events(country);

CREATE INDEX IF NOT EXISTS idx_events_region ON events(region);

CREATE INDEX IF NOT EXISTS idx_events_city ON events(city);

CREATE INDEX IF NOT EXISTS idx_events_browser ON events(browser);

CREATE INDEX IF NOT EXISTS idx_events_os ON events(os);

CREATE INDEX IF NOT EXISTS idx_events_device ON events(device);

CREATE INDEX IF NOT EXISTS idx_events_path ON events(platform_id,path);

CREATE INDEX IF NOT EXISTS idx_events_referrer ON events(platform_id,referrer_host);

CREATE INDEX IF NOT EXISTS idx_events_utm_source ON events(platform_id,utm_source);

CREATE INDEX IF NOT EXISTS idx_events_utm_campaign ON events(platform_id,utm_campaign);

CREATE INDEX IF NOT EXISTS idx_sessions_last_seen ON platform_sessions(platform_id,last_seen);

CREATE INDEX IF NOT EXISTS idx_sessions_visitor ON platform_sessions(platform_id,visitor_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON platform_sessions(platform_id,user_id);

CREATE INDEX IF NOT EXISTS idx_sessions_ip ON platform_sessions(platform_id,ip);

CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON platform_visitors(platform_id,last_seen);

CREATE INDEX IF NOT EXISTS idx_visitors_user ON platform_visitors(platform_id,user_id);

CREATE INDEX IF NOT EXISTS idx_visitors_ip ON platform_visitors(platform_id,last_ip);

CREATE INDEX IF NOT EXISTS idx_archives_status ON event_archives(status,created_at);

CREATE INDEX IF NOT EXISTS idx_archives_platform ON event_archives(platform_id,created_at);

CREATE INDEX IF NOT EXISTS idx_notifications_platform ON notification_log(platform_id,sent_at);

INSERT INTO schema_meta(key,value) VALUES ('schema_version','9.0') ON CONFLICT(key) DO UPDATE SET value=excluded.value;

INSERT INTO schema_meta(key,value) VALUES ('service','universal-event-insights-worker') ON CONFLICT(key) DO UPDATE SET value=excluded.value;


-- 4) Final verification
SELECT
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_meta') AS schema_meta_exists,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='platforms') AS platforms_exists,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='platform_visitors') AS platform_visitors_exists,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='platform_sessions') AS platform_sessions_exists,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='events') AS events_exists,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='event_archives') AS event_archives_exists,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='notification_log') AS notification_log_exists;

SELECT COUNT(*) AS event_columns FROM pragma_table_info('events');
SELECT COUNT(*) AS platform_columns FROM pragma_table_info('platforms');
SELECT COUNT(*) AS visitor_columns FROM pragma_table_info('platform_visitors');
SELECT COUNT(*) AS session_columns FROM pragma_table_info('platform_sessions');
SELECT COUNT(*) AS archive_columns FROM pragma_table_info('event_archives');
SELECT COUNT(*) AS notification_columns FROM pragma_table_info('notification_log');

SELECT key, value FROM schema_meta ORDER BY key;

SELECT
  (SELECT COUNT(*) FROM platforms) AS platforms,
  (SELECT COUNT(*) FROM platform_visitors) AS visitors,
  (SELECT COUNT(*) FROM platform_sessions) AS sessions,
  (SELECT COUNT(*) FROM events) AS events,
  (SELECT COUNT(*) FROM event_archives) AS archives,
  (SELECT COUNT(*) FROM notification_log) AS notifications;

SELECT name
FROM sqlite_master
WHERE type='index'
  AND name LIKE 'idx_%'
ORDER BY name;
