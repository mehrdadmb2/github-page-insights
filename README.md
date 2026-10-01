# 🌌 Universal Event Insights v9

> Universal, request-driven telemetry and analytics infrastructure for websites, GitHub Pages, APIs, Telegram bots, mobile apps, desktop apps, SaaS products, scripts, automation sources and any client capable of sending JSON.

**Service:** `Universal Event Insights`

**Worker:**

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

**Primary collector:**

```http
POST /v1/events
```

**Version:** `9.0.0`

**Architecture:** Cloudflare Worker + D1 + GitHub per-event archive + optional Telegram bot

**Scheduled Trigger / Cron:** not required

---

## 1. What this project is

This repository is no longer a GitHub-Pages-only analytics project.

The central abstraction is a dynamic `platformId`.

A platform may be:

```text
website
GitHub Page
API
REST service
GraphQL service
Telegram bot
Discord bot
mobile app
desktop app
SaaS product
CRM
shop
internal tool
Python script
automation workflow
webhook source
IoT gateway
custom service
```

The client sends an event to the same Worker:

```http
POST /v1/events
```

Minimum payload:

```json
{
  "platformId": "my-platform"
}
```

The Worker automatically:

1. normalizes the platform identifier;
2. captures Cloudflare request intelligence when available;
3. derives missing visitor/session identifiers when possible;
4. stores the event in D1;
5. updates the platform, visitor and session aggregate tables;
6. archives the event as a standalone JSON file in GitHub;
7. optionally notifies the administrator through Telegram.

No hard-coded platform list is required.

---

# 2. v9 design goals

The v9 release was rebuilt around several reliability rules:

- **The event itself is the source of truth.**
- **Aggregate tables are secondary indexes/views of event activity.**
- **Custom application data is preserved in JSON.**
- **Raw client IP is stored when Cloudflare exposes it.**
- **IP hash is stored alongside the raw IP.**
- **Platform IP is stored separately from client IP.**
- **Credential-like fields are redacted from JSON snapshots.**
- **GitHub archive failures never delete the D1 event.**
- **No Cron is necessary for collection.**
- **All platform folders are generated dynamically.**
- **D1 event INSERT bind order is generated from the schema column list to prevent column/value drift.**

Cloudflare D1 currently limits a table to 100 columns, a row/string/blob to 2 MB, and bound parameters in a query to 100. v9 deliberately keeps `events` at 96 columns and the event INSERT at 96 parameters. See the official limits reference:

https://developers.cloudflare.com/d1/platform/limits/

---

# 3. Architecture

```text
                         ANY CLIENT
      ┌────────────────────────────────────────────────┐
      │ Website / GitHub Page / API / Bot / App / SDK │
      │ Python / SaaS / Automation / Custom Service   │
      └──────────────────────┬─────────────────────────┘
                             │
                             │ POST /v1/events
                             ▼
                 ┌─────────────────────────────┐
                 │     Cloudflare Worker       │
                 │                             │
                 │ validate                    │
                 │ normalize                   │
                 │ enrich CF metadata          │
                 │ redact secrets               │
                 │ assign IDs                  │
                 └─────────────┬───────────────┘
                               │
                ┌──────────────┼───────────────┐
                │              │               │
                ▼              ▼               ▼
        ┌────────────┐  ┌──────────────┐  ┌──────────────┐
        │    D1      │  │    GitHub    │  │   Telegram   │
        │            │  │              │  │              │
        │ live data  │  │ event archive│  │ notifications│
        └──────┬─────┘  └──────────────┘  └──────────────┘
               │
               ▼
        ┌─────────────────────┐
        │ Dashboard / Clients │
        │ /v1/platforms       │
        │ /v1/overview        │
        │ /v1/platforms/...   │
        │ /v1/events          │
        └─────────────────────┘
```

D1 is the live query layer. GitHub is the human-readable, per-event archive. The dashboard reads Worker endpoints and never contains GitHub or Cloudflare secrets.

---

# 4. Repository structure

```text
github-page-insights-universal-v9/
│
├── data/
│   └── platforms/
│       └── .gitkeep
│
├── db/
│   ├── schema.sql
│   ├── schema-v9.sql
│   ├── SCHEMA-V9-CATALOG-FA.md
│   └── console/
│       ├── 00_README.txt
│       ├── 01_drop_notification_log.sql
│       ├── 02_drop_event_archives.sql
│       ├── 03_drop_events.sql
│       ├── 04_drop_platform_sessions.sql
│       ├── 05_drop_platform_visitors.sql
│       ├── 06_drop_platforms.sql
│       ├── 07_drop_schema_meta.sql
│       ├── 08_create_schema_meta.sql
│       ├── 09_create_platforms.sql
│       ├── 10_create_platform_visitors.sql
│       ├── 11_create_platform_sessions.sql
│       ├── 12_create_events.sql
│       ├── 13_create_event_archives.sql
│       ├── 14_create_notification_log.sql
│       ├── 15-44_index_*.sql
│       ├── 45_seed_schema.sql
│       ├── 46_seed_service.sql
│       └── 47-55_verify_*.sql
│
├── docs/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── analytics.js
│   ├── config.js
│   ├── api-schema.json
│   └── logo.svg
│
├── worker/
│   ├── index.js
│   ├── package.json
│   └── wrangler.toml
│
├── tests-SAMPLE-EVENT.json
├── SETUP-GUI-FA.md
├── README.md
└── LICENSE
```

---

# 5. D1 database model

## 5.1 `schema_meta`

Stores installation metadata such as:

```text
schema_version = 9.0
service = universal-event-insights-worker
```

## 5.2 `platforms`

One row per dynamic platform.

Stores:

- platform ID
- display name
- platform type
- platform URL/domain
- environment
- app version
- SDK name/version
- source
- first/last seen
- total events
- pageviews
- sessions
- visitors
- last client IP
- last platform IP
- last geo summary
- last event
- optional platform API-key hash
- platform metadata
- capability metadata

## 5.3 `platform_visitors`

One row per `(platform_id, visitor_id)`.

Stores the latest visitor intelligence:

- user ID
- anonymous ID
- first/last seen
- raw IP and IP hash
- country / region / city / continent
- Cloudflare colo
- ASN / organization
- latitude / longitude
- postal code
- timezone / language
- user agent
- browser / browser version
- OS / OS version
- device / vendor / model
- screen and viewport dimensions
- DPR and color depth
- last page/path/referrer
- metadata JSON

## 5.4 `platform_sessions`

One row per `(platform_id, session_id)`.

Stores:

- visitor identity
- first/last seen
- duration
- event count
- pageviews
- maximum scroll
- clicks
- outbound clicks
- latest IP information
- latest geo information
- browser / OS / device
- last page/path/referrer
- metadata JSON

## 5.5 `events`

This is the primary telemetry table.

v9 contains **96 columns**.

The full catalog is available here:

```text
db/SCHEMA-V9-CATALOG-FA.md
```

### Standard information stored by `events`

```text
Event identity
    id
    received_at
    occurred_at
    event_type
    event_version

Platform
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

Identity
    user_id
    session_id
    visitor_id
    anonymous_id
    trace_id
    request_id

Page / resource
    page_url
    path
    query_string
    title
    referrer
    referrer_host

Locale
    language
    accept_language
    timezone

Geo / Cloudflare
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

Network identity
    ip
    ip_hash
    platform_ip
    forwarded_for
    ip_source

Client
    user_agent
    browser
    browser_version
    os
    os_version
    device
    device_vendor
    device_model

Screen
    screen_width
    screen_height
    viewport_width
    viewport_height
    device_pixel_ratio
    color_depth

Connection
    connection_type
    connection_downlink
    connection_rtt
    connection_save_data

Request
    http_method
    request_url
    request_scheme
    request_host
    request_path
    request_query

Cloudflare / security signals
    cf_ray
    tls_version
    client_tcp_rtt
    client_quic_rtt
    bot_score
    verified_bot
    ja3
    ja4

Application response / engagement
    response_status
    duration_ms
    max_scroll
    clicks
    outbound_clicks

Marketing
    utm_source
    utm_medium
    utm_campaign
    utm_term
    utm_content

Preserved JSON
    data_json
    metadata_json
    headers_json
    cf_json
    request_json
    payload_json
    raw_event_json
```

### Why JSON fields are still necessary

Universal integrations inevitably send data that is specific to their application.

Example:

```json
{
  "platformId": "crm",
  "eventType": "invoice_opened",
  "data": {
    "customerId": "C-1020",
    "invoiceId": "INV-9001",
    "amount": 125000,
    "currency": "IRR"
  }
}
```

The standard analytics columns remain query-friendly while `data_json`, `metadata_json`, `payload_json` and `raw_event_json` preserve the application-specific information.

---

# 6. IP storage model

The project keeps these concepts separate:

### `ip`

The client IP observed by the Worker, normally from Cloudflare's request metadata/header path when exposed.

### `ip_hash`

A SHA-256 hash scoped by platform ID and client IP:

```text
SHA-256(platformId + "|" + clientIp)
```

### `platform_ip`

An IP explicitly supplied by the sending platform, for example a backend service IP.

The Worker cannot magically infer the backend/server IP of an arbitrary application from a browser request, so the platform may send its own value.

Cloudflare documents `request.cf` properties including ASN, ASN organization, city, continent, latitude, longitude, postal code, metro code, region, region code, timezone, TLS version and RTT-related fields. The Cloudflare dashboard/Playground preview does not provide `request.cf` in its preview editor, so those fields must be tested through an actual deployed Worker request.

Reference:

https://developers.cloudflare.com/workers/runtime-apis/request/

---

# 7. Sensitive data handling

The Worker intentionally preserves telemetry detail while removing obvious credentials from snapshots.

Redacted key patterns include:

```text
password
passwd
secret
token
authorization
cookie
set-cookie
api-key
access-token
refresh-token
private-key
client-secret
signature
```

Request header snapshots exclude security credentials such as:

```text
Authorization
Cookie
Set-Cookie
Proxy-Authorization
X-API-Key
X-Platform-Key
X-Admin-Key
```

The project still stores the raw client IP because IP intelligence is an explicit requirement of the analytics design. Apply your own retention/access/privacy policy before production use.

---

# 8. Event types

Built-in normalized event types:

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

Unknown event types are normalized to:

```text
custom
```

The original client payload remains available in the JSON snapshots.

---

# 9. Primary API

## `POST /v1/events`

Primary universal collection endpoint.

Also supported for compatibility:

```text
POST /v1/collect
POST /collect
```

The endpoint is public by default.

### Minimal request

```json
{
  "platformId": "my-platform"
}
```

### Recommended request

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "web",
  "platformUrl": "https://example.com",
  "platformDomain": "example.com",
  "environment": "production",
  "appVersion": "2.4.0",
  "sdkName": "my-sdk",
  "sdkVersion": "1.0.0",
  "source": "browser",

  "eventType": "pageview",
  "eventId": "unique-client-event-id",
  "timestamp": "2026-10-01T10:00:00.000Z",

  "identity": {
    "visitorId": "visitor-001",
    "anonymousId": "anonymous-001",
    "sessionId": "session-001",
    "userId": "user-001"
  },

  "page": {
    "url": "https://example.com/dashboard",
    "path": "/dashboard",
    "queryString": "",
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
    "downlink": 25,
    "rtt": 45,
    "saveData": false
  },

  "platformIp": "203.0.113.10",

  "durationMs": 4200,
  "maxScroll": 78,
  "clicks": 3,
  "outboundClicks": 1,

  "data": {
    "customField": "custom-value"
  },

  "metadata": {
    "releaseChannel": "stable"
  }
}
```

### Successful response

A fully healthy event usually returns HTTP `201` when both D1 and GitHub archive succeed.

```json
{
  "ok": true,
  "accepted": true,
  "version": "9.0.0",
  "requestId": "...",
  "eventId": "...",
  "platformId": "my-platform",
  "stored": {
    "d1": true,
    "github": true
  }
}
```

If D1 stored the event but the GitHub archive failed, the Worker returns a non-fatal success/accepted response with archive status information instead of losing the event.

---

# 10. Read APIs

## List platforms

```http
GET /v1/platforms
```

Returns all dynamically discovered platforms.

## Portfolio overview

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

## Single platform

```http
GET /v1/platforms/<platformId>?days=7
```

Compatibility endpoint:

```http
GET /api/site/<platformId>?days=7
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

## All recent events

```http
GET /v1/events?days=7&limit=100
```

## Machine-readable contract

```http
GET /v1/schema
```

---

# 11. Admin APIs

Admin routes require:

```http
X-Admin-Key: YOUR_ADMIN_KEY
```

Routes:

```text
GET  /v1/admin/events
GET  /v1/admin/event?id=<eventId>
GET  /v1/admin/notifications
POST /v1/admin/archive-retry/<eventId>
POST /v1/admin/platform-key
```

The key is a Worker Secret and must never be placed inside `docs/` or any public client application.

---

# 12. GitHub archive

Each event receives a standalone JSON archive file.

Pattern:

```text
data/platforms/<platformId>/events/YYYY/MM/DD/<timestamp>_<eventId>.json
```

Example:

```text
data/platforms/my-platform/events/2026/10/01/2026-10-01T10-00-00_unique-event.json
```

Advantages:

- no shared daily JSON file;
- different events do not overwrite one another;
- easy browsing in GitHub;
- direct raw-file access;
- easy export to another system;
- one archive failure does not remove the D1 event.

GitHub's Contents API supports create/update file operations using fine-grained personal access tokens when repository `Contents: write` is granted. GitHub documents `409` conflicts and other failure codes for this endpoint, which is why v9 retries branch/file conflicts and checks for an already-created archive before declaring failure.

Reference:

https://docs.github.com/en/rest/repos/contents

---

# 13. GitHub token configuration

Create a GitHub fine-grained personal access token for this repository.

Required repository permission:

```text
Contents: Read and write
```

The Worker uses the token only as a server-side secret.

The browser dashboard does NOT receive the token.

The target projects using the analytics SDK do NOT need the token.

---

# 14. Cloudflare Worker configuration

In Cloudflare Workers → Settings → Variables and Secrets, configure the following.

## Text variables

```text
GITHUB_OWNER=mehrdadmb2
GITHUB_REPO=github-page-insights
GITHUB_BRANCH=main
GITHUB_ARCHIVE_ENABLED=true
REQUIRE_PLATFORM_KEY=false
TELEGRAM_ENABLED=true
TELEGRAM_NOTIFY_MODE=visitor
DEBUG=false
```

## Secrets

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

Cloudflare's recommended mechanism for sensitive Worker configuration is Worker Secrets:

https://developers.cloudflare.com/workers/configuration/secrets/

---

# 15. D1 binding

The Worker expects:

```text
Binding name: DB
```

and the binding must point to:

```text
github-page-insights
```

In the Cloudflare dashboard:

```text
Workers & Pages
→ github-page-insights-worker
→ Settings
→ Bindings
→ Add
→ D1 database
→ Variable name: DB
→ Database: github-page-insights
```

---

# 16. GUI-only database installation

Because the target workflow uses the Cloudflare dashboard GUI, the project contains one-statement SQL files.

Do not paste the full `schema.sql` into the Console for the initial deployment workflow described here.

Run the files in this exact order:

```text
01_drop_notification_log.sql
02_drop_event_archives.sql
03_drop_events.sql
04_drop_platform_sessions.sql
05_drop_platform_visitors.sql
06_drop_platforms.sql
07_drop_schema_meta.sql

08_create_schema_meta.sql
09_create_platforms.sql
10_create_platform_visitors.sql
11_create_platform_sessions.sql
12_create_events.sql
13_create_event_archives.sql
14_create_notification_log.sql

15_index_idx_events_platform_received.sql
16_index_idx_events_received.sql
17_index_idx_events_platform_type.sql
18_index_idx_events_platform_ip.sql
19_index_idx_events_ip.sql
20_index_idx_events_platform_platform_ip.sql
21_index_idx_events_platform_visitor.sql
22_index_idx_events_platform_session.sql
23_index_idx_events_user.sql
24_index_idx_events_trace.sql
25_index_idx_events_country.sql
26_index_idx_events_region.sql
27_index_idx_events_city.sql
28_index_idx_events_browser.sql
29_index_idx_events_os.sql
30_index_idx_events_device.sql
31_index_idx_events_path.sql
32_index_idx_events_referrer.sql
33_index_idx_events_utm_source.sql
34_index_idx_events_utm_campaign.sql
35_index_idx_sessions_last_seen.sql
36_index_idx_sessions_visitor.sql
37_index_idx_sessions_user.sql
38_index_idx_sessions_ip.sql
39_index_idx_visitors_last_seen.sql
40_index_idx_visitors_user.sql
41_index_idx_visitors_ip.sql
42_index_idx_archives_platform.sql
43_index_idx_archives_status.sql
44_index_idx_notifications_platform.sql

45_seed_schema.sql
46_seed_service.sql

47_verify_tables.sql
48_verify_event_columns.sql
49_verify_platform_columns.sql
50_verify_visitor_columns.sql
51_verify_session_columns.sql
52_verify_archive_columns.sql
53_verify_notification_columns.sql
54_verify_schema_meta.sql
55_verify_counts.sql
```

The first seven files are destructive. They are for a clean rebuild and will remove old v8 data.

---

# 17. No Cron architecture

Collection is request-driven.

There is no requirement for:

```text
Cron Trigger
Scheduled Trigger
background polling loop
GitHub Actions collector
```

A normal `POST /v1/events` request performs the collection immediately.

The GitHub archive and Telegram path are downstream of the already-stored event.

---

# 18. Telegram bot

Telegram is optional.

The Worker supports:

```text
/telegram/setup
/telegram/test
/telegram/webhook
```

The bot is designed to notify the administrator about new visitors/events according to:

```text
TELEGRAM_NOTIFY_MODE
```

Available modes:

```text
off
event
session
visitor
```

Default:

```text
visitor
```

This intentionally avoids sending a Telegram message for every heartbeat/scroll event.

### Telegram commands

```text
/start
/help
/status
/health
/platforms
/platform <platform-id>
/stats <platform-id>
/recent <platform-id>
/docs
/id
/about
```

### Webhook setup

After all Telegram secrets are configured and the Worker is deployed:

```http
GET /telegram/setup
```

with:

```http
X-Admin-Key: YOUR_ADMIN_KEY
```

The Worker calls Telegram's `setWebhook` API and points the bot to:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/telegram/webhook
```

Telegram's official Bot API documentation:

https://core.telegram.org/bots/api

---

# 19. Dashboard

The dashboard is in `docs/` and can be published as GitHub Pages.

It keeps the existing dark/glass/neon visual style and adds v9 reliability behavior:

- dynamic platform discovery;
- date range controls;
- platform search;
- traffic timeline;
- platform mix;
- country distribution;
- browser distribution;
- operating-system distribution;
- raw IP ranking;
- recent event table;
- event inspector;
- full JSON inspector;
- Worker/D1/GitHub/Telegram health cards;
- automatic refresh;
- request timeout;
- last-known-good data retention after refresh failure;
- graceful partial API failure.

The dashboard only contains public configuration values.

Do NOT put:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
```

inside `docs/config.js`.

---

# 20. Browser SDK

Use:

```html
<script src="https://mehrdadmb2.github.io/github-page-insights/analytics.js"></script>
```

or copy `docs/analytics.js` to another project.

The SDK automatically collects:

```text
pageview
heartbeat
scroll
click
outbound_click
visibility
pageleave
connection changes
```

It creates/reuses:

```text
visitorId
sessionId
```

and sends:

```text
platformId
platformName
platformType
environment
appVersion
platformIp
source
SDK name/version
event ID
timestamp
identity
page
screen
viewport
connection
engagement
custom data
metadata
```

It also keeps a small browser-side retry queue for temporary connectivity failures.

---

# 21. Adding another platform

No Worker code change is required.

Example A:

```json
{
  "platformId": "imdb-showcase",
  "platformName": "IMDb Showcase",
  "platformType": "github-pages"
}
```

Example B:

```json
{
  "platformId": "crm-api",
  "platformName": "CRM API",
  "platformType": "api",
  "eventType": "invoice_opened",
  "data": {
    "invoiceId": "INV-1001"
  }
}
```

Example C:

```json
{
  "platformId": "telegram-bot",
  "platformName": "My Telegram Bot",
  "platformType": "telegram",
  "eventType": "command",
  "data": {
    "command": "/start",
    "chatType": "private"
  }
}
```

Each platform gets its own GitHub namespace automatically:

```text
data/platforms/imdb-showcase/
data/platforms/crm-api/
data/platforms/telegram-bot/
```

---

# 22. Platform API keys

Optional platform authentication is built in.

Keep:

```text
REQUIRE_PLATFORM_KEY=false
```

for the initial installation.

When a platform is ready for authentication:

1. create a platform key;
2. call the admin endpoint;
3. store only the SHA-256 hash in D1;
4. enable `REQUIRE_PLATFORM_KEY=true`;
5. send the platform key using `X-Platform-Key` or `X-API-Key`.

Never put a platform key into public documentation when the client is a browser application.

---

# 23. Reliability behavior

## D1 failure

The Worker returns:

```text
D1_STORE_FAILED
```

and the event is not reported as stored.

## Aggregate failure

The v9 design stores the event before aggregate maintenance.

If aggregate maintenance fails:

```text
D1 event = stored
D1 aggregates = degraded
```

The response exposes the aggregate error instead of pretending the full pipeline was healthy.

## GitHub archive failure

The D1 event stays intact.

The archive status is recorded in:

```text
event_archives
```

and the administrator can retry with:

```http
POST /v1/admin/archive-retry/<eventId>
```

## Telegram failure

Telemetry storage does not fail because Telegram failed.

The notification status is recorded in:

```text
notification_log
```

---

# 24. Health endpoint

Open:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health
```

Full GitHub probe:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health?probe=github
```

The health response checks:

```text
Worker
D1
GitHub
Telegram configuration
Telemetry freshness
schema completeness
row counts
latest event
```

Possible overall states:

```text
healthy
degraded
error
```

---

# 25. Verification after D1 setup

The final verification queries are:

```text
47_verify_tables.sql
48_verify_event_columns.sql
49_verify_platform_columns.sql
50_verify_visitor_columns.sql
51_verify_session_columns.sql
52_verify_archive_columns.sql
53_verify_notification_columns.sql
54_verify_schema_meta.sql
55_verify_counts.sql
```

`48_verify_event_columns.sql` should show **96 event columns**.

The required columns include:

```text
id
received_at
event_type
platform_id
platform_name
platform_type
platform_url
platform_domain
session_id
visitor_id
ip
ip_hash
platform_ip
data_json
metadata_json
headers_json
cf_json
request_json
payload_json
raw_event_json
```

---

# 26. Test event

A ready-made test payload is provided in:

```text
tests-SAMPLE-EVENT.json
```

Send it to:

```text
POST https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events
```

with:

```http
Content-Type: application/json
```

For the first test, use a platform ID such as:

```text
sample-web-app
```

After the request:

1. check the Worker response;
2. open D1 `events` and verify the row;
3. open `platforms` and verify the platform;
4. verify visitor/session rows;
5. verify the GitHub archive file;
6. open `/v1/platforms/sample-web-app?days=7`;
7. open the dashboard and refresh.

---

# 27. GUI-only deployment order

This is the recommended order for this repository.

```text
PHASE A — GitHub
    ↓
Upload repository files
    ↓
PHASE B — D1
    ↓
Create / select github-page-insights
    ↓
Run console SQL 01 → 55 in order
    ↓
PHASE C — Worker
    ↓
Open github-page-insights-worker
    ↓
Attach D1 binding DB
    ↓
Add Variables
    ↓
Add Secrets
    ↓
Paste worker/index.js into Worker editor
    ↓
Deploy
    ↓
PHASE D — Worker verification
    ↓
/v1/health
/v1/schema
/v1/platforms
    ↓
PHASE E — Event test
    ↓
POST /v1/events
    ↓
Verify D1 + GitHub archive
    ↓
PHASE F — GitHub Pages
    ↓
Publish docs/
    ↓
Open dashboard
    ↓
PHASE G — Telegram
    ↓
Set Telegram secrets
    ↓
Deploy Worker again
    ↓
GET /telegram/setup with X-Admin-Key
    ↓
GET /telegram/test with X-Admin-Key
    ↓
Send /start to bot
```

---

# 28. Cloudflare dashboard troubleshooting

## `D1_NOT_CONFIGURED`

Check the binding:

```text
DB → github-page-insights
```

## `D1 schema is incomplete`

Run:

```text
48_verify_event_columns.sql
49_verify_platform_columns.sql
50_verify_visitor_columns.sql
51_verify_session_columns.sql
52_verify_archive_columns.sql
53_verify_notification_columns.sql
```

Then compare them with the v9 schema.

## Event request returns `D1_STORE_FAILED`

Check Worker logs and the `requestId`.

The first thing to verify is that the deployed Worker code is v9 and D1 is v9.

## Dashboard is empty

Check:

```text
/v1/health
/v1/platforms
/v1/overview?days=7
```

Then send the sample event again.

## GitHub archive returns 401/403

Check:

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
```

and make sure the GitHub fine-grained token can write repository contents.

## GitHub archive returns 409

This is treated as a retryable conflict. v9 retries and also checks whether the event file has already been created.

## Telegram does not reply

Check:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_ENABLED=true
```

Then run:

```text
/telegram/setup
/telegram/test
```

with the admin key.

---

# 29. D1 usage considerations

Cloudflare currently enforces daily D1 row-read/write limits on Workers Free plans, so high-volume telemetry can consume the included allowance. Keep the dashboard refresh interval reasonable, avoid unnecessary broad queries, and use platform/date filters for large datasets.

Reference:

https://developers.cloudflare.com/d1/platform/changelog/

---

# 30. Security checklist

Before production:

```text
[ ] ADMIN_KEY is a long random secret
[ ] GITHUB_TOKEN is a Worker Secret
[ ] Telegram token is a Worker Secret
[ ] Telegram webhook secret is a Worker Secret
[ ] No secrets exist in docs/config.js
[ ] No secrets exist in README examples
[ ] REQUIRE_PLATFORM_KEY policy has been decided
[ ] Raw IP access is restricted to appropriate administrators
[ ] Retention/privacy policy has been reviewed
[ ] GitHub archive repository visibility has been reviewed
```

---

# 31. File-by-file responsibilities

## `worker/index.js`

The production Cloudflare Worker.

Responsibilities:

```text
routing
validation
normalization
Cloudflare enrichment
IP detection
secret redaction
D1 storage
aggregate maintenance
GitHub archive
Telegram webhook
Telegram notifications
health diagnostics
admin operations
API contract
```

## `worker/wrangler.toml`

Infrastructure-as-code reference for the same Worker name, variables and D1 binding.

The project does not require CLI usage for the deployment workflow documented here.

## `docs/index.html`

Dashboard markup.

## `docs/style.css`

The full visual layer: dark/light theme, glass panels, gradients, responsive layout, cards, tables, modals and animated background.

## `docs/app.js`

Dashboard logic with resilient API loading and last-good-data retention.

## `docs/analytics.js`

Browser SDK for automatic telemetry collection.

## `docs/config.js`

Public client configuration only.

## `db/schema-v9.sql`

Reference full schema.

## `db/console/*.sql`

One-statement GUI deployment path.

## `docs/api-schema.json`

Machine-readable API contract for AI tools and integrations.

---

# 32. AI integration instructions

An AI coding agent integrating another repository should follow this order:

```text
1. Identify a stable platformId.
2. Identify the platform display name.
3. Identify platform type.
4. Set Worker URL.
5. Send POST /v1/events.
6. Prefer platform/session/visitor IDs when the source system provides them.
7. Put application-specific data in data.
8. Put integration metadata in metadata.
9. Never copy GitHub or admin secrets into the target application.
10. Use /v1/schema to inspect the public contract.
11. Use /v1/platforms/<id> for analytics.
12. Use GitHub archive folders for long-term event export.
```

---

# 33. Versioning

The API namespace is:

```text
/v1/*
```

Breaking contract changes should create a new major namespace instead of silently changing the meaning of existing v1 fields.

Worker internal version:

```text
9.0.0
```

Database schema version:

```text
9.0
```

---

# 34. Final installation rule

Do not mix versions.

A stable deployment means these layers are from the same release family:

```text
Worker v9
D1 schema v9
Dashboard v9
Browser SDK v9
API schema v9
```

If one layer remains on v8 while another is v9, unexpected fields, missing columns, or dashboard/API mismatches can appear.

---

# 35. Official documentation references

Cloudflare D1 limits:

https://developers.cloudflare.com/d1/platform/limits/

Cloudflare D1 Worker API:

https://developers.cloudflare.com/d1/worker-api/

Cloudflare Worker request metadata:

https://developers.cloudflare.com/workers/runtime-apis/request/

Cloudflare Worker Secrets:

https://developers.cloudflare.com/workers/configuration/secrets/

GitHub repository contents API:

https://docs.github.com/en/rest/repos/contents

Telegram Bot API:

https://core.telegram.org/bots/api

---

## 36. Release validation

The final release was statically and runtime-smoke tested before packaging. See:

```text
VALIDATION-REPORT-FA.md
tests/validate.mjs
```

The validation covers JavaScript syntax, D1 schema/Worker column alignment, all numbered D1 Console DDL/index statements (01-46), verification queries (47-55), the collect path, duplicate event handling, `/v1/schema`, `/v1/health`, malformed route encoding, GitHub archive success in a mock, and Telegram setup/test/webhook in a mock.

## License

MIT — see `LICENSE`.
