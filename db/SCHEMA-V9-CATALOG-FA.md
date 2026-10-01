# Universal Event Insights v9 — Data Catalog

Event table columns: **96**. This stays within Cloudflare D1’s 100-column table limit.

| # | Column | Purpose |
|---:|---|---|
| 1 | `id` | Unique stored event identifier |
| 2 | `received_at` | Worker receipt timestamp |
| 3 | `occurred_at` | Client/event occurrence timestamp |
| 4 | `event_type` | Normalized event type |
| 5 | `event_version` | Client event schema version |
| 6 | `platform_id` | Stable dynamic platform identifier |
| 7 | `platform_name` | Human-readable platform name |
| 8 | `platform_type` | web/api/bot/app/etc. |
| 9 | `platform_url` | Platform URL captured on event |
| 10 | `platform_domain` | Platform domain captured on event |
| 11 | `environment` | production/staging/development/etc. |
| 12 | `app_version` | Application version |
| 13 | `sdk_name` | Client SDK name |
| 14 | `sdk_version` | Client SDK version |
| 15 | `source` | Origin/channel of event |
| 16 | `user_id` | Application user identifier |
| 17 | `session_id` | Session identifier |
| 18 | `visitor_id` | Visitor identifier |
| 19 | `anonymous_id` | Anonymous identifier |
| 20 | `trace_id` | Trace/distributed request identifier |
| 21 | `request_id` | Worker request identifier |
| 22 | `page_url` | Page URL |
| 23 | `path` | Page/resource path |
| 24 | `query_string` | Query string |
| 25 | `title` | Page title |
| 26 | `referrer` | Referrer URL |
| 27 | `referrer_host` | Referrer hostname |
| 28 | `language` | Client language |
| 29 | `accept_language` | Accept-Language header |
| 30 | `timezone` | Client/Cloudflare timezone |
| 31 | `country` | Country |
| 32 | `region` | Region |
| 33 | `region_code` | Region code |
| 34 | `city` | City |
| 35 | `continent` | Continent |
| 36 | `colo` | Cloudflare colo |
| 37 | `asn` | Autonomous system number |
| 38 | `as_organization` | ASN organization |
| 39 | `latitude` | Latitude when available |
| 40 | `longitude` | Longitude when available |
| 41 | `postal_code` | Postal code when available |
| 42 | `metro_code` | Metro/DMA code when available |
| 43 | `ip` | Raw client IP |
| 44 | `ip_hash` | SHA-256 platform-scoped IP hash |
| 45 | `platform_ip` | IP supplied by the platform itself |
| 46 | `forwarded_for` | Forwarded-For chain |
| 47 | `ip_source` | Source header used for client IP |
| 48 | `user_agent` | Raw user-agent string |
| 49 | `browser` | Parsed browser family |
| 50 | `browser_version` | Parsed browser version |
| 51 | `os` | Parsed OS family |
| 52 | `os_version` | Parsed OS version |
| 53 | `device` | Device class |
| 54 | `device_vendor` | Device vendor |
| 55 | `device_model` | Device model |
| 56 | `screen_width` | Screen width |
| 57 | `screen_height` | Screen height |
| 58 | `viewport_width` | Viewport width |
| 59 | `viewport_height` | Viewport height |
| 60 | `device_pixel_ratio` | Device pixel ratio |
| 61 | `color_depth` | Screen color depth |
| 62 | `connection_type` | Effective connection/network type |
| 63 | `connection_downlink` | Downlink estimate |
| 64 | `connection_rtt` | Network RTT estimate |
| 65 | `connection_save_data` | Save-Data flag |
| 66 | `http_method` | HTTP method received by Worker |
| 67 | `request_url` | Worker request URL with sensitive query keys redacted |
| 68 | `request_scheme` | HTTP scheme |
| 69 | `request_host` | Worker host |
| 70 | `request_path` | Worker request path |
| 71 | `request_query` | Worker request query |
| 72 | `cf_ray` | Cloudflare Ray ID |
| 73 | `tls_version` | TLS version |
| 74 | `client_tcp_rtt` | Client TCP RTT |
| 75 | `client_quic_rtt` | Client QUIC RTT |
| 76 | `bot_score` | Cloudflare Bot Management score when available |
| 77 | `verified_bot` | Verified bot flag |
| 78 | `ja3` | JA3 fingerprint when available |
| 79 | `ja4` | JA4 fingerprint when available |
| 80 | `response_status` | Application/request response status supplied by client |
| 81 | `duration_ms` | Engagement/request duration in milliseconds |
| 82 | `max_scroll` | Maximum scroll depth percent |
| 83 | `clicks` | Click count |
| 84 | `outbound_clicks` | Outbound click count |
| 85 | `utm_source` | UTM source |
| 86 | `utm_medium` | UTM medium |
| 87 | `utm_campaign` | UTM campaign |
| 88 | `utm_term` | UTM term |
| 89 | `utm_content` | UTM content |
| 90 | `data_json` | Structured application/business data |
| 91 | `metadata_json` | Structured event metadata |
| 92 | `headers_json` | Safe request header snapshot |
| 93 | `cf_json` | Cloudflare request metadata snapshot |
| 94 | `request_json` | Safe request summary |
| 95 | `payload_json` | Redacted original payload |
| 96 | `raw_event_json` | Redacted full event/request snapshot |

## Sensitive data handling

The Worker stores the raw client IP and also an IP hash because the project explicitly uses IP intelligence. Request headers and arbitrary payloads are recursively redacted for credential-like keys such as Authorization, Cookie, token, secret, password, API key and private key. The event payload itself remains available through `payload_json` and `raw_event_json` after redaction.
