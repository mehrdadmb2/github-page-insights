# 🌌 Universal Event Insights v8

A request-driven, multi-platform telemetry and event API for websites, GitHub Pages, APIs, Telegram bots, mobile/web apps, Python scripts, SaaS products, internal tools and custom clients.

## Core architecture

`ANY CLIENT → Cloudflare Worker → D1 + GitHub archive + Telegram notification`

No Cron or Scheduled Trigger is required for collection. Each `POST /v1/events` is processed immediately.

## Worker

https://github-page-insights-worker.game-developer-mb.workers.dev

## Primary collector

`POST /v1/events`

Only `platformId` is required. The request can also supply platform metadata, identity, page information, browser/device details, screen/viewport, network data, custom application payloads and more.

## Data retention design

The D1 `events` table uses 99 normalized columns for common telemetry and stores flexible details in JSON columns: `data_json`, `metadata_json`, `headers_json`, `cf_json`, `request_json`, `payload_json`, `raw_event_json`. This avoids changing the SQL schema whenever a new client adds a custom field.

The Worker stores the caller/client IP in `events.ip` when Cloudflare exposes it and stores the SHA-256 hash in `events.ip_hash`. A platform/server IP is not automatically knowable from a browser request; clients that know their own service IP can send `platformIp`, which is stored separately in `events.platform_ip`.

Credential-like fields are redacted before JSON persistence, including Authorization, Cookie, API-key/token/secret/password style fields.

Cloudflare `request.cf` can provide request geolocation and network metadata such as country/region/city, ASN, latitude/longitude, timezone, colo, TLS and RTT values when available. The complete available `request.cf` object is preserved in `cf_json` (subject to size limits).

## D1 tables

- `schema_meta`
- `platforms`
- `platform_visitors`
- `platform_sessions`
- `events`
- `event_archives`
- `notification_log`

## Cloudflare D1 Console installation

Use `db/console/` and execute every numbered SQL file separately. Do not paste the entire directory into one query. Do not use `BEGIN TRANSACTION` or `COMMIT` in the D1 Console.

Order:

1. `01-07` reset old tables
2. `08-14` create all tables
3. index files
4. seed files
5. verification files

The Worker itself uses `DB.batch()` for grouped writes. Cloudflare documents D1 batch operations as transactional at the batch level.

## GitHub archive

Each event is archived immediately at:

`data/platforms/<platformId>/events/YYYY/MM/DD/<timestamp>_<eventId>.json`

The archive includes the normalized event plus storage diagnostics.

## API endpoints

- `POST /v1/events`
- `GET /v1/platforms`
- `GET /v1/platforms/<platformId>`
- `GET /v1/platforms/<platformId>/events`
- `GET /v1/platforms/<platformId>/visitors`
- `GET /v1/platforms/<platformId>/sessions`
- `GET /v1/overview`
- `GET /v1/health`
- `GET /v1/schema`
- `GET /v1/admin/events` — `X-Admin-Key`
- `GET /v1/admin/event?id=...` — `X-Admin-Key`
- `POST /v1/admin/archive-retry/<eventId>` — `X-Admin-Key`
- `POST /telegram/webhook`
- `GET /telegram/setup` — `X-Admin-Key`
- `GET /telegram/test` — `X-Admin-Key`

## Recommended event

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "web",
  "environment": "production",
  "appVersion": "2.4.1",
  "sdkName": "universal-event-insights-js",
  "sdkVersion": "8.0.0",
  "eventType": "pageview",
  "eventId": "client-event-id",
  "timestamp": "2026-09-21T11:00:00.000Z",
  "platformIp": "203.0.113.10",
  "identity": {
    "userId": "user-123",
    "visitorId": "visitor-123",
    "sessionId": "session-123",
    "anonymousId": "anon-123"
  },
  "page": {
    "url": "https://example.com/dashboard",
    "path": "/dashboard",
    "title": "Dashboard",
    "referrer": "https://google.com/"
  },
  "screen": {"width":1920,"height":1080,"devicePixelRatio":1,"colorDepth":24},
  "viewport": {"width":1500,"height":900},
  "connection": {"type":"4g","rtt":40,"downlink":20,"saveData":false},
  "data": {"action":"opened-dashboard"},
  "metadata": {"tenant":"demo"}
}
```

## Browser SDK

`docs/analytics.js` automatically emits pageview, heartbeat, visibility, scroll/click/outbound events and preserves client identifiers.

## Telegram

Secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`.

Variables: `TELEGRAM_ENABLED=true`, `TELEGRAM_NOTIFY_MODE=visitor`.

The bot is notification-only for telemetry, and Telegram commands are restricted to the configured admin chat.

## Security notes

The collector can remain public when `REQUIRE_PLATFORM_KEY=false`. For production platforms that need stronger authenticity, assign a per-platform key with the admin API and enable `REQUIRE_PLATFORM_KEY=true`. Never expose GitHub or Telegram secrets in frontend code.

## Cloudflare D1 limits relevant to this design

The event table stays below D1's 100-column table limit and the event insert stays below D1's 100 bound-parameter/query limit. JSON columns are used for extensibility rather than endlessly adding SQL columns.
