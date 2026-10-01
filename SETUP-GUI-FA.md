# راه‌اندازی GUI-only — Universal Event Insights v9

این فایل برای راه‌اندازی پروژه فقط با رابط گرافیکی GitHub و Cloudflare نوشته شده است.

---

## مرحله 0 — فایل‌ها را در GitHub قرار بده

کل محتویات این پوشه را داخل repository قرار بده.

ساختار اصلی باید این باشد:

```text
data/platforms/.gitkeep

db/schema.sql
db/schema-v9.sql
db/SCHEMA-V9-CATALOG-FA.md
db/console/...

docs/index.html
docs/style.css
docs/app.js
docs/analytics.js
docs/config.js
docs/api-schema.json
docs/logo.svg

worker/index.js
worker/package.json
worker/wrangler.toml

tests-SAMPLE-EVENT.json
README.md
SETUP-GUI-FA.md
LICENSE
VALIDATION-REPORT-FA.md
tests/validate.mjs
```

---

# مرحله 1 — D1

در Cloudflare:

```text
Workers & Pages
→ D1
→ github-page-insights
→ Console
```

> اگر دیتابیس کاملاً جدید است، فایل‌های DROP هم مشکلی ندارند.
>
> اگر دیتای قدیمی v8 برایت مهم است، **فایل‌های 01 تا 07 را اجرا نکن** و قبل از هر کاری از D1 خروجی بگیر. در این پروژه بازسازی پاک‌شونده، فرض بر این است که داده قدیمی قابل حذف است.

### اجرای SQL

هر فایل را جداگانه باز کن و فقط همان یک statement را در Console اجرا کن.

ابتدا:

```text
01
02
03
04
05
06
07
```

بعد:

```text
08
09
10
11
12
13
14
```

بعد:

```text
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
31
32
33
34
35
36
37
38
39
40
41
42
43
44
```

بعد:

```text
45
46
```

و در پایان بررسی:

```text
47
48
49
50
51
52
53
54
55
```

### نتیجه مهم

فایل:

```text
48_verify_event_columns.sql
```

باید 96 ستون برای `events` نشان دهد.

---

# مرحله 2 — D1 Binding برای Worker

در Worker موجود:

```text
github-page-insights-worker
```

برو به:

```text
Settings
→ Bindings
→ Add binding
→ D1 database
```

مقدار:

```text
Variable name = DB
Database = github-page-insights
```

باید نتیجه شبیه این باشد:

```text
DB → github-page-insights
```

---

# مرحله 3 — Variables

در:

```text
Settings
→ Variables and Secrets
```

Variables متنی:

```text
GITHUB_OWNER
mehrdadmb2
```

```text
GITHUB_REPO
github-page-insights
```

```text
GITHUB_BRANCH
main
```

```text
GITHUB_ARCHIVE_ENABLED
true
```

```text
REQUIRE_PLATFORM_KEY
false
```

```text
TELEGRAM_ENABLED
true
```

```text
TELEGRAM_NOTIFY_MODE
visitor
```

```text
DEBUG
false
```

---

# مرحله 4 — Secrets

این‌ها را به‌عنوان Secret اضافه کن:

```text
GITHUB_TOKEN
ADMIN_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

هیچ‌کدام را داخل `docs/config.js` قرار نده.

---

# مرحله 5 — Worker code

در Cloudflare Worker:

```text
Edit code
```

کل محتوای:

```text
worker/index.js
```

را جایگزین کد فعلی کن.

کد قدیمی را نصفه/نصفه با v9 ترکیب نکن.

بعد:

```text
Save and Deploy
```

---

# مرحله 6 — Health

باز کن:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health
```

و بعد:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/schema
```

برای GitHub probe:

```text
https://github-page-insights-worker.game-developer-mb.workers.dev/v1/health?probe=github
```

در Health، در حالت نصب اولیه ممکن است `degraded` ببینی چون هنوز event وارد نشده یا Telegram کامل نشده است. آن وضعیت به‌تنهایی به معنی خراب بودن Worker نیست.

---

# مرحله 7 — تست Event

برای تست از:

```text
tests-SAMPLE-EVENT.json
```

استفاده کن.

Endpoint:

```text
POST https://github-page-insights-worker.game-developer-mb.workers.dev/v1/events
```

Header:

```text
Content-Type: application/json
```

بعد بررسی کن:

```text
D1 → events
D1 → platforms
D1 → platform_visitors
D1 → platform_sessions
GitHub → data/platforms/sample-web-app/events/...
```

---

# مرحله 8 — GitHub Pages Dashboard

در repository:

```text
Settings
→ Pages
```

Source را روی branch اصلی قرار بده و folder زیر را انتخاب کن:

```text
/docs
```

`docs/config.js` از قبل Worker فعلی را دارد.

بعد از انتشار dashboard را باز کن.

---

# مرحله 9 — Telegram

وقتی Worker و D1 سالم شدند:

در Telegram بات را باز کن و مطمئن شو Chat ID درست است.

در Cloudflare Secret:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
```

را تنظیم کن.

Worker را دوباره Deploy کن.

سپس درخواست setup را از یک ابزار GUI مثل مرورگر/REST client ارسال کن:

```text
GET https://github-page-insights-worker.game-developer-mb.workers.dev/telegram/setup
```

Header:

```text
X-Admin-Key: YOUR_ADMIN_KEY
```

بعد تست:

```text
GET https://github-page-insights-worker.game-developer-mb.workers.dev/telegram/test
```

همان header را ارسال کن.

باید پیام تست داخل Telegram دریافت شود.

---

# مرحله 10 — تست دستورات Telegram

در خود بات:

```text
/start
```

بعد:

```text
/status
```

بعد:

```text
/platforms
```

و برای یک platform:

```text
/platform sample-web-app
```

یا:

```text
/recent sample-web-app
```

---

# خطاهای مهم

## `D1_STORE_FAILED`

اول این‌ها را بررسی کن:

```text
DB binding
Schema v9
Worker v9
```

و:

```text
48_verify_event_columns.sql
```

باید 96 ستون را نشان دهد.

## `D1 schema is incomplete`

یعنی D1 هنوز با Worker نسخه 9 هماهنگ نیست.

## `GITHUB_401` / `GITHUB_403`

توکن GitHub یا permission آن مشکل دارد.

مورد لازم:

```text
Contents: Read and write
```

## Dashboard خالی است

اول:

```text
/v1/platforms
```

اگر صفر بود، test event بفرست.

## Telegram کار نمی‌کند

به ترتیب بررسی کن:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ADMIN_CHAT_ID
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_ENABLED=true
```

بعد:

```text
/telegram/setup
/telegram/test
```

را دوباره انجام بده.

---

# نکته مهم نسخه‌ها

همیشه این مجموعه را هماهنگ نگه دار:

```text
Worker v9
D1 v9
Dashboard v9
Browser SDK v9
API schema v9
```

کد Worker v8 را روی D1 v9 یا برعکس نصب نکن.
