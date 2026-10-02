# Universal Event Insights

A simple universal analytics collector for websites, GitHub Pages, APIs, bots, apps and scripts.

## The simple flow

```text
Website
  ↓
analytics.js
  ↓
Cloudflare Worker
  ↓
D1
  ↓
GitHub Pages dashboard
```

You do not need another Worker for every website. Each website gets a unique `platformId`.

## Connect a website — 3 steps

### 1. Choose an ID

Examples:

```text
my-website
portfolio
imdb-showcase
my-shop
my-telegram-bot
```

### 2. Paste this snippet

Put it before `</head>` or immediately before your closing body tag:

```html
<script>
window.PAGE_INSIGHTS_CONFIG = {
  workerUrl: "https://github-page-insights-worker.game-developer-mb.workers.dev",
  platformId: "my-website",
  platformName: "My Website",
  platformType: "web"
};
</script>
<script src="https://mehrdadmb2.github.io/github-page-insights/analytics.js" defer></script>
```

Change only `platformId` and `platformName`. Do not place `GITHUB_TOKEN`, `ADMIN_KEY` or Telegram secrets in a website.

### 3. Open the website once

Open the website, wait a moment, then open the dashboard and choose the platform from **All platforms**. No manual database insert is required.

## Basic mode

The default browser SDK intentionally sends only the useful basics:

- 1 `pageview` per page load
- stable visitor ID
- session ID with a 30-minute inactivity window
- page URL, title and referrer
- browser, OS, device and screen data
- IP and Cloudflare network context available to the Worker
- in Basic mode, these details travel in the same request — no second geo/device request is made

Clicks, scroll telemetry, visibility events and heartbeats are **off by default**. This keeps normal websites cheap and avoids turning one visit into hundreds of database writes.

## Advanced mode

Enable only when you need deeper telemetry:

```js
window.PAGE_INSIGHTS_CONFIG = {
  workerUrl: "https://github-page-insights-worker.game-developer-mb.workers.dev",
  platformId: "my-website",
  platformName: "My Website",
  advancedTelemetry: true,
  trackPageLeave: true,
  trackClicks: true,
  trackScroll: true,
  trackVisibility: false,
  heartbeat: false
};
```

The dashboard loads expensive analytics such as geo, IP ranking, browsers, OS, devices, sources, event types, HTTP status and top pages only when **Advanced** is opened.

## Find the data

1. Open the GitHub Pages dashboard.
2. Select the website from **All platforms**.
3. Read **Pageviews / Visitors / Sessions / Events** first. Open **Advanced analytics** only when needed.

For raw event details, click a row in **Recent events**. The event inspector shows IP, geo, device, page, session, request ID and JSON payload snapshots.

## API

Collector:

```http
POST /v1/events
```

Discover connected platforms:

```http
GET /v1/platforms
```

Global basic overview:

```http
GET /v1/overview?days=7&lite=1
```

Global advanced overview:

```http
GET /v1/overview?days=7
```

One platform:

```http
GET /v1/platforms/my-website?days=7&lite=1
GET /v1/platforms/my-website?days=7
GET /v1/platforms/my-website/events?days=7&limit=100
```

Health:

```http
GET /v1/health?quick=1
GET /v1/health
```

## Telegram

Telegram is optional. Once `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ADMIN_CHAT_ID` exist as Worker secrets, the Worker configuration enables Telegram by default. `TELEGRAM_ENABLED=false` can still be used as an explicit off switch.

Setup endpoint:

```text
GET /telegram/setup
```

Test endpoint:

```text
GET /telegram/test
```

Telegram notifications default to **new visitors**. A Basic pageview can produce one detailed visitor notification containing IP, IP geolocation, device, OS, browser and other request context. This is a Worker-side Telegram request, not another browser telemetry request. High-volume events such as clicks, scroll, visibility and heartbeats are ignored by default.

## Basic visitor data is not a heavy mode

The important distinction is between **data richness** and **event frequency**. Basic mode can store a rich visitor snapshot in one `pageview` request. Click and scroll tracking is what creates repeated requests, so those signals remain disabled unless Advanced is explicitly enabled.

The Worker can enrich the same incoming request with Cloudflare connection metadata such as IP geolocation and network information. Cloudflare documents `request.cf` fields including country, city, region, latitude, longitude, ASN and organization. citeturn220713search12turn220713search14

## Important D1 note

Cloudflare now enforces the Workers Free daily D1 row-read and row-write limits. When an account reaches the daily limit, D1 queries fail until the limit resets at midnight UTC. The dashboard therefore uses light queries, slower refresh and on-demand Advanced analytics. Cloudflare documents 5 million rows read/day and 100,000 rows written/day for Workers Free.

## Deployment

### Worker

The Worker is not deployed by GitHub Actions in this project. Deploy it manually with Wrangler:

```powershell
npm install
npx wrangler login --use-keyring
npx wrangler whoami
npm run check
npx wrangler deploy
```

### GitHub Pages

GitHub Pages is deployed from `docs/` through the repository Pages workflow. Set **Pages → Source → GitHub Actions**.

## Repository layout

```text
worker/       Cloudflare Worker
db/           D1 schema
docs/         GitHub Pages dashboard + browser SDK
scripts/      validation helpers
tests/        runtime/schema validation
wrangler.jsonc
```

## Data model

The existing D1 contract remains schema 9.0 with a 96-column `events` table. This v12.1 runtime improves the client, Telegram visitor notification and dashboard behavior without requiring a schema migration.
