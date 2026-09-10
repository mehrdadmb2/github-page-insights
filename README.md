# GitHub Page Insights

A modular analytics and visitor-intelligence stack for GitHub Pages, powered by Cloudflare Workers + D1 and optional GitHub archival.

## What it does

- Dynamic site discovery: `siteId` is supplied by each connected Page.
- Real-time event ingestion through `POST /collect`.
- Raw client IP capture from the Cloudflare request path.
- Geo/network context exposed by Cloudflare when available.
- Browser, operating-system and device classification.
- Session and visitor identifiers.
- Duration, scroll depth, clicks and outbound clicks.
- D1-backed statistics APIs.
- Immediate GitHub JSON archive per event.
- Dashboard with live system health, project explorer, traffic charts, client mix, geo, IP intelligence and recent events.
- No Cron is required for collection or GitHub archival.

## Architecture

```text
GitHub Page
  -> docs/analytics.js
  -> POST /collect
  -> Cloudflare Worker
       -> D1
       -> GitHub Contents API
  -> Dashboard APIs
```

The Worker does not need a fixed list of sites. A new valid `siteId` automatically creates the logical site record and the GitHub archive path.

## Worker URL

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

## Required Cloudflare bindings

D1 binding:

```text
Variable: DB
Database: github-page-insights
```

Variables:

```text
GITHUB_OWNER=mehrdadmb2
GITHUB_REPO=github-page-insights
GITHUB_BRANCH=main
```

Secrets:

```text
GITHUB_TOKEN=<Fine-grained GitHub PAT with Contents: Read and write>
ADMIN_KEY=<optional private admin key>
```

Never expose `GITHUB_TOKEN` or `ADMIN_KEY` to a public GitHub Page.

## Connect any GitHub Page

Add the following before the closing `</body>` or in the page `<head>`:

```html
<meta name="page-insights-site-id" content="my-project">
<meta name="page-insights-site-name" content="My Project">
<script src="https://YOUR-DASHBOARD-DOMAIN/analytics.js"></script>
```

For this repository's own GitHub Pages dashboard, the collector is intentionally not installed; it is the control plane.

## `siteId` rules

Use a stable identifier such as:

```text
my-portfolio
imdb-showcase
dual-ping-monitor
project-2026
```

The Worker normalizes the identifier and rejects unsafe path patterns. `siteName` is display metadata and does not control filesystem traversal.

## Collector API

### `POST /collect`

The endpoint is intentionally public so any Page can send telemetry. The Worker validates and normalizes the payload.

Minimal payload:

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

Recommended payload:

```json
{
  "siteId": "my-project",
  "siteName": "My Project",
  "eventType": "pageview",
  "eventId": "client-generated-id",
  "sessionId": "session-123",
  "visitorId": "visitor-123",
  "timestamp": "2026-09-10T12:00:00.000Z",
  "pageUrl": "https://example.github.io/project/",
  "path": "/project/",
  "title": "My Project",
  "referrer": "https://github.com/",
  "language": "en-US",
  "timezone": "Asia/Baku",
  "screen": {"width":1920,"height":1080,"devicePixelRatio":1},
  "viewport": {"width":1440,"height":860},
  "connection": {"type":"4g","downlink":20,"rtt":40,"saveData":false},
  "durationMs": 125000,
  "maxScroll": 86,
  "clicks": 7,
  "outboundClicks": 2,
  "metadata": {"source":"custom-client"}
}
```

Accepted event types:

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

Successful ingestion returns HTTP `201` and confirms both D1 and GitHub archival.

## Data captured

From the browser/client payload:

- URL, path, page title
- referrer
- language and timezone
- screen and viewport dimensions
- device/browser hints
- network connection hints
- visitor/session IDs
- duration and engagement counters

From Cloudflare's request context when available:

- raw client IP
- country
- region
- city
- continent
- colo
- ASN
- ASN organization
- latitude/longitude
- postal code
- TLS version
- client RTT values

The raw IP is stored in D1 and archived in GitHub because this deployment explicitly enables raw-IP analytics. Make your own privacy/legal assessment before collecting IP addresses from real visitors.

## Statistics APIs

### List sites

```http
GET /api/sites
```

Returns dynamic sites known to D1.

### Global overview

```http
GET /api/overview?days=7
GET /api/overview?days=all
```

### Site analytics

```http
GET /api/site/<siteId>?days=7
GET /api/site/<siteId>?days=all
```

Returns traffic, devices, countries, browsers, operating systems, top pages, IP rankings, event types and recent visits.

### Compatibility endpoint

```http
GET /api/stats?site=my-project&days=7
```

Without `site`, it behaves like overview.

## System health

```http
GET /health
GET /api/system-health
GET /api/health
```

`/api/system-health` checks:

- Worker availability
- D1 connectivity
- presence of required tables
- presence of critical event columns including `ip`
- database record counts
- most recent telemetry event
- GitHub repository authentication
- GitHub API rate-limit headers
- required Worker configuration

The public dashboard calls this endpoint and never receives the GitHub secret itself.

## Admin endpoint

```http
GET /api/admin/events?site=my-project&limit=100
```

Send the private admin key using:

```http
X-Admin-Key: <ADMIN_KEY>
```

Do not put this header or key in public frontend source code.

## GitHub archive

Each event is archived under a dynamic path:

```text
data/sites/<siteId>/events/YYYY/MM/DD/<timestamp>_<eventId>.json
```

Example:

```text
data/sites/imdb-showcase/events/2026/09/10/2026-09-10T12-00-00-123Z_abc123.json
```

Because each event is a new file, the collector does not need to update a shared daily JSON document during the request.

## Dashboard architecture

The dashboard in `docs/` reads its live statistics from the Worker APIs. It does not require a GitHub token in browser JavaScript.

Files:

```text
docs/index.html
 docs/style.css
 docs/app.js
 docs/analytics.js
 docs/config.js
 docs/logo.svg
```

## Recommended integration for another AI or coding agent

When asking another AI to add analytics to another repository, provide this README and ask it to:

1. Pick a stable `siteId` for that repository.
2. Add the two Page Insights meta tags.
3. Load `analytics.js` from the deployed dashboard/analytics location.
4. Never expose `GITHUB_TOKEN` or `ADMIN_KEY` in the target repository.
5. Use `/api/site/<siteId>` for project analytics.
6. Use `/api/overview` for aggregate analytics.
7. Use `/collect` only for event ingestion.
8. Treat the GitHub `data/sites/<siteId>/` tree as historical archive, not as a real-time database.

## Error handling

Common collector errors:

```text
400  SITE_ID_REQUIRED
400  INVALID_JSON
400  INVALID_PAYLOAD
413  PAYLOAD_TOO_LARGE
500  D1_STORE_FAILED
502  GITHUB_ARCHIVE_FAILED
401  UNAUTHORIZED   (admin endpoint)
404  NOT_FOUND
405  METHOD_NOT_ALLOWED
```

Every server-side request has a `requestId` in Worker logs and, for important failures, in the JSON response.

## Privacy and compliance

Raw IP collection is enabled in this deployment. IP addresses can be personal data depending on jurisdiction and context. Add an appropriate privacy notice, retention policy and access control for your audience before production use. Consider shortening retention or hashing IPs when raw IP is not genuinely needed.

## GitHub Pages deployment

Set the repository's GitHub Pages source to the `/docs` folder on the desired branch.

The dashboard requires internet access to reach the Worker.

## License

MIT. See `LICENSE`.
