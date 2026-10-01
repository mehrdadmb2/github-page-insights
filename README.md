# 🌌 Universal Event Insights

**Universal Event Insights** is a request-driven telemetry and analytics platform designed to receive events from almost any client, normalize and enrich them at the Cloudflare edge, store them in Cloudflare D1, archive individual events into GitHub, expose a versioned HTTP API, and visualize the resulting data in a GitHub Pages control plane.

It is intentionally **not limited to GitHub Pages**.

A sender can be a:

- website or GitHub Pages site
- REST/GraphQL API
- Telegram/Discord bot
- mobile or desktop application
- SaaS product
- internal tool
- Python script
- automation workflow
- webhook source
- IoT/edge client
- custom application with its own event model

The stable namespace for all data is `platformId`.

---

## فارسی — شروع سریع

اگر فقط می‌خواهی بدانی از کجا شروع کنی:

```text
Client
  ↓
POST /v1/events
  ↓
Cloudflare Worker
  ├── validate + normalize
  ├── enrich from request / Cloudflare
  ├── store in D1
  ├── update platform / visitor / session aggregates
  ├── archive event to GitHub
  └── optionally notify Telegram
  ↓
GitHub Pages Dashboard
```

حداقل Event فقط این را لازم دارد:

```json
{
  "platformId": "my-platform"
}
```

نمونه کامل:

```json
{
  "platformId": "my-website",
  "platformName": "My Website",
  "platformType": "web",
  "platformUrl": "https://example.com",
  "eventType": "pageview",
  "eventId": "evt-123456",
  "identity": {
    "visitorId": "visitor-123",
    "sessionId": "session-123",
    "userId": "user-456"
  },
  "page": {
    "url": "https://example.com/dashboard?utm_source=google",
    "path": "/dashboard",
    "title": "Dashboard"
  },
  "data": {
    "customValue": 42
  },
  "metadata": {
    "environment": "production"
  }
}
```

پس از اولین event، Worker به‌صورت خودکار پلتفرم را ایجاد می‌کند و event را در namespace مربوط به همان `platformId` قرار می‌دهد.

---

# English — Complete Guide

## 1. Service Information

### Production Worker

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

### Primary collector

```http
POST /v1/events
```

Full URL:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events
```

### Live machine-readable contract

```http
GET /v1/schema
```

This endpoint is the authoritative runtime API contract. Humans can read this README, but integrations and AI agents should fetch `/v1/schema` before generating client code.

### Dashboard

The repository's `docs/` directory is the GitHub Pages control plane.

---

# 2. Design Goals

The project is built around several rules:

1. **Universal input** — a platform can send only `platformId`, or send a rich event with nested structures and arbitrary application data.
2. **Data preservation** — standard values are normalized into relational columns while `data_json`, `metadata_json`, `payload_json`, and sanitized request snapshots retain additional context.
3. **Edge enrichment** — the Worker uses request headers and Cloudflare request metadata when available.
4. **D1 first** — D1 is the live relational analytics store.
5. **GitHub archive** — one event is archived as one JSON file under `data/platforms/...`.
6. **No Cron requirement** — collection is triggered by the incoming request; no Scheduled Worker is required for normal ingestion.
7. **Idempotency** — a client-generated `eventId` can make retries safe. A repeated event ID is treated as a duplicate instead of creating a second event.
8. **Graceful degradation** — the event itself is stored before the asynchronous archive step. Archive or aggregate problems are reported instead of silently pretending everything succeeded.
9. **Human + AI friendly** — the repository contains runtime schema metadata, an OpenAPI contract, integration examples, and a strict AI integration guide.

---

# 3. Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                         ANY EVENT SOURCE                            │
│                                                                     │
│ Web · API · Bot · Mobile · Desktop · Python · SaaS · Automation    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ POST /v1/events
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       CLOUDFLARE WORKER                             │
│                                                                     │
│ validate → normalize → enrich → redact sensitive headers            │
│ → D1 event insert → aggregate update → background archive           │
│ → optional Telegram notification                                   │
└───────────────────────┬───────────────────┬─────────────────────────┘
                        │                   │
                        ▼                   ▼
                ┌─────────────┐     ┌─────────────────┐
                │ Cloudflare  │     │ GitHub Contents │
                │ D1          │     │ API             │
                │             │     │                 │
                │ live data   │     │ JSON archive    │
                └──────┬──────┘     └────────┬────────┘
                       │                     │
                       └──────────┬──────────┘
                                  ▼
                     ┌──────────────────────────┐
                     │ GitHub Pages Dashboard   │
                     │ docs/                    │
                     └──────────────────────────┘
                                  │
                                  ▼
                           Telegram Bot
                            (optional)
```

### Why D1 + GitHub?

D1 is optimized for application queries and aggregate analytics. GitHub is useful as a browsable, versioned event archive. The Worker does **not** scan the repository for every dashboard refresh.

---

# 4. Automatic GitHub → Cloudflare Deployment

This repository is designed for **Cloudflare Workers Builds connected to GitHub**.

Once the one-time Cloudflare connection is correctly configured, a push to the production branch can automatically build and deploy the Worker.

Cloudflare's current Git integration documentation states that a connected Git repository can automatically deploy the Worker on push. The Worker name in the Cloudflare project must match the `name` in the Wrangler configuration. See:

- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

## Important: build-loop prevention

The Worker writes archive files into the **same GitHub repository**:

```text
data/platforms/<platformId>/events/YYYY/MM/DD/*.json
```

If Workers Builds watches the entire repository, every archive commit can trigger another Worker build. That can create a deployment loop and unnecessary builds.

Cloudflare provides **Build watch paths** specifically for this problem. Configure the Worker so only code/config changes trigger a Worker build.

Recommended **Include paths**:

```text
worker/*
wrangler.jsonc
package.json
package-lock.json
scripts/*
```

Recommended **Exclude paths**:

```text
data/*
docs/*
db/*
tests/*
.github/*
README.md
*.md
LICENSE
```

Cloudflare evaluates excludes before includes. Current documentation:

https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/

### One-time Workers Builds settings

Cloudflare Dashboard:

```text
Workers & Pages
→ github-page-insights-worker
→ Settings
→ Builds
```

Set:

| Setting | Value |
|---|---|
| Git repository | `mehrdadmb2/github-page-insights` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `npm run check` |
| Deploy command | `npx wrangler deploy` |
| Preview command | `npx wrangler preview` |

The deploy command is intentionally the normal Wrangler deployment command. Workers Builds uses the Wrangler version declared by this project's `package.json`.

### Why the root is `/`

The Wrangler config is deliberately at repository root:

```text
wrangler.jsonc
```

and points to:

```text
worker/index.js
```

This avoids the previous monorepo/root mismatch problem.

### Secrets for Worker runtime vs build authentication

There are two different classes of credentials:

**Runtime secrets** used by the Worker:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

**Workers Builds deployment authentication** is managed by Cloudflare's build system. Do not put a Cloudflare API token into this repository just to make `wrangler deploy` work from Workers Builds.

---

# 5. GitHub Pages Deployment

The dashboard is deployed with GitHub Actions from `docs/`.

The workflow is:

```text
.github/workflows/pages.yml
```

It is intentionally triggered only when `docs/**` changes (or the Pages workflow itself changes).

This matters because every archived telemetry event may create a Git commit under `data/`; those commits should **not** rebuild the dashboard.

## One-time Pages setting

Open:

```text
GitHub
→ Repository
→ Settings
→ Pages
→ Build and deployment
→ Source
→ GitHub Actions
```

The workflow uploads:

```text
docs/
```

and deploys it with GitHub Pages.

Official GitHub reference:

https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

---

# 6. Repository Structure

```text
github-page-insights/
│
├── .github/
│   └── workflows/
│       └── pages.yml
│
├── data/
│   └── platforms/
│       └── <platformId>/
│           └── events/
│               └── YYYY/MM/DD/*.json
│
├── db/
│   ├── schema-v9.sql
│   ├── schema.sql
│   ├── SCHEMA-V9-CATALOG-FA.md
│   └── UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql
│
├── docs/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── analytics.js
│   ├── config.js
│   ├── api-schema.json
│   ├── openapi.yaml
│   ├── logo.svg
│   └── .nojekyll
│
├── scripts/
│   ├── preflight.mjs
│   ├── validate-schema.mjs
│   └── windows/
│       ├── ...
│
├── tests/
│   └── validate.mjs
│
├── worker/
│   └── index.js
│
├── wrangler.jsonc
├── package.json
├── README.md
├── AI-INTEGRATION.md
├── SECURITY.md
├── SETUP-GITHUB-CLOUDFLARE-FA.md
├── SETUP-WRANGLER-WINDOWS-FA.md
└── VALIDATION-REPORT-FA.md
```

---

# 7. D1 Database

## Current logical schema

The project uses:

```text
schema_meta
platforms
platform_visitors
platform_sessions
events
event_archives
notification_log
```

The main `events` table has **96 standardized columns**.

The relational schema is deliberately paired with JSON snapshots so that a new integration does not require a new database column every time it invents a new application field.

## Standard Event data groups

### Event identity

```text
id
received_at
occurred_at
event_type
event_version
request_id
trace_id
```

### Platform

```text
platform_id
platform_name
platform_type
platform_url
platform_domain
environment
app_version
sdk_name
sdk_version
source
platform_ip
```

### Identity

```text
user_id
visitor_id
anonymous_id
session_id
```

### Page/navigation

```text
page_url
path
query_string
title
referrer
referrer_host
```

### Localization / UTM

```text
language
accept_language
timezone
utm_source
utm_medium
utm_campaign
utm_term
utm_content
```

### Geo/network identity

```text
ip
ip_hash
forwarded_for
ip_source
country
region
region_code
city
continent
colo
asn
as_organization
latitude
longitude
postal_code
metro_code
```

### Browser / OS / device

```text
user_agent
browser
browser_version
os
os_version
device
device_vendor
device_model
```

### Screen / connection

```text
screen_width
screen_height
viewport_width
viewport_height
device_pixel_ratio
color_depth
connection_type
connection_downlink
connection_rtt
connection_save_data
```

### HTTP / Cloudflare

```text
http_method
request_url
request_scheme
request_host
request_path
request_query
cf_ray
tls_version
client_tcp_rtt
client_quic_rtt
bot_score
verified_bot
ja3
ja4
response_status
```

### Engagement

```text
duration_ms
max_scroll
clicks
outbound_clicks
```

### Extensible JSON

```text
data_json
metadata_json
headers_json
cf_json
request_json
payload_json
raw_event_json
```

## Raw IP

This project intentionally stores:

```text
ip
ip_hash
```

`ip` is the raw client IP observed by the Worker when available.

`ip_hash` is a SHA-256-derived value scoped with the platform ID.

`platform_ip` is separate and means an IP supplied by the sending platform itself; it is **not** magically discovered as the origin server's IP.

## Sensitive request headers

The project intentionally excludes common credentials and secret headers from stored header snapshots, including values associated with:

```text
Authorization
Cookie
Set-Cookie
X-API-Key
X-Platform-Key
X-Admin-Key
Token
Secret
Password
```

The event itself remains richly stored, but secret credentials should never be deliberately sent as analytics data.

---

# 8. Fresh D1 Install / Reset

The project contains a complete one-shot SQL file:

```text
db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql
```

It is a **destructive fresh-install script**.

It removes the project's old analytics tables, recreates the current tables and indexes, inserts schema metadata, and runs verification statements.

It intentionally does not touch Cloudflare's internal `_cf_KV` table.

### Using Wrangler from Windows

First authenticate:

```powershell
npx wrangler login --use-keyring
npx wrangler whoami
```

Find the remote D1 database:

```powershell
npx wrangler d1 list
```

The D1 `database_id` must be placed in `wrangler.jsonc` for the production binding. Current Wrangler configuration documentation requires a D1 binding to identify the database with its binding name, human-readable database name and database ID.

Then apply the fresh schema remotely:

```powershell
npx wrangler d1 execute github-page-insights --remote --file=./db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql --yes
```

Official references:

- https://developers.cloudflare.com/d1/wrangler-commands/
- https://developers.cloudflare.com/d1/get-started/

### Verify schema

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT COUNT(*) AS event_columns FROM pragma_table_info('events');"
```

Expected:

```text
96
```

Then:

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT key,value FROM schema_meta ORDER BY key;"
```

Expected:

```text
schema_version | 9.0
service        | universal-event-insights-worker
```

---

# 9. Wrangler Configuration

The canonical configuration is:

```text
wrangler.jsonc
```

Important fields:

```json
{
  "name": "github-page-insights-worker",
  "main": "worker/index.js",
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "github-page-insights",
      "database_id": "YOUR_REAL_DATABASE_ID"
    }
  ]
}
```

Replace `YOUR_REAL_DATABASE_ID` once with the actual ID of your D1 database before the repository is built by Cloudflare Workers Builds.

The Worker expects the binding as:

```javascript
env.DB
```

Official reference:

https://developers.cloudflare.com/workers/wrangler/configuration/

---

# 10. Runtime Secrets

Recommended runtime secrets:

```text
GITHUB_TOKEN
ADMIN_KEY
```

Optional:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

### Add a secret with Wrangler

```powershell
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_KEY
```

Telegram:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_ADMIN_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

Never commit secret values to GitHub.

Official Cloudflare reference:

https://developers.cloudflare.com/workers/configuration/secrets/

---

# 11. Configuration Variables

Current defaults are in `wrangler.jsonc`.

```text
GITHUB_OWNER=mehrdadmb2
GITHUB_REPO=github-page-insights
GITHUB_BRANCH=main
GITHUB_ARCHIVE_ENABLED=true
REQUIRE_PLATFORM_KEY=false
TELEGRAM_ENABLED=false
TELEGRAM_NOTIFY_MODE=visitor
DEBUG=false
```

Telegram is intentionally disabled in the repository's clean initial deployment. Once Telegram secrets are configured, change:

```text
TELEGRAM_ENABLED=true
```

and push the change to GitHub.

---

# 12. Universal Event API

## Primary endpoint

```http
POST /v1/events
```

Header:

```http
Content-Type: application/json
```

The endpoint is intentionally public by default so arbitrary clients can send telemetry without exposing repository credentials.

## Minimum event

```json
{
  "platformId": "my-platform"
}
```

## Recommended event

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "web",
  "platformUrl": "https://example.com",
  "platformDomain": "example.com",
  "environment": "production",
  "appVersion": "2.4.1",
  "sdkName": "my-sdk",
  "sdkVersion": "1.0.0",
  "source": "website",
  "eventType": "pageview",
  "eventId": "client-generated-event-id",
  "timestamp": "2026-10-01T12:00:00.000Z",
  "identity": {
    "userId": "user-123",
    "visitorId": "visitor-123",
    "anonymousId": "anon-123",
    "sessionId": "session-123"
  },
  "page": {
    "url": "https://example.com/dashboard",
    "path": "/dashboard",
    "title": "Dashboard",
    "referrer": "https://google.com/"
  },
  "screen": {
    "width": 1920,
    "height": 1080,
    "devicePixelRatio": 1,
    "colorDepth": 24
  },
  "viewport": {
    "width": 1536,
    "height": 864
  },
  "connection": {
    "effectiveType": "4g",
    "downlink": 10,
    "rtt": 40,
    "saveData": false
  },
  "platformIp": "198.51.100.20",
  "data": {
    "businessAction": "dashboard_opened",
    "recordId": "ABC-123",
    "amount": 125000
  },
  "metadata": {
    "tenant": "demo",
    "feature": "analytics"
  }
}
```

## Arbitrary event types

You are not limited to only `pageview`.

Recommended values include:

```text
pageview
heartbeat
pageleave
visibility
click
outbound_click
scroll
request
login
logout
purchase
error
custom
```

Custom event type names are also accepted after normalization. The recommended list is a convention, not a whitelist.

Examples:

```json
{
  "platformId": "crm",
  "eventType": "invoice_opened",
  "data": {
    "invoiceId": "INV-1001",
    "customerId": "C-200"
  }
}
```

or:

```json
{
  "platformId": "telegram-bot",
  "eventType": "command_executed",
  "data": {
    "command": "/stats",
    "chatType": "private"
  }
}
```

---

# 13. Accepted Input Shapes

The Worker accepts both the canonical camelCase form and many snake_case/legacy aliases.

Examples:

```text
platformId        ← platform_id
platformName      ← platform_name
platformType      ← platform_type
platformUrl       ← platform_url
platformDomain    ← platform_domain
eventType         ← event_type / eventName / event_name
eventId           ← event_id
visitorId         ← visitor_id
sessionId         ← session_id
userId            ← user_id
anonymousId       ← anonymous_id
pageUrl           ← page_url
queryString       ← query_string
platformIp        ← platform_ip / serverIp / server_ip
```

Nested aliases are supported for common structures:

```text
identity.visitorId
identity.sessionId
page.url
page.path
page.title
page.referrer
platform.id
platform.url
platform.domain
network.platformIp
```

The complete machine-readable alias list is available at:

```text
docs/api-schema.json
```

and through:

```http
GET /v1/schema
```

---

# 14. cURL

```bash
curl -X POST "https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events" \
  -H "Content-Type: application/json" \
  -d '{
    "platformId": "my-platform",
    "platformName": "My Platform",
    "platformType": "web",
    "eventType": "pageview",
    "eventId": "evt-001",
    "identity": {
      "visitorId": "visitor-001",
      "sessionId": "session-001"
    },
    "page": {
      "url": "https://example.com/dashboard",
      "path": "/dashboard",
      "title": "Dashboard"
    },
    "data": {
      "source": "curl"
    }
  }'
```

---

# 15. JavaScript / Browser / Node

```javascript
const WORKER = "https://github-page-insights-worker.game-developer-mb.workers.dev";

const payload = {
  platformId: "my-web-app",
  platformName: "My Web App",
  platformType: "web",
  eventType: "pageview",
  eventId: crypto.randomUUID(),
  identity: {
    visitorId: localStorage.getItem("visitor_id") || crypto.randomUUID(),
    sessionId: sessionStorage.getItem("session_id") || crypto.randomUUID()
  },
  page: {
    url: location.href,
    path: location.pathname,
    title: document.title,
    referrer: document.referrer || null
  },
  screen: {
    width: screen.width,
    height: screen.height,
    devicePixelRatio: window.devicePixelRatio || 1,
    colorDepth: screen.colorDepth || 24
  },
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight
  },
  connection: {
    effectiveType: navigator.connection?.effectiveType || null,
    downlink: navigator.connection?.downlink || null,
    rtt: navigator.connection?.rtt || null,
    saveData: Boolean(navigator.connection?.saveData)
  },
  data: {
    source: "web"
  }
};

const response = await fetch(`${WORKER}/v1/events`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(payload)
});

console.log(response.status, await response.json());
```

---

# 16. Python

```python
import requests
import uuid

WORKER = "https://github-page-insights-worker.game-developer-mb.workers.dev"

payload = {
    "platformId": "python-service",
    "platformName": "Python Service",
    "platformType": "service",
    "eventType": "job_completed",
    "eventId": str(uuid.uuid4()),
    "data": {
        "jobId": "JOB-1001",
        "success": True,
        "durationSeconds": 18.4
    },
    "metadata": {
        "environment": "production"
    }
}

response = requests.post(
    f"{WORKER}/v1/events",
    json=payload,
    timeout=15,
)

print(response.status_code)
print(response.json())
```

---

# 17. PowerShell

```powershell
$Worker = "https://github-page-insights-worker.game-developer-mb.workers.dev"

$Payload = @{
    platformId = "windows-app"
    platformName = "Windows App"
    platformType = "desktop"
    eventType = "app_started"
    eventId = [guid]::NewGuid().ToString()
    data = @{
        source = "PowerShell"
        version = "1.0.0"
    }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Uri "$Worker/v1/events" `
  -Method POST `
  -ContentType "application/json" `
  -Body $Payload
```

---

# 18. Browser Analytics SDK

For a traditional website/GitHub Page, use:

```text
docs/analytics.js
```

Example HTML:

```html
<meta name="page-insights-site-id" content="my-site">
<meta name="page-insights-site-name" content="My Site">
<meta name="page-insights-site-type" content="web">

<script src="https://mehrdadmb2.github.io/github-page-insights/analytics.js"></script>
```

The SDK automatically derives page/browser/screen information where available and sends events to:

```text
/v1/events
```

The browser does **not** need your GitHub token or admin key.

### Custom browser event

```javascript
window.PageInsights?.track?.("button_clicked", {
  buttonId: "checkout",
  section: "pricing"
});
```

Check `docs/analytics.js` for the exact exported API of the bundled SDK version.

---

# 19. API Responses

## `201 Created`

Normal successful event creation.

Example:

```json
{
  "ok": true,
  "accepted": true,
  "version": "10.2.1",
  "requestId": "...",
  "eventId": "evt-123",
  "platformId": "my-platform",
  "eventType": "pageview",
  "stored": {
    "d1": true,
    "github": "scheduled"
  }
}
```

GitHub archiving is commonly performed in the background.

## `200 OK` duplicate

If the same `eventId` already exists:

```json
{
  "ok": true,
  "accepted": true,
  "duplicate": true
}
```

No second event is created.

## `202 Accepted`

The event was accepted/stored in D1, but aggregate processing reported a degraded condition. Inspect:

```text
d1.aggregateError
```

and:

```text
/v1/health
```

## `400 Bad Request`

Typical causes:

```text
INVALID_JSON
EMPTY_BODY
INVALID_PAYLOAD
PLATFORM_ID_REQUIRED
INVALID_PLATFORM_ID
```

## `401 Unauthorized`

Typical causes:

```text
UNAUTHORIZED
PLATFORM_KEY_REQUIRED
PLATFORM_KEY_INVALID
```

## `413 Payload Too Large`

The incoming JSON body exceeded the Worker request limit configured by the service.

## `503 Service Unavailable`

A required dependency such as D1 may be unavailable, or a specific optional service endpoint may not be configured.

---

# 20. Read API

## List platforms

```http
GET /v1/platforms
```

Returns discovered platforms from the `platforms` table.

## Global overview

```http
GET /v1/overview?days=7
```

Supported examples:

```text
days=1
days=7
days=30
days=90
days=365
days=all
```

Returns:

```text
totals
daily
countries
browsers
operatingSystems
devices
ips
platforms
recentEvents
```

## One platform

```http
GET /v1/platforms/<platformId>?days=7
```

Returns:

```text
platform
totals
daily
countries
browsers
operatingSystems
devices
ips
topPages
recentEvents
```

Compatibility aliases:

```text
GET /api/platform/<platformId>
GET /api/site/<platformId>
```

## Platform events

```http
GET /v1/platforms/<platformId>/events?days=7&limit=100
```

## Platform visitors

```http
GET /v1/platforms/<platformId>/visitors?limit=100
```

## Platform sessions

```http
GET /v1/platforms/<platformId>/sessions?limit=100
```

## Global recent events

```http
GET /v1/events?days=7&limit=100
```

Optional filter:

```text
?platform=my-platform
```

or the legacy compatibility form:

```text
?site=my-platform
```

## Statistics compatibility endpoint

```http
GET /v1/stats?platform=my-platform&days=7
```

---

# 21. Machine-Readable API Contract

Use:

```http
GET /v1/schema
```

The repository also publishes:

```text
docs/api-schema.json
docs/openapi.yaml
```

The runtime contract exposes:

```text
API version
Worker version
Database schema version
event column count
collection requirements
field aliases
recommended event types
read endpoints
admin endpoints
Telegram endpoints
archive model
privacy flags
```

---

# 22. Admin API

Admin endpoints require:

```http
X-Admin-Key: YOUR_ADMIN_KEY
```

## List administrative events

```http
GET /v1/admin/events?platform=my-platform&days=7&limit=100
```

## Full event detail

```http
GET /v1/admin/event?id=EVENT_ID
```

This is intended for internal use and can expose the complete D1 row, including raw IP and stored JSON.

## Notification log

```http
GET /v1/admin/notifications?limit=50
```

## Retry one GitHub archive

```http
POST /v1/admin/archive-retry/EVENT_ID
```

## Configure a platform key

```http
POST /v1/admin/platform-key
Content-Type: application/json
X-Admin-Key: YOUR_ADMIN_KEY
```

Body:

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "web",
  "apiKey": "a-long-random-platform-key"
}
```

When:

```text
REQUIRE_PLATFORM_KEY=true
```

senders must provide:

```http
X-Platform-Key: a-long-random-platform-key
```

or:

```http
X-API-Key: a-long-random-platform-key
```

Never publish platform keys in frontend JavaScript.

---

# 23. Telegram

Telegram integration is optional.

Endpoints:

```http
GET /telegram/setup
GET /telegram/test
POST /telegram/webhook
```

The setup/test endpoints require:

```http
X-Admin-Key: YOUR_ADMIN_KEY
```

The webhook uses:

```text
TELEGRAM_WEBHOOK_SECRET
```

and the secret header provided by Telegram.

### Recommended order

1. Configure Telegram BotFather.
2. Store the three Telegram secrets with Wrangler.
3. Set `TELEGRAM_ENABLED=true`.
4. Push to GitHub so the connected Worker rebuilds.
5. Call `/telegram/setup` with `X-Admin-Key`.
6. Call `/telegram/test` with `X-Admin-Key`.
7. Send `/start` to the bot.

The bot can expose operational commands such as:

```text
/start
/help
/status
/health
/platforms
/platform <id>
/stats <id>
/recent <id>
/docs
/id
/about
```

---

# 24. GitHub Archive

Each event gets its own JSON file.

Pattern:

```text
data/platforms/<platformId>/events/YYYY/MM/DD/<timestamp>_<eventId>.json
```

Example:

```text
data/platforms/my-site/events/2026/10/01/2026-10-01T12-30-00Z_evt-123.json
```

The archive contains:

```text
service
workerVersion
requestId
archivedAt
platform
storage
event
```

The event includes the normalized event plus stored telemetry fields and sanitized snapshots.

### Why individual files?

A shared aggregate JSON file would cause repeated GitHub update conflicts when many clients write at the same time. One file per event avoids that shared-file bottleneck and also makes the archive naturally browsable.

### Archive failures

D1 is still the primary live event store.

Archive status is tracked in:

```text
event_archives
```

Failed archives can be retried with:

```http
POST /v1/admin/archive-retry/<eventId>
```

---

# 25. Using Your Data Later

You can consume collected data in several ways.

## From a website

```javascript
const response = await fetch(
  "https://github-page-insights-worker.game-developer-mb.workers.dev/v1/platforms/my-platform?days=30"
);

const data = await response.json();
console.log(data.totals);
console.log(data.topPages);
console.log(data.recentEvents);
```

## From Python

```python
import requests

WORKER = "https://github-page-insights-worker.game-developer-mb.workers.dev"

data = requests.get(
    f"{WORKER}/v1/platforms/my-platform",
    params={"days": 30},
    timeout=15,
).json()

print(data["totals"])
```

## From another GitHub repository

The live API is preferable for analytics queries:

```text
/v1/platforms
/v1/overview
/v1/platforms/<platformId>
/v1/events
```

The GitHub archive is preferable when you need raw historical JSON files independent of the live API:

```text
data/platforms/<platformId>/events/YYYY/MM/DD/*.json
```

## From D1 directly

With Wrangler:

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT platform_id,event_type,COUNT(*) AS n FROM events GROUP BY platform_id,event_type ORDER BY n DESC;"
```

---

# 26. Building a Second Dashboard

The official `docs/` dashboard is only one consumer.

You can create another frontend with the same API.

For example:

```text
Your App
   ↓
GET /v1/platforms
   ↓
GET /v1/platforms/my-platform?days=30
   ↓
Render your own UI
```

No GitHub credentials are needed for normal public API reads.

For administrative/private data, use an authenticated backend rather than exposing `ADMIN_KEY` to the browser.

---

# 27. Adding a New Platform

You do **not** edit Worker code to add a normal new platform.

Send:

```json
{
  "platformId": "new-platform",
  "platformName": "New Platform",
  "platformType": "api",
  "eventType": "startup"
}
```

The Worker creates/updates the platform namespace automatically.

Archive path becomes:

```text
data/platforms/new-platform/events/...
```

This is the key universal behavior of the project.

---

# 28. Data Retention and Privacy

This project is intentionally capable of storing detailed client telemetry, including raw IP when available.

Before deploying it for real users, decide and document:

- lawful basis / user notice where applicable
- retention period
- who can access raw IP
- whether raw IP should be exported to GitHub at all
- whether public read endpoints should be restricted
- whether geographic precision should be reduced
- whether user IDs are personal data in your context

The code redacts common credential-bearing headers, but **it is not a complete privacy-compliance system**.

See:

```text
SECURITY.md
```

---

# 29. Error Handling and Resilience

The service is designed so a single dependency problem does not automatically destroy telemetry.

### D1

The Worker stores the event first.

Aggregate tables are updated separately and report degradation when necessary.

### GitHub

The archive writer:

- uses a unique event path
- supports timeouts
- retries transient failures
- handles common rate-limit/server failures
- attempts to recover files that already exist after a race/timeout
- records archive state in D1
- provides an admin retry endpoint

### Frontend

The dashboard uses:

```text
Promise.allSettled
request timeouts
local in-memory display cache
non-blocking health updates
error toasts
fallback rendering
```

The dashboard can remain visually usable even if one API request fails.

---

# 30. Health and Diagnostics

## Basic health

```http
GET /v1/health
```

## Health with GitHub probe

```http
GET /v1/health?probe=github
```

The health response includes checks for:

```text
Worker
configuration
D1
authenticated GitHub access (when probed)
telemetry freshness
Telegram configuration
```

A healthy service is not the same thing as "there is already data". A newly installed empty database can legitimately report a warning about missing telemetry while the Worker and database themselves are healthy.

---

# 31. Windows + Wrangler Workflow

For local maintenance:

```powershell
npx wrangler login --use-keyring
npx wrangler whoami
npx wrangler d1 list
npx wrangler d1 info github-page-insights
npm run check
```

Useful commands:

```powershell
npm run check
npm run check:worker
npm run check:dashboard
npm run check:contract
npm run d1:list
npm run d1:info
npm run d1:verify
npm run deploy
npm run dev
npm run tail
```

**Normal production deployment should still happen through Cloudflare Workers Builds after the GitHub repository is connected.**

Use `npm run deploy` / `npx wrangler deploy` as the manual recovery path when you intentionally need it.

---

# 32. Local Development

To install dependencies:

```powershell
npm install
```

To run local Worker development:

```powershell
npm run dev
```

For safe remote D1 development, prefer a dedicated preview database rather than pointing local development at production data.

Cloudflare's D1 configuration supports a separate `preview_database_id` for local/preview workflows.

---

# 33. Preflight and Validation

Before a production push, run:

```powershell
npm run check
```

The validation suite checks:

```text
required files
Wrangler worker name/main
JavaScript syntax
Worker ↔ D1 column alignment
96 event columns
API contract
sample event path
idempotency / duplicate event
health endpoint
schema endpoint
malformed URL handling
Pages workflow path filtering
```

Run the deeper test suite directly:

```powershell
node tests/validate.mjs
```

The repository includes:

```text
VALIDATION-REPORT-FA.md
```

---

# 34. AI Integration Guide

AI agents should **not guess the API from memory**.

Recommended procedure:

```text
1. GET /v1/schema
2. Read contractVersion / workerVersion / databaseSchema
3. Read requiredForCollect
4. Read fieldAliases
5. Read readEndpoints
6. Choose a platformId
7. POST /v1/events
8. Save requestId + eventId from the response
9. Use the read endpoint for verification
10. Only use admin endpoints on a trusted backend
```

### AI integration rules

```text
platformId is the stable namespace.
Do not hard-code a platform list into the Worker.
Do not invent event column names when custom data can live in data/metadata.
Prefer a stable eventId for retryable events.
Never place GITHUB_TOKEN or ADMIN_KEY in frontend code.
Use /v1/schema as the runtime source of truth.
Use /v1/platforms to discover existing namespaces.
Use /v1/platforms/<platformId> for platform analytics.
Use /v1/events for recent event retrieval.
Use /v1/admin/* only from a trusted environment.
```

See also:

```text
AI-INTEGRATION.md
```

---

# 35. Copy-Paste Prompt for an AI Coding Agent

```text
You are integrating a client with Universal Event Insights.

Base URL:
https://github-page-insights-worker.game-developer-mb.workers.dev

First request:
GET /v1/schema

Do not guess the API contract.
Use the live schema response as the authoritative source.

The only mandatory collection field is platformId.
Generate a stable platformId for this application and keep it unchanged.

Prefer POST /v1/events.
Use eventId when retries may happen.
Use eventType for the event type; do not use generic `type` as the event type field unless the live schema explicitly says so.

Put application-specific values under data and metadata.
Put browser/page/user/session information into the canonical fields or nested identity/page/screen/viewport/connection structures when relevant.

Never put GitHub tokens, admin keys, Telegram tokens, API secrets, passwords, cookies, or authorization headers into frontend code or analytics payloads.

After sending a test event:
1. verify the response is 201/200/202 as documented;
2. record requestId and eventId;
3. verify the platform through GET /v1/platforms/<platformId>;
4. do not change the Worker just to add a new platform.

If the existing project has an old analytics implementation, migrate it toward the current v1 contract without deleting unrelated application features.
```

---

# 36. Versioning

The public API namespace is:

```text
/v1/*
```

Breaking API changes should use a new major namespace rather than silently changing existing `/v1` semantics.

The Worker release version and database schema version are reported independently.

Current project release:

```text
Worker: 10.2.1
D1 schema: 9.0
API: v1
```

---

# 37. Troubleshooting

## Worker build fails immediately

Check:

```text
Worker dashboard name == wrangler.jsonc name
Root directory == /
worker/index.js exists
wrangler.jsonc exists
D1 database_id is real
npm run check passes
```

Cloudflare's current Git integration explicitly requires the Worker name to match the Wrangler configuration.

## Every event causes another Worker deployment

Check:

```text
Workers & Pages
→ Worker
→ Settings
→ Builds
→ Build watch paths
```

Make sure `data/*` is not an included trigger path. Use the recommended include/exclude rules from this README.

## GitHub Pages does not update

Check:

```text
Settings → Pages → Source = GitHub Actions
```

Then inspect:

```text
Actions → Deploy GitHub Pages dashboard
```

Only changes under `docs/**` should start the Pages workflow.

## D1 schema error

Run:

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

Then:

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT COUNT(*) AS event_columns FROM pragma_table_info('events');"
```

Expected event column count:

```text
96
```

## Event returns `D1_STORE_FAILED`

Use the returned:

```text
requestId
eventId
details
```

Then:

```powershell
npx wrangler tail github-page-insights-worker
```

Look for:

```text
D1_STORE_FAILED
D1_AGGREGATE_FAILED
UNHANDLED_ERROR
```

## Event is in D1 but not GitHub

Check:

```http
GET /v1/health?probe=github
```

Then inspect:

```sql
SELECT * FROM event_archives ORDER BY created_at DESC LIMIT 20;
```

Retry one:

```http
POST /v1/admin/archive-retry/<eventId>
```

## Telegram is not notifying

Check:

```text
TELEGRAM_ENABLED
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

Then:

```text
/telegram/setup
/telegram/test
```

with:

```http
X-Admin-Key: YOUR_ADMIN_KEY
```

---

# 38. Operational Recommendations

For small and moderate event volume:

```text
D1 + individual GitHub archive
```

is straightforward and traceable.

For high event volume, consider:

```text
rate limiting
platform API keys
batch archiving
sampling
retention policies
separate private admin API
queueing/buffering
```

The current repository intentionally stays request-driven and does not require Cron for basic ingestion.

---

# 39. Official References

Cloudflare Workers Builds:

https://developers.cloudflare.com/workers/ci-cd/builds/

Cloudflare GitHub integration:

https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/

Build watch paths:

https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/

Build configuration:

https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

Wrangler configuration:

https://developers.cloudflare.com/workers/wrangler/configuration/

D1 Wrangler commands:

https://developers.cloudflare.com/d1/wrangler-commands/

D1 getting started:

https://developers.cloudflare.com/d1/get-started/

Cloudflare Worker secrets:

https://developers.cloudflare.com/workers/configuration/secrets/

GitHub Pages:

https://docs.github.com/en/pages

GitHub Contents API:

https://docs.github.com/en/rest/repos/contents

Telegram Bot API:

https://core.telegram.org/bots/api

---

# 40. License

MIT License.

See:

```text
LICENSE
```

---

## Final principle

**Send an event, identify it with `platformId`, keep the event ID stable for retries, let the Worker normalize/enrich/store/archive it, and let `/v1/schema` remain the source of truth for machines and AI.**
