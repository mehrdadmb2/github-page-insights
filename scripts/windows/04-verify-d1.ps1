$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

$queries = @(
  "PRAGMA table_list;",
  "SELECT COUNT(*) AS event_columns FROM pragma_table_info('events');",
  "SELECT COUNT(*) AS platform_columns FROM pragma_table_info('platforms');",
  "SELECT COUNT(*) AS visitor_columns FROM pragma_table_info('platform_visitors');",
  "SELECT COUNT(*) AS session_columns FROM pragma_table_info('platform_sessions');",
  "SELECT key,value FROM schema_meta ORDER BY key;",
  "SELECT (SELECT COUNT(*) FROM platforms) AS platforms,(SELECT COUNT(*) FROM events) AS events,(SELECT COUNT(*) FROM platform_visitors) AS visitors,(SELECT COUNT(*) FROM platform_sessions) AS sessions,(SELECT COUNT(*) FROM event_archives) AS archives,(SELECT COUNT(*) FROM notification_log) AS notifications;"
)

foreach ($q in $queries) {
  Write-Host "`n>>> $q" -ForegroundColor Cyan
  npx wrangler d1 execute github-page-insights --remote --command=$q --json
}
