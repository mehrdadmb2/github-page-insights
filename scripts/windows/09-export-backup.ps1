$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

New-Item -ItemType Directory -Force .\backups | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out = ".\backups\d1-$stamp.sql"

npx wrangler d1 export github-page-insights --remote --output=$out
Write-Host "Backup created: $out" -ForegroundColor Green
