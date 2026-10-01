$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
Write-Host 'Node:' -ForegroundColor Cyan; node --version
Write-Host 'npm:' -ForegroundColor Cyan; npm --version
Write-Host 'Wrangler:' -ForegroundColor Cyan; npx wrangler --version
Write-Host 'Running project checks...' -ForegroundColor Cyan
npm run check
