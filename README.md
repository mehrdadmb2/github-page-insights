# 🚀 GitHub Page Insights

> **Modular, real-time analytics and visitor intelligence for GitHub Pages — powered by Cloudflare Workers + D1, with optional direct GitHub archiving.**

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-ready-222?logo=githubpages&logoColor=white)](https://pages.github.com/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![API](https://img.shields.io/badge/API-REST-5DF7FF)](#-http-api-reference)
[![Architecture](https://img.shields.io/badge/Architecture-request--driven-8B6CFF)](#-architecture)
[![License](https://img.shields.io/badge/License-open-source-56D364)](#-license)

---

## 🧭 What is GitHub Page Insights?

**GitHub Page Insights** is a reusable analytics platform for one or many GitHub Pages.

A connected site sends telemetry to a shared Cloudflare Worker. The Worker:

1. identifies the site by a dynamic `siteId`,
2. receives browser/session/engagement data,
3. reads additional request context from Cloudflare,
4. stores the event in Cloudflare D1,
5. archives the event to a GitHub repository,
6. exposes REST endpoints for dashboards and other applications.

The design is intentionally **multi-site**. You do **not** maintain a hard-coded list of projects inside the Worker.

Example:

```text
my-portfolio
imdb-showcase
dual-ping-monitor
documentation
experimental-project
```

All of them can use the same Worker:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

---

# ✨ Features

### 📊 Analytics

- Page views
- Sessions
- Visitors
- Session duration
- Heartbeats
- Page leave
- Visibility changes
- Scroll depth
- Click counters
- Outbound click tracking
- Event types
- Top pages
- Traffic sources / referrer
- Language
- Time zone

### 🖥️ Client intelligence

- Browser family
- Operating system
- Device class
- User agent
- Screen size
- Viewport size
- Device pixel ratio
- Color depth
- Browser connection hints

### 🌍 Cloudflare request intelligence

When Cloudflare exposes the corresponding metadata for a request:

- Raw client IP
- Country
- Region
- City
- Continent
- Cloudflare colo
- ASN
- ASN organization
- Latitude / longitude
- Postal code
- Metro code
- TLS version
- Client TCP RTT
- Client QUIC RTT

### ⚡ Platform

- Request-driven architecture
- No Cron required for collection
- No Scheduled Worker required
- Dynamic `siteId`
- Automatic site creation in D1
- Automatic GitHub archive path creation
- D1-backed statistics
- GitHub archive
- System health endpoint
- Detailed Worker logs
- CORS support
- Payload validation
- Path traversal protection
- Request IDs for diagnostics

---

# 🏗️ Architecture

```text
┌──────────────────────────────┐
│        GitHub Page           │
│                              │
│  analytics.js                │
│       │                      │
│       │ POST /collect        │
└───────┼──────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│      Cloudflare Worker       │
│                              │
│  validate                    │
│  normalize                   │
│  enrich with CF metadata     │
│  identify site/session/etc.  │
└──────────┬───────────┬───────┘
           │           │
           ▼           ▼
   ┌────────────┐  ┌───────────────┐
   │ Cloudflare │  │ GitHub REST   │
   │ D1         │  │ Contents API  │
   │            │  │               │
   │ real-time  │  │ long-term     │
   │ analytics  │  │ archive       │
   └────────────┘  └───────────────┘
           │
           ▼
   ┌────────────────────┐
   │ Dashboard / Clients│
   │                    │
   │ /api/sites         │
   │ /api/overview      │
   │ /api/site/...      │
   │ /api/stats         │
   │ /api/system-health │
   └────────────────────┘
```

### Why D1 + GitHub?

D1 is used for fast relational analytics and live dashboard queries.

GitHub is used as a persistent, browsable archive of individual event JSON files.

This means the dashboard does not need to scan the Git repository for every statistic.

---

# 🌐 Worker URL

Current deployed Worker:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

Base URL:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

---

# ☁️ Cloudflare Configuration

## Required D1 Binding

Worker binding:

```text
Binding type: D1 Database
Variable: DB
Database: github-page-insights
```

The Worker expects:

```javascript
env.DB
```

## Required Variables

```text
GITHUB_OWNER=mehrdadmb2
GITHUB_REPO=github-page-insights
GITHUB_BRANCH=main
```

## Required Secrets

```text
GITHUB_TOKEN=<fine-grained GitHub PAT>
ADMIN_KEY=<private admin key>
```

### GitHub token recommendation

For the repository:

```text
mehrdadmb2/github-page-insights
```

grant the Worker only the required repository access.

For GitHub Contents API writes, the token must have repository contents write permission.

**Never put `GITHUB_TOKEN` or `ADMIN_KEY` inside `docs/`, HTML, frontend JavaScript, or browser-exposed configuration.**

---

# 🗄️ D1 Schema

The current analytics database contains three main tables:

```text
sites
events
visitor_sessions
```

## `sites`

One logical record per `siteId`.

Important fields:

```text
site_id
site_name
first_seen
last_seen
views
unique_visitors
sessions
```

## `events`

One telemetry event per request.

Important fields:

```text
id
received_at
event_type
site_id
site_name
session_id
visitor_id

page_url
path
title

referrer
referrer_host

language
timezone

country
region
city
continent
colo
asn

ip
ip_hash

user_agent
browser
os
device

screen_width
screen_height
viewport_width
viewport_height

duration_ms
max_scroll
clicks
outbound_clicks

exported
```

## `visitor_sessions`

Session aggregation:

```text
site_id
session_id
visitor_id
first_seen
last_seen
duration_ms
views
max_scroll
```

---

# 🔌 Connect Any GitHub Page

The recommended integration is the repository's `analytics.js`.

Example:

```html
<meta
  name="page-insights-site-id"
  content="my-project"
>

<meta
  name="page-insights-site-name"
  content="My Project"
>

<script
  src="https://YOUR-DASHBOARD-DOMAIN/analytics.js"
></script>
```

For this repository's own dashboard, the deployed file is intended to be served from its GitHub Pages site.

Example:

```html
<script
  src="https://mehrdadmb2.github.io/github-page-insights/analytics.js"
></script>
```

### Recommended placement

Place the two `<meta>` tags and the `<script>` inside `<head>` or immediately before `</body>`.

---

# 🆔 `siteId` Rules

`siteId` is the primary logical identifier.

Recommended examples:

```text
my-portfolio
imdb-showcase
dual-ping-monitor
docs
project-2026
experimental-dashboard
```

Use a **stable identifier**.

Do not use values that change every deployment.

The Worker normalizes the identifier and rejects unsafe path patterns.

Examples of unsafe values:

```text
../secret
../../config
.github
.git
```

`siteName` is display metadata and does not define filesystem paths.

---

# 🔄 Dynamic Site Registration

You do not pre-register sites inside Worker code.

A Page simply sends:

```json
{
  "siteId": "new-project",
  "siteName": "New Project"
}
```

The Worker creates the corresponding D1 site record automatically.

The GitHub archive path becomes:

```text
data/sites/new-project/
```

This works without modifying the Worker for every new site.

---

# 📡 Collector API

## `POST /collect`

Public ingestion endpoint.

Full endpoint:

```text
POST https://github-page-insights-worker.game-developer-mb.workers.dev/collect
```

Header:

```http
Content-Type: application/json
```

The endpoint accepts JSON telemetry.

---

## Minimal Payload

```json
{
  "siteId": "my-project",
  "siteName": "My Project",
  "eventType": "pageview",
  "sessionId": "session-123",
  "visitorId": "visitor-123",
  "pageUrl": "https://example.github.io/project/",
  "path": "/project/",
  "title": "My Project"
}
```

---

## Recommended Payload

```json
{
  "siteId": "my-project",
  "siteName": "My Project",

  "eventType": "pageview",
  "eventId": "client-event-id",

  "sessionId": "session-123",
  "visitorId": "visitor-123",

  "timestamp": "2026-09-10T12:00:00.000Z",

  "pageUrl": "https://example.github.io/project/",
  "path": "/project/",
  "title": "My Project",

  "referrer": "https://github.com/",
  "language": "en-US",
  "timezone": "Asia/Baku",

  "screen": {
    "width": 1920,
    "height": 1080,
    "devicePixelRatio": 1,
    "colorDepth": 24
  },

  "viewport": {
    "width": 1440,
    "height": 860
  },

  "connection": {
    "type": "4g",
    "downlink": 20,
    "rtt": 40,
    "saveData": false
  },

  "durationMs": 125000,
  "maxScroll": 86,
  "clicks": 7,
  "outboundClicks": 2,

  "metadata": {
    "source": "custom-client",
    "version": "1.0.0"
  }
}
```

---

# 🧩 Supported Event Types

The Worker accepts:

```text
pageview
heartbeat
pageleave
visibility
click
outbound_click
scroll
error
custom
```

Unknown event types are normalized to:

```text
custom
```

---

# ✅ Successful `/collect` Response

A successful event returns:

```http
201 Created
```

Example:

```json
{
  "ok": true,
  "accepted": true,
  "version": "5.0.0",

  "requestId": "request-id",

  "eventId": "event-id",

  "siteId": "my-project",

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
    "status": 201,
    "path": "data/sites/my-project/events/2026/09/10/example.json",
    "commitSha": "commit-sha",
    "fileSha": "file-sha"
  },

  "receivedAt": "2026-09-10T12:00:00.000Z",

  "elapsedMs": 500
}
```

### Important

If:

```json
"stored": {
  "d1": true,
  "github": false
}
```

the event was successfully inserted into D1, but the GitHub archive operation failed.

Use the returned:

```text
requestId
eventId
details
```

to diagnose the Worker logs.

---

# 🛠️ Example: Send Data With `fetch`

```javascript
await fetch(
  "https://github-page-insights-worker.game-developer-mb.workers.dev/collect",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      siteId: "my-project",
      siteName: "My Project",

      eventType: "pageview",

      sessionId: "session-123",
      visitorId: "visitor-123",

      timestamp: new Date().toISOString(),

      pageUrl: location.href,
      path: location.pathname + location.search,
      title: document.title,

      referrer: document.referrer,

      language: navigator.language,

      timezone:
        Intl.DateTimeFormat()
          .resolvedOptions()
          .timeZone
    }
  }
);
```

---

# 🛰️ Recommended Browser Integration

The bundled:

```text
docs/analytics.js
```

automatically tracks:

```text
pageview
heartbeat
pageleave
visibility
scroll milestones
click counters
outbound clicks
session ID
visitor ID
duration
screen
viewport
language
timezone
referrer
connection hints
```

Once installed, no custom `fetch()` is required for basic tracking.

---

# 🧪 Custom Events From a Connected Page

The analytics client exposes:

```javascript
window.GitHubPageInsights
```

You can send a custom event:

```javascript
window.GitHubPageInsights.track(
  "custom",
  {
    action: "opened-command-menu",
    section: "dashboard"
  }
);
```

Another example:

```javascript
window.GitHubPageInsights.track(
  "custom",
  {
    action: "download",
    file: "report.pdf"
  }
);
```

You can also flush a heartbeat manually:

```javascript
window.GitHubPageInsights.flush();
```

---

# 📈 REST API

The Worker exposes a set of read APIs.

---

## `GET /api/sites`

Returns all sites known to D1.

```http
GET /api/sites
```

Example:

```json
{
  "ok": true,
  "sites": [
    {
      "siteId": "imdb-showcase",
      "siteName": "IMDb Showcase",
      "firstSeen": "2026-09-10T10:00:00.000Z",
      "lastSeen": "2026-09-10T12:00:00.000Z",
      "views": 240,
      "uniqueVisitors": 83,
      "sessions": 97
    }
  ]
}
```

This endpoint is the recommended way for a dashboard or AI client to discover the available `siteId` values.

---

# 🌐 `GET /api/overview`

Global analytics across all sites.

```http
GET /api/overview?days=7
```

or:

```http
GET /api/overview?days=30
```

or:

```http
GET /api/overview?days=all
```

Returns:

- total views
- unique visitors
- sessions
- average duration
- average scroll
- today statistics
- daily traffic
- countries
- browsers
- operating systems
- devices
- IP rankings
- event types
- top pages

---

# 🎯 `GET /api/site/<siteId>`

Site-specific analytics.

Example:

```http
GET /api/site/imdb-showcase?days=7
```

or:

```http
GET /api/site/imdb-showcase?days=all
```

The response includes:

```text
views
uniqueVisitors
sessions
avgDurationMs
avgScroll

today

last7Days
series

devices
topPages
recentVisits

countries
browsers
operatingSystems
ips
eventTypes
```

---

# 🔁 `GET /api/stats`

Compatibility endpoint.

Without a site:

```http
GET /api/stats?days=7
```

With a site:

```http
GET /api/stats?site=imdb-showcase&days=7
```

When `site` is provided, it behaves like the site analytics endpoint.

---

# ❤️ System Health

Basic health:

```http
GET /health
```

Detailed health center:

```http
GET /api/system-health
```

Alias:

```http
GET /api/health
```

The detailed endpoint checks:

### Worker

```text
Worker reachability
```

### D1

```text
D1 configured
D1 reachable
required tables
required event columns
record counts
latest event
```

### GitHub

```text
GitHub credentials configured
repository reachable
repository identity
branch
rate-limit information
```

### Telemetry

```text
last telemetry time
latest siteId
latest event type
telemetry age
fresh / stale / waiting
```

### Configuration

```text
D1 binding
GitHub token
GitHub owner
GitHub repository
GitHub branch
Admin key configuration
```

Example:

```json
{
  "ok": true,
  "overall": "healthy",
  "checks": {
    "worker": {
      "status": "ok"
    },
    "database": {
      "status": "ok"
    },
    "github": {
      "status": "ok"
    },
    "telemetry": {
      "status": "ok"
    },
    "configuration": {
      "status": "ok"
    }
  }
}
```

---

# 🔐 Admin Events API

Detailed raw event querying is protected by `ADMIN_KEY`.

Endpoint:

```http
GET /api/admin/events
```

Header:

```http
X-Admin-Key: YOUR_ADMIN_KEY
```

Optional site filter:

```http
GET /api/admin/events?site=imdb-showcase
```

Optional limit:

```http
GET /api/admin/events?site=imdb-showcase&limit=100
```

Maximum limit:

```text
500
```

### Never expose `ADMIN_KEY` in frontend code.

---

# 📦 GitHub Archive Structure

Every accepted event is archived as its own JSON file.

Example:

```text
data/
└── sites/
    └── imdb-showcase/
        └── events/
            └── 2026/
                └── 09/
                    └── 10/
                        ├── 2026-09-10T12-01-10-123Z_xxx.json
                        ├── 2026-09-10T12-01-20-456Z_xxx.json
                        └── ...
```

Another site:

```text
data/
└── sites/
    └── dual-ping-monitor/
        └── events/
            └── ...
```

The Worker builds the path dynamically from `siteId`.

You do not manually create folders.

---

# 🔎 How Another Site Finds Its Own Data

Suppose your site sends:

```json
{
  "siteId": "my-project"
}
```

First discover all sites:

```http
GET /api/sites
```

Find:

```json
{
  "siteId": "my-project",
  "siteName": "My Project"
}
```

Then request:

```http
GET /api/site/my-project?days=30
```

This is the preferred approach for external dashboards.

For raw archived events, inspect:

```text
data/sites/my-project/
```

in the GitHub repository.

---

# 🤖 AI INTEGRATION GUIDE

This section is intentionally explicit so that another AI agent can consume this repository as a machine-readable integration contract.

## AI task: connect a new website

Tell the AI:

> Use the GitHub Page Insights Worker as a telemetry collector. Do not create another analytics backend. Use the existing Worker URL and preserve the site's stable `siteId`.

Worker:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

Collector:

```text
POST /collect
```

Full URL:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/collect
```

For the target site define:

```text
siteId
siteName
```

Example:

```text
siteId = "my-new-project"
siteName = "My New Project"
```

Then install:

```html
<meta
  name="page-insights-site-id"
  content="my-new-project"
>

<meta
  name="page-insights-site-name"
  content="My New Project"
>

<script
  src="https://YOUR-DASHBOARD-DOMAIN/analytics.js"
></script>
```

If custom telemetry is required, send JSON to:

```text
POST /collect
```

with:

```json
{
  "siteId": "my-new-project",
  "siteName": "My New Project",
  "eventType": "custom",
  "sessionId": "stable-session-id",
  "visitorId": "stable-visitor-id",
  "metadata": {
    "action": "example"
  }
}
```

## AI task: read analytics for a site

First:

```http
GET /api/sites
```

Find the target `siteId`.

Then:

```http
GET /api/site/<siteId>?days=7
```

Example:

```http
GET /api/site/my-new-project?days=30
```

Use fields from the returned object directly.

Do not guess field names.

## AI task: compare multiple sites

1. Call `/api/sites`.
2. Collect the required `siteId` values.
3. Request `/api/site/<siteId>?days=<N>` for each site.
4. Compare:
   - views
   - uniqueVisitors
   - sessions
   - avgDurationMs
   - avgScroll
   - devices
   - countries
   - browsers
   - operatingSystems
   - topPages
   - ips
   - eventTypes

## AI task: identify a site's raw events

1. Determine `siteId`.
2. Prefer the site analytics API for aggregates.
3. Use the GitHub path:

```text
data/sites/<siteId>/
```

for archive-level data.

4. Each event file contains the archived event object.

## AI task: add analytics to an existing page

Do **not** change the Worker's GitHub credentials.

Do **not** put:

```text
GITHUB_TOKEN
ADMIN_KEY
```

in the target repository's frontend.

Only add the public collector integration.

---

# 🧠 AI Integration Contract

A consuming AI should treat the following as immutable unless the repository version explicitly changes:

```text
Worker base URL
POST /collect
GET /api/sites
GET /api/overview
GET /api/site/<siteId>
GET /api/stats
GET /api/system-health
```

### Required collector identity

```text
siteId
siteName
```

### Recommended session fields

```text
sessionId
visitorId
```

### Recommended page fields

```text
pageUrl
path
title
referrer
```

### Recommended browser fields

```text
language
timezone
screen
viewport
connection
```

### Recommended engagement fields

```text
durationMs
maxScroll
clicks
outboundClicks
```

### Custom application data

Use:

```json
{
  "metadata": {
    "your": "data"
  }
}
```

Keep custom metadata reasonably small.

---

# 🧪 Testing

## 1. Test the Worker

Open:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/
```

Expected:

```text
status = online
```

## 2. Test health

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/health
```

## 3. Test detailed health

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/api/system-health
```

Expected overall status:

```text
healthy
```

or:

```text
degraded
```

or:

```text
error
```

## 4. Test collector

From a normal HTTPS page:

```javascript
fetch(
  "https://github-page-insights-worker.game-developer-mb.workers.dev/collect",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      siteId: "test-site",
      siteName: "Test Site",
      eventType: "pageview",
      sessionId: crypto.randomUUID(),
      visitorId: crypto.randomUUID(),
      pageUrl: location.href,
      path: location.pathname,
      title: document.title
    })
  }
)
.then(r => r.json())
.then(console.log);
```

Expected:

```text
HTTP 201
stored.d1 = true
stored.github = true
```

---

# 🐛 Troubleshooting

## `D1_NOT_CONFIGURED`

Check:

```text
Binding:
DB
```

and ensure it points to:

```text
github-page-insights
```

## `D1_STORE_FAILED`

Use the returned:

```text
requestId
details
```

then inspect Cloudflare Worker Logs.

Typical causes:

- wrong D1 binding
- schema mismatch
- missing column
- invalid SQL
- deployment version mismatch

## `GITHUB_CONFIGURATION_MISSING`

Check:

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
```

## GitHub `401` / `403`

Check:

- token is valid
- repository access is correct
- repository contents write permission exists
- owner/repository names are correct
- token is stored as a Cloudflare Secret

## Dashboard shows no sites

Check:

```text
/api/sites
```

If it returns an empty list, no event has successfully reached D1 yet.

Then test:

```text
/collect
```

and confirm:

```text
stored.d1 = true
```

## Collector works but dashboard is empty

Check:

```text
/api/sites
/api/overview?days=7
/api/site/<siteId>?days=7
```

The frontend should consume Worker API data instead of guessing the database schema.

---

# 🌐 Browser CSP / CORS

A browser can only call the Worker when the hosting page allows the connection.

Typical CSP requirement:

```text
connect-src https://github-page-insights-worker.game-developer-mb.workers.dev
```

The Worker itself returns CORS headers.

For local browser testing, do not run collector tests from:

```text
chrome://...
```

or other browser-internal pages.

Use a normal:

```text
https://...
```

page.

---

# 🔒 Security Model

The collector endpoint is public by design.

That means anyone can technically submit a telemetry event.

The Worker protects the storage layer by:

- normalizing `siteId`
- rejecting unsafe site identifiers
- never exposing GitHub credentials
- limiting payload size
- validating URLs
- constraining numeric values
- protecting the admin endpoint
- keeping GitHub credentials server-side

### Important limitation

A public analytics collector is not proof of trusted identity.

An attacker can submit fake analytics for a known `siteId`.

If stronger site authenticity is required, add a per-site public/secret registration mechanism in a future version rather than treating `siteId` as a secret.

---

# 🧾 Raw IP Policy

This deployment intentionally stores the raw IP in:

```text
D1
GitHub archive
Dashboard responses
```

and also retains:

```text
ip_hash
```

The Worker does not intentionally print raw IPs in diagnostic logs.

Before deploying analytics publicly, assess your legal/privacy obligations for your jurisdiction and your audience.

---

# 📚 Repository Layout

```text
github-page-insights/
│
├── data/
│   └── sites/
│       └── <siteId>/
│           └── events/
│               └── YYYY/
│                   └── MM/
│                       └── DD/
│                           └── *.json
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
│   └── src/
│       └── index.js
│
├── README.md
└── LICENSE
```

---

# 🎨 Dashboard

The included GitHub Pages dashboard is designed as a frontend control plane for the Worker/D1 system.

It contains:

```text
Live status
System health
Site explorer
Date-range selector
Traffic overview
Device distribution
Geo distribution
Top pages
Browser distribution
OS distribution
IP intelligence
Recent visits
Event telemetry
```

The dashboard reads analytics from the Worker APIs rather than using browser-side GitHub credentials.

---

# 🔄 Recommended Deployment Workflow

```text
1. Create / configure D1
       ↓
2. Create GitHub fine-grained token
       ↓
3. Store token as Cloudflare Secret
       ↓
4. Add DB binding
       ↓
5. Add GITHUB_* variables
       ↓
6. Deploy Worker
       ↓
7. Test /health
       ↓
8. Test /api/system-health
       ↓
9. Test /collect
       ↓
10. Verify D1
       ↓
11. Verify GitHub archive
       ↓
12. Deploy GitHub Pages dashboard
       ↓
13. Add analytics.js to connected projects
```

---

# ♻️ Adding Another Project Later

You do **not** need another Worker.

For example:

```html
<meta
  name="page-insights-site-id"
  content="project-alpha"
>

<meta
  name="page-insights-site-name"
  content="Project Alpha"
>

<script
  src="https://YOUR-DASHBOARD-DOMAIN/analytics.js"
></script>
```

Then another:

```html
<meta
  name="page-insights-site-id"
  content="project-beta"
>

<meta
  name="page-insights-site-name"
  content="Project Beta"
>

<script
  src="https://YOUR-DASHBOARD-DOMAIN/analytics.js"
></script>
```

Both use:

```text
same Worker
same D1
same repository
```

but separate `siteId` namespaces.

---

# 🧩 Building Your Own Dashboard

Any application can use the public read endpoints.

Example JavaScript:

```javascript
const WORKER =
  "https://github-page-insights-worker.game-developer-mb.workers.dev";

const sites =
  await fetch(
    `${WORKER}/api/sites`
  ).then(
    r => r.json()
  );

console.log(sites);
```

Then:

```javascript
const site =
  await fetch(
    `${WORKER}/api/site/imdb-showcase?days=30`
  ).then(
    r => r.json()
  );

console.log(site);
```

---

# 📦 Working With Archived GitHub Data

GitHub archive data can be consumed independently from the Worker.

The archive root is:

```text
data/sites/
```

A project is:

```text
data/sites/<siteId>/
```

Events are:

```text
data/sites/<siteId>/events/YYYY/MM/DD/
```

This makes the repository suitable for:

- offline analysis
- backups
- custom scripts
- notebooks
- ETL pipelines
- AI analysis
- static reporting
- audit/history use cases

---

# 🧠 Practical AI Prompt

When asking an AI to integrate this repository into another project, use a prompt such as:

> Read the `README.md` of GitHub Page Insights before making changes. Use the existing Cloudflare Worker rather than creating a new analytics backend. Identify the target project's stable `siteId`, add the `page-insights-site-id` and `page-insights-site-name` metadata, load the public `analytics.js`, and preserve all existing project functionality. For analytics queries, use `/api/sites` to discover site IDs and `/api/site/<siteId>?days=<N>` for site-specific statistics. Never expose `GITHUB_TOKEN` or `ADMIN_KEY` to frontend code.

---

# ❌ Do Not Do This

Never put:

```javascript
const GITHUB_TOKEN = "...";
```

inside frontend code.

Never send:

```text
GITHUB_TOKEN
ADMIN_KEY
```

from a browser.

Never hard-code another project's secret into:

```text
analytics.js
app.js
config.js
index.html
```

Never use an unstable `siteId` such as a random ID generated on every page load.

---

# ✅ Recommended Conventions

Use:

```text
siteId
```

as a stable project identifier.

Use:

```text
siteName
```

as a human-readable label.

Use:

```text
sessionId
```

for a browsing session.

Use:

```text
visitorId
```

for a longer-lived visitor identifier.

Use:

```text
metadata
```

for project-specific custom events.

---

# 📊 Data Semantics

### Views

`views` correspond to `pageview` events.

### Unique visitors

Computed from the `visitor_id` values observed by D1.

### Sessions

A session is identified by:

```text
site_id + session_id
```

### Duration

`durationMs` is client-reported engagement duration.

### Scroll

`maxScroll` is the maximum page scroll percentage reported by the client.

### IP

The Worker obtains the request IP from Cloudflare request headers and stores the raw value in the `ip` field when available.

---

# 🧪 API Quick Reference

| Purpose | Method | Endpoint |
|---|---:|---|
| Root | GET | `/` |
| Basic health | GET | `/health` |
| Detailed health | GET | `/api/system-health` |
| Health alias | GET | `/api/health` |
| Collect telemetry | POST | `/collect` |
| List sites | GET | `/api/sites` |
| Global overview | GET | `/api/overview?days=7` |
| Site analytics | GET | `/api/site/<siteId>?days=7` |
| Compatibility stats | GET | `/api/stats?site=<siteId>&days=7` |
| Admin event query | GET | `/api/admin/events` |

---

# 📌 Example Integration Matrix

| Requirement | Recommended endpoint / file |
|---|---|
| Connect a GitHub Page | `docs/analytics.js` |
| Send telemetry manually | `POST /collect` |
| Discover projects | `GET /api/sites` |
| Global dashboard | `GET /api/overview` |
| One-project dashboard | `GET /api/site/<siteId>` |
| Health center | `GET /api/system-health` |
| Raw event investigation | `GET /api/admin/events` |
| Historical archive | `data/sites/<siteId>/events/` |

---

# 🚀 Production Notes

For small-to-moderate traffic, request-driven D1 + per-event GitHub archive is straightforward and easy to inspect.

For high-volume production traffic, consider a future batching architecture because every GitHub archive write can create repository/API activity.

A future scalable architecture may use:

```text
Browser
   ↓
Worker
   ↓
D1
   ↓
batch/archive pipeline
   ↓
GitHub
```

rather than creating a GitHub commit for every single telemetry event.

The current deployment intentionally favors:

```text
simplicity
immediacy
traceability
human-readable archive
```

over maximum event throughput.

---

# 🛠️ Development Principles

When modifying this repository:

1. Keep `siteId` dynamic.
2. Keep the Worker stateless with respect to the site list.
3. Keep GitHub credentials server-side.
4. Keep D1 schema and Worker SQL synchronized.
5. Preserve existing API routes when possible.
6. Maintain `/api/system-health`.
7. Use request IDs in diagnostic logs.
8. Do not silently rename API fields without documenting it.
9. Update this README whenever the API contract changes.

---

# 📜 License

See:

```text
LICENSE
```

---

# ❤️ Project

**GitHub Page Insights**

A reusable analytics layer for your GitHub Pages ecosystem.

Current Worker:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

Repository:

```text
https://github.com/mehrdadmb2/github-page-insights
```
