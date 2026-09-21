# راه‌اندازی کامل Universal Event Insights v8 فقط با رابط گرافیکی

این نسخه برای راه‌اندازی بدون CLI آماده شده است. مهم‌ترین نکته این است که در Cloudflare D1 Console هر فایل SQL شماره‌دار داخل `db/console/` را جداگانه اجرا کنی.

## 1) ساخت / انتخاب D1

Cloudflare Dashboard → Workers & Pages → D1 → دیتابیس `github-page-insights`

اگر دیتابیس فعلی را می‌خواهی از صفر بسازی، مراحل SQL زیر داده‌های قبلی را پاک می‌کنند.

## 2) ساخت دیتابیس از داخل D1 Console

وارد دیتابیس شو → Console.

به ترتیب:

`01` تا `07`  → حذف جداول قدیمی

`08` تا `14` → ساخت جداول جدید

`15` تا `44` → ساخت ایندکس‌ها

`45` تا `46` → ثبت نسخه اسکیمای v8

`47` تا `55` → بررسی نهایی

هر فایل فقط یک statement دارد.

### قانون مهم Console

هیچ‌وقت کل پوشه را یک‌جا paste نکن.

این موارد را هم اجرا نکن:

```sql
BEGIN TRANSACTION;
COMMIT;
```

برای محیط D1 Console مورد استفاده در این پروژه، روش فایل‌های تک‌statement در نظر گرفته شده است.

## 3) بررسی خروجی D1

در انتها `55_verify_counts.sql` باید چیزی شبیه این نشان دهد:

```text
platforms | events | visitors | sessions | archives | notifications
0         | 0      | 0        | 0        | 0        | 0
```

صفر بودن شمارنده‌ها در دیتابیس تازه طبیعی است.

## 4) تنظیم Worker در Cloudflare Dashboard

Workers & Pages → Worker → Edit code.

محتوای کامل:

`worker/index.js`

را جایگزین کد قبلی Worker کن.

سپس در Worker → Settings → Variables and Secrets این موارد را تنظیم کن.

### Variables

```text
GITHUB_OWNER=mehrdadmb2
GITHUB_REPO=github-page-insights
GITHUB_BRANCH=main
GITHUB_ARCHIVE_ENABLED=true
REQUIRE_PLATFORM_KEY=false
TELEGRAM_ENABLED=true
TELEGRAM_NOTIFY_MODE=visitor
```

### Secrets

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

هیچ Secretی را داخل `docs/` یا JavaScript فرانت‌اند قرار نده.

## 5) D1 Binding

Worker → Settings → Bindings → D1 Database

باید دقیقاً این binding وجود داشته باشد:

```text
Variable name: DB
Database: github-page-insights
```

کد Worker از `env.DB` استفاده می‌کند.

## 6) Deploy Worker

بعد از ذخیره Variables / Secrets / Binding، Deploy را بزن.

## 7) Health Check

این آدرس را باز کن:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health
```

برای بررسی GitHub نیز:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health?probe=github
```

## 8) اولین تست Collector

یک درخواست JSON با حداقل `platformId` باید با HTTP 201 پاسخ دهد.

نمونه:

```json
{
  "platformId": "test-platform",
  "platformName": "Test Platform",
  "platformType": "web",
  "environment": "production",
  "eventType": "pageview",
  "identity": {
    "visitorId": "visitor-demo",
    "sessionId": "session-demo"
  },
  "page": {
    "url": "https://example.com/",
    "path": "/",
    "title": "Example"
  },
  "data": {
    "hello": "world"
  }
}
```

بعد از آن در D1 باید حداقل یک رکورد در این جدول‌ها دیده شود:

```text
platforms
platform_visitors
platform_sessions
events
```

و در GitHub باید این مسیر ساخته شود:

```text
data/platforms/test-platform/events/YYYY/MM/DD/
```

## 9) راه‌اندازی GitHub Pages Dashboard

GitHub Repository → Settings → Pages

Source:

```text
Deploy from a branch
```

Branch:

```text
main
```

Folder:

```text
/docs
```

بعد از انتشار، داشبورد با Worker API صحبت می‌کند و Secretی در مرورگر لازم ندارد.

## 10) راه‌اندازی Telegram

بعد از اینکه Worker سالم شد:

Secrets را تنظیم کن و سپس endpoint زیر را با `X-Admin-Key` اجرا کن:

```text
GET /telegram/setup
```

Webhook روی این مسیر قرار می‌گیرد:

```text
POST /telegram/webhook
```

برای تست پیام:

```text
GET /telegram/test
```

## 11) معماری ذخیره‌سازی داده

```text
Client
  ↓
POST /v1/events
  ↓
Cloudflare Worker
  ├── D1 events
  ├── D1 platform_visitors
  ├── D1 platform_sessions
  ├── D1 platforms
  ├── D1 event_archives
  ├── GitHub per-event JSON archive
  └── Telegram notification
```

هیچ Cron یا Scheduled Trigger برای دریافت event لازم نیست.

## 12) چیزی که در هر event نگه‌داری می‌شود

### هویت و پلتفرم

```text
platformId
platformName
platformType
platformUrl
platformDomain
environment
appVersion
sdkName
sdkVersion
source
userId
visitorId
sessionId
anonymousId
traceId
requestId
```

### صفحه / ارجاع

```text
pageUrl
path
queryString
title
referrer
referrerHost
utmSource
utmMedium
utmCampaign
utmTerm
utmContent
```

### Geo / شبکه Cloudflare

```text
country
region
regionCode
city
continent
colo
asn
asOrganization
latitude
longitude
postalCode
metroCode
timezone
tlsVersion
clientTcpRtt
clientQuicRtt
botScore
verifiedBot
ja3
ja4
cfRay
```

این مقادیر تا جایی ذخیره می‌شوند که Cloudflare برای همان request در دسترس قرار داده باشد.

### IP

```text
ip
ipHash
platformIp
forwardedFor
ipSource
```

`ip` آدرس کلاینت/درخواست‌کننده‌ای است که Worker می‌بیند.

`platformIp` برای زمانی است که خود سیستم مبدا IP سرویس یا سرور پلتفرم را می‌داند و آن را داخل event می‌فرستد؛ این مقدار از یک درخواست مرورگری به‌صورت خودکار قابل حدس‌زدن نیست.

### Browser / Device

```text
userAgent
browser
browserVersion
os
osVersion
device
deviceVendor
deviceModel
screenWidth
screenHeight
viewportWidth
viewportHeight
devicePixelRatio
colorDepth
```

### Connection

```text
connectionType
connectionDownlink
connectionRtt
connectionSaveData
```

### HTTP request

```text
httpMethod
requestUrl
requestScheme
requestHost
requestPath
requestQuery
requestContentType
requestContentLength
acceptHeader
acceptEncoding
originHeader
```

### Event metrics

```text
responseStatus
durationMs
maxScroll
clicks
outboundClicks
```

### JSONهای منعطف

```text
dataJson
metadataJson
headersJson
cfJson
requestJson
payloadJson
rawEventJson
```

این قسمت برای داده‌های اختصاصی پلتفرم‌هاست؛ مثلاً CRM، فروشگاه، ربات، API یا اپلیکیشن می‌توانند فیلدهای اختصاصی خودشان را بدون تغییر اسکیمای SQL ارسال کنند.

## 13) درباره هدرها و Secretها

برای اینکه telemetry به محل ذخیره‌ی credential تبدیل نشود، Worker قبل از JSON persistence کلیدهای رایج credential را redact می‌کند، از جمله:

```text
Authorization
Cookie
Set-Cookie
X-API-Key
X-Platform-Key
X-Admin-Key
password
secret
token
private-key
client-secret
```

در نتیجه «همه اطلاعات مفید» ذخیره می‌شود، ولی credentialهای شناخته‌شده عمداً ذخیره نمی‌شوند.

## 14) APIهای اصلی

```text
POST /v1/events
GET  /v1/platforms
GET  /v1/platforms/<platformId>
GET  /v1/platforms/<platformId>/events
GET  /v1/platforms/<platformId>/visitors
GET  /v1/platforms/<platformId>/sessions
GET  /v1/overview
GET  /v1/health
GET  /v1/schema
GET  /v1/admin/events
GET  /v1/admin/event?id=<eventId>
POST /v1/admin/archive-retry/<eventId>
POST /telegram/webhook
GET  /telegram/setup
GET  /telegram/test
```

## 15) اضافه کردن پلتفرم جدید

هیچ لیست hard-code شده‌ای لازم نیست.

هر کلاینت فقط یک `platformId` جدید می‌فرستد:

```json
{
  "platformId": "crm-production"
}
```

Worker رکورد پلتفرم را خودکار ایجاد / به‌روزرسانی می‌کند.

آرشیو نیز خودکار به namespace جدا می‌رود:

```text
data/platforms/crm-production/events/...
```
