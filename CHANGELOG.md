## 12.1.0 — One-request Basic visitor telemetry

- Basic browser collection is now exactly one `pageview` request per page load under normal operation.
- Removed Basic `pageleave` traffic; page-leave is Advanced-only.
- Disabled periodic queue flushing in Basic mode; queued failures retry on a future page load/online event instead.
- Added client-hints context to the same Basic request when supported by the browser.
- Expanded Telegram new-visitor message with IP geo, coordinates, postal/metro, ASN/organization, POP, device, screen, viewport, language, timezone and network context.
- Added a Basic dashboard visitor snapshot so the rich visitor context is visible without opening Advanced.
- Kept the D1 schema unchanged (events=96 columns).

# Changelog

## 12.0.0 — Reliability + simple mode

- Rebuilt the GitHub Pages dashboard around a strict Basic / Advanced workflow.
- Fixed the repository's dashboard DOM/JavaScript contract mismatch.
- Fixed the dashboard render path so one failed panel cannot blank later panels.
- Added resilient partial loading and last-good-data cache.
- Added low-cost `lite=1` overview/platform reads.
- Added low-cost `quick=1` health checks.
- Added complete advanced aggregates for event types, sources and HTTP status.
- Browser SDK Basic mode now records useful page/session data without high-volume click/scroll/heartbeat events.
- Added a short duplicate pageview guard for accidental double execution.
- Telegram no longer requires a separate enable switch when its required secrets exist; `TELEGRAM_ENABLED=false` remains an explicit disable option.
- Telegram notifications ignore high-volume low-value telemetry events.
- Added `docs/connect.html` with snippet generator and connection checker.
- Kept D1 schema 9.0 and the existing 96-column `events` table; no schema migration is required for this release.
- Worker remains manual Wrangler deployment; GitHub Pages remains GitHub Actions deployment.
