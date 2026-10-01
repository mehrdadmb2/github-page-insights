$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

Write-Host "===============================================================" -ForegroundColor DarkCyan
Write-Host " Universal Event Insights - Windows + Wrangler setup" -ForegroundColor Cyan
Write-Host "===============================================================" -ForegroundColor DarkCyan

Write-Host "`n[1] Node + npm + local Wrangler" -ForegroundColor Cyan
node --version
npm --version
npm install
npx wrangler --version

Write-Host "`n[2] Cloudflare login" -ForegroundColor Cyan
npx wrangler login --use-keyring
npx wrangler whoami

Write-Host "`n[3] D1 database" -ForegroundColor Cyan
npx wrangler d1 list
$choice = Read-Host "Does github-page-insights already exist? Type YES or NO"
if ($choice -eq 'NO') {
  npx wrangler d1 create github-page-insights --binding DB --update-config --use-remote
} else {
  Write-Host "Using the existing D1 database. Verify database_id in wrangler.jsonc before continuing." -ForegroundColor Yellow
}

Write-Host "`n[4] D1 schema" -ForegroundColor Cyan
$reset = Read-Host "This is a destructive fresh install. Type RESET to apply the one-shot schema"
if ($reset -ne 'RESET') { throw 'Setup stopped before D1 reset.' }
npx wrangler d1 execute github-page-insights --remote --file=./db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql --yes

Write-Host "`n[5] Required secrets" -ForegroundColor Cyan
foreach ($name in @('GITHUB_TOKEN','ADMIN_KEY')) {
  npx wrangler secret put $name
}

Write-Host "`n[6] Optional Telegram" -ForegroundColor Cyan
$telegram = Read-Host "Configure Telegram secrets now? Type YES or NO"
if ($telegram -eq 'YES') {
  foreach ($name in @('TELEGRAM_BOT_TOKEN','TELEGRAM_ADMIN_CHAT_ID','TELEGRAM_WEBHOOK_SECRET')) {
    npx wrangler secret put $name
  }
  $config = Get-Content .\wrangler.jsonc -Raw
  $config = $config -replace '"TELEGRAM_ENABLED"\s*:\s*"false"', '"TELEGRAM_ENABLED": "true"'
  Set-Content .\wrangler.jsonc $config -Encoding UTF8
}

Write-Host "`n[7] Validation" -ForegroundColor Cyan
npm run check
npx wrangler d1 execute github-page-insights --remote --command="SELECT COUNT(*) AS event_columns FROM pragma_table_info('events');" --json
npx wrangler d1 execute github-page-insights --remote --command="SELECT key,value FROM schema_meta ORDER BY key;" --json

Write-Host "`n[8] Deploy" -ForegroundColor Cyan
npx wrangler deploy

Write-Host "`nSetup completed." -ForegroundColor Green
Write-Host "Next: run scripts\windows\08-smoke-test.ps1" -ForegroundColor Yellow
