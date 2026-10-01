# راهنمای سریع Windows + Wrangler — Universal Event Insights v11

این نسخه Worker را از GitHub به Cloudflare خودکار Deploy نمی‌کند. Worker فقط با Wrangler از Windows مدیریت می‌شود.

## نصب

```powershell
npm install
npx wrangler --version
npx wrangler login --use-keyring
npx wrangler whoami
```

## تنظیم D1

```powershell
npx wrangler d1 list
.\scripts\windows\02-sync-d1-id.ps1
```

اگر D1 وجود ندارد:

```powershell
npx wrangler d1 create github-page-insights --binding DB --update-config --use-remote
```

## نصب Schema

برای Fresh Reset (مخرب):

```powershell
npx wrangler d1 execute github-page-insights --remote --file=./db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql --yes
```

## Secrets

```powershell
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_KEY
```

## بررسی و Deploy

```powershell
npm run check
npx wrangler deploy --dry-run
npx wrangler deploy
```

## Log

```powershell
npx wrangler tail github-page-insights-worker
```

## تست

```powershell
.\scripts\windows\08-smoke-test.ps1
```

مرجع کامل: `SETUP-MANUAL-WRANGLER-WINDOWS-FA.md`
