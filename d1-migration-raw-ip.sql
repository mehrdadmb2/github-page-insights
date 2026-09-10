-- Run this once against the existing github-page-insights D1 database.
-- It adds raw IP storage while preserving existing rows.

ALTER TABLE events ADD COLUMN ip TEXT;

CREATE INDEX IF NOT EXISTS idx_events_ip ON events(ip);
CREATE INDEX IF NOT EXISTS idx_events_site_ip ON events(site_id, ip);
