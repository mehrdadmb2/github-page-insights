# Universal Event Insights

Universal Event Insights is a request-driven analytics and telemetry service for websites, GitHub Pages, APIs, SaaS applications, Telegram bots, mobile/web apps, Python services, and other systems that can send an HTTPS request.

The project uses:

```text
Client / Website / API / Bot
        │
        │ POST /v1/events
        ▼
Cloudflare Worker
        │
        ├── enrich request (IP / Cloudflare network context)
        ├── normalize event
        ├── store event in D1
        ├── update visitor/session/platform aggregates
        ├── archive event to GitHub (optional)
        └── notify Telegram (optional)
        │
        ▼
GitHub Pages Dashboard
```

The Worker is **request-driven**. There is no Cron requirement and no scheduled analytics collection.

---

# 1. The 60-second version

For a normal website, you do **not** need to design an API payload manually.

Use the included browser SDK:

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

Change only:

```text
platformId
platformName
```

Then:

```text
1. Commit the snippet to your website.
2. Open the website once.
3. Open the Universal Event Insights dashboard.
4. Select your platform from the platform list.
5. Read the platform statistics and recent visitor/event data.
```

There is no manual D1 insert and no per-website Worker.

---

# 2. One Worker can collect many platforms

The Worker uses `platformId` as the stable namespace.

Example:

```text
imdb-showcase
my-portfolio
my-shop
telegram-bot
crm-production
mobile-app
python-service
```

All of them can send to the same Worker:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev
```

The Worker automatically creates/discovers the platform namespace when the first event arrives.

You do **not** need to pre-register a website in a hardcoded list.

---

# 3. Website integration — recommended simple method

## 3.1 Copy the SDK

The browser SDK is:

```text
docs/analytics.js
```

It is already published with the GitHub Pages dashboard.

Use:

```text
https://mehrdadmb2.github.io/github-page-insights/analytics.js
```

## 3.2 Add the configuration

```html
<script>
window.PAGE_INSIGHTS_CONFIG = {
  workerUrl: "https://github-page-insights-worker.game-developer-mb.workers.dev",
  platformId: "my-website",
  platformName: "My Website",
  platformType: "web",
  environment: "production"
};
</script>
```

Then load the SDK:

```html
<script src="https://mehrdadmb2.github.io/github-page-insights/analytics.js" defer></script>
```

## 3.3 Result

The browser SDK sends a Basic `pageview` request to:

```http
POST https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events
Content-Type: application/json
```

Basic mode intentionally avoids high-frequency telemetry.

By default it does **not** continuously send:

```text
click
scroll
visibility
heartbeat
connection_change
```

The goal is one useful request per page load, not hundreds of small requests during one visit.

A failed request may be kept locally and retried when the browser comes back online. Periodic queue flushing is disabled by default.

---

# 4. What a Basic website visit contains

The important distinction is:

```text
Rich visitor data
        ≠
High request frequency
```

A single Basic `pageview` can contain a rich snapshot.

The browser can provide:

```text
Visitor ID
Session ID
Page URL
Path
Page title
Referrer
Language
Timezone
Screen size
Viewport size
Device pixel ratio
Color depth
Browser User-Agent / parsed browser
Operating system / parsed OS
Device classification
Connection type
Connection RTT
Connection downlink
Save-data hint
Client hints when supported
```

The Worker can enrich the same request with server-side/request context such as:

```text
Client IP
IP hash scoped to platform
Country
Region
Region code
City
Continent
Latitude
Longitude
Postal code
Metro code
ASN
ASN organization
Cloudflare colo / POP
CF-Ray
TLS / connection fields available to the Worker
Bot-related fields when available
```

The exact availability of some fields depends on the browser, request path, Cloudflare configuration, and what the platform actually sends.

`platformIp` is different from the visitor IP. `platformIp` is an IP supplied by the sending platform/application (for example, an API server or service). The Worker does not invent the platform's server IP.

Exact GPS location is **not** automatically collected by the browser. IP geolocation and device-reported coordinates are different concepts.

---

# 5. If you only need a website: stop here

For the simplest website integration, you only need:

```text
platformId
platformName
analytics.js
```

You do not need:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
D1 credentials
```

None of those secrets belong in browser code.

---

# 6. Where do I find my website's data?

After the first successful event:

## Step 1 — discover platforms

```http
GET https://github-page-insights-worker.game-developer-mb.workers.dev/v1/platforms
```

Look for:

```json
{
  "platformId": "my-website",
  "platformName": "My Website"
}
```

## Step 2 — read the platform

Basic / lighter query:

```http
GET https://github-page-insights-worker.game-developer-mb.workers.dev/v1/platforms/my-website?days=7&lite=1
```

Advanced query:

```http
GET https://github-page-insights-worker.game-developer-mb.workers.dev/v1/platforms/my-website?days=7
```

## Step 3 — read recent raw events

```http
GET https://github-page-insights-worker.game-developer-mb.workers.dev/v1/platforms/my-website/events?days=7&limit=100
```

## Step 4 — read visitor records

```http
GET https://github-page-insights-worker.game-developer-mb.workers.dev/v1/platforms/my-website/visitors?limit=100
```

## Step 5 — read sessions

```http
GET https://github-page-insights-worker.game-developer-mb.workers.dev/v1/platforms/my-website/sessions?limit=100
```

That is the complete normal read path.

---

# 7. Write data — universal event API

The authoritative collector endpoint is:

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

## 7.1 Smallest possible event

The Worker accepts the minimum:

```json
{
  "platformId": "my-platform"
}
```

This is useful for testing connectivity.

## 7.2 Recommended generic event

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "api",
  "environment": "production",
  "eventType": "custom",
  "eventId": "event-0001",
  "data": {
    "action": "sync_completed",
    "records": 42
  },
  "metadata": {
    "appVersion": "1.4.0"
  }
}
```

Only `platformId` is required.

The other fields are optional and the Worker normalizes both the current camelCase names and documented snake_case aliases.

---

# 8. Website pageview payload — manual version

Normally the browser SDK creates this automatically. If you are writing your own collector, a useful pageview looks like:

```json
{
  "platformId": "my-website",
  "platformName": "My Website",
  "platformType": "web",
  "environment": "production",
  "eventType": "pageview",
  "eventId": "4c1ddf8a-9f5d-4b77-8ef0-example",
  "identity": {
    "visitorId": "visitor-123",
    "sessionId": "session-123"
  },
  "page": {
    "url": "https://example.com/products",
    "path": "/products",
    "queryString": "category=tools",
    "title": "Products",
    "referrer": "https://google.com/"
  },
  "screen": {
    "width": 1920,
    "height": 1080,
    "devicePixelRatio": 1,
    "colorDepth": 24
  },
  "viewport": {
    "width": 1512,
    "height": 850
  },
  "connection": {
    "effectiveType": "4g",
    "downlink": 10,
    "rtt": 40,
    "saveData": false
  },
  "data": {
    "source": "website"
  }
}
```

You normally do **not** need to put the visitor IP or Cloudflare geo fields in this JSON. The Worker obtains request-side information from the incoming request when available.

---

# 9. cURL — write data

## 9.1 Minimal connectivity test

```bash
curl -X POST \
  "https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events" \
  -H "Content-Type: application/json" \
  -d '{"platformId":"curl-test","eventType":"test"}'
```

## 9.2 Real event

```bash
curl -X POST \
  "https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events" \
  -H "Content-Type: application/json" \
  -d '{
    "platformId":"my-api",
    "platformName":"My API",
    "platformType":"api",
    "environment":"production",
    "eventType":"request",
    "eventId":"req-10001",
    "data":{
      "route":"/v1/orders",
      "method":"POST",
      "status":201
    }
  }'
```

---

# 10. JavaScript / Node.js — write data

```js
const WORKER = "https://github-page-insights-worker.game-developer-mb.workers.dev";

const payload = {
  platformId: "my-service",
  platformName: "My Service",
  platformType: "api",
  environment: "production",
  eventType: "request",
  eventId: crypto.randomUUID(),
  data: {
    route: "/v1/orders",
    method: "GET",
    status: 200
  }
};

const response = await fetch(`${WORKER}/v1/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

const result = await response.json();
console.log(response.status, result);
```

For a retry of the **same** logical event, reuse the same `eventId`. That gives the Worker an idempotency key and prevents duplicate insertion.

Do not generate a brand-new `eventId` for every retry of the same event.

---

# 11. Python — write data

```python
import requests
import uuid

WORKER = "https://github-page-insights-worker.game-developer-mb.workers.dev"

payload = {
    "platformId": "python-service",
    "platformName": "Python Service",
    "platformType": "python",
    "environment": "production",
    "eventType": "custom",
    "eventId": str(uuid.uuid4()),
    "data": {
        "job": "daily-sync",
        "status": "completed",
        "records": 42,
    },
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

# 12. What the write response means

A successful new event normally returns HTTP `201` or `202`.

Typical response shape:

```json
{
  "ok": true,
  "accepted": true,
  "version": "12.1.0",
  "requestId": "request-id",
  "eventId": "event-0001",
  "platformId": "my-platform",
  "eventType": "pageview",
  "stored": {
    "d1": true,
    "github": "scheduled"
  },
  "d1": {
    "event": true,
    "aggregates": true,
    "aggregateError": null,
    "newVisitor": true,
    "newSession": true
  },
  "telegram": {
    "enabled": true,
    "eligible": true
  }
}
```

Important fields:

```text
accepted=true
        → the Worker accepted the event

d1.event=true
        → the event was stored in D1

d1.newVisitor=true
        → this event created a new visitor record

d1.newSession=true
        → this event created a new session record

github="scheduled"
        → GitHub archive is being handled in the background
```

A `200` response with `duplicate=true` means the supplied `eventId` already exists and was not inserted again.

Example:

```json
{
  "ok": true,
  "accepted": true,
  "duplicate": true,
  "eventId": "event-0001",
  "platformId": "my-platform"
}
```

---

# 13. Read data — the simple API map

Use this table as the primary integration reference.

| Need | Method | Endpoint | Typical use |
|---|---|---|---|
| Check service | GET | `/v1/health?quick=1` | cheap health check |
| Discover platforms | GET | `/v1/platforms` | find platform IDs |
| Basic global analytics | GET | `/v1/overview?days=7&lite=1` | dashboard / summary |
| Full global analytics | GET | `/v1/overview?days=7` | advanced dashboard |
| Basic platform analytics | GET | `/v1/platforms/<platformId>?days=7&lite=1` | normal app integration |
| Full platform analytics | GET | `/v1/platforms/<platformId>?days=7` | deeper analytics |
| Recent raw events | GET | `/v1/platforms/<platformId>/events?days=7&limit=100` | event stream |
| Visitor records | GET | `/v1/platforms/<platformId>/visitors?limit=100` | visitor detail |
| Session records | GET | `/v1/platforms/<platformId>/sessions?limit=100` | session detail |
| Global recent events | GET | `/v1/events?days=7&limit=100` | cross-platform events |
| Live API contract | GET | `/v1/schema` | AI / integration discovery |

Compatibility routes exist, but new integrations should prefer `/v1/*`.

---

# 14. Read one platform — JavaScript

```js
const WORKER = "https://github-page-insights-worker.game-developer-mb.workers.dev";
const platformId = "my-website";

const response = await fetch(
  `${WORKER}/v1/platforms/${encodeURIComponent(platformId)}?days=7&lite=1`
);

const data = await response.json();

console.log("Visitors:", data.totals?.uniqueVisitors);
console.log("Pageviews:", data.totals?.views ?? data.totals?.pageviews);
console.log("Sessions:", data.totals?.sessions);
console.log("Events:", data.totals?.events);
console.log("Recent events:", data.recentEvents);
```

Use:

```text
lite=1
```

for the lighter/basic response.

Remove `lite=1` only when you actually need the advanced aggregates.

---

# 15. Read the global overview — JavaScript

Basic:

```js
const WORKER = "https://github-page-insights-worker.game-developer-mb.workers.dev";

const response = await fetch(
  `${WORKER}/v1/overview?days=7&lite=1`
);

const data = await response.json();
console.log(data.totals);
console.log(data.daily);
console.log(data.platforms);
console.log(data.recentEvents);
```

Advanced:

```js
const response = await fetch(
  `${WORKER}/v1/overview?days=7`
);

const data = await response.json();

console.log(data.countries);
console.log(data.browsers);
console.log(data.operatingSystems);
console.log(data.devices);
console.log(data.ips);
console.log(data.eventTypes);
console.log(data.sources);
console.log(data.statuses);
```

Supported range values are:

```text
1
7
30
90
all
```

Example:

```http
GET /v1/overview?days=30&lite=1
```

---

# 16. Platform response shape

A platform endpoint returns a structure similar to:

```json
{
  "ok": true,
  "requestId": "request-id",
  "platformId": "my-website",
  "platform": {
    "platform_id": "my-website",
    "platform_name": "My Website",
    "platform_type": "web",
    "last_seen": "2026-10-02T08:00:00.000Z",
    "total_events": 12,
    "total_pageviews": 3,
    "total_sessions": 2,
    "total_visitors": 2,
    "last_ip": "203.0.113.10",
    "last_country": "IR",
    "last_region": "...",
    "last_city": "..."
  },
  "totals": {
    "events": 12,
    "views": 3,
    "uniqueVisitors": 2,
    "sessions": 2,
    "avgDurationMs": 2400,
    "avgScroll": 0
  },
  "daily": [],
  "recentEvents": [],
  "advanced": false
}
```

Exact optional fields may vary with available data. Do not treat missing optional arrays or values as an API failure.

---

# 17. Read raw events

For the recent event stream:

```http
GET /v1/platforms/my-website/events?days=7&limit=100
```

A raw event contains normalized fields such as:

```text
id / eventId
receivedAt
occurredAt
eventType
platformId
platformName
platformType
visitorId
sessionId
pageUrl
path
title
referrer
country
region
city
latitude
longitude
asn
asOrganization
colo
ip
platformIp
browser
browserVersion
os
osVersion
device
deviceVendor
deviceModel
screenWidth
screenHeight
viewportWidth
viewportHeight
connection...
request metadata
Cloudflare metadata
custom data / metadata snapshots
```

Use the raw event endpoint when you need event-level records rather than aggregates.

---

# 18. Visitor records

For persistent visitor information:

```http
GET /v1/platforms/my-website/visitors?limit=100
```

Visitor records are stored separately from events and contain fields such as:

```text
visitor_id
user_id
anonymous_id
first_seen
last_seen
last_ip
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
timezone
language
user_agent
browser
browser_version
os
os_version
device
device_vendor
device_model
screen dimensions
viewport dimensions
last page
last path
last referrer
metadata
```

This is the endpoint to use when an application needs a visitor-centric view instead of individual event rows.

---

# 19. Session records

```http
GET /v1/platforms/my-website/sessions?limit=100
```

Sessions contain information such as:

```text
session_id
visitor_id
first_seen
last_seen
duration_ms
event_count
pageviews
max_scroll
clicks
outbound_clicks
ip
platform_ip
country
region
city
browser
OS
device
last page
last path
last referrer
```

A session is maintained by the client using the configured session timeout. The current browser SDK uses a 30-minute inactivity window by default.

---

# 20. IP and location data — important distinction

There are two different IP concepts in this project.

## Client IP

```text
ip
```

This is the IP observed by the Worker from the incoming request, typically using Cloudflare's request headers when available.

## Platform IP

```text
platformIp
```

This is an IP explicitly supplied by the sending application/platform.

Example:

```json
{
  "platformId": "my-api",
  "platformIp": "203.0.113.25",
  "eventType": "request"
}
```

Do not use `platformIp` as a substitute for the visitor IP.

## Geolocation

The Worker can store request-side IP geolocation information such as:

```text
country
region
city
latitude
longitude
postalCode
metroCode
asn
asOrganization
```

These values are request/network enrichment values. They are not guaranteed to be available for every request and they are not GPS coordinates from the visitor's device.

---

# 21. Custom application data

Do not change the D1 schema every time your application has a new custom field.

Put application-specific information under `data`.

Example:

```json
{
  "platformId": "inventory-api",
  "eventType": "request",
  "data": {
    "route": "/items",
    "method": "GET",
    "status": 200,
    "warehouse": "west",
    "operation": "list"
  }
}
```

Additional integration metadata can go under `metadata`:

```json
{
  "metadata": {
    "appVersion": "2.5.0",
    "release": "2026-10-02",
    "environment": "production"
  }
}
```

The Worker preserves JSON-oriented application information in the event record.

---

# 22. Event types

The project accepts sanitized custom event types. The following are recommended standard names:

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

The Worker also recognizes common telemetry names such as:

```text
heartbeat
visibility
click
outbound_click
scroll
connection_change
```

Those high-frequency browser events are intentionally disabled in the default Basic browser SDK.

---

# 23. Advanced browser telemetry

Only enable Advanced browser telemetry when you really need it.

Example:

```html
<script>
window.PAGE_INSIGHTS_CONFIG = {
  workerUrl: "https://github-page-insights-worker.game-developer-mb.workers.dev",
  platformId: "my-website",
  platformName: "My Website",
  platformType: "web",

  advancedTelemetry: true,
  trackPageLeave: true,
  trackClicks: true,
  trackScroll: true,
  trackVisibility: false,
  heartbeat: false,
  periodicQueueFlush: false
};
</script>
<script src="https://mehrdadmb2.github.io/github-page-insights/analytics.js" defer></script>
```

Advanced telemetry is configurable because click and scroll tracking can create many more writes than Basic pageview tracking.

For ordinary analytics, keep them off.

---

# 24. Telegram notifications

Telegram is optional and is configured on the Worker, not in frontend code.

Required Worker secrets:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

Optional setting:

```text
TELEGRAM_ENABLED=true
```

When Telegram is enabled, the default notification mode is:

```text
visitor
```

The Worker can send a detailed message for a newly recognized visitor/session according to the configured notification mode.

For a Basic website pageview, Telegram can include request-enriched information such as:

```text
platform
URL/domain
event type
time
client IP
platform IP
country / region / city
coordinates when available
postal / metro codes
ASN / organization
Cloudflare POP
device
OS
browser
screen
viewport
language / timezone
network hints
page
referrer
visitor ID
session ID
request ID
```

High-frequency browser events such as:

```text
heartbeat
visibility
scroll
click
outbound_click
pageleave
connection_change
```

are suppressed by the current notification rules.

Telegram notification delivery is a **Worker-to-Telegram** request. It is not another telemetry request generated by the visitor's browser.

---

# 25. Telegram setup

The protected setup/test endpoints are:

```http
GET /telegram/setup
GET /telegram/test
```

They require the Worker admin key:

```http
X-Admin-Key: YOUR_ADMIN_KEY
```

The Telegram webhook is:

```http
POST /telegram/webhook
```

The webhook can validate:

```http
X-Telegram-Bot-Api-Secret-Token
```

Do not expose the bot token or admin key in GitHub Pages JavaScript.

---

# 26. GitHub archive

When GitHub archiving is enabled, events are stored as individual repository files:

```text
data/platforms/<platformId>/events/YYYY/MM/DD/<timestamp>_<eventId>.json
```

Example:

```text
data/platforms/my-website/events/2026/10/02/2026-10-02T09-30-00Z_event-0001.json
```

D1 is the live relational storage layer.

GitHub is the browsable file-level historical archive.

If D1 stores an event but GitHub archiving fails, the event is not silently removed from D1. Archive state is tracked and an administrator can retry the archive operation.

---

# 27. Health checks

Cheap health check:

```http
GET /v1/health?quick=1
```

Full health check:

```http
GET /v1/health
```

GitHub probe:

```http
GET /v1/health?probe=github
```

Use `quick=1` for frequent monitoring to avoid unnecessary database work.

---

# 28. API discovery for AI agents

This section is intentionally deterministic so that another AI can integrate the repository without guessing.

## AI rule 1 — discover the live contract first

Always call:

```http
GET https://github-page-insights-worker.game-developer-mb.workers.dev/v1/schema
```

Repository copies are available at:

```text
docs/api-schema.json
docs/openapi.yaml
```

The live Worker contract should be treated as the runtime source of truth.

## AI rule 2 — identify the platform with `platformId`

Every sender needs one stable namespace:

```text
platformId
```

Do not create a second Worker for every website.

## AI rule 3 — write with `POST /v1/events`

```http
POST /v1/events
Content-Type: application/json
```

Minimum:

```json
{"platformId":"my-platform"}
```

Recommended:

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "web",
  "eventType": "custom",
  "eventId": "stable-event-id",
  "identity": {
    "visitorId": "visitor-123",
    "sessionId": "session-123"
  },
  "data": {
    "applicationSpecificField": "value"
  }
}
```

## AI rule 4 — use a stable eventId for retries

For the same logical event:

```text
same eventId → safe retry / duplicate protection
new eventId  → new event
```

## AI rule 5 — discover the resulting platform

```http
GET /v1/platforms
```

Then find:

```text
platformId = your chosen ID
```

## AI rule 6 — read basic platform analytics

```http
GET /v1/platforms/<platformId>?days=7&lite=1
```

## AI rule 7 — read advanced analytics only when needed

```http
GET /v1/platforms/<platformId>?days=7
```

## AI rule 8 — read raw event records separately

```http
GET /v1/platforms/<platformId>/events?days=7&limit=100
```

## AI rule 9 — read visitor-centric data separately

```http
GET /v1/platforms/<platformId>/visitors?limit=100
```

## AI rule 10 — use global endpoints for cross-platform analytics

Basic:

```http
GET /v1/overview?days=7&lite=1
```

Advanced:

```http
GET /v1/overview?days=7
```

## AI rule 11 — never put secrets in browser code

Never add these to a public website:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
D1 credentials
```

## AI rule 12 — do not confuse client IP and platform IP

```text
ip          = incoming client/visitor IP observed by Worker
platformIp  = IP explicitly supplied by the sending platform
```

## AI rule 13 — do not infer data from a missing field

Optional data may be null or absent because:

```text
browser did not expose it
Cloudflare did not provide it for that request
sender did not supply it
```

A missing optional value is not automatically an API failure.

## AI rule 14 — use `requestId` when debugging

Keep:

```text
requestId
eventId
platformId
```

from write responses and error responses.

---

# 29. AI integration recipe — website

An AI modifying another repository should perform exactly this workflow:

```text
1. Choose a stable platformId.
2. Add PAGE_INSIGHTS_CONFIG.
3. Load analytics.js.
4. Do not add secrets.
5. Deploy the website.
6. Open it once.
7. Call GET /v1/platforms.
8. Confirm the platformId exists.
9. Call GET /v1/platforms/<platformId>?days=7&lite=1.
10. If event-level information is needed, call /events.
11. If visitor-level information is needed, call /visitors.
12. Use the full overview/platform endpoint only when advanced aggregates are required.
```

Do not invent new database tables, Worker endpoints, or another analytics backend.

---

# 30. AI integration recipe — backend / API / Python

For a backend application:

```text
1. Choose a stable platformId.
2. POST each logical event to /v1/events.
3. Use a stable eventId when retrying.
4. Keep the response requestId for diagnostics.
5. Discover the platform via /v1/platforms.
6. Read aggregates from /v1/platforms/<platformId>.
7. Read raw events from /events when event-level data is needed.
8. Put application-specific fields in data/metadata.
```

The backend does not need to know the D1 schema.

It should not directly manipulate the D1 database.

---

# 31. Read endpoint examples in Python

```python
import requests

WORKER = "https://github-page-insights-worker.game-developer-mb.workers.dev"
PLATFORM = "my-website"

# 1. Discover platforms
platforms = requests.get(
    f"{WORKER}/v1/platforms",
    timeout=15,
).json()

# 2. Read lightweight platform analytics
stats = requests.get(
    f"{WORKER}/v1/platforms/{PLATFORM}",
    params={"days": 7, "lite": 1},
    timeout=15,
).json()

print("Visitors:", stats["totals"]["uniqueVisitors"])
print("Pageviews:", stats["totals"]["views"])
print("Sessions:", stats["totals"]["sessions"])

# 3. Read recent events
recent = requests.get(
    f"{WORKER}/v1/platforms/{PLATFORM}/events",
    params={"days": 7, "limit": 100},
    timeout=15,
).json()

print("Recent events:", recent["events"])

# 4. Read visitors
visitors = requests.get(
    f"{WORKER}/v1/platforms/{PLATFORM}/visitors",
    params={"limit": 100},
    timeout=15,
).json()

print("Visitors:", visitors["visitors"])
```

---

# 32. Common mistakes

## Mistake: using a new platformId on every request

Bad:

```text
website-2026-10-02-09-01
website-2026-10-02-09-02
website-2026-10-02-09-03
```

Good:

```text
website
```

The platform ID is a stable namespace, not an event ID.

## Mistake: generating a new eventId when retrying

Bad:

```text
retry → event-002
retry → event-003
retry → event-004
```

Good:

```text
original → event-001
retry    → event-001
```

## Mistake: putting secrets in the website

Never expose:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
```

## Mistake: reading advanced analytics for every tiny UI update

Prefer:

```http
/v1/overview?days=7&lite=1
/v1/platforms/<id>?days=7&lite=1
```

Then request advanced data only when the user actually opens an advanced view.

## Mistake: confusing events with visitors

These are different:

```text
Events       = total telemetry records
Pageviews    = events with eventType=pageview
Visitors     = distinct visitor identities
Sessions     = distinct session identities
```

A website can have:

```text
100 events
10 pageviews
4 visitors
5 sessions
```

Those values do not need to match.

---

# 33. Error handling

Common collector errors:

```text
INVALID_JSON
EMPTY_BODY
INVALID_PAYLOAD
PAYLOAD_TOO_LARGE
PLATFORM_ID_REQUIRED
D1_NOT_CONFIGURED
D1_STORE_FAILED
UNAUTHORIZED
NOT_FOUND
INTERNAL_ERROR
GITHUB_ARCHIVE_FAILED
```

HTTP semantics:

```text
201  new event stored in D1
202  accepted/stored but an aggregate or dependency condition is degraded
200  duplicate eventId; existing event was not inserted again
400  invalid input
401  admin/platform authentication failure
413  request body too large
503  required dependency/configuration unavailable
```

Always log:

```text
HTTP status
error code
requestId
platformId
(eventId when available)
```

---

# 34. Protected admin endpoints

These are not public read APIs:

```http
GET  /v1/admin/events
GET  /v1/admin/event?id=<eventId>
GET  /v1/admin/notifications
POST /v1/admin/archive-retry/<eventId>
POST /v1/admin/platform-key
```

They require:

```http
X-Admin-Key: YOUR_ADMIN_KEY
```

Never call them from a public browser application where the key would be exposed.

---

# 35. Optional platform API keys

The Worker can enforce per-platform API keys when:

```text
REQUIRE_PLATFORM_KEY=true
```

Clients then use one of:

```http
X-Platform-Key: YOUR_PLATFORM_KEY
```

or:

```http
X-API-Key: YOUR_PLATFORM_KEY
```

For a public website where anyone can load the page, do not enable a secret that would have to be embedded in client-side JavaScript. Use platform keys for server-to-server integrations where the key can remain private.

---

# 36. Rate / volume philosophy

The service is intentionally designed around low-frequency useful requests.

For a normal browser website:

```text
Basic:
1 pageview request per page load
```

High-frequency telemetry is optional:

```text
click
scroll
visibility
heartbeat
connection_change
```

The dashboard also separates lighter queries from advanced aggregates:

```text
Basic / lite  → low-cost normal dashboard data
Advanced      → extra aggregates only when needed
```

This matters especially for Cloudflare D1 usage. Free-plan limits are daily row-read and row-write allowances; unnecessary polling and high-frequency telemetry can consume those allowances faster than useful pageview collection.

For high-volume deployments, review Cloudflare's current D1 limits and your account plan before enabling frequent event streams.

---

# 37. Data storage model

The main D1 tables are:

```text
platforms
    platform-level aggregate/state

platform_visitors
    visitor-centric state

platform_sessions
    session-centric state

events
    event-level normalized telemetry

event_archives
    GitHub archive state

notification_log
    Telegram notification state
```

The current project keeps the established schema 9.0 contract.

The `events` table has 96 columns and is intentionally kept below D1's documented column limit.

Variable application data belongs in JSON fields rather than new columns for every custom property.

---

# 38. Privacy and sensitive information

This project is capable of storing raw IP addresses and IP-derived geolocation information.

Operators are responsible for deciding whether that data collection is appropriate for their users, jurisdiction, privacy notice, retention policy, and access controls.

The Worker also sanitizes/redacts sensitive headers and secrets before storing request/payload snapshots.

Never intentionally send:

```text
passwords
API secrets
access tokens
cookies
authorization headers
private keys
payment-card data
```

inside `data`, `metadata`, or custom event fields.

---

# 39. GitHub Pages dashboard

The dashboard is in:

```text
docs/
```

It communicates with the Worker API and does not require GitHub credentials in frontend code.

Current dashboard goals include:

```text
platform discovery
lightweight overview
advanced analytics
visitor information
session information
IP intelligence
country / region / city
browser / OS / device
traffic trends
top pages
sources / referrers
event types
HTTP statuses
recent events
event inspection
API playground
health status
responsive UI
dark glass UI
```

Basic dashboard calls should prefer `lite=1` where possible.

---

# 40. Dashboard configuration

Public configuration is in:

```text
docs/config.js
```

Example:

```js
window.PAGE_INSIGHTS_CONFIG = {
  workerUrl: "https://github-page-insights-worker.game-developer-mb.workers.dev",
  dashboardUrl: "https://mehrdadmb2.github.io/github-page-insights/",
  analyticsUrl: "https://mehrdadmb2.github.io/github-page-insights/analytics.js",
  platformId: "github-page-insights-dashboard",
  platformName: "GitHub Page Insights Dashboard",
  platformType: "web-dashboard",
  environment: "production",
  appVersion: "12.1.0",
  autoRefreshMs: 300000,
  healthRefreshMs: 300000,
  requestTimeoutMs: 12000,
  recentLimit: 60,
  defaultRangeDays: 7,
  advanced: false,
  trackPageLeave: false,
  periodicQueueFlush: false,
  showRawIp: true,
  showPlatformIp: true
};
```

No secret belongs in this file.

---

# 41. Machine-readable API contract

Use these files when integrating tools or AI systems:

```text
docs/api-schema.json
docs/openapi.yaml
```

Runtime contract:

```http
GET /v1/schema
```

The API reports:

```text
contractVersion
workerVersion
databaseSchema
endpoints
required fields
recommended payload
error codes
response semantics
```

When documentation and the deployed API ever disagree, use the live `/v1/schema` response as the runtime reference and then correct the repository documentation.

---

# 42. Backward-compatible routes

New integrations should use `/v1/*`.

Compatibility aliases still exist.

Collector:

```http
POST /v1/events
POST /v1/collect
POST /collect
```

Platforms:

```http
GET /v1/platforms
GET /api/platforms
GET /api/sites
```

Overview:

```http
GET /v1/overview
GET /api/overview
```

Stats:

```http
GET /v1/stats
GET /api/stats
```

Health:

```http
GET /health
GET /v1/health
GET /api/health
GET /api/system-health
```

Use compatibility routes only when maintaining an older integration.

---

# 43. Deployment model

GitHub Pages:

```text
GitHub repository
    ↓
GitHub Actions
    ↓
docs/
    ↓
GitHub Pages
```

Cloudflare Worker:

```text
Local Windows machine
    ↓
Wrangler
    ↓
Cloudflare Worker
```

The Worker is intentionally not deployed by GitHub Actions and the repository is not dependent on Cloudflare Workers Builds.

Typical Worker deployment:

```powershell
npm install
npx wrangler login --use-keyring
npx wrangler whoami
npm run check
npx wrangler deploy
```

---

# 44. Troubleshooting checklist

## Website sends nothing

Check:

```text
workerUrl is correct
platformId is stable
analytics.js loads
browser console has no blocking error
POST /v1/events returns 201/202/200
```

Then:

```http
GET /v1/platforms
```

## Platform exists but dashboard looks empty

Call directly:

```http
GET /v1/platforms/<platformId>?days=7&lite=1
```

Then:

```http
GET /v1/platforms/<platformId>/events?days=7&limit=20
```

If those contain data, the issue is dashboard-side rather than ingestion-side.

## IP is empty

Check the event was actually received through the deployed Worker and not through a mock/local runtime.

`ip` comes from the incoming request. `platformIp` exists only when the sender supplies it.

## Geo fields are empty

Some request enrichment fields are optional. Verify the event reached the Cloudflare Worker and inspect the raw event.

Do not assume an empty city/latitude/longitude means the request was not stored.

## Telegram is not sending

Check Worker secrets:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
```

Check:

```text
TELEGRAM_ENABLED != false
```

Then use the protected test endpoint with the admin key.

## GitHub archive is missing

D1 storage and GitHub archiving are separate operations.

Check the event first:

```http
GET /v1/platforms/<platformId>/events?days=7&limit=20
```

Then inspect the archive state through the admin tools.

## Many events appear unexpectedly

Check whether Advanced browser telemetry was enabled:

```text
trackClicks
trackScroll
trackVisibility
heartbeat
periodicQueueFlush
trackPageLeave
```

Basic mode should not continuously emit these signals.

## API returns 503 after heavy testing

Check Cloudflare D1 usage and Worker/D1 health. Daily free-plan read/write allowances can be exhausted by high-frequency telemetry and repeated broad queries.

---

# 45. Recommended integration order

For a human:

```text
1. Add the website SDK.
2. Open the site once.
3. GET /v1/platforms.
4. GET /v1/platforms/<id>?days=7&lite=1.
5. Open advanced analytics only when required.
```

For an AI:

```text
1. GET /v1/schema.
2. Choose a stable platformId.
3. POST /v1/events.
4. Keep eventId stable across retries.
5. GET /v1/platforms.
6. GET /v1/platforms/<id>?days=7&lite=1.
7. Use /events, /visitors, /sessions for detailed records.
8. Use the full endpoint only when advanced aggregates are needed.
9. Never expose secrets.
```

For a backend service:

```text
same Worker
same POST endpoint
same read endpoints
separate platformId
```

---

# 46. Project structure

```text
github-page-insights/
│
├── data/
│   └── platforms/
│       └── <platformId>/
│           └── events/
│               └── YYYY/MM/DD/*.json
│
├── db/
│   ├── schema.sql
│   ├── schema-v9.sql
│   └── UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql
│
├── docs/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── analytics.js
│   ├── config.js
│   ├── connect.html
│   ├── api-schema.json
│   └── openapi.yaml
│
├── worker/
│   └── index.js
│
├── scripts/
├── tests/
├── wrangler.jsonc
├── package.json
└── README.md
```

---

# 47. Version information

Current project release:

```text
Worker:          12.1.0
Contract:        4.1
D1 schema:       9.0
Events columns:  96
Deployment:      manual Wrangler
Cron required:   no
```

---

# 48. The simplest possible mental model

Think of the system as four operations:

```text
WRITE
POST /v1/events

DISCOVER
GET /v1/platforms

READ ONE
GET /v1/platforms/<platformId>?days=7&lite=1

READ DETAILS
GET /v1/platforms/<platformId>/events
GET /v1/platforms/<platformId>/visitors
GET /v1/platforms/<platformId>/sessions
```

Everything else is optional/advanced.

That is the intended integration model.
