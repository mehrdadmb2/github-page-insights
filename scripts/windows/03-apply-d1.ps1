$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

if (-not (Test-Path .\db\UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql)) {
  throw "D1 one-shot SQL file not found."
}

Write-Host "WARNING: this resets the project's analytics tables and data." -ForegroundColor Yellow
$answer = Read-Host "Type RESET to continue"
if ($answer -ne 'RESET') {
  Write-Host "Cancelled." -ForegroundColor Red
  exit 1
}

npx wrangler d1 execute github-page-insights --remote --file=./db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql --yes

Write-Host "D1 installation completed." -ForegroundColor Green
