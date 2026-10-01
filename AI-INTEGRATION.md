# AI Integration Guide — Universal Event Insights

This file is intended for coding agents, AI assistants and automated integration tools.

## 1. Authoritative source

Always start from:

```http
GET https://github-page-insights-worker.game-developer-mb.workers.dev/v1/schema
```

Do not infer endpoint names, field names, response shapes or authentication rules from an old README, memory, or a previous generated integration.

Repository copies of the contract are:

```text
docs/api-schema.json
docs/openapi.yaml
```

The runtime endpoint is authoritative when it differs from a stale local copy.

## 2. Integration sequence

```text
GET /v1/schema
        ↓
read identityField
        ↓
choose stable platformId
        ↓
POST /v1/events
        ↓
save requestId + eventId
        ↓
GET /v1/platforms/<platformId>
        ↓
verify totals/recentEvents
```

## 3. Minimal event

```json
{
  "platformId": "my-platform"
}
```

## 4. Safe recommended event

```json
{
  "platformId": "my-platform",
  "platformName": "My Platform",
  "platformType": "web",
  "eventType": "custom",
  "eventId": "stable-id-for-retries",
  "identity": {
    "visitorId": "visitor-123",
    "sessionId": "session-123"
  },
  "data": {
    "applicationSpecificField": "value"
  },
  "metadata": {
    "environment": "production"
  }
}
```

## 5. Rules for AI-generated clients

1. Use `platformId` as the stable namespace.
2. Do not hard-code a list of platforms into the Worker.
3. Use `eventId` whenever an operation can be retried.
4. Use `eventType` for the event type.
5. Keep application-specific data inside `data` and `metadata`.
6. Never put secrets into analytics payloads.
7. Never put `GITHUB_TOKEN`, `ADMIN_KEY`, Telegram tokens, database credentials or cookies into frontend source code.
8. Treat `/v1/admin/*` as backend-only.
9. Use `/v1/schema` before modifying generated integration code.
10. Do not change the Worker merely to add a new platform namespace.

## 6. Common mappings

```text
platformId       ← platform_id
platformName     ← platform_name
platformType     ← platform_type
eventType        ← event_type / eventName / event_name
eventId          ← event_id
visitorId        ← visitor_id
sessionId        ← session_id
userId           ← user_id
pageUrl          ← page_url
platformIp       ← platform_ip
```

Nested forms are also supported for common structures.

## 7. Verification

A successful creation normally returns:

```text
201
```

A duplicate event ID normally returns:

```text
200
```

An accepted event with degraded aggregate processing can return:

```text
202
```

Always retain:

```text
requestId
eventId
platformId
```

for diagnostic correlation.
