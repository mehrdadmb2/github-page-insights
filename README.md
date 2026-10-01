# 🌌 Universal Event Insights — v11.0.0

A universal, request-driven telemetry platform for websites, APIs, bots, apps, scripts, SaaS systems and custom applications. The repository stores the Worker source, D1 schema, GitHub Pages dashboard and versioned API documentation.

> **Deployment model:** this repository is **not connected to Cloudflare Workers Builds**. The Worker is deployed manually from Windows with Wrangler. GitHub Pages is deployed separately with GitHub Actions.

## What changed in v11

- Workers Builds / auto-build integration removed from the repository.
- `tools/cloudflare-auto-build` removed.
- No `auto` build command.
- No Cloudflare build watch paths are required.
- `wrangler.jsonc` is the single Worker deployment configuration.
- `npm run check` validates the project before deploy.
- `npx wrangler deploy --dry-run` is the preflight deployment check.
- Worker runtime version: `11.0.0`.
- API contract: `4.1`.
- D1 schema contract remains `9.0` and uses the existing 96-column `events` table.

## Architecture

```text
Any Client
   │
   │ POST /v1/events
   ▼
Cloudflare Worker
   ├── validate / normalize
   ├── Cloudflare edge enrichment
   ├── D1 event storage
   ├── visitor/session/platform aggregates
   ├── GitHub per-event archive
   └── optional Telegram notification
   │
   ├──────────────► Cloudflare D1
   │
   ├──────────────► GitHub Archive
   │
   └──────────────► Telegram

GitHub repository
   └── docs/ → GitHub Pages Dashboard

Windows PowerShell
   └── Wrangler → manual Worker deployment
```

## Repository

```text
worker/index.js                         Worker runtime
wrangler.jsonc                          Wrangler config
db/schema-v9.sql                        Canonical D1 schema
db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql  Fresh D1 install
docs/                                   GitHub Pages dashboard
docs/analytics.js                       Browser telemetry SDK
docs/api-schema.json                    Machine-readable contract
docs/openapi.yaml                       OpenAPI 3.1 contract
.github/workflows/pages.yml             GitHub Pages deploy
scripts/                                 Validation helpers
scripts/windows/                         Windows/PowerShell helpers
README.md                               Human documentation
AI-INTEGRATION.md                       AI/agent integration guide
SECURITY.md                             Security guidance
SETUP-MANUAL-WRANGLER-WINDOWS-FA.md     Full deployment guide
```

## Production endpoints

```text
Worker:   https://github-page-insights-worker.game-developer-mb.workers.dev
Collector: POST /v1/events
Schema:    GET /v1/schema
Health:    GET /v1/health
Platforms: GET /v1/platforms
Overview:  GET /v1/overview?days=7
```

## One-time Windows deployment

```powershell
npm install
npx wrangler login --use-keyring
npx wrangler whoami
npx wrangler d1 list
.\scripts\windows\02-sync-d1-id.ps1
npx wrangler d1 execute github-page-insights --remote --file=./db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql --yes
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_KEY
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy
```

Full steps: `SETUP-MANUAL-WRANGLER-WINDOWS-FA.md`.

## Daily Worker update

```powershell
npm run check
npx wrangler deploy
```

No GitHub → Cloudflare automatic deployment is expected in this version.

## GitHub Pages update

Only dashboard changes use GitHub Actions:

```text
docs/*
   ↓
.github/workflows/pages.yml
   ↓
GitHub Pages
```

Set GitHub Pages source to **GitHub Actions**.

## Universal API — minimum event

```json
{
  "platformId": "my-platform"
}
```

## Universal API — recommended event

```json
{
  "platformId": "my-web-app",
  "platformName": "My Web App",
  "platformType": "web",
  "platformUrl": "https://example.com",
  "eventType": "pageview",
  "eventId": "evt-001",
  "identity": {
    "visitorId": "visitor-001",
    "sessionId": "session-001",
    "userId": "user-001"
  },
  "page": {
    "url": "https://example.com/dashboard",
    "path": "/dashboard",
    "title": "Dashboard",
    "referrer": "https://google.com/"
  },
  "screen": { "width": 1920, "height": 1080 },
  "viewport": { "width": 1536, "height": 864 },
  "data": { "action": "opened" },
  "metadata": { "environment": "production" }
}
```

## cURL

```bash
curl -X POST "https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events" \
  -H "Content-Type: application/json" \
  -d '{"platformId":"my-platform","eventType":"custom","data":{"source":"curl"}}'
```

## JavaScript

```javascript
await fetch("https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    platformId: "my-platform",
    eventType: "custom",
    data: { action: "opened" }
  })
});
```

## Python

```python
import requests

WORKER = "https://github-page-insights-worker.game-developer-mb.workers.dev"
payload = {
    "platformId": "my-python-service",
    "eventType": "job_completed",
    "data": {"jobId": "J-100", "success": True},
}
response = requests.post(f"{WORKER}/v1/events", json=payload, timeout=15)
print(response.status_code)
print(response.json())
```

## Reading your data later

Live aggregates and recent telemetry should be read through the Worker API. GitHub archive files are intended for browsable/versioned historical export.

```http
GET /v1/platforms/<platformId>?days=30
GET /v1/platforms/<platformId>/events?days=30&limit=100
GET /v1/platforms/<platformId>/visitors?limit=100
GET /v1/platforms/<platformId>/sessions?limit=100
GET /v1/overview?days=30
```

## Browser/GitHub Pages integration

Include the SDK: `docs/analytics.js`. Configure `docs/config.js` or HTML metadata with a stable `platformId`. The SDK generates visitor/session identifiers, tracks pageview/heartbeat/pageleave/visibility/click/scroll/outbound events, and queues failed requests locally for retry.

```html
<meta name="uei-platform-id" content="my-site">
<meta name="uei-platform-name" content="My Site">
<script src="https://YOUR-GITHUB-PAGES-DOMAIN/analytics.js"></script>
```

If a site uses a Content Security Policy, allow the Worker URL in `connect-src`.

## D1 data model

The main `events` table has 96 standardized columns covering event identity, platform, user/session, page/referrer/UTM, locale, IP/Geo, browser/OS/device, screen, network, HTTP, Cloudflare metadata, response/engagement and JSON snapshots.

Key JSON preservation fields:

```text
data_json
metadata_json
headers_json
cf_json
request_json
payload_json
raw_event_json
```

Common secret-bearing headers such as `Authorization` and `Cookie` are redacted from stored request snapshots. Raw client IP is intentionally stored in `ip` and a scoped hash is stored in `ip_hash`.

## GitHub archive

Each event is archived independently:

```text
data/platforms/<platformId>/events/YYYY/MM/DD/<timestamp>_<eventId>.json
```

This avoids a shared daily file and makes individual events easy to inspect/export.

## Telegram

Telegram is optional. The Worker exposes:

```text
GET  /telegram/setup
GET  /telegram/test
POST /telegram/webhook
```

Set the three Telegram secrets, change `TELEGRAM_ENABLED` to `true` in `wrangler.jsonc`, and run `npx wrangler deploy`.

## AI integration contract

An AI agent integrating another repository should follow this sequence:

```text
1. GET /v1/schema
2. Treat /v1/schema as runtime authority
3. Choose a stable platformId
4. Send POST /v1/events
5. Use eventId for retry/idempotency
6. Check the HTTP response and requestId
7. Use /v1/platforms/<platformId> for live analytics
8. Use /v1/platforms/<platformId>/events for recent raw events
9. Never put GITHUB_TOKEN or ADMIN_KEY in client code
```

Machine-readable references:

```text
docs/api-schema.json
docs/openapi.yaml
AI-INTEGRATION.md
GET /v1/schema
```

## Security

The collector is public by default. Set `REQUIRE_PLATFORM_KEY=true` when per-platform authentication is required, then manage a platform key through the admin endpoint. Keep `ADMIN_KEY`, GitHub token and Telegram token in Worker Secrets.

See `SECURITY.md` for details.

## Limits and operations

D1 currently documents a maximum of 100 columns per table, 100 bound parameters per query, and 2 MB maximum string/BLOB/table row size. This project intentionally keeps the standard event table at 96 columns and checks its schema before deployment.

Official references:
- Wrangler: https://developers.cloudflare.com/workers/wrangler/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- D1 commands: https://developers.cloudflare.com/d1/wrangler-commands/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Worker secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- GitHub Pages: https://docs.github.com/en/pages

## License

MIT
