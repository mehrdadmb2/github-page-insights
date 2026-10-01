$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

Write-Host "Running local syntax checks..." -ForegroundColor Cyan
npm run check

Write-Host "Deploying Worker..." -ForegroundColor Cyan
npx wrangler deploy

Write-Host "Worker deployment completed." -ForegroundColor Green
