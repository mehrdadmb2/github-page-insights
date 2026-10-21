/* Public dashboard configuration only. Never put Worker admin keys or GitHub tokens here. */
window.PAGE_INSIGHTS_CONFIG = Object.assign({
  workerUrl: "https://github-page-insights-worker.game-developer-mb.workers.dev",
  dashboardUrl: "https://mehrdadmb2.github.io/github-page-insights/",
  platformId: "github-page-insights-dashboard",
  platformName: "GitHub Page Insights Dashboard",
  platformType: "web-dashboard",
  environment: "production",
  appVersion: "13.0.0",
  apiVersion: "v1",
  defaultRangeDays: 7,
  /* A slightly longer interval reduces unnecessary D1 reads while keeping the UI fresh. */
  autoRefreshMs: 300000,
  requestTimeoutMs: 7500,
  recentLimit: 60,
  showRawIp: true,
  showPlatformIp: true,
  /* Public-repository archive fallback is only used if live API + cache are unavailable. */
  githubOwner: "mehrdadmb2",
  githubRepository: "github-page-insights",
  githubBranch: "main"
}, window.PAGE_INSIGHTS_CONFIG || {});
