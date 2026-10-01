## 10.2.1 — 2026-10-01

- Fixed Cloudflare Workers Builds failure when the Build command was incorrectly set to `auto`.
- Added `npm run build` as the canonical build command.
- Added a compatibility `auto` executable backed by the repository build checks.
- Kept GitHub archive commits isolated from Worker builds through Watch Path guidance.

# Changelog

## 10.2.1 — 2026-10-01

### Reliability
- Worker/D1 schema contract is checked before deployment.
- Event ingestion stores in D1 before background archive/notification work.
- Duplicate `eventId` submissions are idempotent.
- GitHub archive writes use per-event paths with conflict/retry handling.
- Sensitive request headers and payload keys are redacted from stored snapshots.
- Health checks compare the live D1 table shape against the Worker contract.

### CI/CD
- Cloudflare Workers Builds configuration is documented with watch-path exclusions so `data/*` archive commits do not trigger Worker rebuild loops.
- GitHub Pages is deployed by a dedicated workflow listening only to `docs/**` and its workflow changes.

### API / Dashboard
- Universal `platformId` model.
- Rich event schema with 96 normalized event columns plus extensible JSON.
- Browser SDK and dashboard use the same Worker contract.
- OpenAPI 3.1 specification is included at `docs/openapi.yaml`.
- AI integration guide is included in `AI-INTEGRATION.md`.
