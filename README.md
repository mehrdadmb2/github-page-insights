# GitHub Page Insights

A dynamic, modular analytics platform for GitHub Pages built around **Cloudflare Workers + Cloudflare D1 + GitHub archival**.

The project is designed for a portfolio owner who has multiple GitHub Pages and wants one analytics command center without hard-coding a list of sites into the dashboard or Worker.

> **Repository:** `https://github.com/mehrdadmb2/github-page-insights`
>
> **Worker:** `https://github-page-insights-worker.game-developer-mb.workers.dev`
>
> **Dashboard:** `https://mehrdadmb2.github.io/github-page-insights/`

---

## What this project does

Each GitHub Page can send a small telemetry event to the shared Cloudflare Worker.

The Worker:

1. validates and normalizes the incoming event;
2. derives server-side information available to the Worker through Cloudflare;
3. hashes the client IP instead of storing raw IP by default;
4. stores the structured event in D1;
5. archives the event as an individual JSON file inside this repository;
6. returns a success response only after both storage paths succeed.

The dashboard then discovers project folders directly from the public `data/sites/` tree and requests aggregated statistics from the Worker. It does **not** contain a hard-coded site inventory.

---

## Architecture

```text
                    ┌───────────────────────┐
                    │      GitHub Pages     │
                    │  your-project-a.html  │
                    │  your-project-b.html  │
                    └──────────┬────────────┘
                               │
                               │ POST /collect
                               ▼
                    ┌───────────────────────┐
                    │   Cloudflare Worker   │
                    │ github-page-insights- │
                    │        worker         │
                    └──────────┬────────────┘
                               │
                  ┌────────────┴────────────┐
                  ▼                         ▼
          ┌────────────────┐      ┌─────────────────────┐
          │  Cloudflare D1 │      │ GitHub Contents API │
          │  live storage  │      │ permanent archive   │
          └────────┬───────┘      └──────────┬──────────┘
                   │                         │
                   └────────────┬────────────┘
                                ▼
                     ┌──────────────────────┐
                     │ GitHub Page Insights │
                     │      Dashboard       │
                     └──────────────────────┘
```

No Cron trigger is required for ingestion.

Each `POST /collect` is handled immediately by the Worker's normal `fetch()` handler.

---

## Dynamic site model

There is no central list such as:

```js
const sites = ["site-a", "site-b", "site-c"];
```

Instead, the site identity comes from each telemetry request:

```json
{
  "siteId": "imdb-showcase",
  "siteName": "IMDb Showcase"
}
```

The Worker normalizes `siteId` before using it in the GitHub path.

A new project can therefore start sending data without modifying the Worker source code.

For example:

```text
data/
└── sites/
    ├── imdb-showcase/
    │   └── events/
    │       └── 2026/09/10/*.json
    ├── dual-ping-monitor/
    │   └── events/
    │       └── 2026/09/10/*.json
    └── a-brand-new-project/
        └── events/
            └── 2026/09/10/*.json
```

The third project needs no Worker code change.

---

# 1. Cloudflare configuration

## D1 binding

Create a D1 database, for example:

```text
github-page-insights
```

Bind it to the Worker with:

```text
Variable name: DB
```

The Worker accesses it with `env.DB`.

## Variables

```text
GITHUB_OWNER=mehrdadmb2
GITHUB_REPO=github-page-insights
GITHUB_BRANCH=main
```

## Secrets

```text
GITHUB_TOKEN=<Fine-grained GitHub PAT>
ADMIN_KEY=<long random secret>
```

The GitHub token should have only the permissions needed by this analytics repository. For archive writes, `Contents: Read and write` is sufficient.

**Never put `GITHUB_TOKEN` in a public GitHub Pages file.**

---

# 2. Current D1 schema

The current Worker-compatible schema contains:

```text
sites
 events
 visitor_sessions
```

Important event dimensions include:

- event ID / event type
- site ID / site name
- visitor ID / session ID
- page URL / path / title
- referrer
- language / timezone
- country / region / city / continent
- Cloudflare colo / ASN
- hashed client IP
- user agent
- browser / OS / device
- screen / viewport
- duration / scroll depth
- clicks / outbound clicks
- connection hints
- archive status

The dashboard intentionally focuses on aggregated and practical analytics rather than exposing raw private identifiers.

---

# 3. Telemetry endpoint

## Endpoint

```http
POST https://github-page-insights-worker.game-developer-mb.workers.dev/collect
Content-Type: application/json
```

The collector is public because a normal browser must be able to call it.

A public collector URL must be treated as **an ingestion endpoint, not a secret endpoint**.

---

## Minimal request

```json
{
  "siteId": "my-project",
  "siteName": "My Project",
  "eventType": "pageview"
}
```

The Worker fills/derives the rest where possible.

---

## Recommended request

```json
{
  "siteId": "my-project",
  "siteName": "My Project",
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "pageview",
  "sessionId": "session-id",
  "visitorId": "visitor-id",
  "timestamp": "2026-09-10T09:30:00.000Z",

  "page": {
    "url": "https://example.github.io/my-project/",
    "path": "/my-project/",
    "title": "My Project"
  },

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
    "width": 1536,
    "height": 850
  },

  "connection": {
    "type": "4g",
    "downlink": 10,
    "rtt": 40,
    "saveData": false
  },

  "durationMs": 12000,
  "maxScroll": 74,
  "clicks": 3,
  "outboundClicks": 1,

  "metadata": {
    "collector": "github-page-insights-v4"
  }
}
```

---

# 4. Event types

Supported logical event types are:

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

The current drop-in `analytics.js` intentionally aggregates click/scroll information into heartbeat and pageleave payloads instead of creating an individual GitHub commit for every click.

---

# 5. Drop-in collector installation

There are two supported installation styles.

## A. Use page metadata

Add:

```html
<meta name="page-insights-site-id" content="my-project">
<meta name="page-insights-site-name" content="My Project">
<script src="https://mehrdadmb2.github.io/github-page-insights/analytics.js"></script>
```

This is convenient when the analytics repository is itself published through GitHub Pages.

## B. Use `data-*` attributes

```html
<script
  src="https://mehrdadmb2.github.io/github-page-insights/analytics.js"
  data-worker-url="https://github-page-insights-worker.game-developer-mb.workers.dev"
  data-site-id="my-project"
  data-site-name="My Project">
</script>
```

If `data-site-id`/metadata are missing, the collector attempts to derive a stable identifier from the hostname.

---

# 6. What the collector tracks

The provided `analytics.js` collects practical client-side telemetry:

### Page context

- URL
- path
- title
- referrer
- language
- timezone

### Session

- session ID
- visitor ID
- page lifetime
- heartbeat activity
- page leave
- visibility changes

### Engagement

- clicks
- outbound clicks
- maximum scroll depth
- duration

### Device

- browser-side screen dimensions
- viewport dimensions
- device pixel ratio
- color depth
- connection hints

### Server-side Cloudflare context

The Worker can additionally use information exposed for the incoming request, such as the Cloudflare country/region/city fields, colo and ASN when available.

---

# 7. Privacy model

The public dashboard should not publish raw IP addresses.

The Worker therefore stores a deterministic hash of the client IP by default. That allows approximate repeat-visitor analysis without writing the raw IP into the public GitHub repository.

The browser-generated `visitorId` is also scoped to the site and stored in browser storage.

Do not treat the system as a replacement for legal/privacy review. Requirements depend on your audience, jurisdiction and purpose.

---

# 8. Worker API

## Root

```http
GET /
```

Returns Worker identity and available endpoints.

## Health

```http
GET /health
```

Checks Worker configuration, D1 availability and GitHub configuration.

## Statistics

All sites:

```http
GET /api/stats?days=7
```

One site:

```http
GET /api/stats?site=my-project&days=7
```

The response contains:

```text
site
totals
countries
browsers
operatingSystems
devices
pages
daily
```

This endpoint is what the dashboard uses for aggregate analytics.

## Admin events

```http
GET /api/admin/events?site=my-project&limit=100
X-Admin-Key: <ADMIN_KEY>
```

This endpoint is protected.

**Never put `ADMIN_KEY` into the public GitHub Pages dashboard.**

---

# 9. GitHub archive format

Each telemetry event is stored as its own JSON file.

Example:

```text
data/sites/my-project/events/2026/09/10/2026-09-10T09-30-00Z_<event-id>.json
```

This prevents the Worker from needing to rewrite one giant daily file on every event.

A typical archive object contains:

```json
{
  "schemaVersion": "3.0",
  "service": "github-page-insights-worker",
  "workerVersion": "3.0.0",
  "archivedAt": "2026-09-10T09:30:01.000Z",
  "requestId": "...",
  "site": {
    "id": "my-project",
    "name": "My Project"
  },
  "storage": {
    "d1": true,
    "github": true
  },
  "event": {}
}
```

---

# 10. Using the data in another application

There are two recommended ways.

## A. Use the Worker API

For live/aggregated analytics:

```js
const response = await fetch(
  "https://github-page-insights-worker.game-developer-mb.workers.dev/api/stats?site=my-project&days=30"
);

const stats = await response.json();
console.log(stats.totals);
```

This is the preferred method for dashboards and charts.

## B. Read the public GitHub archive

The archive is suitable for:

- offline analysis
- static reports
- backup/inspection
- external data pipelines
- Git-based history

For a public repository you can read the archive with GitHub's Contents API or raw file URLs.

---

# 11. Dashboard behavior

The dashboard under `docs/` is intentionally dynamic.

It does not contain a hard-coded list of all your projects.

At startup it queries:

```http
GET https://api.github.com/repos/mehrdadmb2/github-page-insights/contents/data/sites?ref=main
```

and discovers the folders currently present in `data/sites/`.

Then it requests aggregate statistics from the Worker for the selected scope.

Recent archived visits are read from the public GitHub archive and cached in the browser.

This gives you:

- dynamic site discovery
- site search
- all-sites scope
- per-site scope
- 7/14/30/90-day ranges
- page-view trend chart
- device distribution
- top countries
- top pages
- browser distribution
- OS distribution
- latest archived visits
- dark/light mode
- animated background
- responsive layout
- boot animation
- graceful error handling

---

# 12. Running the dashboard on GitHub Pages

Use the repository's `docs/` directory as the Pages source if that is how your repository is configured.

Required files:

```text
docs/
├── app.js
├── analytics.js
├── config.js
├── index.html
├── logo.svg
└── style.css
```

No build step is required.

---

# 13. Adding analytics to another GitHub Page

Recommended pattern:

```html
<meta name="page-insights-site-id" content="dual-ping-monitor">
<meta name="page-insights-site-name" content="Dual Ping Monitor">
<script src="https://mehrdadmb2.github.io/github-page-insights/analytics.js"></script>
```

For another project:

```html
<meta name="page-insights-site-id" content="imdb-showcase">
<meta name="page-insights-site-name" content="IMDb Showcase">
<script src="https://mehrdadmb2.github.io/github-page-insights/analytics.js"></script>
```

The next unseen project could use:

```html
<meta name="page-insights-site-id" content="new-project">
<meta name="page-insights-site-name" content="New Project">
<script src="https://mehrdadmb2.github.io/github-page-insights/analytics.js"></script>
```

No Worker edit is required.

---

# 14. Collector response

Successful storage returns HTTP `201`.

Example:

```json
{
  "ok": true,
  "accepted": true,
  "version": "3.0.0",
  "requestId": "...",
  "eventId": "...",
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
    "path": "data/sites/my-project/events/2026/09/10/...json",
    "status": 201,
    "commitSha": "...",
    "fileSha": "..."
  }
}
```

A GitHub failure is returned separately from a D1 failure so the source of the problem is visible.

---

# 15. Important production considerations

## GitHub commit volume

With immediate archival, each event becomes a GitHub file/commit. This is easy to audit and excellent for low/moderate traffic, but it is not an ideal high-volume analytics warehouse.

For higher traffic, the natural next architecture is:

```text
Browser -> Worker -> D1
                     |
                     +-> batched archive
```

rather than one GitHub write per event.

## Public endpoint abuse

Because `/collect` is public, an attacker can submit fabricated telemetry. `siteId` must never be treated as a password.

Recommended protections for production:

- Cloudflare WAF/rate limiting
- Turnstile for controlled clients
- optional per-site ingestion keys
- request size limits
- event validation
- anomaly detection

The Worker already sanitizes the GitHub path component so a malicious `siteId` cannot escape `data/sites/` through path traversal.

---

# 16. Troubleshooting

## `/collect` returns 403 from GitHub

Check:

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
```

and make sure the Fine-grained PAT has access to the target repository with `Contents: Read and write`.

## D1 is false in `/health`

Check the Worker binding:

```text
Binding type: D1 database
Variable name: DB
```

## Dashboard says Worker unavailable

Open:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/health
```

Verify that the response reports D1 as reachable and GitHub configuration as present.

## Dashboard has no projects

Confirm that archived events have created:

```text
data/sites/<site-id>/events/...
```

The dashboard discovers projects from that directory.

## A Page sends no telemetry

Open the browser's DevTools and check the Network tab for:

```text
POST /collect
```

Then verify that:

```html
<meta name="page-insights-site-id" content="your-project">
```

or the `data-site-id` attribute is present.

---

# 17. Repository structure

```text
github-page-insights/
├── data/
│   └── sites/
│       └── <dynamic-site-id>/
│           └── events/
│               └── YYYY/
│                   └── MM/
│                       └── DD/
│                           └── event.json
│
├── docs/
│   ├── analytics.js
│   ├── app.js
│   ├── config.js
│   ├── index.html
│   ├── logo.svg
│   └── style.css
│
├── worker/
│   └── src/
│       └── index.js
│
├── LICENSE
└── README.md
```

---

# 18. Design goals

The dashboard intentionally uses:

- deep dark surfaces
- cyan / electric blue / purple / magenta neon accents
- animated ambient orbs
- radar-style telemetry visual
- subtle grid and grain
- glass panels
- high-contrast typography
- responsive cards
- dynamic charts drawn with native Canvas
- no heavy UI framework
- no fixed site list
- no GitHub token in browser code

The goal is to keep the page visually rich while still being a plain GitHub Pages application with no build process.

---

# License

MIT. See `LICENSE`.
