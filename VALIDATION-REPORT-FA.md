# گزارش بررسی نهایی Universal Event Insights v9

نسخه 9.0.0 قبل از بسته‌بندی از نظر Syntax، ساختار D1، ترتیب ستون‌ها و bindها، مسیرهای اصلی API، آرشیو GitHub و Telegram بررسی شد.

## نتیجه

- Worker JavaScript: PASS
- Dashboard JavaScript: PASS
- Browser SDK JavaScript: PASS
- Dashboard config JavaScript: PASS
- `events`: 96 ستون
- `platforms`: 28 ستون
- `platform_visitors`: 39 ستون
- `platform_sessions`: 32 ستون
- تطابق ترتیب ستون‌های Worker و D1: PASS
- تمام SQLهای 01 تا 46: PASS در SQLite
- تمام verificationهای 47 تا 55: PASS
- Event INSERT: 96 placeholder / 96 bind
- Collect smoke test: PASS
- Duplicate event / idempotency: PASS
- `/v1/schema`: PASS
- `/v1/health`: PASS در محیط شبیه‌سازی‌شده
- malformed URL encoding: کنترل‌شده و 400
- GitHub archive 201: PASS در Mock
- Telegram setup/test/webhook: PASS در Mock

## علت اصلی خرابی v8

در مسیر ذخیره‌سازی v8 بین تعداد ستون‌ها، placeholderها و مقدارهای `bind()` برای چند INSERT عدم تطابق وجود داشت. در v9، لیست ستون‌های Event و SQL مربوط به INSERT از یک آرایه ثابت ساخته می‌شوند و تست runtime نیز این تطابق را کنترل می‌کند.

## محدودیت مهم D1

تعداد ستون‌های `events` عمداً 96 نگه داشته شده تا زیر سقف 100 ستون هر جدول باقی بماند. جزئیات متغیر نیز در JSONهای `data_json`, `metadata_json`, `headers_json`, `cf_json`, `request_json`, `payload_json`, `raw_event_json` حفظ می‌شوند.

## نکته Cloudflare

اطلاعات `request.cf` فقط روی درخواست واقعی Worker قابل اتکا است و ممکن است در Preview/Playground داشبورد Cloudflare موجود نباشد.

## نحوه استفاده از این گزارش

این گزارش جای تست Deploy واقعی را نمی‌گیرد. بعد از قرار دادن Worker و Binding روی Cloudflare باید `/v1/health` و یک Event واقعی هم تست شوند.
