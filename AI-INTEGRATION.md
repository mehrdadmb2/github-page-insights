# AI / Agent Integration — Universal Event Insights

This document is the machine-friendly path. For a normal website, use `docs/connect.html` first.

## 1. Runtime contract

Authoritative endpoint:

```http
GET https://github-page-insights-worker.game-developer-mb.workers.dev/v1/schema
```

Repository copies:

```text
docs/api-schema.json
docs/openapi.yaml
```

## 2. Simplest website integration

Use one stable `platformId` and the existing browser SDK:

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

Basic mode sends one pageview for a page load and one pageleave when leaving the page. It creates a stable visitor ID and a 30-minute inactivity session.

## 3. Find the data

Discover:

```http
GET /v1/platforms
```

Read one platform:

```http
GET /v1/platforms/<platformId>?days=7&lite=1
```

Read advanced analytics:

```http
GET /v1/platforms/<platformId>?days=7
```

Read recent raw events:

```http
GET /v1/platforms/<platformId>/events?days=7&limit=100
```

## 4. Universal event integration

Minimum:

```json
{
  "platformId": "my-platform"
}
```

Recommended:

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "web",
  "eventType": "custom",
  "eventId": "stable-id-for-retries",
  "identity": {
    "visitorId": "visitor-123",
    "sessionId": "session-123"
  },
  "data": {
    "applicationSpecificField": "value"
  }
}
```

Collector:

```http
POST /v1/events
Content-Type: application/json
```

Always retain `requestId`, `eventId` and `platformId` when troubleshooting.

## 5. Advanced event types

Custom event types are allowed. The recommended standard types include:

```text
pageview
pageleave
request
login
logout
purchase
error
custom
```

Browser Basic mode deliberately does not emit high-volume click/scroll/visibility/heartbeat telemetry unless explicitly enabled.

## 6. Security

Never place these in frontend code:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
D1 credentials
```

Admin endpoints require `X-Admin-Key`.

## 7. Telegram

Telegram is optional. Set the three secrets on the Worker:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

Then deploy and call:

```text
GET /telegram/setup
GET /telegram/test
```

Telegram notifications suppress low-value high-volume browser events such as clicks, scroll, visibility and heartbeat.

## 8. Deployment model

GitHub Pages uses GitHub Actions. The Worker is deployed manually with Wrangler. The repository is intentionally not connected to Cloudflare Workers Builds.
