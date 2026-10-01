# راهنمای Windows + Wrangler

این راهنما برای عملیات دستی/پشتیبان است. مسیر عادی Production بعد از اتصال GitHub به Workers Builds باید با Push به `main` انجام شود.

## نصب

Node.js LTS نصب باشد.

بررسی:

```powershell
node --version
npm --version
```

داخل ریشه پروژه:

```powershell
npm install
```

نسخه Wrangler:

```powershell
npx wrangler --version
```

این پروژه Wrangler `4.145.0` را pin کرده است.

## Login

```powershell
npx wrangler login --use-keyring
npx wrangler whoami
```

## D1

لیست:

```powershell
npx wrangler d1 list
```

اطلاعات:

```powershell
npx wrangler d1 info github-page-insights
```

Schema:

```powershell
npx wrangler d1 execute github-page-insights --remote --file=./db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql --yes
```

## Secrets

```powershell
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_KEY
```

لیست نام Secretها:

```powershell
npx wrangler secret list
```

## Validation

```powershell
npm run check
node tests/validate.mjs
```

## Deploy دستی

```powershell
npx wrangler deploy
```

## Logs

```powershell
npx wrangler tail github-page-insights-worker
```

## Backup

```powershell
New-Item -ItemType Directory -Force .\backups | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
npx wrangler d1 export github-page-insights --remote --output=".\backups\d1-$stamp.sql"
```

## نکته مهم

Do not use old `db/console/RESET` scripts from previous project generations. The current canonical fresh install is:

```text
db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql
```
