SELECT name FROM sqlite_master WHERE type='table' AND name IN ('schema_meta','platforms','platform_visitors','platform_sessions','events','event_archives','notification_log') ORDER BY name;
