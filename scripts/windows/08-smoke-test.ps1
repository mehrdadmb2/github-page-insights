param(
  [string]$WorkerUrl = "https://github-page-insights-worker.game-developer-mb.workers.dev"
)
$ErrorActionPreference = 'Stop'

$urls = @(
  "$WorkerUrl/",
  "$WorkerUrl/v1/health",
  "$WorkerUrl/v1/schema",
  "$WorkerUrl/v1/platforms"
)

foreach ($url in $urls) {
  Write-Host "`n>>> $url" -ForegroundColor Cyan
  try {
    $r = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 30
    Write-Host "HTTP $($r.StatusCode)" -ForegroundColor Green
    $r.Content
  } catch {
    Write-Host "Request failed: $($_.Exception.Message)" -ForegroundColor Red
    throw
  }
}
