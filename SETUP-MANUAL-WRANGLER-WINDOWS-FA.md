# راه‌اندازی نهایی — GitHub + GitHub Pages + Cloudflare D1/Worker با Wrangler دستی

این نسخه عمداً **به Cloudflare Workers Builds متصل نیست**. GitHub فقط محل نگهداری سورس، Dashboard و آرشیو Eventهاست. Worker با Wrangler از Windows منتشر می‌شود.

## معماری

```text
GitHub Repository
├── worker/             ← کد Worker
├── wrangler.jsonc      ← منبع حقیقت تنظیمات Wrangler
├── db/                 ← Schema و SQL
├── docs/               ← GitHub Pages Dashboard
└── data/platforms/     ← آرشیو Eventها

Windows PowerShell
        ↓
     Wrangler
        ↓
Cloudflare Worker + D1
```

## 1) Disconnect Workers Builds

Cloudflare Dashboard → Workers & Pages → `github-page-insights-worker` → Settings → Builds → Disconnect.

بعد از Disconnect، این Worker دیگر از Pushهای GitHub Deploy نمی‌شود.

## 2) GitHub

کل فایل‌های این پروژه را در repository قرار بده. Secret واقعی را Commit نکن.

GitHub Pages همچنان با `.github/workflows/pages.yml` منتشر می‌شود؛ تغییرات `docs/**` آن را اجرا می‌کند.

## 3) Windows

```powershell
cd D:\Projects\github-page-insights
npm install
npx wrangler --version
npx wrangler login --use-keyring
npx wrangler whoami
```

## 4) D1

لیست:

```powershell
npx wrangler d1 list
```

اگر دیتابیس موجود است:

```powershell
.\scripts\windows\02-sync-d1-id.ps1
```

اگر وجود ندارد:

```powershell
npx wrangler d1 create github-page-insights --binding DB --update-config --use-remote
```

Cloudflare برای `d1 create` و `d1 execute --remote` همین Wrangler workflow را مستند کرده است:
https://developers.cloudflare.com/d1/wrangler-commands/

## 5) Fresh database در صورت نیاز

**مخرب است.** فقط وقتی داده قبلی مهم نیست:

```powershell
npx wrangler d1 execute github-page-insights --remote --file=./db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql --yes
```

Backup قبل از reset:

```powershell
npx wrangler d1 export github-page-insights --remote --output=./backups/d1-backup.sql
```

## 6) Secrets

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

`wrangler secret put` یک نسخه جدید Worker ایجاد و Deploy می‌کند؛ مقدار Secret در GitHub ذخیره نمی‌شود:
https://developers.cloudflare.com/workers/configuration/secrets/

## 7) Validation

```powershell
npm run check
npx wrangler deploy --dry-run
```

اگر این دو موفق بودند:

```powershell
npx wrangler deploy
```

## 8) Smoke test

```powershell
.\scripts\windows\08-smoke-test.ps1
```

یا:

```powershell
Invoke-RestMethod https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health
Invoke-RestMethod https://github-page-insights-worker.game-developer-mb.workers.dev/v1/schema
Invoke-RestMethod https://github-page-insights-worker.game-developer-mb.workers.dev/v1/platforms
```

## 9) GitHub archive

Eventها در D1 ذخیره می‌شوند و سپس در مسیر زیر به GitHub Archive می‌روند:

```text
data/platforms/<platformId>/events/YYYY/MM/DD/<timestamp>_<eventId>.json
```

تغییر این `data/` نباید Worker را Deploy کند، چون دیگر Workers Builds متصل نیست.

## 10) GitHub Pages

Repository → Settings → Pages → Source = GitHub Actions.

فایل workflow:

```text
.github/workflows/pages.yml
```

Dashboard:

```text
docs/
```

## 11) توسعه روزمره

تغییر Worker:

```powershell
npm run check
npx wrangler deploy
```

تغییر Dashboard فقط GitHub:

```text
docs/* → Commit → GitHub Actions → GitHub Pages
```

Tail:

```powershell
npx wrangler tail github-page-insights-worker
```

## 12) نکته مهم درباره config

فایل اصلی:

```text
wrangler.jsonc
```

تنها مقدار شخصی که باید یک بار تنظیم شود:

```json
"database_id": "YOUR_D1_DATABASE_ID"
```

این ID راز نیست. Tokenها راز هستند.

## 13) منابع رسمی

- Wrangler: https://developers.cloudflare.com/workers/wrangler/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- D1 Wrangler commands: https://developers.cloudflare.com/d1/wrangler-commands/
- D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Worker secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Manual Worker deployment: https://developers.cloudflare.com/workers/get-started/guide/
