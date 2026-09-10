# GitHub Page Insights

A modular analytics stack for GitHub Pages using a shared Cloudflare Worker, Cloudflare D1, and optional GitHub archival.

## Architecture

GitHub Pages -> `/collect` -> Cloudflare Worker -> D1 (live analytics) -> Cron -> GitHub repository (`data/sites/<siteId>/events/YYYY-MM-DD.json`)

The public browser never receives the GitHub token. The Worker holds it as a Cloudflare Secret.

## Features

- Dynamic site registration from incoming telemetry; no predefined site-folder list is required.
- Site-specific folders are created on first archive.
- Page views, session heartbeats, page leave, duration and scroll depth.
- Country/region/city/timezone/Cloudflare colo where Cloudflare exposes them.
- Browser, OS, device class, language, screen/viewport and connection hints from the browser.
- IP is hashed by default. Raw IP storage is opt-in by changing `RAW_IP_MODE=raw` and is strongly discouraged for a public repository.
- GitHub archive by site and day.
- Interactive dashboard powered by the Worker API.

## Setup

1. Create a Cloudflare D1 database named `github-page-insights`.
2. Put its ID into `worker/wrangler.toml`.
3. Set `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` in `wrangler.toml`.
4. Create a fine-grained GitHub token with `Contents: Read and write` only for the analytics repository.
5. Add it to the Worker as a secret:

```bash
npx wrangler secret put GITHUB_TOKEN
```

6. Deploy the Worker.
7. Run the D1 migration through Wrangler.
8. Set `docs/config.js` `workerUrl` to your Worker URL.
9. Add these two tags to every GitHub Page that should report analytics:

```html
<script src="https://YOUR-ANALYTICS-DOMAIN/config.js"></script>
<script src="https://YOUR-ANALYTICS-DOMAIN/analytics.js"></script>
```

Or configure the page directly:

```html
<meta name="page-insights-site-id" content="my-project">
<meta name="page-insights-site-name" content="My Project">
<script src="https://YOUR-WORKER.workers.dev/analytics/analytics.js"></script>
```

For a GitHub Pages site, the preferred approach is to copy `analytics.js` to that site's own repo and use a local script path.

## Dynamic folders

A page sending:

```json
{"siteId":"portfolio","siteName":"My Portfolio"}
```

will eventually archive into:

```text
data/sites/portfolio/
  meta.json
  events/
    2026-09-10.json
```

A first-time `siteId` automatically creates the corresponding path because GitHub's Contents API accepts arbitrary file paths for create/update operations.

## Important production notes

The public collector cannot be protected by a private token because every browser must be able to call it. Treat `siteId` as an identifier, not a secret. For higher traffic, put Cloudflare WAF/rate limiting in front of the collector and consider a custom ingestion token or Turnstile for controlled clients.

Do not publish raw IP addresses in a public GitHub repository. The default archive stores `ipHash` rather than `ip`.
