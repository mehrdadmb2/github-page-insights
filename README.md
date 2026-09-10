# GitHub Page Insights

A modular, dynamic analytics platform for GitHub Pages powered by **Cloudflare Workers + D1 + GitHub**. A public collector accepts telemetry from any GitHub Page, stores structured data in D1 for real-time queries, and archives each event immediately into this repository using a dynamic `siteId` path.

> **Current architecture:** request-driven, no Cron and no Scheduled Trigger required for collection or archival.

## Repository

- GitHub repository: `mehrdadmb2/github-page-insights`
- Worker: `https://github-page-insights-worker.game-developer-mb.workers.dev`
- Dashboard: the `docs/` directory can be published as GitHub Pages.

## What this project does

The collector is intentionally generic. A page only needs a Worker URL and a `siteId`.

```text
Any GitHub Page
      |
      | POST /collect
      v
Cloudflare Worker
      |
      +--> D1: real-time analytics
      |
      +--> GitHub Contents API: immediate archive
      |
      v
Dashboard / API consumers
```

No site whitelist is required. A new `siteId` automatically creates its own archive directory under `data/sites/<siteId>/events/...`.

## Important security model

The collector endpoint is public by design, so **anyone who knows `/collect` can send telemetry**. `siteId` is an identifier, not a secret. The Worker sanitizes `siteId` and prevents path traversal / hidden Git metadata paths. The GitHub token and admin key are server-side Worker secrets and must never be embedded in `docs/`.

This configuration stores the raw client IP in D1 and in the GitHub archive because this project is explicitly configured for raw-IP analytics. Do not deploy this configuration without considering your privacy notice, retention policy, local law, and repository visibility. For a public repository, raw IP addresses are sensitive visitor data.

## Required Cloudflare setup

### 1. Worker

Create a Worker named `github-page-insights-worker` and paste `worker/src/index.js` into the Cloudflare editor.

No Cron Trigger is required.

### 2. D1

Create a D1 database named `github-page-insights` and attach it to the Worker with binding name:

```text
DB
```

The SQL schema must contain at least these tables:

- `sites`
- `events`
- `visitor_sessions`

For an existing deployment that was created before raw IP support, run `d1-migration-raw-ip.sql` once to add `events.ip` and its indexes.

### 3. Worker Variables

```text
GITHUB_OWNER=mehrdadmb2
GITHUB_REPO=github-page-insights
GITHUB_BRANCH=main
```

### 4. Worker Secrets

```text
GITHUB_TOKEN=<Fine-grained GitHub PAT>
ADMIN_KEY=<long random secret>
```

`GITHUB_TOKEN` must be allowed to write repository contents. GitHub documents that the Contents write permission is sufficient for Create or Update File Contents. citehttps://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28

## D1 schema

For a fresh database, use the schema below.

```sql
CREATE TABLE IF NOT EXISTS sites (
  site_id TEXT PRIMARY KEY,
  site_name TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  site_id TEXT NOT NULL,
  site_name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  page_url TEXT,
  path TEXT,
  title TEXT,
  referrer TEXT,
  referrer_host TEXT,
  language TEXT,
  timezone TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  continent TEXT,
  colo TEXT,
  asn INTEGER,
  ip TEXT,
  ip_hash TEXT,
  user_agent TEXT,
  browser TEXT,
  os TEXT,
  device TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  viewport_width INTEGER,
  viewport_height INTEGER,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  max_scroll INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  outbound_clicks INTEGER NOT NULL DEFAULT 0,
  exported INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS visitor_sessions (
  site_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  max_scroll INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(site_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_events_site_received ON events(site_id, received_at);
CREATE INDEX IF NOT EXISTS idx_events_ip ON events(ip);
CREATE INDEX IF NOT EXISTS idx_events_site_ip ON events(site_id, ip);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(site_id, visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(site_id, session_id);

## Collector API

### `POST /collect`

The collector accepts JSON. The endpoint is public.

Example:

```js
fetch("https://github-page-insights-worker.game-developer-mb.workers.dev/collect", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    siteId: "my-project",
    siteName: "My Project",
    type: "pageview",
    sessionId: crypto.randomUUID(),
    visitorId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    pageUrl: location.href,
    path: location.pathname + location.search,
    title: document.title,
    referrer: document.referrer,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: {
      width: screen.width,
      height: screen.height,
      devicePixelRatio: devicePixelRatio,
      colorDepth: screen.colorDepth
    },
    viewport: {
      width: innerWidth,
      height: innerHeight
    },
    connection: navigator.connection ? {
      type: navigator.connection.effectiveType,
      downlink: navigator.connection.downlink,
      rtt: navigator.connection.rtt,
      saveData: navigator.connection.saveData
    } : null,
    durationMs: 0,
    maxScroll: 0,
    clicks: 0,
    outboundClicks: 0,
    metadata: { source: "my-project" }
  })
});
```

Successful ingestion and archive return HTTP `201` with both `stored.d1=true` and `stored.github=true`.

### Event types

Accepted types:

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

Unknown values are normalized to `custom`.

## Server-derived telemetry

The Worker derives data from the request in addition to the JSON body.

From Cloudflare request metadata where available:

```text
country
region
city
continent
colo
ASN
ASN organization
latitude
longitude
postal code
TLS version
client TCP RTT
client QUIC RTT
```

Cloudflare exposes incoming-request metadata through `request.cf`. The current Worker also reads the visitor IP from `CF-Connecting-IP` (with fallbacks) and stores the **raw IP** in `events.ip`. Cloudflare documents `CF-Connecting-IP` as the client IP header in the Worker request path. citehttps://developers.cloudflare.com/fundamentals/reference/http-headers/

The Worker also parses the User-Agent for:

```text
browser
OS
device type
```

## Automatic site discovery

There is no hard-coded site list.

The following payload creates a new site automatically:

```json
{
  "siteId": "new-project",
  "siteName": "New Project",
  "type": "pageview"
}
```

The archive path becomes:

```text
data/sites/new-project/events/YYYY/MM/DD/<event>.json
```

Changing `siteName` does not move historical data because `siteId` is the stable key.

## GitHub archive format

Every event is archived as its own JSON file. Example:

```text
data/
└── sites/
    └── my-project/
        └── events/
            └── 2026/
                └── 09/
                    └── 10/
                        └── 2026-09-10T12-00-00-123Z_<eventId>.json
```

A file contains:

```json
{
  "schemaVersion": "5.0",
  "service": "github-page-insights-worker",
  "workerVersion": "5.0.0",
  "requestId": "...",
  "archivedAt": "...",
  "site": {
    "id": "my-project",
    "name": "My Project"
  },
  "storage": {
    "d1": true,
    "github": true
  },
  "event": {
    "ip": "203.0.113.10",
    "country": "US",
    "city": "Example City",
    "browser": "Chrome",
    "os": "Windows",
    "device": "Desktop"
  }
}
```

## Public statistics API

### List discovered sites

```http
GET /api/sites
```

Response contains `sites[]` with:

```text
siteId
siteName
firstSeen
lastSeen
views
uniqueVisitors
sessions
```

### All-sites overview

```http
GET /api/overview?days=7
GET /api/overview?days=30
GET /api/overview?days=90
GET /api/overview?days=all
```

Response includes:

```text
totalViews
uniqueVisitors
sessions
avgDurationMs
avgScroll
today
daily
countries
browsers
operatingSystems
devices
ips
eventTypes
pages
```

### Site-level statistics

```http
GET /api/site/my-project?days=7
```

Response includes:

```text
siteId
siteName
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

### Compatibility endpoint

For older clients, this endpoint remains available:

```http
GET /api/stats?site=my-project&days=7
GET /api/stats?days=7
```

It routes to the same site or overview data model.

## Protected admin API

`GET /api/admin/events` requires the Worker secret `ADMIN_KEY`.

Example request:

```http
GET /api/admin/events?site=my-project&limit=100
X-Admin-Key: <ADMIN_KEY>
```

Do not call this endpoint from public client-side JavaScript because that would expose the secret.

## Drop-in analytics collector

The included `docs/analytics.js` is designed to be copied to any GitHub Page. Add:

```html
<meta name="page-insights-site-id" content="my-project">
<meta name="page-insights-site-name" content="My Project">
<script src="https://mehrdadmb2.github.io/github-page-insights/analytics.js"></script>
```

The collector sends:

```text
pageview
heartbeat
visibility
pageleave
session ID
visitor ID
page URL
path
title
referrer
language
timezone
screen
viewport
connection hints
duration
scroll depth
click count
outbound click count
```

No GitHub token is required on the tracked page.

## Dashboard

Publish `docs/` as GitHub Pages. The dashboard discovers the directories under `data/sites/` and queries the Worker for live aggregate statistics.

The current interface provides:

- dynamic project explorer
- dark / light theme
- neon glass UI
- animated startup screen
- animated ambient background
- traffic chart
- device distribution
- countries
- top pages
- browser distribution
- operating system distribution
- raw IP ranking
- recent event table with IP
- event type distribution
- responsive mobile layout
- automatic refresh

## Using the data elsewhere

### Read live statistics

```js
const response = await fetch(
  "https://github-page-insights-worker.game-developer-mb.workers.dev/api/site/my-project?days=30"
);
const data = await response.json();
console.log(data.views);
console.log(data.uniqueVisitors);
console.log(data.ips);
```

### Read archived data from GitHub

Because each event is a normal repository file, external tools can read it through GitHub's Contents API or raw GitHub URLs. For automated processing, prefer the structured D1/Worker API for aggregate queries and GitHub for historical archive/export workflows.

## Building an AI integration

An AI coding agent can integrate another repository by following this sequence:

1. Add the supplied `analytics.js` loader to the target GitHub Page.
2. Give the site a stable, lowercase `siteId`.
3. Set a human-friendly `siteName`.
4. Use the Worker URL as the collector base URL.
5. Do not copy `GITHUB_TOKEN` or `ADMIN_KEY` into the target repository.
6. Use `/api/site/<siteId>` for site statistics.
7. Use `/api/overview` for the entire analytics portfolio.
8. Use `/api/sites` for the dynamically discovered site list.
9. Use GitHub archive paths under `data/sites/<siteId>/events/` for historical event files.

### Example configuration for an AI-generated repository

```js
window.PAGE_INSIGHTS_CONFIG = {
  workerUrl: "https://github-page-insights-worker.game-developer-mb.workers.dev",
  siteId: "my-project",
  siteName: "My Project"
};
```

Or with HTML metadata:

```html
<meta name="page-insights-site-id" content="my-project">
<meta name="page-insights-site-name" content="My Project">
```

## Failure behavior

The Worker returns explicit diagnostics:

- `D1_STORE_FAILED` means D1 did not accept the event.
- `GITHUB_ARCHIVE_FAILED` means the event is already in D1 but GitHub archive failed.
- `INVALID_JSON`, `INVALID_PAYLOAD`, `SITE_ID_REQUIRED` and similar values indicate a client request problem.
- `401 UNAUTHORIZED` from `/api/admin/events` means the admin secret is missing or wrong.

Every request receives a `requestId` for log correlation.

## Observability

Use Cloudflare Worker Logs / Observability to search for:

```text
REQUEST_START
D1_STORE_FAILED
GITHUB_ARCHIVE_FAILED
COLLECT_SUCCESS
UNHANDLED_ERROR
```

The Worker logs event ID, site ID, request ID, timing and GitHub archive path without logging the raw IP directly to application logs.

## GitHub API behavior

The Worker creates one archive file per event using GitHub's Create or Update File Contents endpoint. GitHub documents `201 Created` for a new file, and `Contents: write` for fine-grained token access. citehttps://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28

Individual event files reduce the need to update one large daily JSON file and avoid a SHA-read/update cycle for every visitor. This can still create many GitHub commits on a high-traffic site; for high volume, D1 should be considered the primary real-time store and GitHub should be treated as the archive layer.

## Limits and production notes

- The public collector is not proof of visitor authenticity. An attacker can submit forged telemetry.
- `siteId` must be treated as a public identifier.
- Raw IP storage should be covered by an explicit privacy / retention policy.
- Very high traffic can create a large number of GitHub commits.
- For high-traffic deployments, use rate limiting / WAF controls and consider batching archive operations.
- GitHub API authentication tokens must remain Worker secrets.
- Never put `ADMIN_KEY` in a GitHub Page.

## Files

```text
docs/
├── index.html
├── style.css
├── app.js
├── analytics.js
├── config.js
└── logo.svg

worker/
├── package.json
├── wrangler.toml
└── src/
    └── index.js

d1-migration-raw-ip.sql
README.md
LICENSE
```

## License

MIT License. See `LICENSE`.

## System health diagnostics

The dashboard calls `GET /api/system-health` when it opens and periodically afterwards. The endpoint is read-only and does not write telemetry. It checks:

- Worker reachability and diagnostic latency.
- D1 connectivity and the presence of the expected `sites`, `events`, and `visitor_sessions` tables.
- Required `events` columns, including `ip`, session/visitor fields, client fields, and engagement fields.
- Current D1 counts for sites, events, and sessions.
- The timestamp/type/site of the most recent telemetry event.
- Authenticated access from the Worker to the configured GitHub repository.
- Configured branch and GitHub REST API rate-limit headers returned by the authenticated request.
- Telemetry freshness (`ok`, `stale`, or `idle`).

The endpoint never returns the GitHub token or `ADMIN_KEY`, and the dashboard does not need either secret. The UI presents the result as the **System Health Center**. GitHub documents the rate-limit headers exposed by authenticated REST requests, and recommends avoiding unnecessary concurrent requests. citeturn958999search0turn958999search11

Example:

```text
GET https://YOUR-WORKER-DOMAIN/api/system-health
```

The response includes `overall` plus a `checks` object for `worker`, `database`, `github`, `telemetry`, and `configuration`.

