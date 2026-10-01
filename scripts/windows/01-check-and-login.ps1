$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

Write-Host "[1/3] Checking Node.js..." -ForegroundColor Cyan
node --version
npm --version

Write-Host "[2/3] Installing local project dependencies..." -ForegroundColor Cyan
npm install

Write-Host "[3/3] Checking Wrangler authentication..." -ForegroundColor Cyan
npx wrangler --version
npx wrangler login --use-keyring
npx wrangler whoami

Write-Host "Login complete." -ForegroundColor Green
