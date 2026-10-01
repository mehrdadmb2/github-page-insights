param([switch]$FreshDatabase,[switch]$ConfigureTelegram)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
Write-Host '=== Universal Event Insights v11 — Manual Wrangler Setup ===' -ForegroundColor Cyan
node --version
npm --version
npm install
npx wrangler --version
Write-Host '`n[1] Cloudflare login' -ForegroundColor Cyan
npx wrangler login --use-keyring
npx wrangler whoami
Write-Host '`n[2] D1 database' -ForegroundColor Cyan
npx wrangler d1 list
$exists = Read-Host 'Does github-page-insights already exist? Type YES or NO'
if ($exists -eq 'NO') {
  npx wrangler d1 create github-page-insights --binding DB --update-config --use-remote
} else {
  .\scripts\windows\02-sync-d1-id.ps1
}
if ($FreshDatabase) {
  Write-Host '`n[3] Fresh D1 schema reset' -ForegroundColor Yellow
  $ok = Read-Host 'Type RESET to continue'
  if ($ok -ne 'RESET') { throw 'Fresh database reset cancelled.' }
  npx wrangler d1 execute github-page-insights --remote --file=./db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql --yes
} else {
  Write-Host '`n[3] Skipping destructive D1 reset. Use -FreshDatabase when intentionally rebuilding.' -ForegroundColor Yellow
}
Write-Host '`n[4] Required Worker secrets' -ForegroundColor Cyan
foreach ($name in @('GITHUB_TOKEN','ADMIN_KEY')) { npx wrangler secret put $name }
if ($ConfigureTelegram) {
  Write-Host '`n[5] Telegram secrets' -ForegroundColor Cyan
  foreach ($name in @('TELEGRAM_BOT_TOKEN','TELEGRAM_ADMIN_CHAT_ID','TELEGRAM_WEBHOOK_SECRET')) { npx wrangler secret put $name }
  $config = Get-Content .\wrangler.jsonc -Raw
  $config = $config -replace '"TELEGRAM_ENABLED"\s*:\s*"false"','"TELEGRAM_ENABLED": "true"'
  Set-Content .\wrangler.jsonc $config -Encoding UTF8
}
Write-Host '`n[6] Local checks' -ForegroundColor Cyan
npm run check
Write-Host '`n[7] Deploy' -ForegroundColor Cyan
npx wrangler deploy --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Dry-run failed.' }
npx wrangler deploy
Write-Host '`nSetup completed.' -ForegroundColor Green
