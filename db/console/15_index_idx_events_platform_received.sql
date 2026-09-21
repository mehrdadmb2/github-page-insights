CREATE INDEX IF NOT EXISTS idx_events_platform_received ON events(platform_id, received_at);
