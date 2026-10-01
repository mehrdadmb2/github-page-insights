# راهنمای کامل راه‌اندازی Universal Event Insights با Wrangler در Windows

این نسخه عمداً مسیر Cloudflare Dashboard را از فرآیند فنی حذف می‌کند. ساخت D1، اجرای SQL، اتصال Binding، Secrets و Deploy Worker با Wrangler از Windows انجام می‌شود. GitHub Repository و GitHub Pages همچنان از خود GitHub مدیریت می‌شوند.

> **مرجع اصلی این راهنما:** ساختار v9.1 همین پروژه. کد Worker و Schema با تست داخلی `tests/validate.mjs` بررسی شده‌اند.

## 1) معماری نهایی

```text
Windows PowerShell
        |
        | Wrangler
        +------------------- Cloudflare account
        |                         |
        |                         +-- Worker
        |                         |
        |                         +-- D1
        |                         |
        |                         +-- Worker Secrets
        |
        +------------------- GitHub repository
                                  |
                                  +-- docs/  -> GitHub Pages
                                  +-- data/  -> event archive
```

### وظایفی که دیگر در Cloudflare Dashboard انجام نمی‌دهیم

- ساخت D1
- اتصال D1 Binding به Worker
- اجرای SQL schema
- ثبت Variables
- ثبت Secrets
- Deploy Worker
- اجرای health smoke test

همه این‌ها از Wrangler انجام می‌شوند.

## 2) پیش‌نیاز Windows

Cloudflare برای Wrangler به Node.js نیاز دارد و مستندات فعلی حداقل Node.js `16.17.0` را ذکر می‌کنند. استفاده از یک نسخه LTS جاری توصیه می‌شود.

PowerShell یا Windows Terminal را باز کن و بررسی کن:

```powershell
node --version
npm --version
```

سپس از ریشه پروژه:

```powershell
npm install
npx wrangler --version
```

Cloudflare برای پروژه‌های جدید نصب محلی Wrangler را به جای نصب global توصیه می‌کند؛ بنابراین این پروژه Wrangler را در `devDependencies` دارد و دستورات اصلی با `npx wrangler` اجرا می‌شوند.

## 3) ورود به Cloudflare

از ریشه پروژه:

```powershell
npx wrangler login --use-keyring
```

مرورگر برای OAuth باز می‌شود. اجازه دسترسی را تأیید کن.

بعد:

```powershell
npx wrangler whoami
```

Wrangler فعلی روی Windows می‌تواند credentialهای OAuth را با OS keyring/Windows Credential Manager ذخیره کند؛ بنابراین برای این پروژه `--use-keyring` انتخاب شده است.

## 4) ساخت D1

اول فهرست دیتابیس‌ها:

```powershell
npx wrangler d1 list
```

### اگر D1 از قبل وجود ندارد

```powershell
npx wrangler d1 create github-page-insights --binding DB --update-config --use-remote
```

دو گزینه مهم همین دستور:

- `--binding DB` → نام Binding داخل Worker می‌شود `env.DB`
- `--update-config` → Wrangler Binding را داخل config می‌نویسد
- `--use-remote` → resource را برای remote/production تنظیم می‌کند

Cloudflare همین قابلیت را در مستندات فعلی D1 توضیح داده است.

### اگر D1 از قبل وجود دارد

از:

```powershell
npx wrangler d1 list
```

مقدار database ID همان دیتابیس `github-page-insights` را پیدا کن و در `wrangler.jsonc` قرار بده:

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "github-page-insights",
    "database_id": "REAL-DATABASE-ID"
  }
]
```

## 5) فایل Wrangler اصلی

فایل:

```text
wrangler.jsonc
```

منبع حقیقت تنظیمات Worker است.

در آن:

```text
name                 = github-page-insights-worker
main                 = worker/index.js
binding              = DB
database_name        = github-page-insights
```

متغیرهای غیرحساس نیز در همین فایل هستند.

Secretها داخل فایل نوشته نمی‌شوند.

Cloudflare فعلاً برای پروژه‌های جدید `wrangler.jsonc` را به عنوان فرمت پیشنهادی معرفی می‌کند و برخی قابلیت‌های جدید نیز ابتدا در قالب JSON/JSONC ارائه می‌شوند.

## 6) نصب Schema روی D1 واقعی

این پروژه یک فایل one-shot دارد:

```text
db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql
```

برای اجرای آن:

```powershell
npx wrangler d1 execute github-page-insights --remote --file=./db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql --yes
```

نکته بسیار مهم: این فایل **Fresh Reset** است و جدول‌های تحلیلی پروژه و داده‌های آن‌ها را پاک و دوباره ایجاد می‌کند. جدول داخلی `_cf_KV` را دست نمی‌زند.

Cloudflare در مستندات فعلی `d1 execute --remote --file=...` را برای اجرای فایل SQL روی دیتابیس remote مستند کرده است. اگر اجرای import با خطا مواجه شود، D1 از اجرای فایل پشتیبانی می‌کند و می‌توان قبل از retry علت خطا را بررسی کرد.

## 7) بررسی Schema

بعد:

```powershell
npx wrangler d1 execute github-page-insights --remote --command="PRAGMA table_list;"
```

و:

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT COUNT(*) AS event_columns FROM pragma_table_info('events');"
```

باید:

```text
event_columns = 96
```

باشد.

بررسی سایر جدول‌ها:

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT COUNT(*) AS platform_columns FROM pragma_table_info('platforms');"
```

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT COUNT(*) AS visitor_columns FROM pragma_table_info('platform_visitors');"
```

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT COUNT(*) AS session_columns FROM pragma_table_info('platform_sessions');"
```

خروجی مورد انتظار:

```text
platform_columns = 28
visitor_columns  = 39
session_columns  = 32
```

## 8) Schema Metadata

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT key,value FROM schema_meta ORDER BY key;"
```

باید شامل این‌ها باشد:

```text
schema_version | 9.0
service        | universal-event-insights-worker
```

## 9) Cloudflare Secrets با Wrangler

دو Secret اصلی الزامی هستند:

```text
GITHUB_TOKEN
ADMIN_KEY
```

تنظیم:

```powershell
npx wrangler secret put GITHUB_TOKEN
```

بعد:

```powershell
npx wrangler secret put ADMIN_KEY
```

Wrangler مقدار را interactive می‌گیرد؛ secret را داخل command line ننویس.

Cloudflare در مستندات فعلی `wrangler secret put` را برای Secret روی Worker مستند کرده و Secretها در runtime از `env` در دسترس هستند.

در `wrangler.jsonc` این دو به عنوان required secret تعریف شده‌اند:

```json
"secrets": {
  "required": ["GITHUB_TOKEN", "ADMIN_KEY"]
}
```

در نتیجه deploy اگر Secret ضروری وجود نداشته باشد، fail خواهد شد.

## 10) Telegram Secrets

سه Secret اختیاری:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

تنظیم:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_ADMIN_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

فعلاً `TELEGRAM_ENABLED` در config روی `false` است.

بعد از تنظیم هر سه Secret، آن را به `true` تغییر بده و Worker را Deploy کن.

## 11) GitHub Token

`GITHUB_TOKEN` باید برای repository:

```text
mehrdadmb2/github-page-insights
```

اجازه لازم برای Contents write داشته باشد تا archive eventها در GitHub ایجاد شوند.

Token را نه در:

```text
docs/
worker/
wrangler.jsonc
README.md
```

قرار بده.

## 12) Deploy Worker

قبل از Deploy:

```powershell
npm run check
```

بعد:

```powershell
npx wrangler deploy
```

Cloudflare مستند می‌کند که `wrangler deploy` Worker را Deploy می‌کند و توصیه می‌کند Wrangler را به‌صورت local project dependency استفاده کنی.

## 13) Health

بعد از Deploy:

```powershell
Invoke-WebRequest https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health | Select-Object -ExpandProperty Content
```

و:

```powershell
Invoke-WebRequest https://github-page-insights-worker.game-developer-mb.workers.dev/v1/schema | Select-Object -ExpandProperty Content
```

و:

```powershell
Invoke-WebRequest https://github-page-insights-worker.game-developer-mb.workers.dev/v1/platforms | Select-Object -ExpandProperty Content
```

## 14) تست Event واقعی

PowerShell:

```powershell
$body = @{
  platformId = "sample-web-app"
  platformName = "Sample Web App"
  platformType = "web"
  platformUrl = "https://example.com"
  eventType = "pageview"
  eventId = "sample-event-001"
  sessionId = "session-sample-001"
  visitorId = "visitor-sample-001"
  pageUrl = "https://example.com/dashboard"
  path = "/dashboard"
  title = "Dashboard"
  data = @{
    source = "windows-wrangler-test"
    test = $true
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Uri "https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body
```

باید پاسخ 201 و شناسه Event دریافت کنی.

## 15) بررسی Event در D1

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT id,platform_id,event_type,ip,country,region,city,browser,os,device,duration_ms FROM events ORDER BY rowid DESC LIMIT 5;"
```

دقت کن که در درخواست واقعی Cloudflare ممکن است بعضی متادیتاها بسته به مسیر شبکه در دسترس نباشند. Worker هر داده‌ای را که Cloudflare واقعاً در اختیارش قرار دهد ذخیره می‌کند.

## 16) بررسی اطلاعات JSON

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT id,data_json,metadata_json,headers_json,cf_json,request_json,payload_json,raw_event_json FROM events ORDER BY rowid DESC LIMIT 1;"
```

این هشت ستون برای توسعه Universal API مهم هستند، چون event سفارشی هر پلتفرم را بدون نیاز به تغییر schema نگه می‌دارند.

## 17) GitHub Archive

بعد از Event موفق:

```text
data/platforms/<platformId>/events/YYYY/MM/DD/<event>.json
```

باید در repository ایجاد شود.

بررسی D1 archive tracking:

```powershell
npx wrangler d1 execute github-page-insights --remote --command="SELECT * FROM event_archives ORDER BY created_at DESC LIMIT 5;"
```

## 18) Dashboard

GitHub Pages همچنان از repository مدیریت می‌شود.

فایل‌های frontend:

```text
docs/index.html
docs/style.css
docs/app.js
docs/analytics.js
docs/config.js
docs/api-schema.json
docs/logo.svg
```

Source GitHub Pages:

```text
main /docs
```

Cloudflare بخش runtime را با Wrangler مدیریت می‌کند.

## 19) Telegram Webhook

بعد از اینکه:

```text
D1        OK
Worker    OK
Event     OK
GitHub    OK
```

شد، Telegram را فعال کن.

ابتدا Secretها:

```powershell
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_ADMIN_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

سپس در `wrangler.jsonc`:

```json
"TELEGRAM_ENABLED": "true"
```

و:

```powershell
npx wrangler deploy
```

Setup Webhook از Worker:

```text
GET /telegram/setup
```

با Header مدیریتی:

```text
X-Admin-Key: YOUR_ADMIN_KEY
```

Test:

```text
GET /telegram/test
```

## 20) Backup D1 قبل از تغییرهای مخرب

برای خروجی گرفتن از D1 remote:

```powershell
New-Item -ItemType Directory -Force .\backups
npx wrangler d1 export github-page-insights --remote --output=./backups/d1-backup.sql
```

Cloudflare فعلاً `d1 export --remote --output=...` را برای export کامل schema/data مستند می‌کند.

## 21) اجرای همه مراحل با یک PowerShell

فایل زیر آماده است:

```text
scripts/windows/ALL-IN-ONE-SETUP.ps1
```

اجرا:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\windows\ALL-IN-ONE-SETUP.ps1
```

این اسکریپت:

```text
Node check
↓
npm install
↓
Wrangler login
↓
D1 create/list
↓
D1 schema
↓
required secrets
↓
optional Telegram secrets
↓
syntax check
↓
D1 verification
↓
Worker deploy
```

## 22) اجرای مرحله‌ای به‌جای All-in-One

برای کنترل بیشتر:

```powershell
.\scripts\windows\01-check-and-login.ps1
```

بعد:

```powershell
.\scripts\windows\02-create-or-configure-d1.ps1
```

بعد:

```powershell
.\scripts\windows\03-apply-d1.ps1
```

بعد:

```powershell
.\scripts\windows\04-verify-d1.ps1
```

بعد:

```powershell
.\scripts\windows\05-set-required-secrets.ps1
```

سپس:

```powershell
.\scripts\windows\07-deploy-worker.ps1
```

و در پایان:

```powershell
.\scripts\windows\08-smoke-test.ps1
```

## 23) Debug و Logs

برای دیدن logهای زنده Worker:

```powershell
npx wrangler tail github-page-insights-worker
```

در لاگ‌ها دنبال Eventهایی مثل این بگرد:

```text
REQUEST_START
COLLECT_START
COLLECT_COMPLETE
D1_STORE_FAILED
GITHUB_ARCHIVE_FAILED
UNHANDLED_ERROR
```

IP خام به‌صورت غیرضروری در log چاپ نمی‌شود؛ IP برای storage در D1 جداگانه حفظ می‌شود.

## 24) خطای D1 binding

اگر Worker گفت:

```text
D1_NOT_CONFIGURED
```

این سه مورد را بررسی کن:

```text
binding = DB
database_name = github-page-insights
database_id = real UUID
```

و:

```powershell
npx wrangler d1 info github-page-insights
```

## 25) خطای Secret

اگر deploy گفت required secret موجود نیست:

```powershell
npx wrangler secret list
```

باید حداقل این دو موجود باشند:

```text
GITHUB_TOKEN
ADMIN_KEY
```

## 26) خطای GitHub 401/403

بررسی کن:

```text
GITHUB_TOKEN
repository owner
repository name
branch
Contents write permission
```

## 27) خطای Telegram

ابتدا:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

بعد:

```text
TELEGRAM_ENABLED=true
```

و Deploy مجدد.

## 28) یک قانون مهم در این پروژه

فایل‌های زیر را با هم هماهنگ نگه دار:

```text
worker/index.js
wrangler.jsonc
db/schema-v9.sql
db/UNIVERSAL-EVENT-INSIGHTS-D1-ONE-SHOT-V9.1.sql
docs/api-schema.json
docs/config.js
```

ترکیب نسخه‌های v7/v8/v9 با هم توصیه نمی‌شود.

## 29) منابع رسمی مورد استفاده

- Wrangler Workers commands: https://developers.cloudflare.com/workers/wrangler/commands/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- D1 Wrangler commands: https://developers.cloudflare.com/d1/wrangler-commands/
- D1 getting started: https://developers.cloudflare.com/d1/get-started/
- Worker secrets: https://developers.cloudflare.com/workers/configuration/secrets/

این راهنما برای Workflow فعلی Windows + PowerShell + Wrangler نوشته شده است.
