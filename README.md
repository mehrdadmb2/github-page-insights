# 🌌 Universal Event Insights

[![Universal API](https://img.shields.io/badge/API-Universal%20Event%20API-45F5FF?style=for-the-badge&logo=fastapi&logoColor=white)](#-universal-event-api)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![D1](https://img.shields.io/badge/Cloudflare-D1-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![GitHub Archive](https://img.shields.io/badge/GitHub-Archive-181717?style=for-the-badge&logo=github&logoColor=white)](https://docs.github.com/en/rest/repos/contents)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-229ED9?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![No Cron](https://img.shields.io/badge/Collection-No%20Cron-56D364?style=for-the-badge)](#-architecture)

> **A reusable, modular, multi-platform event API for websites, GitHub Pages, dashboards, bots, mobile/web apps, APIs, automation tools, and arbitrary clients.**

---

## 🧭 The Core Idea

This project is intentionally **not a GitHub Pages-only analytics tool**.

The API has one universal identity concept:

```text
platformId
```

A platform can be anything:

```text
github-pages
website
telegram-bot
discord-bot
mobile-app
desktop-app
saas-api
internal-tool
webhook-source
iot-device
cli-client
crm
shop
custom-service
```

A client sends an event to the same Worker:

```http
POST /v1/events
```

with at minimum:

```json
{
  "platformId": "my-platform"
}
```

The Worker automatically creates/updates the platform and stores the event under its own namespace.

GitHub archive example:

```text
data/platforms/my-platform/events/YYYY/MM/DD/<event>.json
```

No hard-coded project list is required.

---

# 🚀 Current Service

## Worker

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

## Collector

```text
POST https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events
```

Compatibility aliases are also available:

```text
POST /v1/collect
POST /collect
```

---

# 🏗️ Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                        ANY CLIENT                            │
│                                                              │
│ Website / GitHub Page / Mobile / Bot / API / App / Script    │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               │ POST /v1/events
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                CLOUDFLARE WORKER                             │
│                                                              │
│ validation → normalization → request metadata → routing     │
└───────────────┬──────────────────────────┬───────────────────┘
                │                          │
                ▼                          ▼
      ┌──────────────────┐        ┌────────────────────────┐
      │ Cloudflare D1    │        │ GitHub REST API        │
      │                  │        │                        │
      │ live query/data  │        │ human-readable archive │
      └────────┬─────────┘        └───────────┬────────────┘
               │                              │
               └──────────────┬───────────────┘
                              ▼
                 ┌────────────────────────────┐
                 │ Dashboard / Other Clients  │
                 │                            │
                 │ REST API                   │
                 │ JSON                       │
                 │ Health                      │
                 └────────────────────────────┘
                              │
                              └─────────────► Telegram admin alerts
```

### Design principles

- **Universal:** not tied to GitHub Pages.
- **Dynamic:** new platforms appear automatically.
- **Request-driven:** collection works without Cron or Scheduled Triggers.
- **Modular:** collector, analytics, GitHub archive, dashboard and Telegram are separate modules.
- **Machine-readable:** `/v1/schema` exposes the integration contract.
- **AI-friendly:** this README documents the exact flow an AI agent should follow.

---

# 🧩 Platform Model

Every event belongs to:

```text
platformId
platformName
platformType
```

Example:

```json
{
  "platformId": "discord-bot",
  "platformName": "My Discord Bot",
  "platformType": "bot"
}
```

Another:

```json
{
  "platformId": "shop-api",
  "platformName": "Shop API",
  "platformType": "api"
}
```

The Worker does not need to know in advance what these platforms are.

---

# 🔐 Cloudflare Configuration

## Required D1 binding

Create a D1 database and bind it to the Worker with:

```text
Binding type: D1 Database
Variable name: DB
```

The Worker accesses it as:

```javascript
env.DB
```

Cloudflare documents the Worker D1 binding pattern and prepared statements here:

- https://developers.cloudflare.com/d1/worker-api/
- https://developers.cloudflare.com/d1/worker-api/prepared-statements/

## Required GitHub variables

```text
GITHUB_OWNER=mehrdadmb2
GITHUB_REPO=github-page-insights
GITHUB_BRANCH=main
GITHUB_ARCHIVE_ENABLED=true
```

## Required secrets

```text
GITHUB_TOKEN
```

Optional Telegram secrets/values:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

Optional configuration values:

```text
TELEGRAM_ENABLED=true
TELEGRAM_NOTIFY_MODE=visitor
REQUIRE_PLATFORM_KEY=false
DEBUG=false
```

Cloudflare recommends storing sensitive credentials such as API tokens as Worker Secrets rather than exposing them in frontend code.

Official reference:

https://developers.cloudflare.com/workers/configuration/secrets/

---

# 🗄️ D1 Database

The current universal schema uses these tables:

```text
platforms
platform_visitors
platform_sessions
events
notification_log
```

Full schema:

```text
db/schema-v7.sql
```

### Why `payload_json` exists

The relational columns cover common analytics fields, while `payload_json` preserves the original arbitrary JSON payload.

This is what makes the API suitable for applications that send custom business data.

Example custom event:

```json
{
  "platformId": "crm",
  "eventType": "custom",
  "data": {
    "customerId": "C-1020",
    "action": "opened-invoice",
    "invoiceTotal": 125000
  }
}
```

The Worker can still analyze standard fields while preserving the complete event payload.

---

# 📡 Universal Event API

## Primary endpoint

```http
POST /v1/events
```

Full URL:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events
```

Content type:

```http
Content-Type: application/json
```

The endpoint is intentionally public by default.

---

# ✅ Minimum Event

Only one business field is mandatory:

```json
{
  "platformId": "my-platform"
}
```

Everything else can be supplied when relevant.

If `visitorId` is omitted, the Worker derives a deterministic visitor identifier from request information when possible.

If `sessionId` is omitted, the Worker creates a stable time-bucketed session identifier for that platform/visitor combination.

For best control, production clients should send their own stable `visitorId` and `sessionId`.

---

# ⭐ Recommended Event

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "web",

  "eventType": "pageview",
  "eventId": "client-generated-event-id",

  "sessionId": "session-123",
  "visitorId": "visitor-123",

  "timestamp": "2026-09-21T11:00:00.000Z",

  "pageUrl": "https://example.com/dashboard",
  "path": "/dashboard",
  "title": "Dashboard",

  "referrer": "https://google.com/",

  "language": "en-US",
  "timezone": "Asia/Baku",

  "screen": {
    "width": 1920,
    "height": 1080,
    "devicePixelRatio": 1,
    "colorDepth": 24
  },

  "viewport": {
    "width": 1500,
    "height": 900
  },

  "connection": {
    "type": "4g",
    "downlink": 25,
    "rtt": 40,
    "saveData": false
  },

  "durationMs": 125000,
  "maxScroll": 84,
  "clicks": 9,
  "outboundClicks": 2,

  "data": {
    "action": "opened-dashboard",
    "section": "reports"
  },

  "metadata": {
    "sdk": "my-client",
    "clientVersion": "4.2.1"
  }
}
```

---

# 🧾 Supported Event Types

Built-in event types include:

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

Custom event categories are allowed through:

```text
custom
```

and your application-specific data should go inside:

```json
{
  "data": {}
}
```

This avoids polluting the core API contract with application-specific columns.

---

# 📤 Sending Data Examples

## JavaScript

```javascript
await fetch(
  "https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      platformId: "my-web-app",
      platformName: "My Web App",
      platformType: "web",
      eventType: "pageview",
      sessionId: "session-123",
      visitorId: "visitor-123",
      pageUrl: location.href,
      path: location.pathname,
      title: document.title,
      timestamp: new Date().toISOString(),
      data: {
        section: "home"
      }
    })
  }
);
```

## cURL

```bash
curl -X POST \
  "https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events" \
  -H "Content-Type: application/json" \
  -d '{
    "platformId": "my-api",
    "platformName": "My API",
    "platformType": "api",
    "eventType": "request",
    "data": {
      "route": "/v1/orders",
      "method": "GET",
      "status": 200
    }
  }'
```

## Python

```python
import requests

url = "https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events"

payload = {
    "platformId": "my-python-app",
    "platformName": "My Python App",
    "platformType": "script",
    "eventType": "custom",
    "data": {
        "action": "job-completed",
        "jobId": "JOB-101",
        "durationMs": 2800
    }
}

response = requests.post(
    url,
    json=payload,
    timeout=15,
)

print(response.status_code)
print(response.json())
```

## PHP

```php
<?php

$url = 'https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events';

$payload = [
    'platformId' => 'my-php-app',
    'platformName' => 'My PHP App',
    'platformType' => 'backend',
    'eventType' => 'request',
    'data' => [
        'route' => '/checkout',
        'status' => 200
    ]
];

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
]);

$result = curl_exec($ch);
curl_close($ch);

echo $result;
```

---

# 📥 Successful Response

A normal successful event returns:

```http
201 Created
```

Typical response:

```json
{
  "ok": true,
  "accepted": true,
  "version": "7.0.0",
  "requestId": "...",
  "eventId": "...",
  "platformId": "my-platform",
  "eventType": "pageview",
  "stored": {
    "d1": true,
    "github": true
  },
  "d1": {
    "newVisitor": true,
    "newSession": true
  },
  "github": {
    "ok": true,
    "status": 201,
    "path": "data/platforms/my-platform/events/2026/09/21/...json",
    "commitSha": "...",
    "fileSha": "..."
  }
}
```

The response contains a `requestId` specifically so the same request can be found in Cloudflare logs.

---

# 🧠 Universal Data Model

The Worker normalizes the request into common dimensions:

### Identity

```text
platformId
platformName
platformType
eventId
visitorId
sessionId
```

### Web/page context

```text
pageUrl
path
title
referrer
referrerHost
```

### Client context

```text
userAgent
browser
browserVersion
os
osVersion
device
language
timezone
screen
viewport
connection
```

### Network / Cloudflare context

```text
ip
ipHash
country
region
city
continent
colo
asn
asOrganization
latitude
longitude
postalCode
metroCode
tlsVersion
clientTcpRtt
clientQuicRtt
```

### Engagement

```text
durationMs
maxScroll
clicks
outboundClicks
```

### Arbitrary application data

```text
data
payload
metadata
```

`data` is normalized into `data_json` while the complete submitted object is preserved in `payload_json`. The normalized event archive also exposes the parsed custom `data` object for convenient downstream consumption.

---

# 🌍 Raw IP

Raw client IP is stored when Cloudflare supplies it to the Worker.

The primary field is:

```text
ip
```

An additional deterministic fingerprint remains available as:

```text
ipHash
```

The raw IP can be used by the dashboard and Telegram notification module.

Review applicable privacy and data-protection requirements before deploying this publicly.

---

# 🗂️ Automatic GitHub Organization

A platform automatically receives its own GitHub namespace.

For:

```text
platformId = imdb-showcase
```

archive path:

```text
data/platforms/imdb-showcase/events/YYYY/MM/DD/<event>.json
```

For:

```text
platformId = telegram-bot
```

archive path:

```text
data/platforms/telegram-bot/events/YYYY/MM/DD/<event>.json
```

For:

```text
platformId = my-api
```

archive path:

```text
data/platforms/my-api/events/YYYY/MM/DD/<event>.json
```

No manual folder creation is required.

The Worker sanitizes platform IDs before using them as paths.

---

# 🔎 Finding a Platform's Data

## Step 1 — discover platforms

```http
GET /v1/platforms
```

Example:

```json
{
  "ok": true,
  "platforms": [
    {
      "platformId": "imdb-showcase",
      "platformName": "IMDb Showcase",
      "platformType": "web",
      "totalEvents": 120,
      "totalPageviews": 80,
      "totalSessions": 70,
      "totalVisitors": 55,
      "lastSeen": "2026-09-21T11:00:00.000Z"
    }
  ]
}
```

## Step 2 — request platform analytics

```http
GET /v1/platforms/imdb-showcase?days=30
```

## Step 3 — request platform raw events

```http
GET /v1/platforms/imdb-showcase/events?days=30&limit=100
```

## Step 4 — inspect GitHub archive

```text
data/platforms/imdb-showcase/
```

This four-step workflow is the recommended discovery pattern for external applications and AI agents.

---

# 📊 Global Overview

```http
GET /v1/overview?days=7
```

Supported values:

```text
1
7
30
90
all
```

Returns global aggregates across all platforms.

---

# 🎯 Platform Analytics

```http
GET /v1/platforms/<platformId>?days=7
```

Returns:

```text
views
uniqueVisitors
sessions
events
avgDurationMs
avgScroll
daily
countries
browsers
operatingSystems
devices
ips
topPages
recentEvents
```

---

# 🧾 Raw Platform Events

```http
GET /v1/platforms/<platformId>/events?days=7&limit=100
```

`limit` is capped by the Worker.

Each returned event is suitable for custom processing, export, AI analysis or another application.

---

# 🩺 System Health API

Basic:

```http
GET /v1/health
```

Detailed:

```http
GET /v1/health?probe=github
```

Aliases:

```text
/health
/api/health
/api/system-health
```

The health response can inspect:

```text
Worker
D1
expected tables
expected event columns
record counts
latest event
GitHub configuration
GitHub repository access
GitHub rate limit
Telegram configuration
telemetry freshness
```

The dashboard uses the same endpoint to display its health center.

---

# 🧬 Machine-Readable API Schema

The Worker exposes:

```http
GET /v1/schema
```

The endpoint returns a machine-readable contract containing:

```text
contractVersion
identityField
genericPayload
dynamicFolders
telegramNotification
endpoints
requiredForCollect
recommendedForCollect
eventTypes
```

This endpoint is intentionally useful for AI agents, SDK generators and external tooling.

---

# 🤖 Telegram Integration

Telegram is an optional module of the same Worker.

It can:

- notify the admin when a new visitor uses a platform,
- show system status,
- list platforms,
- show a platform summary,
- show recent events.

The Bot API is documented by Telegram:

https://core.telegram.org/bots/api

---

# 🔔 Telegram Notification Modes

Set:

```text
TELEGRAM_NOTIFY_MODE=visitor
```

Available values:

```text
off
visitor
session
event
```

Recommended:

```text
visitor
```

This sends an alert for the first event observed from a new visitor identifier rather than every heartbeat.

`event` sends for every eligible event and can become very noisy on active sites.

---

# 📨 Telegram Notification Contents

The notification can include:

```text
platform
platform id
platform type
event type
time
IP
country
region
city
ASN
ASN organization
device
OS
browser
page
referrer
duration
scroll
clicks
visitor ID
session ID
request ID
```

This module uses the same normalized event that is stored in D1 and archived in GitHub.

---

# 🤖 Telegram Bot Commands

The same Worker exposes a Telegram webhook endpoint:

```text
POST /telegram/webhook
```

Supported admin commands include:

```text
/start
/help
/status
/platforms
/platform <platformId>
/last <platformId>
/whoami
```

Only the configured `TELEGRAM_ADMIN_CHAT_ID` is allowed to receive admin command responses.

---

# 🔗 Telegram Webhook Setup

The Worker includes:

```text
GET /telegram/setup
```

This endpoint requires the same private `ADMIN_KEY` used for admin operations.

Call it with:

```http
X-Admin-Key: YOUR_ADMIN_KEY
```

The Worker builds its own webhook URL:

```text
https://YOUR-WORKER-DOMAIN/telegram/webhook
```

and registers it with Telegram's `setWebhook` method.

Telegram's Bot API documentation specifies that `setWebhook` configures an HTTPS URL to which Telegram sends JSON-serialized updates. Telegram also documents `sendMessage` as the text-message method used by this integration.

---

# 🧪 Telegram Test

After configuration:

```text
GET /telegram/test
```

with:

```http
X-Admin-Key: YOUR_ADMIN_KEY
```

The Worker sends a test message to the configured admin chat.

---

# 🔐 Telegram Webhook Secret

Set:

```text
TELEGRAM_WEBHOOK_SECRET=<long-random-value>
```

Telegram sends the corresponding secret in:

```text
X-Telegram-Bot-Api-Secret-Token
```

The Worker validates that header when a webhook secret is configured.

---

# 🗝️ Provisioning a Platform API Key

If you choose to enable per-platform authentication, the admin API can provision a key hash.

Endpoint:

```http
POST /v1/admin/platform-key
```

Required header:

```text
X-Admin-Key: YOUR_ADMIN_KEY
```

JSON body:

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "web",
  "apiKey": "A-LONG-SECRET-KEY"
}
```

The Worker stores only the SHA-256 hash of the platform key. Clients then send:

```text
X-Platform-Key: A-LONG-SECRET-KEY
```

This mechanism is optional and does not need to be used by public anonymous collectors.

---

# 🧱 Optional Platform Authentication

By default:

```text
REQUIRE_PLATFORM_KEY=false
```

This means anybody can submit an event with a platform ID.

This is intentional for a universal public collector.

If you need stronger source authenticity, the schema contains:

```text
platforms.api_key_hash
```

and the Worker accepts:

```text
X-Platform-Key
```

or:

```text
X-API-Key
```

When:

```text
REQUIRE_PLATFORM_KEY=true
```

an event needs a valid platform key for an existing platform.

Use an administrative provisioning flow or a future management API to provision keys rather than placing secrets in public frontend code.

---

# 🛡️ Abuse Resistance

The Worker includes baseline protections:

```text
payload size limits
URL validation
numeric range validation
event type normalization
platform ID normalization
path traversal prevention
admin authentication
webhook secret validation
request IDs
error logging
GitHub timeouts
Telegram timeouts
```

Because `/v1/events` is public, it is still possible for someone to submit false events.

For higher security requirements, combine the Worker with Cloudflare rate limiting and authenticated per-platform keys.

---

# 🧯 Failure Semantics

The collector separates D1 persistence from GitHub archival.

### D1 succeeds, GitHub succeeds

```json
{
  "stored": {
    "d1": true,
    "github": true
  }
}
```

### D1 succeeds, GitHub fails

```json
{
  "stored": {
    "d1": true,
    "github": false
  }
}
```

The event remains available in D1.

The response also contains the GitHub error details and request ID for diagnostics.

### D1 fails

```json
{
  "stored": {
    "d1": false,
    "github": false
  }
}
```

The request does not pretend that the event was stored.

---

# 🪵 Worker Logging

Each request receives a unique:

```text
requestId
```

Useful log events include:

```text
REQUEST_START
COLLECT_START
VALIDATION_ERROR
D1_STORE_FAILED
GITHUB_ARCHIVE_FAILED
TELEGRAM_NOTIFICATION_FAILED
COLLECT_COMPLETE
UNHANDLED_ERROR
```

When debugging:

1. reproduce the request,
2. copy the returned `requestId`,
3. open Cloudflare Worker logs,
4. search for that request ID.

---

# 🎨 Included Dashboard

The GitHub Pages dashboard is a visual control plane for the universal API.

It includes:

```text
System health center
Dynamic platform discovery
Global metrics
Platform selector
Date range selector
Traffic timeline
Platform mix
Countries
Browsers
Operating systems
IP intelligence
Recent telemetry
Live status
Dark / light theme
Neon glass UI
Responsive mobile layout
Initial boot animation
```

The dashboard does **not** contain:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
```

It uses public read endpoints from the Worker.

---

# 🌐 Using the Dashboard on GitHub Pages

The repository is designed to work through GitHub Pages using the `docs/` directory.

Relevant files:

```text
docs/index.html
docs/style.css
docs/app.js
docs/config.js
docs/analytics.js
docs/logo.svg
```

Set GitHub Pages to deploy from:

```text
main / docs
```

---

# 📦 Universal Browser SDK

The bundled SDK is:

```text
docs/analytics.js
```

Install it on another page with:

```html
<meta name="uei-platform-id" content="my-project">
<meta name="uei-platform-name" content="My Project">
<meta name="uei-platform-type" content="web">
<script src="https://YOUR-DASHBOARD-DOMAIN/analytics.js"></script>
```

Backward-compatible GitHub Page metadata names are also recognized:

```html
<meta name="page-insights-site-id" content="my-project">
<meta name="page-insights-site-name" content="My Project">
```

---

# 🧩 SDK Custom Events

After installing `analytics.js`:

```javascript
window.UniversalEventInsights.track(
  "custom",
  {
    action: "opened-settings",
    tab: "security"
  }
);
```

You can manually flush a heartbeat:

```javascript
window.UniversalEventInsights.flush();
```

Backward-compatible alias:

```javascript
window.GitHubPageInsights
```

---

# 🧠 AI-First Integration Rules

This section is the canonical integration procedure for an AI agent.

## Rule 1 — understand the identity

The canonical universal identity field is:

```text
platformId
```

For convenience, the collector also accepts `platform`, `platformName`, `platform_name`, or `name` and converts that value into a safe platform ID. An AI integrating a new project should prefer a stable explicit `platformId`.

Never invent a new identity field such as `siteId` unless maintaining legacy compatibility.

## Rule 2 — choose a stable platform ID

Good:

```text
my-web-app
telegram-bot
inventory-api
mobile-app
```

Bad:

```text
random-uuid-every-request
current-timestamp
```

## Rule 3 — send events to the universal collector

```text
POST https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events
```

## Rule 4 — include custom application information under `data`

Good:

```json
{
  "platformId": "inventory-api",
  "eventType": "request",
  "data": {
    "route": "/items",
    "method": "GET",
    "status": 200
  }
}
```

Do not modify the Worker database schema merely to add one application-specific field when the field fits naturally in `data`.

## Rule 5 — discover data through `/v1/platforms`

Do not assume a platform exists.

Call:

```http
GET /v1/platforms
```

Then find the requested `platformId`.

## Rule 6 — use the platform endpoint for analytics

```http
GET /v1/platforms/<platformId>?days=7
```

## Rule 7 — use the platform events endpoint for raw events

```http
GET /v1/platforms/<platformId>/events?days=7&limit=100
```

## Rule 8 — use the GitHub archive for long-term file-level access

```text
data/platforms/<platformId>/events/
```

## Rule 9 — never expose secrets

An AI modifying a consuming project must never add:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
```

to frontend/browser code.

## Rule 10 — inspect `/v1/schema` when the API contract is unclear

```http
GET /v1/schema
```

The Worker is the source of truth for supported routes and event types.

---

# 🤖 AI Example: Connect a New Website

Assume the target application is:

```text
https://example.github.io/project/
```

The AI should:

### 1. Select a stable platform ID

```text
project
```

### 2. Add metadata

```html
<meta name="uei-platform-id" content="project">
<meta name="uei-platform-name" content="Project">
<meta name="uei-platform-type" content="web">
```

### 3. Load the SDK

```html
<script src="https://YOUR-DASHBOARD-DOMAIN/analytics.js"></script>
```

### 4. Do not create another analytics backend

The existing Worker is already the collector.

### 5. Verify

Call:

```text
GET /v1/platforms
```

and confirm:

```text
platformId = project
```

---

# 🤖 AI Example: Connect a Telegram Bot

A bot backend can send a request like:

```json
{
  "platformId": "my-telegram-bot",
  "platformName": "My Telegram Bot",
  "platformType": "telegram-bot",
  "eventType": "request",
  "data": {
    "command": "/start",
    "userId": "12345"
  }
}
```

The bot's own service does not need to be hosted on Cloudflare.

Any platform capable of making HTTPS POST requests can use the collector.

---

# 🤖 AI Example: Use the Data in Another Website

Suppose a new dashboard wants information about:

```text
my-telegram-bot
```

The AI should call:

```javascript
const base =
  "https://github-page-insights-worker.game-developer-mb.workers.dev";

const result = await fetch(
  `${base}/v1/platforms/my-telegram-bot?days=30`
).then(r => r.json());

console.log(result);
```

For raw events:

```javascript
const events = await fetch(
  `${base}/v1/platforms/my-telegram-bot/events?days=30&limit=100`
).then(r => r.json());
```

---

# 🔬 AI Example: Find Its Own Data

A consuming project can determine its own platform ID from configuration.

Recommended sequence:

```text
1. GET /v1/platforms
2. Filter platformId
3. GET /v1/platforms/<platformId>?days=N
4. GET /v1/platforms/<platformId>/events?days=N&limit=M
5. Optionally inspect data/platforms/<platformId>/ in GitHub
```

This is better than assuming a folder exists.

---

# 🧪 Postman / Insomnia

Request:

```text
POST
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events
```

Header:

```text
Content-Type: application/json
```

Body:

```json
{
  "platformId": "postman-test",
  "platformName": "Postman Test",
  "platformType": "test",
  "eventType": "custom",
  "data": {
    "hello": "world"
  }
}
```

---

# ⚙️ Compatibility Routes

For existing integrations, these routes remain available:

```text
POST /collect
POST /v1/collect
GET /health
GET /api/health
GET /api/system-health
GET /api/sites
GET /api/platforms
GET /api/overview
GET /api/site/<id>
GET /api/stats
GET /api/admin/events
```

New integrations should prefer the `/v1/*` routes.

---

# 🧾 Status Codes

```text
200 OK
201 Created
202 Accepted (for non-fatal archive failures)
400 Bad Request
401 Unauthorized
404 Not Found
405 Method Not Allowed
413 Payload Too Large
500 Internal Server Error
502 Upstream archive error
503 Dependency/configuration error
```

---

# 🛠️ Troubleshooting

## Dashboard is empty

Check:

```text
/v1/health
/v1/platforms
/v1/overview?days=7
```

If `/v1/platforms` returns zero platforms, no events have been successfully stored in D1 yet.

## D1 is failing

Open:

```text
Cloudflare → Worker → Logs
```

Look for:

```text
D1_STORE_FAILED
```

Use the returned `requestId`.

## GitHub archive is failing

Look for:

```text
GITHUB_ARCHIVE_FAILED
```

Typical causes:

- invalid GitHub token
- repository access missing
- Contents write permission missing
- incorrect repository owner/name
- wrong branch
- GitHub API error

## Telegram is not notifying

Check:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_ENABLED
TELEGRAM_NOTIFY_MODE
```

Then:

```text
GET /telegram/test
```

with:

```text
X-Admin-Key: YOUR_ADMIN_KEY
```

Also check:

```text
TELEGRAM_WEBHOOK_SECRET
```

if webhook commands are enabled.

---

# 📁 Repository Structure

```text
github-page-insights/
│
├── data/
│   └── platforms/
│       └── <platformId>/
│           └── events/
│               └── YYYY/MM/DD/*.json
│
├── docs/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── analytics.js
│   ├── config.js
│   └── logo.svg
│
├── worker/
│   ├── index.js
│   ├── package.json
│   └── wrangler.toml
│
├── db/
│   └── schema-v7.sql
│
├── README.md
└── LICENSE
```

---

# 📌 Production Recommendations

For small and moderate traffic, immediate D1 storage plus per-event GitHub archive is simple and traceable.

For very high event volume, GitHub should be treated primarily as an archive rather than the real-time datastore. D1 remains the analytics query layer.

Recommended future scaling path:

```text
Client
  ↓
Worker
  ↓
D1
  ↓
batch/archive pipeline
  ↓
GitHub
```

Optional improvements for high-volume deployments:

```text
Cloudflare rate limiting
platform API keys
idempotency keys
retention policies
sampling
edge buffering
batch archive
separate admin API
```

---

# 🔄 Versioning Policy

The universal API contract is versioned under:

```text
/v1/*
```

When a breaking API change is introduced, use a new major API namespace instead of silently changing `/v1` semantics.

The machine-readable contract is available through:

```text
/v1/schema
```

---

# 🧠 Canonical AI Integration Checklist

Before an AI changes a project to use this service, it should verify:

```text
[ ] Read README.md
[ ] Identify stable platformId
[ ] Select platformName
[ ] Select platformType
[ ] Use POST /v1/events
[ ] Put custom data under data
[ ] Keep secrets out of frontend code
[ ] Discover with GET /v1/platforms
[ ] Query analytics with GET /v1/platforms/<id>
[ ] Query raw events with GET /v1/platforms/<id>/events
[ ] Use /v1/schema when uncertain
[ ] Test /v1/health
[ ] Preserve existing application functionality
```

---

# 🔗 Official References

Cloudflare Workers:

https://developers.cloudflare.com/workers/

Cloudflare Workers Secrets:

https://developers.cloudflare.com/workers/configuration/secrets/

Cloudflare D1 Worker API:

https://developers.cloudflare.com/d1/worker-api/

Cloudflare D1 prepared statements:

https://developers.cloudflare.com/d1/worker-api/prepared-statements/

GitHub Contents API:

https://docs.github.com/en/rest/repos/contents

GitHub REST API authentication:

https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api

Telegram Bot API:

https://core.telegram.org/bots/api

---

# 🧪 Quick Reference

### Send

```text
POST /v1/events
```

### Discover

```text
GET /v1/platforms
```

### Global analytics

```text
GET /v1/overview?days=7
```

### Platform analytics

```text
GET /v1/platforms/<platformId>?days=7
```

### Raw events

```text
GET /v1/platforms/<platformId>/events?days=7&limit=100
```

### Health

```text
GET /v1/health?probe=github
```

### API contract

```text
GET /v1/schema
```

### Telegram webhook

```text
POST /telegram/webhook
```

---

# ❤️ Philosophy

**Send one event. Identify one platform. Keep the payload flexible. Query the same data everywhere.**

This project is built so that a GitHub Page, a Telegram bot, a backend API, a mobile app or a completely unrelated service can all speak the same event language.

> **One Worker · Every Platform · One Data Fabric**
