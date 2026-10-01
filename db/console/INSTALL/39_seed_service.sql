INSERT INTO schema_meta(key,value) VALUES ('service','universal-event-insights-worker') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
