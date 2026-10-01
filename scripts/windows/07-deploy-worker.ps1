$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
Write-Host 'Running local validation...' -ForegroundColor Cyan
npm run check
Write-Host 'Dry-run deployment validation...' -ForegroundColor Cyan
npx wrangler deploy --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Wrangler dry-run failed.' }
Write-Host 'Deploying Worker manually with Wrangler...' -ForegroundColor Cyan
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw 'Wrangler deploy failed.' }
Write-Host 'Worker deployment completed.' -ForegroundColor Green
