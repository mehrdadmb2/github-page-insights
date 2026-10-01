$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

Write-Host "Telegram secrets are optional until you enable Telegram." -ForegroundColor Yellow
foreach ($name in @('TELEGRAM_BOT_TOKEN','TELEGRAM_ADMIN_CHAT_ID','TELEGRAM_WEBHOOK_SECRET')) {
  Write-Host "`nSetting secret: $name" -ForegroundColor Cyan
  npx wrangler secret put $name
}

Write-Host "Telegram secrets configured." -ForegroundColor Green
Write-Host "Remember to set TELEGRAM_ENABLED=true in wrangler.jsonc before deploying the Telegram-enabled configuration." -ForegroundColor Yellow
