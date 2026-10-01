# راه‌اندازی نهایی — GitHub ↔ Cloudflare Workers Builds ↔ D1 ↔ GitHub Pages

این پروژه طوری تنظیم شده که بعد از اتصال یک‌باره Worker به GitHub، تغییرات کد Worker با Push به `main` از طریق **Cloudflare Workers Builds** ساخته و Deploy شوند.

## 1. ساختار اصلی

```text
GitHub repository
      │
      ├── worker/index.js
      ├── wrangler.jsonc
      ├── package.json
      └── docs/
             │
             └── GitHub Pages

Cloudflare Workers Builds
      │
      └── github-page-insights-worker
              │
              └── D1 → github-page-insights
```

## 2. نکته بسیار مهم: جلوگیری از حلقه Build

Worker داخل همان repository برای هر Event یک فایل می‌سازد:

```text
data/platforms/<platformId>/events/YYYY/MM/DD/*.json
```

بنابراین Worker نباید با تغییر `data/` دوباره Build شود.

در Cloudflare:

```text
Workers & Pages
→ github-page-insights-worker
→ Settings
→ Builds
→ Build watch paths
```

### Include paths

```text
worker/*
wrangler.jsonc
package.json
package-lock.json
scripts/*
```

### Exclude paths

```text
data/*
docs/*
db/*
tests/*
.github/*
README.md
*.md
LICENSE
```

Cloudflare مستند کرده که Build Watch Paths برای محدودکردن فایل‌هایی است که Build را Trigger می‌کنند و excludeها قبل از include بررسی می‌شوند.

Reference:

https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/

## 3. Build settings

```text
Git repository:
mehrdadmb2/github-page-insights

Production branch:
main

Root directory:
/

Build command:
npm run check

Deploy command:
npx wrangler deploy

Preview command:
npx wrangler preview
```

Cloudflare می‌گوید Worker name در Dashboard باید با `name` داخل Wrangler config یکسان باشد.

در پروژه:

```text
github-page-insights-worker
```

## 4. D1

در Windows:

```powershell
npx wrangler login --use-keyring
npx wrangler whoami
npx wrangler d1 list
```

`database_id` دیتابیس `github-page-insights` را در `wrangler.jsonc` وارد کن.

سپس Schema:

```powershell
npx wrangler d1 execute github-page-insights --remote --file=./db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql --yes
```

## 5. Secrets

```powershell
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_KEY
```

Telegram بعداً:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_ADMIN_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

## 6. اولین Deploy دستی

برای اینکه اتصال اولیه را سریع تست کنیم:

```powershell
npm install
npm run check
npx wrangler deploy
```

بعد از آن، اگر Workers Builds صحیح باشد، Deployهای معمولی از Push به GitHub انجام می‌شوند.

## 7. Health

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health
```

با GitHub probe:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health?probe=github
```

## 8. API schema

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/schema
```

باید اعلام کند:

```text
workerVersion = 10.2.1
databaseSchema = 9.0
eventColumnCount = 96
```

## 9. GitHub Pages

در:

```text
Repository
→ Settings
→ Pages
→ Source
→ GitHub Actions
```

Workflow:

```text
.github/workflows/pages.yml
```

این workflow فقط تغییرات `docs/**` را Deploy می‌کند.

## 10. تست Event

```powershell
$Worker = "https://github-page-insights-worker.game-developer-mb.workers.dev"
$Body = @{
  platformId = "setup-test"
  platformName = "Setup Test"
  platformType = "test"
  eventType = "setup_test"
  eventId = [guid]::NewGuid().ToString()
  data = @{ source = "wrangler" }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "$Worker/v1/events" -Method POST -ContentType "application/json" -Body $Body
```

بعد:

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT id,platform_id,event_type,ip,country,city FROM events ORDER BY rowid DESC LIMIT 5;"
```

## 11. مسیر عیب‌یابی

اگر Build شکست خورد:

```text
Cloudflare
→ Worker
→ Builds
→ آخرین Build
```

اگر Worker بالا است ولی D1 خراب است:

```text
/v1/health
```

اگر Event در D1 هست ولی GitHub نیست:

```text
/v1/health?probe=github
```

و:

```sql
SELECT * FROM event_archives ORDER BY created_at DESC LIMIT 20;
```

برای retry:

```http
POST /v1/admin/archive-retry/<eventId>
```
