# 🌌 Universal Event Insights v8

> **A reusable, modular, multi-platform telemetry, analytics, event collection and monitoring platform built on Cloudflare Workers + D1 + GitHub Archive + Telegram.**

Universal Event Insights is no longer limited to GitHub Pages analytics. The same Worker can receive telemetry from almost any client or service:

```text
GitHub Pages
Websites
Web Apps
REST APIs
Telegram Bots
Discord Bots
Mobile Apps
Desktop Apps
Python Scripts
SaaS Applications
CRMs
Internal Tools
Webhooks
Automation Services
IoT / Edge Clients
Custom Platforms
```

The central concept is a dynamic **`platformId`**. A new integration does not require adding a hard-coded platform to the Worker. The client simply sends a new `platformId`, and the Worker creates or updates the corresponding platform namespace automatically.

---

# ✨ What This Project Does

Universal Event Insights receives an event at:

```http
POST /v1/events
```

The Worker then performs the complete request-driven pipeline:

```text
Client
   │
   │ POST /v1/events
   ▼
Cloudflare Worker
   │
   ├── validate input
   ├── normalize fields
   ├── identify platform / visitor / session
   ├── enrich with Cloudflare request metadata
   ├── capture client intelligence
   ├── sanitize secrets
   │
   ├──────────────► Cloudflare D1
   │                  ├── platforms
   │                  ├── platform_visitors
   │                  ├── platform_sessions
   │                  ├── events
   │                  ├── event_archives
   │                  └── notification_log
   │
   ├──────────────► GitHub
   │                  └── per-event JSON archive
   │
   └──────────────► Telegram
                      └── optional administrator notification
```

There is **no Cron requirement for event collection**. Incoming requests are processed immediately by the Worker.

---

# 🧭 Design Principles

## Universal

The service is designed around one API and many clients.

```text
platformId = the namespace of the sender
```

Examples:

```text
imdb-showcase
my-website
crm-production
telegram-bot
mobile-app
internal-api
```

## Dynamic

The Worker does not require a hard-coded list of platforms.

A new platform can start sending data immediately:

```json
{
  "platformId": "crm-production"
}
```

## Detailed

Common fields are normalized into relational columns for analytics and filtering, while flexible application-specific data is preserved in JSON.

## Traceable

Every request receives a `requestId`, and each event has a unique event identifier.

## Archive-friendly

Every accepted event can be written to a deterministic GitHub path:

```text
data/platforms/<platformId>/events/YYYY/MM/DD/<timestamp>_<eventId>.json
```

## GUI-first deployment

The project is intended to be deployed using:

```text
GitHub Web UI
Cloudflare Dashboard
Cloudflare D1 Console
Cloudflare Worker Code Editor
Telegram BotFather
```

No CLI is required for the deployment workflow described in this repository.

---

# 🧱 Repository Structure

```text
github-page-insights/
│
├── data/
│   └── platforms/
│       └── .gitkeep
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
├── db/
│   ├── schema-v7.sql
│   ├── schema-v8.sql
│   ├── SCHEMA-V8-CATALOG-FA.md
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
│       ├── 15-44 indexes
│       ├── 45_seed_schema.sql
│       ├── 46_seed_service.sql
│       └── 47-55 verification
│
├── tests-SAMPLE-EVENT.json
├── SETUP-GUI-FA.md
├── README.md
└── LICENSE
```

---

# ☁️ Cloudflare Worker

Current Worker URL used by this project:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

Worker source:

```text
worker/index.js
```

Worker version:

```text
8.0.0
```

Service identifier:

```text
universal-event-insights-worker
```

---

# 🗄️ D1 Database

The universal schema uses these tables:

```text
schema_meta
platforms
platform_visitors
platform_sessions
events
event_archives
notification_log
```

## Why more than one table?

### `platforms`

One row per platform namespace. This table stores platform identity, aggregate counters, last-seen information, platform metadata and optional platform-key information.

### `platform_visitors`

One row per visitor within a platform namespace. It stores the latest known identity, IP, location, browser, operating system, device and last page information.

### `platform_sessions`

One row per session within a platform namespace. It stores session lifetime, event count, pageviews, engagement counters and latest client intelligence.

### `events`

The primary detailed telemetry table. Every unique event receives one row with normalized relational fields plus complete sanitized JSON snapshots.

### `event_archives`

Tracks the GitHub archive state for each event.

### `notification_log`

Tracks Telegram notification delivery for each event/channel.

### `schema_meta`

Stores service/schema metadata used by health and verification tooling.

---

# 🧾 D1: Full Event Data Model

The v8 `events` table intentionally contains a large normalized set of common telemetry fields while keeping flexible JSON fields for platform-specific data.

The database is designed so that **useful telemetry is not lost merely because the client is not a website**.

## Platform identity

```text
platform_id
platform_name
platform_type
environment
app_version
sdk_name
sdk_version
source
```

Additional platform registry data is stored in `platforms`, including:

```text
platform_url
platform_domain
metadata_json
capabilities_json
last_ip
last_ip_hash
last_platform_ip
last_country
last_region
last_city
```

## Event identity and tracing

```text
event id
occurred_at
received_at
event_type
event_version
user_id
session_id
visitor_id
anonymous_id
trace_id
request_id
```

## Page / URL information

```text
page_url
path
query_string
title
referrer
referrer_host
```

## Campaign attribution

```text
utm_source
utm_medium
utm_campaign
utm_term
utm_content
```

## Language and time zone

```text
language
accept_language
timezone
```

## Geo / Cloudflare intelligence

When the corresponding request metadata is available:

```text
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

## IP information

```text
ip
ip_hash
platform_ip
forwarded_for
ip_source
```

### Meaning of the IP fields

`ip` is the raw client/request IP visible to the Worker.

`ip_hash` is a deterministic hash associated with the platform and client IP.

`platform_ip` is an optional IP supplied by the client when the application knows the IP of its own upstream server/service. The Worker cannot automatically discover the real origin server IP of an arbitrary browser application.

`forwarded_for` records the relevant forwarded IP information available through the request, subject to the Worker's normalization rules.

`ip_source` records the source category used when identifying the client IP.

## Browser

```text
user_agent
browser
browser_version
```

## Operating system

```text
os
os_version
```

## Device

```text
device
device_vendor
device_model
```

## Screen and viewport

```text
screen_width
screen_height
viewport_width
viewport_height
device_pixel_ratio
color_depth
```

## Connection hints

```text
connection_type
connection_downlink
connection_rtt
connection_save_data
```

## HTTP request information

```text
http_method
request_url
request_scheme
request_host
request_path
request_query
request_content_type
request_content_length
accept_header
accept_encoding
origin_header
```

## Cloudflare / edge request information

```text
cf_ray
tls_version
client_tcp_rtt
client_quic_rtt
bot_score
verified_bot
ja3
ja4
```

These values are not guaranteed to exist for every request. The Worker stores them when available or when a compatible client value is supplied.

## Response / engagement metrics

```text
response_status
duration_ms
max_scroll
clicks
outbound_clicks
```

---

# 🧩 Flexible JSON Storage

A universal API cannot predict every future field required by every application. For that reason, v8 stores both normalized fields and structured JSON.

The event table contains:

```text
data_json
metadata_json
headers_json
cf_json
request_json
payload_json
raw_event_json
```

This enables examples such as:

### CRM

```json
{
  "platformId": "crm",
  "eventType": "custom",
  "data": {
    "customerId": "C-1020",
    "action": "opened-invoice",
    "invoiceId": "INV-22",
    "invoiceTotal": 125000
  }
}
```

### Telegram bot

```json
{
  "platformId": "telegram-bot",
  "eventType": "custom",
  "data": {
    "command": "/status",
    "chatType": "private",
    "chatId": "123456789"
  }
}
```

### API request telemetry

```json
{
  "platformId": "my-api",
  "eventType": "request",
  "request": {
    "method": "POST",
    "route": "/v1/orders",
    "status": 201
  },
  "data": {
    "orderId": "ORD-123",
    "result": "created"
  }
}
```

The normalized portion remains queryable with SQL while the custom fields remain available in JSON.

---

# 🔐 Secret / Credential Protection

The universal pipeline deliberately does not persist known authentication or credential values inside the telemetry snapshots.

Sensitive keys are redacted before JSON persistence, including common names such as:

```text
Authorization
Cookie
Set-Cookie
X-API-Key
X-Platform-Key
X-Admin-Key
password
secret
token
private-key
client-secret
```

This means:

```text
Useful telemetry → preserved
Application metadata → preserved
Request metadata → preserved
Custom event data → preserved
Credentials / known secrets → redacted
```

The rule applies to the sanitized payload, header snapshot and raw-event snapshot generated by the Worker.

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

The collector is public by default. Optional platform-key enforcement is available through configuration.

---

# ✅ Minimum Event

The minimum business field is:

```json
{
  "platformId": "my-platform"
}
```

The Worker can derive fallback visitor/session identifiers when the client does not provide them, but production integrations should normally provide stable IDs themselves when possible.

---

# ⭐ Recommended Event

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "web",
  "platformUrl": "https://example.com",
  "platformDomain": "example.com",
  "environment": "production",
  "appVersion": "2.4.0",
  "sdkName": "universal-event-sdk",
  "sdkVersion": "1.0.0",
  "source": "website",

  "eventType": "pageview",
  "eventVersion": "1",
  "eventId": "client-generated-event-id",

  "userId": "user-123",
  "sessionId": "session-123",
  "visitorId": "visitor-123",
  "anonymousId": "anon-123",
  "traceId": "trace-123",

  "pageUrl": "https://example.com/dashboard?tab=overview",
  "path": "/dashboard",
  "queryString": "tab=overview",
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
    "type": "wifi",
    "downlink": 20,
    "rtt": 30,
    "saveData": false
  },

  "engagement": {
    "durationMs": 5200,
    "maxScroll": 78,
    "clicks": 4,
    "outboundClicks": 1
  },

  "platformIp": "203.0.113.10",

  "data": {
    "feature": "overview"
  },

  "metadata": {
    "release": "2026-09"
  }
}
```

---

# 🧠 Accepted Input Naming

The Worker accepts both camelCase-style application fields and relevant snake_case aliases for common identifiers and metrics.

Examples:

```text
platformId / platform_id
platformName / platform_name
platformType / platform_type
eventType / event_type
eventVersion / event_version
visitorId / visitor_id
sessionId / session_id
userId / user_id
anonymousId / anonymous_id
traceId / trace_id
pageUrl / page_url
queryString / query_string
durationMs / duration_ms
maxScroll / scrollDepth / scroll_depth
outboundClicks / outbound_clicks
platformIp
```

This is intended to make integration from JavaScript, Python, APIs and other systems easier.

---

# 🏷️ Event Types

The Worker recognizes these event categories:

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

A client can still provide a custom business payload through `data` and `metadata`.

---

# 🔄 Request-Driven Processing

There is no scheduled ingestion process.

```text
POST /v1/events
       ↓
validate
       ↓
normalize
       ↓
enrich
       ↓
D1 persistence
       ↓
archive / notification
```

This means a new event can be processed immediately as soon as the request reaches the Worker.

---

# 💾 D1 Persistence Model

For each new event, the Worker checks whether the event ID already exists.

If it already exists, the event is treated as a duplicate rather than creating another copy.

For a new event, the system maintains:

```text
platform registry
visitor registry
session registry
detailed event row
archive state
notification state
```

The platform counters are updated as events arrive.

---

# 🗂️ GitHub Archive

When GitHub archiving is enabled, each event receives its own JSON file.

Archive path:

```text
 data/platforms/<platformId>/events/YYYY/MM/DD/<timestamp>_<eventId>.json
```

Example:

```text
 data/platforms/crm-production/events/2026/09/21/2026-09-21T12-30-44Z_abc123.json
```

The archive object contains:

```text
schemaVersion
service
workerVersion
requestId
archivedAt
platform
storage
event
```

GitHub is therefore the browsable long-term event archive, while D1 remains the live relational analytics layer.

---

# 🧯 Archive Failure Behavior

D1 is treated as the primary real-time storage layer.

If an event is stored successfully in D1 but GitHub archiving fails, the failure is recorded in `event_archives` rather than pretending the event was lost.

The archive state tracks:

```text
status
attempts
commit_sha
file_sha
last_error
```

The API also exposes an administrative archive-retry route.

---

# 📊 Dashboard

The GitHub Pages dashboard is located in:

```text
/docs
```

It is designed as a control plane for the Universal Event API.

Core dashboard areas include:

```text
Live service status
Health diagnostics
Platform explorer
Date-range filtering
Traffic overview
Visitor/session information
Event telemetry
Top pages
Referrer sources
Country / region / city
Browser distribution
Operating system distribution
Device information
IP intelligence
Platform IP information
Recent events
Request details
Payload details
Archive / storage state
Automatic refresh
Responsive layout
```

The dashboard communicates with the Worker API and does not require GitHub credentials in frontend code.

---

# ⚙️ Dashboard Configuration

File:

```text
docs/config.js
```

Current configuration shape:

```js
window.PAGE_INSIGHTS_CONFIG = {
  workerUrl: "https://github-page-insights-worker.game-developer-mb.workers.dev",
  githubOwner: "mehrdadmb2",
  githubRepo: "github-page-insights",
  githubBranch: "main",
  apiVersion: "v1",
  autoRefreshMs: 30000,
  healthRefreshMs: 120000,
  recentLimit: 50,
  siteConcurrency: 3,
  githubCacheMs: 90000,
  maxRecentDaysToScan: 7,
  defaultRangeDays: 7,
  showRawIp: true,
  showPlatformIp: true,
  showRequestDetails: true,
  showPayloadDetails: true
};
```

No GitHub token or admin key belongs in this file.

---

# 🔌 Analytics Client

The browser helper is:

```text
docs/analytics.js
```

A GitHub Page can load it from the published dashboard/project URL and configure its platform identity through metadata or JavaScript.

Example:

```html
<meta name="page-insights-site-id" content="my-project">
<meta name="page-insights-site-name" content="My Project">
```

The universal architecture can use the same Worker for many projects.

---

# 🌐 Backward Compatibility

Although `/v1/*` is the preferred API namespace, compatibility aliases remain available for the older GitHub Pages integration.

Collector aliases:

```http
POST /v1/events
POST /v1/collect
POST /collect
```

Platform aliases:

```http
GET /v1/platforms
GET /api/platforms
GET /api/sites
```

Overview aliases:

```http
GET /v1/overview
GET /api/overview
```

Health aliases:

```http
GET /health
GET /v1/health
GET /api/system-health
GET /api/health
```

Schema aliases:

```http
GET /v1/schema
GET /api/schema
```

New integrations should prefer `/v1/*`.

---

# 🔗 API Endpoint Reference

## Public

### Collect event

```http
POST /v1/events
```

### List platforms

```http
GET /v1/platforms
```

### Universal overview

```http
GET /v1/overview?days=7
```

### Platform detail

```http
GET /v1/platforms/<platformId>?days=7
```

### Platform events

```http
GET /v1/platforms/<platformId>/events?days=7&limit=100
```

### Platform visitors

```http
GET /v1/platforms/<platformId>/visitors?limit=100
```

### Platform sessions

```http
GET /v1/platforms/<platformId>/sessions?limit=100
```

### All events

```http
GET /v1/events?days=7&limit=100
```

### Compatibility stats

```http
GET /v1/stats?platform=<platformId>&days=7
```

### Health

```http
GET /v1/health
```

GitHub probe:

```http
GET /v1/health?probe=github
```

### API schema

```http
GET /v1/schema
```

The schema endpoint is intended to be machine-readable and suitable for AI-assisted integrations.

---

# 🔒 Administrative API

Administrative routes require the Worker `ADMIN_KEY` through the supported admin authentication header.

## Event list

```http
GET /v1/admin/events
```

## Event detail

```http
GET /v1/admin/event?id=<eventId>
```

## Notification log

```http
GET /v1/admin/notifications
```

## Retry GitHub archive

```http
POST /v1/admin/archive-retry/<eventId>
```

## Manage optional platform key

```http
POST /v1/admin/platform-key
```

Never place `ADMIN_KEY` in a public frontend.

---

# 🔑 Optional Platform Keys

The system supports optional per-platform API keys.

Default configuration:

```text
REQUIRE_PLATFORM_KEY=false
```

In this mode the collector remains easy to integrate.

When platform-key enforcement is enabled:

```text
platform request
      ↓
platform key
      ↓
SHA-256 comparison
      ↓
accept / reject
```

Only the hash is stored in the platform registry.

---

# ❤️ Health and Diagnostics

The Worker provides a machine-readable health response.

The main health route is:

```text
/v1/health
```

Optional GitHub connectivity probe:

```text
/v1/health?probe=github
```

The diagnostics cover areas such as:

```text
Worker availability
D1 connectivity
D1 table/schema completeness
D1 counters
Latest telemetry
GitHub configuration
Optional GitHub probe
Telegram configuration
```

Use Cloudflare Worker logs together with the returned `requestId` when investigating failures.

---

# 🧪 Test Event

A ready sample payload is included:

```text
tests-SAMPLE-EVENT.json
```

Equivalent example:

```json
{
  "platformId": "test-platform",
  "platformName": "Test Platform",
  "platformType": "web",
  "platformUrl": "https://example.com",
  "platformDomain": "example.com",
  "environment": "production",
  "eventType": "pageview",
  "identity": {
    "visitorId": "visitor-demo",
    "sessionId": "session-demo",
    "anonymousId": "anonymous-demo"
  },
  "page": {
    "url": "https://example.com/",
    "path": "/",
    "title": "Example",
    "referrer": "https://google.com/"
  },
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
    "type": "wifi",
    "downlink": 20,
    "rtt": 30,
    "saveData": false
  },
  "engagement": {
    "durationMs": 2500,
    "maxScroll": 40,
    "clicks": 2,
    "outboundClicks": 0
  },
  "data": {
    "hello": "world"
  },
  "metadata": {
    "test": true
  }
}
```

---

# 🛠️ GUI-Only Installation

The detailed Persian setup guide is:

```text
SETUP-GUI-FA.md
```

This README gives the architecture; the following section gives the canonical order.

---

# 1. Create / Select D1

In Cloudflare Dashboard:

```text
Workers & Pages
→ D1
→ github-page-insights
```

For a clean rebuild, the numbered SQL files can recreate the schema.

> **Important:** Execute the numbered console files individually. Do not paste the entire folder as one query.

---

# 2. Build D1 from the Console

Go to:

```text
D1
→ github-page-insights
→ Console
```

Run the files in this exact order.

## Reset

```text
01_drop_notification_log.sql
02_drop_event_archives.sql
03_drop_events.sql
04_drop_platform_sessions.sql
05_drop_platform_visitors.sql
06_drop_platforms.sql
07_drop_schema_meta.sql
```

## Tables

```text
08_create_schema_meta.sql
09_create_platforms.sql
10_create_platform_visitors.sql
11_create_platform_sessions.sql
12_create_events.sql
13_create_event_archives.sql
14_create_notification_log.sql
```

## Indexes

```text
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
```

## Metadata seed

```text
45_seed_schema.sql
46_seed_service.sql
```

## Verification

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

A fresh database should normally report zero stored events/visitors/sessions/archives/notifications before the first event arrives.

---

# 3. Configure Cloudflare Worker Variables

In the Worker:

```text
Settings
→ Variables and Secrets
```

Add these variables:

```text
GITHUB_OWNER=mehrdadmb2
GITHUB_REPO=github-page-insights
GITHUB_BRANCH=main
GITHUB_ARCHIVE_ENABLED=true
REQUIRE_PLATFORM_KEY=false
TELEGRAM_ENABLED=true
TELEGRAM_NOTIFY_MODE=visitor
```

---

# 4. Configure Cloudflare Secrets

Add these as Worker Secrets:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

Do not put these values in:

```text
docs/
README.md
analytics.js
config.js
GitHub Pages frontend code
```

---

# 5. Configure D1 Binding

Worker:

```text
Settings
→ Bindings
→ Add
→ D1 Database
```

Required binding:

```text
Variable name: DB
Database: github-page-insights
```

The Worker accesses the database through:

```js
env.DB
```

---

# 6. Deploy the Worker

Use the Cloudflare Worker editor and deploy the complete:

```text
worker/index.js
```

Do not mix an old Worker version with the v8 database schema.

---

# 7. Test Worker Health

Open:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health
```

Then test GitHub connectivity:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health?probe=github
```

---

# 8. Send the First Event

Send `tests-SAMPLE-EVENT.json` to:

```text
POST /v1/events
```

The expected flow is:

```text
201 Created
   ↓
D1 event stored
   ↓
platform created/updated
   ↓
visitor created/updated
   ↓
session created/updated
   ↓
GitHub archive attempted
   ↓
Telegram notification evaluated
```

---

# 9. Verify D1

After a successful test, inspect:

```text
platforms
platform_visitors
platform_sessions
events
```

The event row should contain the normalized details and JSON snapshots.

---

# 10. Verify GitHub Archive

The repository should receive something similar to:

```text
 data/
 └── platforms/
     └── test-platform/
         └── events/
             └── 2026/
                 └── 09/
                     └── 21/
                         └── <event-file>.json
```

---

# 11. Publish the GitHub Pages Dashboard

GitHub Repository:

```text
Settings
→ Pages
```

Choose:

```text
Deploy from a branch
Branch: main
Folder: /docs
```

The frontend should communicate with the Worker and should not contain server-side secrets.

---

# 12. Telegram Integration

The Worker contains Telegram support so that the same telemetry service can act as the bot's backend.

Telegram routes:

```http
POST /telegram/webhook
GET  /telegram/setup
GET  /telegram/test
```

The intended setup is:

```text
BotFather
   ↓
Bot Token
   ↓
Cloudflare Secret
   ↓
Worker Telegram module
   ↓
Telegram Webhook
```

Default notification mode:

```text
visitor
```

This is designed to reduce noise from heartbeat/visibility-style events.

---

# 🤖 Suggested Telegram Bot Identity

Recommended bot name:

```text
EventScope — Universal Insights
```

Suggested username:

```text
EventScopeBot
```

Possible alternatives when the username is unavailable:

```text
EventScopeMonitorBot
EventScopeAlertsBot
UniversalEventBot
EventInsightsBot
TelemetryScopeBot
EventPulseMonitorBot
```

---

# 📝 Telegram Description

```text
🚀 EventScope is a universal telemetry and analytics companion for websites, APIs, bots, apps, services, and any platform connected to the EventScope API.

Monitor incoming activity, platform events, traffic intelligence, visitor details, system health, and real-time operational signals from one place.
```

---

# ℹ️ Telegram About Text

```text
Universal telemetry, analytics & platform monitoring.
```

---

# ⌨️ Telegram Commands

```text
start - Start EventScope
help - Show available commands
status - Show EventScope status
health - Run system health diagnostics
platforms - List connected platforms
stats - Show platform analytics
recent - Show recent activity
docs - Show API documentation
id - Show your Telegram chat ID
about - About EventScope
```

The Worker can handle the Telegram webhook and use the configured administrator chat ID for alerts.

---

# 🖼️ Telegram Profile Image Prompt

Use this prompt with an image generator:

```text
Create a premium futuristic Telegram bot avatar for a universal telemetry and analytics platform.

The visual concept should combine an abstract data-eye, telemetry core, radar pulse, connected nodes, signal waves and a subtle central network hub.

Style: high-end cyber infrastructure, futuristic enterprise software, cinematic 3D, dark background, layered glassmorphism, deep shadows, luminous cyan, electric violet and subtle magenta accents, refined metallic details, crisp geometry, strong contrast, sophisticated and professional, visually powerful at small icon size, centered composition, minimal clutter.

No words, no letters, no numbers, no logo text, no watermark.
```

---

# 🖼️ Telegram Banner Prompt

```text
Create a cinematic 16:9 banner for a futuristic universal telemetry and analytics platform.

Show a sophisticated digital ecosystem connecting websites, APIs, mobile applications, bots, cloud services, databases and edge systems through luminous data streams, network nodes and telemetry pulses.

Visual language: premium enterprise cyber infrastructure, dark glassmorphism, layered translucent panels, deep dimensional shadows, rich gradients, luminous cyan, blue, violet and subtle magenta, realistic volumetric lighting, fine technical details, high-end dashboard atmosphere, cinematic depth, modern cloud architecture aesthetic.

The composition should feel intelligent, secure, scalable and highly technical without becoming visually chaotic.

No Persian text, no English text, no letters, no numbers, no watermark.
```

---

# 📤 Telegram Notification Content

For eligible events, the notification can include details such as:

```text
Platform
Platform ID
Platform type
Platform URL/domain
Event type
Timestamp
Client IP
Platform IP
City / Region / Country
ASN
ASN organization
Device
Operating system
Browser
Page / path
Referrer
Duration
Scroll depth
Clicks
Outbound clicks
Visitor ID
Session ID
Request ID
Trace ID
User agent
```

Notification delivery is recorded in `notification_log`.

---

# 🧪 Example: Website Integration

A website can send:

```js
fetch("https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    platformId: "my-website",
    platformName: "My Website",
    platformType: "web",
    eventType: "pageview",
    visitorId: localStorage.getItem("visitor-id"),
    sessionId: crypto.randomUUID(),
    pageUrl: location.href,
    path: location.pathname,
    title: document.title,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: {
      width: screen.width,
      height: screen.height,
      devicePixelRatio: window.devicePixelRatio,
      colorDepth: screen.colorDepth
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    data: {
      source: "website"
    }
  })
});
```

---

# 🐍 Example: Python Integration

```python
import requests

WORKER = "https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events"

payload = {
    "platformId": "python-service",
    "platformName": "Python Service",
    "platformType": "python",
    "eventType": "custom",
    "data": {
        "task": "daily-sync",
        "status": "completed"
    },
    "metadata": {
        "version": "1.0.0"
    }
}

response = requests.post(WORKER, json=payload, timeout=15)
print(response.status_code)
print(response.json())
```

---

# 🤖 Example: Telegram / Bot Integration

A bot can use the same Worker for events such as:

```json
{
  "platformId": "telegram-bot",
  "platformName": "EventScope Telegram Bot",
  "platformType": "telegram-bot",
  "eventType": "custom",
  "data": {
    "command": "/status",
    "chatType": "private",
    "action": "status_request"
  },
  "metadata": {
    "botVersion": "1.0.0"
  }
}
```

---

# 🔌 Example: SaaS / API Integration

```json
{
  "platformId": "saas-api-production",
  "platformName": "SaaS API",
  "platformType": "api",
  "environment": "production",
  "eventType": "request",
  "request": {
    "method": "POST",
    "route": "/v1/orders",
    "status": 201
  },
  "durationMs": 183,
  "data": {
    "orderId": "ORD-10025",
    "operation": "create"
  }
}
```

---

# 🧠 AI Integration Contract

The project is intentionally easy for another AI coding agent to integrate.

An AI agent should discover the service in this order:

```text
1. GET /v1/schema
2. POST a minimal event to /v1/events
3. GET /v1/platforms
4. GET /v1/platforms/<platformId>
5. GET /v1/platforms/<platformId>/events
```

The machine-readable API contract is also available in:

```text
docs/api-schema.json
```

The identity model is:

```text
platformId
```

The integration rule is:

```text
same Worker
same D1
same GitHub repository
separate dynamic platform namespace
```

---

# 📁 Platform Namespace Strategy

Each platform gets its own logical namespace in the GitHub archive:

```text
 data/platforms/<platformId>/
```

Example:

```text
 data/platforms/imdb-showcase/
 data/platforms/dual-ping-monitor/
 data/platforms/telegram-bot/
 data/platforms/crm-production/
 data/platforms/mobile-app/
```

This prevents the platform identity from depending on a manually maintained Worker list.

The Worker also normalizes platform identifiers to avoid unsafe path fragments and path traversal patterns.

---

# 📈 Analytics Capabilities

The architecture supports analytics across:

```text
Total events
Pageviews
Unique visitors
Sessions
Session duration
Event types
Top pages
Referrers
UTM sources
Countries
Regions
Cities
ASNs
Browser families
Browser versions
Operating systems
OS versions
Devices
Device models
Screen sizes
Viewport sizes
Connection hints
Client IPs
Platform IPs
Cloudflare metadata
HTTP request metadata
Custom data
Metadata
```

---

# 📐 Data Retention / Scaling Philosophy

For small and moderate traffic:

```text
Worker → D1 → GitHub per-event archive
```

is simple and highly traceable.

For larger installations, GitHub should primarily be treated as the historical archive, while D1 remains the real-time relational analytics layer.

A future high-volume architecture can evolve toward:

```text
Client
  ↓
Worker
  ↓
D1 / edge buffering
  ↓
batch archive pipeline
  ↓
GitHub archive
```

Potential future extensions include:

```text
platform API keys
rate limiting
idempotency keys
retention policies
sampling
batch archiving
advanced aggregation
separate admin service
```

---

# 🚦 HTTP Status Semantics

The API can use statuses such as:

```text
200 OK
201 Created
202 Accepted
400 Bad Request
401 Unauthorized
404 Not Found
405 Method Not Allowed
413 Payload Too Large
500 Internal Server Error
502 Upstream archive error
503 Configuration / dependency error
```

The response body should be inspected together with its `requestId` when diagnosing an issue.

---

# 🐛 Troubleshooting

## `D1_NOT_CONFIGURED`

Check:

```text
Worker → Settings → Bindings
Variable name: DB
Database: github-page-insights
```

## D1 schema incomplete

Run verification files again:

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

## Collector returns a D1 error

Check:

```text
/v1/health
```

Then open:

```text
Cloudflare → Worker → Logs
```

Search using the returned `requestId`.

## GitHub archive fails

Verify:

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
GITHUB_ARCHIVE_ENABLED
```

The GitHub token belongs in Worker Secrets, not in the browser.

## Dashboard is empty

Check:

```text
/v1/platforms
/v1/overview?days=7
```

Then send a known test event and confirm that D1 received it.

## Telegram is silent

Check:

```text
TELEGRAM_ENABLED
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_NOTIFY_MODE
```

Then use the administrator-protected Telegram test endpoint.

---

# 🔎 Observability

Useful Worker log markers include:

```text
REQUEST_START
D1_STORE_FAILED
GITHUB_ARCHIVE_FAILED
COLLECT_SUCCESS
UNHANDLED_ERROR
```

Every request has a `requestId` so that a client response, Worker log and downstream failure can be correlated.

---

# 🧩 Important Operational Rules

## Rule 1 — Do not store secrets in the frontend

Never expose:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
```

through GitHub Pages JavaScript.

## Rule 2 — Do not paste the entire D1 schema at once

Use:

```text
db/console/*.sql
```

one statement at a time.

## Rule 3 — No Cron is required for collection

Do not add a scheduled trigger just to make event ingestion work.

## Rule 4 — Keep `/v1/*` as the canonical API

Compatibility routes exist for older integrations, but new projects should use the versioned API.

## Rule 5 — Keep D1 and GitHub roles separate

```text
D1       = live structured analytics
GitHub   = browsable historical archive
```

## Rule 6 — Preserve custom platform data

Use:

```text
data
metadata
```

instead of discarding application-specific information simply because there is no dedicated SQL column.

---

# 🔄 Adding a New Platform Later

No Worker source change is required for a normal new platform.

Example:

```json
{
  "platformId": "new-platform",
  "platformName": "New Platform",
  "platformType": "custom",
  "eventType": "custom",
  "data": {
    "hello": "world"
  }
}
```

The Worker will use:

```text
new-platform
```

as the namespace and the GitHub archive will go under:

```text
data/platforms/new-platform/
```

---

# 🔬 Database Verification Philosophy

The schema is intentionally verifiable from the Cloudflare Console.

The numbered verification files exist so you can diagnose the deployment without guessing.

The final verification phase checks:

```text
table existence
important event columns
platform columns
visitor columns
session columns
archive columns
notification columns
schema metadata
row counts
```

---

# 📚 Project Documents

## Main README

```text
README.md
```

## Persian GUI setup guide

```text
SETUP-GUI-FA.md
```

## Database field catalog

```text
db/SCHEMA-V8-CATALOG-FA.md
```

## Complete SQL schema

```text
db/schema-v8.sql
```

## One-statement D1 Console scripts

```text
db/console/
```

## Machine-readable API contract

```text
docs/api-schema.json
```

## Browser analytics client

```text
docs/analytics.js
```

---

# 📌 Canonical Setup Order

For a fresh installation, use this sequence:

```text
1. Create / select D1
        ↓
2. Execute db/console/01 → 07
        ↓
3. Execute db/console/08 → 14
        ↓
4. Execute db/console/15 → 44
        ↓
5. Execute db/console/45 → 46
        ↓
6. Execute db/console/47 → 55
        ↓
7. Configure Worker variables
        ↓
8. Configure Worker secrets
        ↓
9. Add D1 binding DB
        ↓
10. Deploy Worker
        ↓
11. Test /v1/health
        ↓
12. Test /v1/events
        ↓
13. Verify D1
        ↓
14. Verify GitHub archive
        ↓
15. Publish GitHub Pages /docs
        ↓
16. Configure Telegram
        ↓
17. Test Telegram webhook / notification
```

---

# 🌐 Service Contract Summary

```text
Service:
universal-event-insights-worker

Version:
8.0.0

Primary collector:
POST /v1/events

Primary identity:
platformId

Live storage:
Cloudflare D1

Archive:
GitHub per-event JSON

Notifications:
Telegram

Scheduled collection:
Not required

Dashboard:
GitHub Pages /docs

Machine-readable contract:
/v1/schema
```

---

# 🏁 Final Architecture

```text
                         ┌──────────────────────┐
                         │       ANY CLIENT     │
                         │                      │
                         │ Web / API / Bot      │
                         │ Mobile / Python      │
                         │ SaaS / Script        │
                         └──────────┬───────────┘
                                    │
                                    │ POST /v1/events
                                    ▼
                    ┌────────────────────────────────┐
                    │     Cloudflare Worker v8        │
                    │                                │
                    │ Validate                       │
                    │ Normalize                      │
                    │ Identify                       │
                    │ Enrich                         │
                    │ Sanitize                       │
                    │ Request-driven                 │
                    └───────┬─────────┬────────┬─────┘
                            │         │        │
                            ▼         ▼        ▼
                     ┌──────────┐ ┌────────┐ ┌──────────┐
                     │ Cloudflare│ │ GitHub │ │ Telegram │
                     │    D1     │ │ Archive│ │   Bot    │
                     └────┬─────┘ └────────┘ └──────────┘
                          │
                          ▼
                ┌───────────────────────┐
                │ GitHub Pages Dashboard│
                │                       │
                │ Platforms             │
                │ Visitors              │
                │ Sessions              │
                │ Events                │
                │ Geo / IP              │
                │ Browser / Device      │
                │ Request intelligence  │
                │ Custom JSON           │
                └───────────────────────┘
```

---

# 📄 License

The project includes the repository `LICENSE` file. See that file for the exact license text and terms.

---

# ✅ Project Status

Universal Event Insights v8 is structured around the following capabilities:

```text
✓ Universal platform identity
✓ Dynamic platform namespaces
✓ Request-driven ingestion
✓ No Cron required for collection
✓ Detailed relational telemetry
✓ Raw client IP storage
✓ Platform IP support
✓ Geo / Cloudflare metadata
✓ Browser / OS / device intelligence
✓ HTTP request intelligence
✓ Custom JSON preservation
✓ Secret redaction
✓ D1 analytics storage
✓ GitHub per-event archive
✓ Archive status tracking
✓ Telegram notification support
✓ Machine-readable API schema
✓ GitHub Pages dashboard
✓ Backward-compatible collector aliases
✓ GUI-first setup documentation
✓ One-statement D1 Console scripts
✓ Verification scripts
```

