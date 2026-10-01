$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')

$required = @('GITHUB_TOKEN','ADMIN_KEY')
foreach ($name in $required) {
  Write-Host "`nSetting required secret: $name" -ForegroundColor Cyan
  Write-Host "Wrangler will prompt securely. Do not paste the secret into PowerShell command history." -ForegroundColor Yellow
  npx wrangler secret put $name
}

Write-Host "Required secrets configured." -ForegroundColor Green
Write-Host "Current secret names:" -ForegroundColor Cyan
npx wrangler secret list
