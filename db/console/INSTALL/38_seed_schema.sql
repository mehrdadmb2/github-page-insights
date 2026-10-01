INSERT INTO schema_meta(key,value) VALUES ('schema_version','9.0') ON CONFLICT(key) DO UPDATE SET value=excluded.value;
