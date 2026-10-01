$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

$config = Get-Content .\wrangler.jsonc -Raw
$config = $config -replace '"TELEGRAM_ENABLED"\s*:\s*"false"', '"TELEGRAM_ENABLED": "true"'
Set-Content .\wrangler.jsonc $config -Encoding UTF8
Write-Host "TELEGRAM_ENABLED=true written to wrangler.jsonc" -ForegroundColor Green

Write-Host "Deploy after the Telegram secrets have been configured:" -ForegroundColor Cyan
Write-Host "npx wrangler deploy" -ForegroundColor White
