WRITE-PATH HOTFIX 11.1.0

Replace these files in the repository:
  docs/index.html
  docs/analytics.js
  docs/config.js
  worker/index.js
  wrangler.jsonc

No D1 schema reset or migration is required.

Basic browser behavior:
  - exactly one POST /v1/events per page load
  - no heartbeat
  - no click events
  - no scroll events
  - no visibility events
  - no pageleave events
  - no periodic queue flush
  - request Content-Type text/plain to avoid an extra CORS preflight

Telegram behavior:
  - auto-enabled when TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID exist
  - explicitly disabled only when TELEGRAM_ENABLED is false/off/disabled
  - notification eligibility is new visitor/new session only

GitHub archive:
  - unchanged endpoint/path architecture
  - event is archived by Worker using GITHUB_TOKEN when archive is enabled
