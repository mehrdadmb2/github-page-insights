SELECT name, type FROM sqlite_master WHERE type IN ('table','index') ORDER BY type,name;

PRAGMA table_info(events);
PRAGMA table_info(platforms);
PRAGMA table_info(platform_sessions);
PRAGMA table_info(platform_visitors);
PRAGMA table_info(notification_log);
