# گزارش اعتبارسنجی — Universal Event Insights v10.2.0

تاریخ: 2026-10-01

## نتیجه نهایی

```text
VALIDATION COMPLETE
Worker version: 10.2.0
API namespace: /v1
D1 schema: 9.0
Events columns: 96
Platforms columns: 28
Visitors columns: 39
Sessions columns: 32
Archive columns: 9
Notification columns: 7
Runtime smoke tests: PASS
```

## بررسی‌های انجام‌شده

### JavaScript syntax

```text
worker/index.js   PASS
docs/app.js       PASS
docs/analytics.js PASS
docs/config.js    PASS
```

### Contract

Worker و D1 برای چهار جدول اصلی از نظر نام/ترتیب ستون‌های مورد استفاده تطبیق داده شده‌اند.

```text
events              96 / 96
platforms           28 / 28
platform_visitors   39 / 39
platform_sessions   32 / 32
```

### D1 SQL

Schema و One-Shot SQL با SQLite به‌صورت کامل parse/execute شدند و خطای syntax یا ترتیب dependency مشاهده نشد.

### Runtime smoke tests

```text
Sample event storage              PASS
Duplicate event idempotency       PASS
/v1/schema                         PASS
/v1/health                         PASS
Malformed URL handling             PASS
API schema loading                 PASS
```

### OpenAPI

`docs/openapi.yaml` با parser YAML بررسی شد و مسیر `/v1/events` اکنون فقط یک بار تعریف شده و هم `GET` و هم `POST` را در همان path دارد.

## مورد شخصی‌سازی‌شده قبل از اولین Cloudflare Build

فایل `wrangler.jsonc` عمداً دارای placeholder زیر است:

```text
YOUR_D1_DATABASE_ID
```

این مقدار باید یک‌بار با UUID واقعی D1 جایگزین شود. این UUID Secret نیست، اما مخصوص حساب Cloudflare صاحب پروژه است و نمی‌توان آن را از روی نام دیتابیس حدس زد.

پس از ثبت UUID و یک‌بار تنظیم Workers Builds در Cloudflare، روند عادی به این شکل خواهد بود:

```text
GitHub push
   ↓
Cloudflare Workers Builds
   ↓
npm run check
   ↓
npx wrangler deploy
   ↓
Worker updated
```

و برای جلوگیری از حلقه Deploy، مسیرهای زیر نباید Build Worker را trigger کنند:

```text
data/*
docs/*
db/*
tests/*
.github/*
*.md
LICENSE
```

## GitHub Pages

داشبورد از طریق GitHub Actions منتشر می‌شود و workflow آن فقط با تغییرات `docs/**` یا خود workflow فعال می‌شود. بنابراین commitهای آرشیو telemetry در `data/**` باعث rebuild دوباره Pages نمی‌شوند.

## نکته امنیتی

Tokenها و Secretها نباید در GitHub commit شوند. Worker Secrets باید یک‌بار در Cloudflare تنظیم شوند. Snapshotهای headers/request/payload نیز قبل از ذخیره با redaction پردازش می‌شوند.
