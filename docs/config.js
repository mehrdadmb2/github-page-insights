window.PAGE_INSIGHTS_CONFIG = Object.assign({
  workerUrl: "https://github-page-insights-worker.game-developer-mb.workers.dev",
  platformId: "github-page-insights-dashboard",
  platformName: "GitHub Page Insights Dashboard",
  platformType: "web-dashboard",
  environment: "production",
  appVersion: "12.2.0",
  apiVersion: "v1",
  defaultRangeDays: 7,
  autoRefreshMs: 120000,
  requestTimeoutMs: 12000,
  recentLimit: 50,
  showRawIp: true,
  showPlatformIp: true
}, window.PAGE_INSIGHTS_CONFIG || {});
