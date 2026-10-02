# Validation Report — Universal Event Insights v12

## Result

```text
worker       12.1.0
D1 schema    9.0
events       96 columns
runtime      PASS
GitHub Pages PASS (static contract)
```

## Checks performed

- `node --check worker/index.js`
- `node --check docs/app.js`
- `node --check docs/analytics.js`
- `node --check docs/config.js`
- package version / Wrangler contract
- Worker ↔ D1 column alignment
- SQLite execution of the reference schema and console DDL
- sample event collection
- duplicate event idempotency
- `/v1/schema`
- `/v1/health`
- `/v1/health?quick=1`
- `/v1/overview?days=7&lite=1`
- `/v1/overview?days=7`
- `/v1/platforms/<id>?days=7&lite=1`
- malformed URL encoding
- Basic browser SDK startup behavior
- GitHub Pages DOM ↔ JavaScript ID consistency
- GitHub Pages files contain no Arabic/Persian script

## Important runtime behavior

The dashboard's Basic mode uses low-cost API reads. Advanced analytics are requested only after the user opens Advanced.

The browser SDK's Basic mode does not emit click, scroll, visibility or heartbeat telemetry.
