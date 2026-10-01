# Changelog

## 11.0.0 — Manual Wrangler deployment

- Removed Cloudflare Workers Builds integration from the repository workflow.
- Removed `tools/cloudflare-auto-build` and all `auto` build compatibility code.
- Worker deployment is now manual via Wrangler on Windows.
- Added stronger local preflight validation.
- Added D1 ID synchronization helper.
- Added dry-run deployment step.
- Kept GitHub Pages deployment through GitHub Actions.
- Fixed duplicate `headersJson` projection in recent event reads.
- Adjusted Telegram eligibility so event mode can notify every eligible non-heartbeat event.
- Updated Worker/browser SDK/API documentation version to 11.0.0.
