# Security and Privacy Notes

Universal Event Insights is a telemetry system. It can intentionally store detailed request/client metadata, including raw IP addresses when available.

## Never commit secrets

Do not commit:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
platform API keys
application credentials
```

Store Worker runtime secrets with Cloudflare Secrets / Wrangler.

## Sensitive headers

The Worker redacts or omits common secret-bearing headers from stored header snapshots, including:

```text
Authorization
Cookie
Set-Cookie
X-API-Key
X-Platform-Key
X-Admin-Key
Token
Secret
Password
```

This is defense-in-depth, not a guarantee that arbitrary business payloads are safe. Do not deliberately send credentials as analytics data.

## Raw IP

The system stores:

```text
ip
ip_hash
```

Raw IP visibility should be restricted to trusted operators. The public read API currently exposes rich event fields by design; if your deployment is multi-tenant or handles sensitive traffic, place the API behind an appropriate access-control layer before exposing it broadly.

## GitHub archive

GitHub archive files may contain the same telemetry stored by D1. A public repository therefore becomes a public telemetry archive unless repository visibility/access is controlled.

Before enabling archival in a public repository, evaluate whether that is appropriate for your data.

## Data minimization

For high-sensitivity deployments consider:

- disabling GitHub archiving
- reducing geographic precision
- removing user IDs
- shortening retention
- restricting read endpoints
- using platform keys
- separating operator/admin APIs from public APIs

## Incident diagnostics

Use:

```text
requestId
eventId
cf_ray
```

for correlation. Do not paste secret header values into tickets or logs.
