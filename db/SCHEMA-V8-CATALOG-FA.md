# کاتالوگ اسکیمای D1 v8

## جدول `platforms` — 28 ستون

```text
platform_id
platform_name
platform_type
platform_url
platform_domain
environment
app_version
sdk_name
sdk_version
source
first_seen
last_seen
total_events
total_pageviews
total_sessions
total_visitors
last_ip
last_ip_hash
last_platform_ip
last_country
last_region
last_city
last_event_id
last_event_type
api_key_hash
api_key_updated_at
metadata_json
capabilities_json
```

## جدول `platform_visitors` — 39 ستون

```text
platform_id
visitor_id
user_id
anonymous_id
first_seen
last_seen
last_ip
last_ip_hash
country
region
region_code
city
continent
colo
asn
as_organization
latitude
longitude
postal_code
timezone
language
user_agent
browser
browser_version
os
os_version
device
device_vendor
device_model
screen_width
screen_height
viewport_width
viewport_height
device_pixel_ratio
color_depth
last_page_url
last_path
last_referrer
metadata_json
```

## جدول `platform_sessions` — 32 ستون

```text
platform_id
session_id
visitor_id
user_id
anonymous_id
first_seen
last_seen
duration_ms
event_count
pageviews
max_scroll
clicks
outbound_clicks
ip
ip_hash
platform_ip
country
region
city
continent
colo
asn
as_organization
browser
browser_version
os
os_version
device
last_page_url
last_path
last_referrer
metadata_json
```

## جدول `events` — 99 ستون

### Identity

```text
id
received_at
occurred_at
event_type
event_version
platform_id
platform_name
platform_type
environment
app_version
sdk_name
sdk_version
source
user_id
session_id
visitor_id
anonymous_id
trace_id
request_id
```

### Page / Referrer

```text
page_url
path
query_string
title
referrer
referrer_host
```

### Language / Geo

```text
language
accept_language
timezone
country
region
region_code
city
continent
colo
asn
as_organization
latitude
longitude
postal_code
metro_code
```

### IP / network identity

```text
ip
ip_hash
platform_ip
forwarded_for
ip_source
```

### Browser / Device

```text
user_agent
browser
browser_version
os
os_version
device
device_vendor
device_model
screen_width
screen_height
viewport_width
viewport_height
device_pixel_ratio
color_depth
```

### Connection

```text
connection_type
connection_downlink
connection_rtt
connection_save_data
```

### HTTP request

```text
http_method
request_url
request_scheme
request_host
request_path
request_query
request_content_type
request_content_length
accept_header
accept_encoding
origin_header
cf_ray
```

### TLS / Cloudflare metadata

```text
tls_version
client_tcp_rtt
client_quic_rtt
bot_score
verified_bot
ja3
ja4
response_status
```

### Engagement

```text
duration_ms
max_scroll
clicks
outbound_clicks
```

### UTM

```text
utm_source
utm_medium
utm_campaign
utm_term
utm_content
```

### Flexible JSON

```text
data_json
metadata_json
headers_json
cf_json
request_json
payload_json
raw_event_json
```

## جدول `event_archives` — 9 ستون

```text
event_id
platform_id
archive_path
created_at
status
attempts
commit_sha
file_sha
last_error
```

## جدول `notification_log` — 7 ستون

```text
event_id
platform_id
channel
sent_at
status
message_id
error
```

## جدول `schema_meta` — 2 ستون

```text
key
value
```
