param([string]$DatabaseName = 'github-page-insights')
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
Write-Host "Reading remote D1 information for $DatabaseName ..." -ForegroundColor Cyan
$jsonText = npx wrangler d1 info $DatabaseName --json
if ($LASTEXITCODE -ne 0) { throw 'wrangler d1 info failed.' }
$data = $jsonText | ConvertFrom-Json
$id = $null
function Find-Id($node) {
  if ($null -eq $node) { return $null }
  if ($node -is [System.Collections.IEnumerable] -and -not ($node -is [string])) {
    foreach($item in $node){ $found = Find-Id $item; if($found){ return $found } }
  } else {
    foreach($prop in $node.PSObject.Properties){
      if($prop.Name -in @('database_id','databaseId','id') -and "$($prop.Value)" -match '^[0-9a-fA-F-]{20,}$'){ return "$($prop.Value)" }
      $found = Find-Id $prop.Value; if($found){ return $found }
    }
  }
  return $null
}
$id = Find-Id $data
if(-not $id){ throw 'Could not extract D1 database ID. Run: npx wrangler d1 info github-page-insights --json and put the ID into wrangler.jsonc manually.' }
$config = Get-Content .\wrangler.jsonc -Raw
$config = $config -replace '"database_id"\s*:\s*"[^"]+"', ('"database_id": "' + $id + '"')
Set-Content .\wrangler.jsonc $config -Encoding UTF8
Write-Host "D1 ID synced into wrangler.jsonc: $id" -ForegroundColor Green
