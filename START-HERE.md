# Start Here — Universal Event Insights

This is the easiest way to use the project. Ignore the advanced files until the basic path works.

## Connect a website

1. Open the GitHub Pages dashboard and click **Connect a website**.
2. Enter a unique Platform ID and name. Copy the generated snippet.
3. Paste it into the website, open the website once, then press **Test connection**.

That is all. A new platform is created automatically when its first event arrives.

## Read the data

Open the dashboard → **All platforms** → choose the Platform ID.

Start with:

```text
Pageviews
Visitors
Sessions
Events
Last Activity
```

The Basic page already shows the latest visitor snapshot. Open **Advanced** only when you need:

```text
Countries
IP intelligence
Browser / OS / Device
Top pages
Sources
Event types
HTTP status
```

## Correct meaning of the numbers

- **Pageviews** = pageview events.
- **Visitors** = unique visitor IDs.
- **Sessions** = unique session IDs.
- **Events** = every stored telemetry event.

A single visitor can create several pageviews while still being one visitor and one session. Basic mode sends one request per page load and packs the useful visitor snapshot into that request. It deliberately does not send click, scroll, visibility, page-leave or heartbeat requests unless Advanced telemetry is enabled.

## Add another website

Use the same Worker and D1. Only change:

```text
platformId
platformName
```

Do not create a new Worker or database.

## If the Worker looks dead

Run:

```powershell
Invoke-RestMethod https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health?quick=1
```

Then:

```powershell
Invoke-RestMethod https://github-page-insights-worker.game-developer-mb.workers.dev/v1/platforms
```

If Cloudflare D1 has reached a Free-tier daily row-read or row-write limit, D1 requests can fail until midnight UTC. The data is not deleted by that limit.

## Worker deployment

The Worker is intentionally deployed manually with Wrangler. GitHub Pages remains automatic through GitHub Actions. Current Cloudflare documentation recommends `wrangler.jsonc` as the configuration source of truth.
