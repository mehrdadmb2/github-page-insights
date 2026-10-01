param(
  [string]$DatabaseName = "github-page-insights"
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

Write-Host "Listing remote D1 databases..." -ForegroundColor Cyan
npx wrangler d1 list

Write-Host "If '$DatabaseName' does not exist, create it with:" -ForegroundColor Yellow
Write-Host "npx wrangler d1 create $DatabaseName --binding DB --update-config --use-remote" -ForegroundColor White
Write-Host ""
Write-Host "If the database already exists, keep it and make sure wrangler.jsonc contains its real database_id." -ForegroundColor Yellow
Write-Host "Current config:" -ForegroundColor Cyan
Get-Content .\wrangler.jsonc
