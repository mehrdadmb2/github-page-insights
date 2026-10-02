const VERSION = "11.1.0";
const SERVICE = "universal-event-insights-worker";
const GH_API = "https://api.github.com";
const GH_API_VERSION = "2026-03-10";
const MAX_BODY_BYTES = 128 * 1024;
const MAX_JSON_FIELD_BYTES = 96 * 1024;
const MAX_METADATA_BYTES = 24 * 1024;
const MAX_DAYS = 3650;
const MAX_LIMIT = 200;
const TELEGRAM_MAX = 4096;
const DEFAULT_NOTIFY_MODE = "visitor";
const ARCHIVE_ATTEMPTS = 5;
const ARCHIVE_TIMEOUT_MS = 15000;
const TELEGRAM_TIMEOUT_MS = 10000;

const RECOMMENDED_EVENT_TYPES = new Set([
  "pageview", "heartbeat", "pageleave", "visibility", "click",
  "outbound_click", "scroll", "request", "login", "logout",
  "purchase", "error", "custom"
]);

const CORS_ALLOW_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Admin-Key",
  "X-Platform-Key",
  "X-API-Key"
].join(", ");

/*
 * Keep this list in EXACTLY the same order as db/schema-v9.sql /
 * db/console/12_create_events.sql.  The INSERT SQL is generated from it,
 * which prevents the placeholder/bind-count mismatch that existed in v8.
 * There are 100 or fewer columns in this table to stay within D1's limit.
 */
const EVENT_COLUMNS = [
  "id", "received_at", "occurred_at", "event_type", "event_version",
  "platform_id", "platform_name", "platform_type", "platform_url", "platform_domain",
  "environment", "app_version", "sdk_name", "sdk_version", "source",
  "user_id", "session_id", "visitor_id", "anonymous_id", "trace_id", "request_id",
  "page_url", "path", "query_string", "title", "referrer", "referrer_host",
  "language", "accept_language", "timezone",
  "country", "region", "region_code", "city", "continent", "colo",
  "asn", "as_organization", "latitude", "longitude", "postal_code", "metro_code",
  "ip", "ip_hash", "platform_ip", "forwarded_for", "ip_source",
  "user_agent", "browser", "browser_version", "os", "os_version", "device", "device_vendor", "device_model",
  "screen_width", "screen_height", "viewport_width", "viewport_height", "device_pixel_ratio", "color_depth",
  "connection_type", "connection_downlink", "connection_rtt", "connection_save_data",
  "http_method", "request_url", "request_scheme", "request_host", "request_path", "request_query",
  "cf_ray", "tls_version", "client_tcp_rtt", "client_quic_rtt", "bot_score", "verified_bot", "ja3", "ja4",
  "response_status", "duration_ms", "max_scroll", "clicks", "outbound_clicks",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "data_json", "metadata_json", "headers_json", "cf_json", "request_json", "payload_json", "raw_event_json"
];

const PLATFORM_COLUMNS = [
  "platform_id", "platform_name", "platform_type", "platform_url", "platform_domain",
  "environment", "app_version", "sdk_name", "sdk_version", "source", "first_seen", "last_seen",
  "total_events", "total_pageviews", "total_sessions", "total_visitors",
  "last_ip", "last_ip_hash", "last_platform_ip", "last_country", "last_region", "last_city",
  "last_event_id", "last_event_type", "api_key_hash", "api_key_updated_at", "metadata_json", "capabilities_json"
];

const VISITOR_COLUMNS = [
  "platform_id", "visitor_id", "user_id", "anonymous_id", "first_seen", "last_seen", "last_ip", "last_ip_hash",
  "country", "region", "region_code", "city", "continent", "colo", "asn", "as_organization",
  "latitude", "longitude", "postal_code", "timezone", "language", "user_agent", "browser", "browser_version",
  "os", "os_version", "device", "device_vendor", "device_model", "screen_width", "screen_height",
  "viewport_width", "viewport_height", "device_pixel_ratio", "color_depth", "last_page_url", "last_path",
  "last_referrer", "metadata_json"
];

const SESSION_COLUMNS = [
  "platform_id", "session_id", "visitor_id", "user_id", "anonymous_id", "first_seen", "last_seen", "duration_ms",
  "event_count", "pageviews", "max_scroll", "clicks", "outbound_clicks", "ip", "ip_hash", "platform_ip",
  "country", "region", "city", "continent", "colo", "asn", "as_organization", "browser", "browser_version",
  "os", "os_version", "device", "last_page_url", "last_path", "last_referrer", "metadata_json"
];

export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    log("info", "REQUEST_START", {
      requestId,
      method: request.method,
      path
    });

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    try {
      if (request.method === "GET" && path === "/") {
        return withCors(jsonResponse({
          ok: true,
          service: SERVICE,
          version: VERSION,
          status: "online",
          architecture: "universal-request-driven-no-cron",
          noCronRequired: true,
          database: "Cloudflare D1",
          archive: "GitHub Contents API",
          telegram: "optional",
          databaseSchema: "9.0",
          endpoints: apiContract().endpoints
        }));
      }

      if (request.method === "GET" && ["/health", "/v1/health", "/api/health", "/api/system-health"].includes(path)) {
        const probeGithub = url.searchParams.get("probe") === "github";
        return systemHealth(env, requestId, probeGithub);
      }

      if (request.method === "GET" && ["/v1/schema", "/api/schema"].includes(path)) {
        return withCors(jsonResponse({
          ok: true,
          requestId,
          service: SERVICE,
          version: VERSION,
          ...apiContract()
        }));
      }

      if (request.method === "POST" && ["/v1/events", "/v1/collect", "/collect"].includes(path)) {
        return collect(request, env, ctx, requestId, started);
      }

      if (request.method === "GET" && ["/v1/platforms", "/api/platforms", "/api/sites"].includes(path)) {
        return listPlatforms(env, requestId);
      }

      if (request.method === "GET" && ["/v1/overview", "/api/overview"].includes(path)) {
        return overview(request, env, requestId);
      }

      if (request.method === "GET" && path === "/v1/events") {
        const platformId = url.searchParams.get("platform") || url.searchParams.get("site");
        return platformEvents(request, env, requestId, platformId || null);
      }

      if (request.method === "GET" && ["/v1/stats", "/api/stats"].includes(path)) {
        const platformId = url.searchParams.get("platform") || url.searchParams.get("site");
        return platformId
          ? platformStats(request, env, requestId, platformId)
          : overview(request, env, requestId);
      }

      if (request.method === "GET" && path.startsWith("/v1/platforms/")) {
        const rest = path.slice("/v1/platforms/".length);
        const slash = rest.indexOf("/");
        const rawPlatformId = slash === -1 ? rest : rest.slice(0, slash);
        const action = slash === -1 ? "" : rest.slice(slash + 1);
        const platformId = safeDecodeURIComponent(rawPlatformId);
        if (!platformId) {
          return withCors(jsonResponse({ ok: false, requestId, error: "PLATFORM_ID_REQUIRED" }, 400));
        }
        if (action === "events") return platformEvents(request, env, requestId, platformId);
        if (action === "visitors") return platformVisitors(request, env, requestId, platformId);
        if (action === "sessions") return platformSessions(request, env, requestId, platformId);
        if (!action) return platformStats(request, env, requestId, platformId);
      }

      if (request.method === "GET" && path.startsWith("/api/platform/")) {
        const platformId = safeDecodeURIComponent(path.slice("/api/platform/".length));
        return platformStats(request, env, requestId, platformId);
      }

      if (request.method === "GET" && path.startsWith("/api/site/")) {
        const platformId = safeDecodeURIComponent(path.slice("/api/site/".length));
        return platformStats(request, env, requestId, platformId);
      }

      if (request.method === "GET" && ["/v1/admin/events", "/api/admin/events"].includes(path)) {
        return adminEvents(request, env, requestId);
      }

      if (request.method === "GET" && path === "/v1/admin/event") {
        return adminEventDetail(request, env, requestId);
      }

      if (request.method === "GET" && path === "/v1/admin/notifications") {
        return adminNotifications(request, env, requestId);
      }

      if (request.method === "POST" && path.startsWith("/v1/admin/archive-retry/")) {
        const eventId = safeDecodeURIComponent(path.slice("/v1/admin/archive-retry/".length));
        return adminArchiveRetry(request, env, ctx, requestId, eventId);
      }

      if (request.method === "POST" && path === "/v1/admin/platform-key") {
        return adminSetPlatformKey(request, env, requestId);
      }

      if (request.method === "POST" && ["/telegram/webhook", "/v1/telegram/webhook"].includes(path)) {
        return telegramWebhook(request, env, ctx, requestId);
      }

      if (request.method === "GET" && path === "/telegram/setup") {
        return telegramSetup(request, env, requestId);
      }

      if (request.method === "GET" && path === "/telegram/test") {
        return telegramTest(request, env, requestId);
      }

      return withCors(jsonResponse({ ok: false, requestId, error: "NOT_FOUND", path }, 404));
    } catch (error) {
      log("error", "UNHANDLED_ERROR", {
        requestId,
        error: String(error?.message || error),
        stack: error?.stack || null,
        elapsedMs: Date.now() - started
      });
      return withCors(jsonResponse({
        ok: false,
        requestId,
        error: "INTERNAL_ERROR",
        message: env.DEBUG === "true" ? String(error?.message || error) : "Request failed"
      }, 500));
    }
  }
};

/* =============================================================
   COLLECTOR
============================================================= */
async function collect(request, env, ctx, requestId, started) {
  if (!env.DB) {
    return withCors(jsonResponse({ ok: false, accepted: false, requestId, error: "D1_NOT_CONFIGURED" }, 503));
  }

  const parsed = await readJson(request);
  if (parsed.error) {
    return withCors(jsonResponse({ ok: false, accepted: false, requestId, error: parsed.error }, parsed.status || 400));
  }

  let event;
  try {
    event = await normalizeEvent(request, parsed.data, requestId);
  } catch (error) {
    log("warn", "VALIDATION_ERROR", {
      requestId,
      error: String(error?.message || error)
    });
    return withCors(jsonResponse({
      ok: false,
      accepted: false,
      requestId,
      error: String(error?.message || error)
    }, 400));
  }

  const providedApiKey = request.headers.get("X-Platform-Key") || request.headers.get("X-API-Key");
  const auth = await validateOptionalPlatformKey(env, event.platformId, providedApiKey);
  if (!auth.ok) {
    return withCors(jsonResponse({
      ok: false,
      accepted: false,
      requestId,
      platformId: event.platformId,
      error: auth.error
    }, auth.status || 401));
  }

  log("info", "COLLECT_START", {
    requestId,
    eventId: event.eventId,
    platformId: event.platformId,
    eventType: event.eventType,
    hasIp: Boolean(event.ip),
    hasPlatformIp: Boolean(event.platformIp)
  });

  let storage;
  try {
    storage = await storeEvent(env, event);
  } catch (error) {
    log("error", "D1_STORE_FAILED", {
      requestId,
      eventId: event.eventId,
      platformId: event.platformId,
      error: String(error?.message || error),
      stack: error?.stack || null
    });
    return withCors(jsonResponse({
      ok: false,
      accepted: false,
      requestId,
      eventId: event.eventId,
      platformId: event.platformId,
      stored: { d1: false, github: false },
      error: "D1_STORE_FAILED",
      details: String(error?.message || error)
    }, 500));
  }

  if (storage.duplicate) {
    return withCors(jsonResponse({
      ok: true,
      accepted: true,
      duplicate: true,
      version: VERSION,
      requestId,
      eventId: event.eventId,
      platformId: event.platformId,
      eventType: event.eventType,
      stored: { d1: true, github: "unknown" },
      d1: { duplicate: true },
      receivedAt: event.receivedAt,
      elapsedMs: Date.now() - started
    }, 200));
  }

  let archive = {
    ok: false,
    status: "scheduled",
    pending: Boolean(ctx?.waitUntil),
    reason: "background"
  };

  const archiveTask = async () => {
    try {
      const result = await archiveToGithub(env, event, requestId, storage);
      log("info", result.ok ? "GITHUB_ARCHIVE_SUCCESS" : "GITHUB_ARCHIVE_RESULT", {
        requestId,
        eventId: event.eventId,
        platformId: event.platformId,
        status: result.status || null,
        attempts: result.attempts || null
      });
      return result;
    } catch (error) {
      log("error", "GITHUB_ARCHIVE_FAILED", {
        requestId,
        eventId: event.eventId,
        platformId: event.platformId,
        error: String(error?.message || error)
      });
      try {
        await recordArchive(env, event, "failed", ARCHIVE_ATTEMPTS, null, null, String(error?.message || error));
      } catch (recordError) {
        log("error", "ARCHIVE_STATE_RECORD_FAILED", {
          requestId,
          eventId: event.eventId,
          error: String(recordError?.message || recordError)
        });
      }
      return { ok: false, status: "failed", error: String(error?.message || error) };
    }
  };

  if (ctx?.waitUntil) {
    ctx.waitUntil(archiveTask());
  } else {
    archive = await archiveTask();
  }

  if (shouldNotify(env, event, storage)) {
    const task = sendTelegramVisitNotification(env, event, storage, requestId).catch(error => {
      log("error", "TELEGRAM_NOTIFICATION_FAILED", {
        requestId,
        eventId: event.eventId,
        error: String(error?.message || error)
      });
    });
    if (ctx?.waitUntil) ctx.waitUntil(task);
    else await task;
  }

  const responseOk = storage.aggregateOk;
  const httpStatus = responseOk ? 201 : 202;
  log("info", "COLLECT_COMPLETE", {
    requestId,
    eventId: event.eventId,
    platformId: event.platformId,
    d1: true,
    aggregates: storage.aggregateOk,
    github: archive.ok || archive.status === "scheduled",
    archiveStatus: archive.status || null,
    elapsedMs: Date.now() - started
  });

  return withCors(jsonResponse({
    ok: responseOk,
    accepted: true,
    version: VERSION,
    requestId,
    eventId: event.eventId,
    platformId: event.platformId,
    eventType: event.eventType,
    stored: { d1: true, github: archive.ok ? true : (archive.status === "scheduled" ? "scheduled" : false) },
    d1: {
      event: true,
      aggregates: storage.aggregateOk,
      aggregateError: storage.aggregateError || null,
      newVisitor: storage.newVisitor,
      newSession: storage.newSession
    },
    telegram: {
      enabled: telegramEnabled(env),
      eligible: Boolean(storage.notifyEligible)
    },
    github: archive,
    receivedAt: event.receivedAt,
    elapsedMs: Date.now() - started
  }, httpStatus));
}

async function readJson(request) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return { error: "PAYLOAD_TOO_LARGE", status: 413 };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return { error: "PAYLOAD_TOO_LARGE", status: 413 };
  if (!raw.trim()) return { error: "EMPTY_BODY", status: 400 };
  try {
    return { data: JSON.parse(raw) };
  } catch {
    return { error: "INVALID_JSON", status: 400 };
  }
}

async function normalizeEvent(request, payload, requestId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw Error("INVALID_PAYLOAD");
  }

  const platformObject = objectOrEmpty(payload.platform);
  const platformId = normalizePlatformId(
    payload.platformId || payload.platform_id || platformObject.id || platformObject.platformId ||
    (typeof payload.platform === "string" ? payload.platform : null) || payload.platformName ||
    payload.platform_name || payload.name || payload.app || payload.application || payload.source
  );
  if (!platformId) throw Error("PLATFORM_ID_REQUIRED");

  const page = objectOrEmpty(payload.page);
  const identity = objectOrEmpty(payload.identity);
  const screen = objectOrEmpty(payload.screen);
  const viewport = objectOrEmpty(payload.viewport);
  const connection = objectOrEmpty(payload.connection);
  const requestInfo = objectOrEmpty(payload.request);
  const geo = objectOrEmpty(payload.geo);
  const network = objectOrEmpty(payload.network);

  const platformName = clean(
    payload.platformName || payload.platform_name || payload.name || payload.label || platformId,
    160
  ) || platformId;
  const platformType = clean(
    payload.platformType || payload.platform_type || payload.typeName || payload.type || "generic",
    80
  ) || "generic";
  const platformUrl = validUrl(
    payload.platformUrl || payload.platform_url || payload.platform?.url || payload.appUrl || payload.app_url
  );
  const platformDomain = clean(
    payload.platformDomain || payload.platform_domain || payload.platform?.domain || hostOf(platformUrl),
    255
  );
  const environment = clean(payload.environment || payload.env || payload.runtime?.environment, 64);
  const appVersion = clean(payload.appVersion || payload.app_version || payload.version, 128);
  const sdkName = clean(payload.sdkName || payload.sdk_name, 128);
  const sdkVersion = clean(payload.sdkVersion || payload.sdk_version, 64);
  const source = clean(payload.source || payload.origin || payload.channel || "api", 128) || "api";

  const rawType = payload.eventType || payload.event_type || payload.eventName || payload.event_name || "custom";
  const eventType = normalizeEventType(rawType);
  const eventId = clean(payload.eventId || payload.event_id || crypto.randomUUID(), 128) || crypto.randomUUID();
  const receivedAt = new Date().toISOString();
  const occurredAt = normalizeOccurredAt(payload.timestamp || payload.occurredAt || payload.occurred_at, receivedAt);

  const clientIp = clean(
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("True-Client-IP") ||
    request.headers.get("X-Real-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim(),
    128
  );
  const forwardedFor = clean(request.headers.get("X-Forwarded-For"), 4096);
  const ipSource = request.headers.get("CF-Connecting-IP") ? "CF-Connecting-IP"
    : request.headers.get("True-Client-IP") ? "True-Client-IP"
      : request.headers.get("X-Real-IP") ? "X-Real-IP"
        : request.headers.get("X-Forwarded-For") ? "X-Forwarded-For" : null;

  const platformIp = clean(
    payload.platformIp || payload.platform_ip || payload.serverIp || payload.server_ip ||
    payload.sourceIp || payload.source_ip || payload.platform?.ip || payload.platform?.serverIp ||
    payload.platform?.server_ip || network.platformIp || network.platform_ip,
    128
  );

  const userAgent = clean(request.headers.get("User-Agent") || payload.userAgent || payload.user_agent, 4096) || "";
  const ua = parseUA(userAgent);
  const ipHash = clientIp ? await sha256(`${platformId}|${clientIp}`) : null;

  const userId = clean(payload.userId || payload.user_id || identity.userId || identity.user_id, 256);
  const anonymousId = clean(payload.anonymousId || payload.anonymous_id || identity.anonymousId || identity.anonymous_id, 256);
  const visitorId = clean(
    payload.visitorId || payload.visitor_id || identity.visitorId || identity.visitor_id,
    256
  ) || anonymousId || (ipHash ? ipHash.slice(0, 32) : `anon-${crypto.randomUUID().replaceAll("-", "")}`);
  const sessionId = clean(
    payload.sessionId || payload.session_id || identity.sessionId || identity.session_id,
    256
  ) || (await sha256(`${platformId}|${visitorId}|${Math.floor(Date.now() / 3600000)}`)).slice(0, 40);
  const traceId = clean(
    payload.traceId || payload.trace_id || request.headers.get("traceparent") || request.headers.get("X-Request-ID"),
    256
  );

  const pageUrl = validUrl(payload.pageUrl || payload.page_url || page.url);
  const pagePath = clean(payload.path || payload.pagePath || payload.page_path || page.path, 4096);
  const pageQuery = clean(
    payload.queryString || payload.query_string || page.query || (pageUrl ? new URL(pageUrl).search.slice(1) : null),
    8192
  );
  const title = clean(payload.title || page.title, 512);
  const referrer = validUrl(payload.referrer || page.referrer);
  const referrerHost = hostOf(referrer);
  const utm = parseUtm(pageUrl);

  const cf = request.cf && typeof request.cf === "object" ? request.cf : {};
  const botManagement = objectOrEmpty(cf.botManagement);

  const country = clean(cf.country || payload.country || geo.country, 32);
  const regionCode = clean(cf.regionCode || payload.regionCode || geo.regionCode, 32);
  const region = clean(cf.region || payload.region || geo.region, 128);
  const city = clean(cf.city || payload.city || geo.city, 128);
  const continent = clean(cf.continent || payload.continent || geo.continent, 16);
  const colo = clean(cf.colo || payload.colo, 32);
  const asn = safeInt(cf.asn ?? payload.asn ?? geo.asn, 0, 999999999);
  const asOrganization = clean(cf.asOrganization || payload.asOrganization || payload.as_organization || geo.asOrganization, 512);
  const latitude = clean(cf.latitude ?? payload.latitude ?? geo.latitude, 32);
  const longitude = clean(cf.longitude ?? payload.longitude ?? geo.longitude, 32);
  const postalCode = clean(cf.postalCode ?? payload.postalCode ?? payload.postal_code ?? geo.postalCode, 32);
  const metroCode = clean(cf.metroCode ?? payload.metroCode ?? payload.metro_code ?? geo.metroCode, 32);

  const dpr = safeFloat(screen.devicePixelRatio ?? payload.devicePixelRatio ?? payload.device_pixel_ratio, 0, 20);
  const colorDepth = safeInt(screen.colorDepth ?? payload.colorDepth, 0, 128);

  const requestUrlObject = new URL(request.url);
  const rawHeaders = buildSafeHeaderSnapshot(request.headers);
  const safePayload = redactSecrets(payload);
  const dataObject = payload.data !== undefined ? redactSecrets(payload.data) : {};
  const metadataObject = payload.metadata !== undefined ? redactSecrets(payload.metadata) : {};

  const requestObject = redactSecrets({
    method: request.method,
    url: request.url,
    request: requestInfo,
    contentType: request.headers.get("Content-Type"),
    contentLength: request.headers.get("Content-Length"),
    origin: request.headers.get("Origin"),
    referer: request.headers.get("Referer"),
    accept: request.headers.get("Accept"),
    acceptLanguage: request.headers.get("Accept-Language"),
    acceptEncoding: request.headers.get("Accept-Encoding"),
    userAgent,
    forwardedFor
  });

  const rawEventObject = redactSecrets({
    receivedAt,
    occurredAt,
    requestId,
    sourceRequest: {
      method: request.method,
      url: redactUrl(request.url),
      headers: rawHeaders,
      cf
    },
    clientEvent: safePayload
  });

  return {
    eventId,
    receivedAt,
    occurredAt,
    eventType,
    eventVersion: clean(payload.eventVersion || payload.event_version, 64),
    platformId,
    platformName,
    platformType,
    platformUrl,
    platformDomain,
    environment,
    appVersion,
    sdkName,
    sdkVersion,
    source,
    userId,
    sessionId,
    visitorId,
    anonymousId,
    traceId,
    requestId,
    pageUrl,
    path: pagePath,
    queryString: pageQuery,
    title,
    referrer,
    referrerHost,
    language: clean(payload.language || payload.lang || request.headers.get("Accept-Language"), 128),
    acceptLanguage: clean(request.headers.get("Accept-Language"), 512),
    timezone: clean(payload.timezone || cf.timezone || geo.timezone, 128),
    country,
    region,
    regionCode,
    city,
    continent,
    colo,
    asn,
    asOrganization,
    latitude,
    longitude,
    postalCode,
    metroCode,
    ip: clientIp,
    ipHash,
    platformIp,
    forwardedFor,
    ipSource,
    userAgent,
    browser: ua.browser,
    browserVersion: ua.browserVersion,
    os: ua.os,
    osVersion: ua.osVersion,
    device: clean(payload.device || payload.deviceType || payload.device_type, 128) || ua.device,
    deviceVendor: clean(payload.deviceVendor || payload.device_vendor || screen.vendor, 128),
    deviceModel: clean(payload.deviceModel || payload.device_model || screen.model, 128),
    screenWidth: safeInt(screen.width ?? payload.screenWidth ?? payload.screen_width, 0, 100000),
    screenHeight: safeInt(screen.height ?? payload.screenHeight ?? payload.screen_height, 0, 100000),
    viewportWidth: safeInt(viewport.width ?? payload.viewportWidth ?? payload.viewport_width, 0, 100000),
    viewportHeight: safeInt(viewport.height ?? payload.viewportHeight ?? payload.viewport_height, 0, 100000),
    devicePixelRatio: dpr,
    colorDepth,
    connectionType: clean(connection.effectiveType || connection.type || payload.connectionType || payload.connection_type, 64),
    connectionDownlink: safeFloat(connection.downlink ?? payload.connectionDownlink, 0, 100000),
    connectionRtt: safeInt(connection.rtt ?? payload.connectionRtt, 0, 600000),
    connectionSaveData: Boolean(connection.saveData ?? payload.connectionSaveData),
    httpMethod: request.method,
    requestUrl: redactUrl(request.url),
    requestScheme: requestUrlObject.protocol.replace(":", "").slice(0, 16),
    requestHost: clean(requestUrlObject.hostname, 255),
    requestPath: clean(requestUrlObject.pathname, 4096),
    requestQuery: clean(requestUrlObject.search.slice(1), 8192),
    cfRay: clean(request.headers.get("CF-Ray"), 256),
    tlsVersion: clean(cf.tlsVersion || payload.tlsVersion, 64),
    clientTcpRtt: safeInt(cf.clientTcpRtt ?? payload.clientTcpRtt, 0, 600000),
    clientQuicRtt: safeInt(cf.clientQuicRtt ?? payload.clientQuicRtt, 0, 600000),
    botScore: safeInt(botManagement.score ?? payload.botScore, 0, 100),
    verifiedBot: botManagement.verifiedBot === true || payload.verifiedBot === true || payload.verified_bot === true ? 1 : 0,
    ja3: clean(botManagement.ja3Hash || payload.ja3, 256),
    ja4: clean(botManagement.ja4 || payload.ja4, 256),
    responseStatus: safeInt(payload.responseStatus ?? payload.response_status, 100, 999),
    durationMs: safeInt(payload.durationMs ?? payload.duration_ms, 0, 86400000) || 0,
    maxScroll: safeInt(payload.maxScroll ?? payload.scrollDepth ?? payload.scroll_depth, 0, 100) || 0,
    clicks: safeInt(payload.clicks, 0, 100000) || 0,
    outboundClicks: safeInt(payload.outboundClicks ?? payload.outbound_clicks, 0, 100000) || 0,
    utmSource: utm.source || clean(payload.utmSource || payload.utm_source, 256),
    utmMedium: utm.medium || clean(payload.utmMedium || payload.utm_medium, 256),
    utmCampaign: utm.campaign || clean(payload.utmCampaign || payload.utm_campaign, 256),
    utmTerm: utm.term || clean(payload.utmTerm || payload.utm_term, 256),
    utmContent: utm.content || clean(payload.utmContent || payload.utm_content, 256),
    dataJson: safeJson(dataObject, MAX_JSON_FIELD_BYTES),
    metadataJson: safeJson(metadataObject, MAX_METADATA_BYTES),
    headersJson: safeJson(rawHeaders, MAX_METADATA_BYTES),
    cfJson: safeJson(cf, MAX_METADATA_BYTES),
    requestJson: safeJson(requestObject, MAX_METADATA_BYTES),
    payloadJson: safeJson(safePayload, MAX_JSON_FIELD_BYTES),
    rawEventJson: safeJson(rawEventObject, MAX_JSON_FIELD_BYTES),
    _originalPayload: safePayload
  };
}

/* =============================================================
   D1 STORAGE
============================================================= */
async function storeEvent(env, e) {
  const eventSql = `INSERT OR IGNORE INTO events (${EVENT_COLUMNS.join(",")}) VALUES (${EVENT_COLUMNS.map(() => "?").join(",")})`;
  const eventValues = EVENT_COLUMNS.map(column => eventValue(e, column));

  if (eventValues.length > 100) {
    throw Error(`EVENT_BIND_COUNT_EXCEEDED:${eventValues.length}`);
  }

  const eventResult = await env.DB.prepare(eventSql).bind(...eventValues).run();
  const inserted = Number(eventResult?.meta?.changes || 0) > 0;
  if (!inserted) {
    return {
      duplicate: true,
      newVisitor: false,
      newSession: false,
      notifyEligible: false,
      aggregateOk: true,
      aggregateError: null
    };
  }

  let newVisitor = false;
  let newSession = false;
  let aggregateOk = true;
  let aggregateError = null;

  try {
    const [platformInsert, visitorInsert, sessionInsert] = await env.DB.batch([
      preparedInsertIgnore(env.DB, "platforms", PLATFORM_COLUMNS, platformValues(e)),
      preparedInsertIgnore(env.DB, "platform_visitors", VISITOR_COLUMNS, visitorValues(e)),
      preparedInsertIgnore(env.DB, "platform_sessions", SESSION_COLUMNS, sessionValues(e))
    ]);

    newVisitor = Number(visitorInsert?.meta?.changes || 0) > 0;
    newSession = Number(sessionInsert?.meta?.changes || 0) > 0;

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE platform_sessions
        SET last_seen = ?,
            duration_ms = max(duration_ms, ?),
            event_count = event_count + 1,
            pageviews = pageviews + ?,
            max_scroll = max(max_scroll, ?),
            clicks = clicks + ?,
            outbound_clicks = outbound_clicks + ?,
            ip = COALESCE(?, ip),
            ip_hash = COALESCE(?, ip_hash),
            platform_ip = COALESCE(?, platform_ip),
            country = COALESCE(?, country),
            region = COALESCE(?, region),
            city = COALESCE(?, city),
            continent = COALESCE(?, continent),
            colo = COALESCE(?, colo),
            asn = COALESCE(?, asn),
            as_organization = COALESCE(?, as_organization),
            browser = COALESCE(?, browser),
            browser_version = COALESCE(?, browser_version),
            os = COALESCE(?, os),
            os_version = COALESCE(?, os_version),
            device = COALESCE(?, device),
            last_page_url = COALESCE(?, last_page_url),
            last_path = COALESCE(?, last_path),
            last_referrer = COALESCE(?, last_referrer),
            metadata_json = COALESCE(?, metadata_json)
        WHERE platform_id = ? AND session_id = ?
      `).bind(
        e.receivedAt, e.durationMs, e.eventType === "pageview" ? 1 : 0, e.maxScroll,
        e.clicks, e.outboundClicks, e.ip, e.ipHash, e.platformIp, e.country, e.region, e.city,
        e.continent, e.colo, e.asn, e.asOrganization, e.browser, e.browserVersion, e.os, e.osVersion,
        e.device, e.pageUrl, e.path, e.referrer, e.metadataJson, e.platformId, e.sessionId
      ),
      env.DB.prepare(`
        UPDATE platform_visitors
        SET last_seen = ?,
            user_id = COALESCE(?, user_id),
            anonymous_id = COALESCE(?, anonymous_id),
            last_ip = COALESCE(?, last_ip),
            last_ip_hash = COALESCE(?, last_ip_hash),
            country = COALESCE(?, country),
            region = COALESCE(?, region),
            region_code = COALESCE(?, region_code),
            city = COALESCE(?, city),
            continent = COALESCE(?, continent),
            colo = COALESCE(?, colo),
            asn = COALESCE(?, asn),
            as_organization = COALESCE(?, as_organization),
            latitude = COALESCE(?, latitude),
            longitude = COALESCE(?, longitude),
            postal_code = COALESCE(?, postal_code),
            timezone = COALESCE(?, timezone),
            language = COALESCE(?, language),
            user_agent = COALESCE(?, user_agent),
            browser = COALESCE(?, browser),
            browser_version = COALESCE(?, browser_version),
            os = COALESCE(?, os),
            os_version = COALESCE(?, os_version),
            device = COALESCE(?, device),
            device_vendor = COALESCE(?, device_vendor),
            device_model = COALESCE(?, device_model),
            screen_width = COALESCE(?, screen_width),
            screen_height = COALESCE(?, screen_height),
            viewport_width = COALESCE(?, viewport_width),
            viewport_height = COALESCE(?, viewport_height),
            device_pixel_ratio = COALESCE(?, device_pixel_ratio),
            color_depth = COALESCE(?, color_depth),
            last_page_url = COALESCE(?, last_page_url),
            last_path = COALESCE(?, last_path),
            last_referrer = COALESCE(?, last_referrer),
            metadata_json = COALESCE(?, metadata_json)
        WHERE platform_id = ? AND visitor_id = ?
      `).bind(
        e.receivedAt, e.userId, e.anonymousId, e.ip, e.ipHash, e.country, e.region, e.regionCode, e.city,
        e.continent, e.colo, e.asn, e.asOrganization, e.latitude, e.longitude, e.postalCode, e.timezone,
        e.language, e.userAgent, e.browser, e.browserVersion, e.os, e.osVersion, e.device, e.deviceVendor,
        e.deviceModel, e.screenWidth, e.screenHeight, e.viewportWidth, e.viewportHeight, e.devicePixelRatio,
        e.colorDepth, e.pageUrl, e.path, e.referrer, e.metadataJson, e.platformId, e.visitorId
      ),
      env.DB.prepare(`
        UPDATE platforms
        SET platform_name = ?,
            platform_type = ?,
            platform_url = COALESCE(?, platform_url),
            platform_domain = COALESCE(?, platform_domain),
            environment = COALESCE(?, environment),
            app_version = COALESCE(?, app_version),
            sdk_name = COALESCE(?, sdk_name),
            sdk_version = COALESCE(?, sdk_version),
            source = COALESCE(?, source),
            last_seen = ?,
            total_events = total_events + 1,
            total_pageviews = total_pageviews + ?,
            total_sessions = total_sessions + ?,
            total_visitors = total_visitors + ?,
            last_ip = COALESCE(?, last_ip),
            last_ip_hash = COALESCE(?, last_ip_hash),
            last_platform_ip = COALESCE(?, last_platform_ip),
            last_country = COALESCE(?, last_country),
            last_region = COALESCE(?, last_region),
            last_city = COALESCE(?, last_city),
            last_event_id = ?,
            last_event_type = ?,
            metadata_json = COALESCE(?, metadata_json)
        WHERE platform_id = ?
      `).bind(
        e.platformName, e.platformType, e.platformUrl, e.platformDomain, e.environment, e.appVersion,
        e.sdkName, e.sdkVersion, e.source, e.receivedAt, e.eventType === "pageview" ? 1 : 0,
        newSession ? 1 : 0, newVisitor ? 1 : 0, e.ip, e.ipHash, e.platformIp, e.country, e.region, e.city,
        e.eventId, e.eventType, e.metadataJson, e.platformId
      )
    ]);

    // Re-assert the platform insert was not silently omitted due to malformed env.
    void platformInsert;
  } catch (error) {
    aggregateOk = false;
    aggregateError = String(error?.message || error);
    log("error", "D1_AGGREGATE_FAILED", {
      eventId: e.eventId,
      platformId: e.platformId,
      error: aggregateError
    });
  }

  return {
    duplicate: false,
    newVisitor,
    newSession,
    notifyEligible: shouldNotifyEvent(e, newVisitor, newSession),
    aggregateOk,
    aggregateError,
    eventStored: true
  };
}

function eventValue(e, column) {
  const map = {
    id: e.eventId,
    received_at: e.receivedAt,
    occurred_at: e.occurredAt,
    event_type: e.eventType,
    event_version: e.eventVersion,
    platform_id: e.platformId,
    platform_name: e.platformName,
    platform_type: e.platformType,
    platform_url: e.platformUrl,
    platform_domain: e.platformDomain,
    environment: e.environment,
    app_version: e.appVersion,
    sdk_name: e.sdkName,
    sdk_version: e.sdkVersion,
    source: e.source,
    user_id: e.userId,
    session_id: e.sessionId,
    visitor_id: e.visitorId,
    anonymous_id: e.anonymousId,
    trace_id: e.traceId,
    request_id: e.requestId,
    page_url: e.pageUrl,
    path: e.path,
    query_string: e.queryString,
    title: e.title,
    referrer: e.referrer,
    referrer_host: e.referrerHost,
    language: e.language,
    accept_language: e.acceptLanguage,
    timezone: e.timezone,
    country: e.country,
    region: e.region,
    region_code: e.regionCode,
    city: e.city,
    continent: e.continent,
    colo: e.colo,
    asn: e.asn,
    as_organization: e.asOrganization,
    latitude: e.latitude,
    longitude: e.longitude,
    postal_code: e.postalCode,
    metro_code: e.metroCode,
    ip: e.ip,
    ip_hash: e.ipHash,
    platform_ip: e.platformIp,
    forwarded_for: e.forwardedFor,
    ip_source: e.ipSource,
    user_agent: e.userAgent,
    browser: e.browser,
    browser_version: e.browserVersion,
    os: e.os,
    os_version: e.osVersion,
    device: e.device,
    device_vendor: e.deviceVendor,
    device_model: e.deviceModel,
    screen_width: e.screenWidth,
    screen_height: e.screenHeight,
    viewport_width: e.viewportWidth,
    viewport_height: e.viewportHeight,
    device_pixel_ratio: e.devicePixelRatio,
    color_depth: e.colorDepth,
    connection_type: e.connectionType,
    connection_downlink: e.connectionDownlink,
    connection_rtt: e.connectionRtt,
    connection_save_data: e.connectionSaveData ? 1 : 0,
    http_method: e.httpMethod,
    request_url: e.requestUrl,
    request_scheme: e.requestScheme,
    request_host: e.requestHost,
    request_path: e.requestPath,
    request_query: e.requestQuery,
    cf_ray: e.cfRay,
    tls_version: e.tlsVersion,
    client_tcp_rtt: e.clientTcpRtt,
    client_quic_rtt: e.clientQuicRtt,
    bot_score: e.botScore,
    verified_bot: e.verifiedBot,
    ja3: e.ja3,
    ja4: e.ja4,
    response_status: e.responseStatus,
    duration_ms: e.durationMs,
    max_scroll: e.maxScroll,
    clicks: e.clicks,
    outbound_clicks: e.outboundClicks,
    utm_source: e.utmSource,
    utm_medium: e.utmMedium,
    utm_campaign: e.utmCampaign,
    utm_term: e.utmTerm,
    utm_content: e.utmContent,
    data_json: e.dataJson,
    metadata_json: e.metadataJson,
    headers_json: e.headersJson,
    cf_json: e.cfJson,
    request_json: e.requestJson,
    payload_json: e.payloadJson,
    raw_event_json: e.rawEventJson
  };
  return Object.prototype.hasOwnProperty.call(map, column) ? map[column] : null;
}

function platformValues(e) {
  return [
    e.platformId, e.platformName, e.platformType, e.platformUrl, e.platformDomain,
    e.environment, e.appVersion, e.sdkName, e.sdkVersion, e.source,
    e.receivedAt, e.receivedAt, 0, 0, 0, 0,
    e.ip, e.ipHash, e.platformIp, e.country, e.region, e.city,
    e.eventId, e.eventType, null, null, e.metadataJson, "{}"
  ];
}

function visitorValues(e) {
  return [
    e.platformId, e.visitorId, e.userId, e.anonymousId, e.receivedAt, e.receivedAt, e.ip, e.ipHash,
    e.country, e.region, e.regionCode, e.city, e.continent, e.colo, e.asn, e.asOrganization,
    e.latitude, e.longitude, e.postalCode, e.timezone, e.language, e.userAgent, e.browser, e.browserVersion,
    e.os, e.osVersion, e.device, e.deviceVendor, e.deviceModel, e.screenWidth, e.screenHeight,
    e.viewportWidth, e.viewportHeight, e.devicePixelRatio, e.colorDepth, e.pageUrl, e.path, e.referrer, e.metadataJson
  ];
}

function sessionValues(e) {
  return [
    e.platformId, e.sessionId, e.visitorId, e.userId, e.anonymousId, e.occurredAt, e.receivedAt,
    e.durationMs, 0, 0, e.maxScroll, e.clicks, e.outboundClicks, e.ip, e.ipHash, e.platformIp,
    e.country, e.region, e.city, e.continent, e.colo, e.asn, e.asOrganization, e.browser, e.browserVersion,
    e.os, e.osVersion, e.device, e.pageUrl, e.path, e.referrer, e.metadataJson
  ];
}

function preparedInsertIgnore(db, table, columns, values) {
  if (values.length !== columns.length) {
    throw Error(`BIND_MISMATCH:${table}:${columns.length}:${values.length}`);
  }
  return db.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`).bind(...values);
}

/* =============================================================
   GITHUB ARCHIVE
============================================================= */
async function archiveToGithub(env, e, requestId, storage) {
  if (String(env.GITHUB_ARCHIVE_ENABLED ?? "true").toLowerCase() !== "true") {
    await recordArchive(env, e, "disabled", 0, null, null, "archive_disabled");
    return { ok: false, status: "skipped", skipped: true, reason: "disabled" };
  }

  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) {
    await recordArchive(env, e, "not_configured", 0, null, null, "github_not_configured");
    return { ok: false, status: "skipped", skipped: true, reason: "github_not_configured" };
  }

  const d = new Date(e.receivedAt);
  const year = d.getUTCFullYear().toString();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const stamp = e.receivedAt.replace(/:/g, "-").replace(/\.\d{3}Z$/i, "").replace(/[^0-9TZ-]/g, "");
  const path = `data/platforms/${safePath(e.platformId)}/events/${year}/${month}/${day}/${stamp}_${safePath(e.eventId)}.json`;

  const archive = {
    schemaVersion: "9.0",
    service: SERVICE,
    workerVersion: VERSION,
    requestId,
    archivedAt: new Date().toISOString(),
    platform: {
      id: e.platformId,
      name: e.platformName,
      type: e.platformType,
      url: e.platformUrl,
      domain: e.platformDomain,
      environment: e.environment,
      source: e.source
    },
    storage: {
      ...storage,
      // _originalPayload is deliberately excluded from the duplicated internal storage object.
    },
    event: { ...e, _originalPayload: undefined }
  };
  delete archive.event._originalPayload;

  const content = JSON.stringify(archive, null, 2);
  const url = `${GH_API}/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  let lastError = null;

  for (let attempt = 1; attempt <= ARCHIVE_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, {
        method: "PUT",
        headers: githubHeaders(env),
        body: JSON.stringify({
          message: `analytics: ${e.platformId}/${e.eventType}/${e.eventId}`.slice(0, 120),
          content: base64Utf8(content),
          branch: env.GITHUB_BRANCH || "main",
          committer: {
            name: "Universal Event Insights",
            email: "universal-event-insights@users.noreply.github.com"
          }
        })
      }, ARCHIVE_TIMEOUT_MS);

      const text = await response.text();
      if (response.ok) {
        let result = {};
        try { result = JSON.parse(text); } catch { /* keep empty result */ }
        const out = {
          ok: true,
          status: response.status,
          path,
          attempts: attempt,
          commitSha: result?.commit?.sha || null,
          fileSha: result?.content?.sha || null
        };
        await recordArchive(env, e, "archived", attempt, out.commitSha, out.fileSha, null, path);
        return out;
      }

      lastError = Error(`GITHUB_${response.status}:${text.slice(0, 1600)}`);

      // A branch race may produce 409. A prior successful request can also race
      // with a timeout. If the file already exists, recover it instead of duplicating.
      if (response.status === 409 || response.status === 422) {
        const recovered = await recoverGithubFile(env, url);
        if (recovered) {
          const out = {
            ok: true,
            status: recovered.status,
            recovered: true,
            path,
            attempts: attempt,
            commitSha: null,
            fileSha: recovered.sha || null
          };
          await recordArchive(env, e, "archived", attempt, null, recovered.sha || null, null, path);
          return out;
        }
      }

      if (attempt < ARCHIVE_ATTEMPTS && [409, 429, 500, 502, 503, 504].includes(response.status)) {
        await sleep(500 * attempt);
        continue;
      }
      break;
    } catch (error) {
      lastError = error;
      if (attempt < ARCHIVE_ATTEMPTS) {
        await sleep(500 * attempt);
        continue;
      }
    }
  }

  const errorText = String(lastError?.message || lastError || "GITHUB_ARCHIVE_FAILED").slice(0, 1800);
  await recordArchive(env, e, "failed", ARCHIVE_ATTEMPTS, null, null, errorText, path);
  throw Error(errorText);
}

async function recoverGithubFile(env, url) {
  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: githubHeaders(env)
    }, 10000);
    if (!response.ok) return null;
    const data = await response.json();
    if (data?.type !== "file") return null;
    return { status: 200, sha: data.sha || null };
  } catch {
    return null;
  }
}

async function recordArchive(env, e, status, attempts, commitSha, fileSha, errorText, path = null) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO event_archives(event_id,platform_id,archive_path,created_at,status,attempts,commit_sha,file_sha,last_error)
      VALUES(?,?,?,?,?,?,?,?,?)
    `).bind(
      e.eventId,
      e.platformId,
      path || "",
      new Date().toISOString(),
      status,
      attempts,
      commitSha,
      fileSha,
      errorText
    ).run();
  } catch (error) {
    log("warn", "ARCHIVE_STATUS_WRITE_FAILED", {
      eventId: e.eventId,
      error: String(error?.message || error)
    });
  }
}

/* =============================================================
   TELEGRAM
============================================================= */
function telegramEnabled(env) {
  const explicit = String(env.TELEGRAM_ENABLED ?? "auto").trim().toLowerCase();
  if (explicit === "false" || explicit === "0" || explicit === "off" || explicit === "disabled") return false;
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID);
}

function notifyMode(env) {
  const mode = String(env.TELEGRAM_NOTIFY_MODE || DEFAULT_NOTIFY_MODE).toLowerCase();
  return ["off", "event", "session", "visitor"].includes(mode) ? mode : DEFAULT_NOTIFY_MODE;
}

function shouldNotifyEvent(event, newVisitor, newSession) {
  if (["heartbeat", "visibility", "scroll", "click", "outbound_click", "connection_change", "pageleave"].includes(event.eventType)) return false;
  return Boolean(newVisitor || newSession);
}

function shouldNotify(env, event, storage) {
  if (!telegramEnabled(env) || !storage.notifyEligible) return false;
  const mode = notifyMode(env);
  if (mode === "off") return false;
  if (mode === "event") return true;
  if (mode === "session") return storage.newSession;
  return storage.newVisitor;
}

async function sendTelegramVisitNotification(env, e, storage, requestId) {
  const lines = [
    "🚨 <b>Universal Event Insights</b>",
    "",
    `🧩 <b>Platform:</b> ${escapeHtml(e.platformName)} <code>[${escapeHtml(e.platformId)}]</code>`,
    `🏷️ <b>Type:</b> ${escapeHtml(e.platformType)}`,
    `🌐 <b>Platform URL:</b> ${escapeHtml(e.platformDomain || e.platformUrl || "unknown")}`,
    `⚡ <b>Event:</b> ${escapeHtml(e.eventType)}`,
    `🕒 <b>Time:</b> ${escapeHtml(e.receivedAt)}`,
    `🌍 <b>Client IP:</b> <code>${escapeHtml(e.ip || "unknown")}</code>`,
    `🖥️ <b>Platform IP:</b> <code>${escapeHtml(e.platformIp || "unknown")}</code>`,
    `📍 <b>Location:</b> ${escapeHtml([e.city, e.region, e.country].filter(Boolean).join(", ") || "unknown")}`,
    `🏢 <b>ASN:</b> ${escapeHtml(String(e.asn || "unknown"))}${e.asOrganization ? ` — ${escapeHtml(e.asOrganization)}` : ""}`,
    `💻 <b>Device:</b> ${escapeHtml(e.device || "unknown")}`,
    `🌍 <b>OS:</b> ${escapeHtml(e.os || "unknown")}${e.osVersion ? ` ${escapeHtml(e.osVersion)}` : ""}`,
    `🧭 <b>Browser:</b> ${escapeHtml(e.browser || "unknown")}${e.browserVersion ? ` ${escapeHtml(e.browserVersion)}` : ""}`,
    `📄 <b>Page:</b> ${escapeHtml(e.path || e.pageUrl || "unknown")}`,
    `🔗 <b>Referrer:</b> ${escapeHtml(e.referrerHost || "direct")}`,
    `⏱️ <b>Duration:</b> ${escapeHtml(formatDuration(e.durationMs))}`,
    `📜 <b>Scroll:</b> ${e.maxScroll}%`,
    `🖱️ <b>Clicks:</b> ${e.clicks} / ${e.outboundClicks} outbound`,
    `🧑 <b>Visitor:</b> <code>${escapeHtml(e.visitorId)}</code>`,
    `🪪 <b>Session:</b> <code>${escapeHtml(e.sessionId)}</code>`,
    `🆔 <b>Request:</b> <code>${escapeHtml(requestId)}</code>`,
    `🔖 <b>Trace:</b> <code>${escapeHtml(e.traceId || "unknown")}</code>`,
    `🧱 <b>UA:</b> ${escapeHtml(truncate(e.userAgent || "unknown", 700))}`
  ];
  if (e.pageUrl) lines.push(`🔎 <b>URL:</b> ${escapeHtml(truncate(e.pageUrl, 700))}`);
  if (!storage.aggregateOk) lines.push(`⚠️ <b>D1 aggregates:</b> ${escapeHtml(storage.aggregateError || "degraded")}`);

  const message = lines.join("\n").slice(0, TELEGRAM_MAX - 80);
  try {
    const result = await telegramApi(env, "sendMessage", {
      chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
      text: message,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    await recordNotification(env, e, "sent", String(result?.result?.message_id || ""), null);
    return result;
  } catch (error) {
    await recordNotification(env, e, "failed", null, String(error?.message || error).slice(0, 1000));
    throw error;
  }
}

async function recordNotification(env, event, status, messageId, errorText) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO notification_log(event_id,platform_id,channel,sent_at,status,message_id,error)
      VALUES(?,?,?,?,?,?,?)
    `).bind(event.eventId, event.platformId, "telegram", new Date().toISOString(), status, messageId, errorText).run();
  } catch (error) {
    log("warn", "NOTIFICATION_LOG_WRITE_FAILED", {
      eventId: event.eventId,
      error: String(error?.message || error)
    });
  }
}

async function telegramWebhook(request, env, ctx, requestId) {
  if (!env.TELEGRAM_BOT_TOKEN) return jsonResponse({ ok: false, requestId, error: "TELEGRAM_NOT_CONFIGURED" }, 503);

  const expected = String(env.TELEGRAM_WEBHOOK_SECRET || "");
  if (expected) {
    const received = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    if (received !== expected) return jsonResponse({ ok: false, requestId, error: "INVALID_WEBHOOK_SECRET" }, 401);
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return jsonResponse({ ok: false, requestId, error: "INVALID_JSON" }, 400);
  }

  const message = update?.message;
  if (!message?.chat?.id || typeof message.text !== "string") {
    return jsonResponse({ ok: true, ignored: true, requestId });
  }

  if (String(message.chat.id) !== String(env.TELEGRAM_ADMIN_CHAT_ID)) {
    return jsonResponse({ ok: true, ignored: true, requestId });
  }

  const commandText = message.text.trim();
  const task = handleTelegramCommand(env, message, commandText, requestId).catch(error => {
    log("error", "TELEGRAM_COMMAND_FAILED", {
      requestId,
      error: String(error?.message || error)
    });
  });

  if (ctx?.waitUntil) ctx.waitUntil(task);
  else await task;

  return jsonResponse({ ok: true, requestId });
}

async function handleTelegramCommand(env, message, text, requestId) {
  const [command, ...args] = text.split(/\s+/);
  const cmd = String(command || "").toLowerCase().split("@")[0];
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID;

  if (["/start", "/help"].includes(cmd)) {
    return telegramApi(env, "sendMessage", {
      chat_id: chatId,
      text: "🤖 <b>Universal Event Insights</b>\n\n/status — system status\n/health — full diagnostics\n/platforms — list platforms\n/platform &lt;id&gt; — platform summary\n/stats &lt;id&gt; — 7-day stats\n/recent &lt;id&gt; — recent events\n/docs — API documentation\n/id — admin chat ID\n/about — bot information",
      parse_mode: "HTML"
    });
  }

  if (["/id", "/whoami"].includes(cmd)) {
    return telegramApi(env, "sendMessage", {
      chat_id: chatId,
      text: `🪪 Chat ID: <code>${escapeHtml(String(message.chat.id))}</code>`,
      parse_mode: "HTML"
    });
  }

  if (["/status", "/health"].includes(cmd)) {
    const full = cmd === "/health";
    const health = await buildHealth(env, requestId, full);
    const c = health.checks;
    const txt = [
      `🛰️ <b>System: ${escapeHtml(health.overall)}</b>`,
      `⚙️ Worker: ${escapeHtml(c.worker.status)}`,
      `🗄️ D1: ${escapeHtml(c.database.status)} — ${c.database.counts?.events ?? 0} events`,
      `🌐 GitHub: ${escapeHtml(c.github.status)}`,
      `📡 Telemetry: ${escapeHtml(c.telemetry.status)}`,
      `🧩 Platforms: ${c.database.counts?.platforms ?? 0}`,
      `🤖 Telegram: ${telegramEnabled(env) ? "configured" : "not configured"}`
    ].join("\n");
    return telegramApi(env, "sendMessage", { chat_id: chatId, text: txt, parse_mode: "HTML" });
  }

  if (cmd === "/platforms") {
    const rows = await env.DB.prepare(`
      SELECT platform_id, platform_name, platform_type, last_seen, total_events, total_pageviews
      FROM platforms ORDER BY last_seen DESC LIMIT 50
    `).all();
    const out = rows.results?.length
      ? ["🧩 <b>Platforms</b>", ...rows.results.map((x, i) =>
        `${i + 1}. <b>${escapeHtml(x.platform_name)}</b> <code>${escapeHtml(x.platform_id)}</code> — ${Number(x.total_pageviews || 0)} views`
      )].join("\n")
      : "📭 No platforms yet.";
    return telegramApi(env, "sendMessage", { chat_id: chatId, text: out.slice(0, TELEGRAM_MAX), parse_mode: "HTML" });
  }

  if (["/platform", "/stats"].includes(cmd)) {
    const platformId = normalizePlatformId(args[0]);
    if (!platformId) {
      return telegramApi(env, "sendMessage", {
        chat_id: chatId,
        text: `Usage: ${cmd} &lt;platform-id&gt;`,
        parse_mode: "HTML"
      });
    }
    const data = await getPlatformSummary(env, platformId, 7);
    if (!data.platform) {
      return telegramApi(env, "sendMessage", { chat_id: chatId, text: "Platform not found." });
    }
    const txt = [
      `🧩 <b>${escapeHtml(data.platform.platformName)}</b>`,
      `ID: <code>${escapeHtml(data.platform.platformId)}</code>`,
      `Type: ${escapeHtml(data.platform.platformType)}`,
      `👁 Views: ${data.totals.views}`,
      `📦 Events: ${data.totals.events}`,
      `👤 Visitors: ${data.totals.uniqueVisitors}`,
      `🧭 Sessions: ${data.totals.sessions}`,
      `⏱ Avg duration: ${formatDuration(data.totals.avgDurationMs)}`,
      `📍 Top country: ${escapeHtml(data.countries?.[0]?.label || "unknown")}`
    ].join("\n");
    return telegramApi(env, "sendMessage", { chat_id: chatId, text: txt, parse_mode: "HTML" });
  }

  if (cmd === "/recent") {
    const platformId = normalizePlatformId(args[0]);
    if (!platformId) {
      return telegramApi(env, "sendMessage", { chat_id: chatId, text: "Usage: /recent <platform-id>" });
    }
    const rows = await env.DB.prepare(`
      SELECT received_at,event_type,ip,city,country,path,duration_ms
      FROM events WHERE platform_id=? ORDER BY rowid DESC LIMIT 8
    `).bind(platformId).all();
    const out = rows.results?.length
      ? ["🕘 <b>Recent events</b>", ...rows.results.map(x =>
        `${escapeHtml(x.received_at)} — ${escapeHtml(x.event_type)} — <code>${escapeHtml(x.ip || "unknown")}</code> — ${escapeHtml(x.city || x.country || "unknown")} — ${escapeHtml(x.path || "/")}`
      )].join("\n")
      : "📭 No events.";
    return telegramApi(env, "sendMessage", { chat_id: chatId, text: out.slice(0, TELEGRAM_MAX), parse_mode: "HTML" });
  }

  if (cmd === "/docs") {
    const textOut = `📚 <b>Universal Event Insights API</b>\n\nPOST /v1/events\nGET /v1/platforms\nGET /v1/overview\nGET /v1/schema\n\nUse the deployed Worker URL + these paths.`;
    return telegramApi(env, "sendMessage", { chat_id: chatId, text: textOut, parse_mode: "HTML", disable_web_page_preview: true });
  }

  if (cmd === "/about") {
    return telegramApi(env, "sendMessage", {
      chat_id: chatId,
      text: "🌌 <b>Universal Event Insights</b>\nUniversal telemetry, analytics and platform monitoring for websites, APIs, bots, apps, services and custom event sources.",
      parse_mode: "HTML"
    });
  }

  return telegramApi(env, "sendMessage", { chat_id: chatId, text: "Unknown command. Use /help" });
}

async function telegramSetup(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok: false, requestId, error: "UNAUTHORIZED" }, 401));
  if (!env.TELEGRAM_BOT_TOKEN) return withCors(jsonResponse({ ok: false, requestId, error: "TELEGRAM_BOT_TOKEN_MISSING" }, 503));

  const webhookUrl = new URL("/telegram/webhook", request.url).toString();
  const result = await telegramApi(env, "setWebhook", {
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET || undefined,
    allowed_updates: ["message"],
    drop_pending_updates: true
  });

  return withCors(jsonResponse({
    ok: true,
    requestId,
    webhookUrl,
    telegram: result
  }));
}

async function telegramTest(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok: false, requestId, error: "UNAUTHORIZED" }, 401));
  if (!telegramEnabled(env)) return withCors(jsonResponse({ ok: false, requestId, error: "TELEGRAM_NOT_CONFIGURED" }, 503));
  const result = await telegramApi(env, "sendMessage", {
    chat_id: env.TELEGRAM_ADMIN_CHAT_ID,
    text: "✅ Universal Event Insights Telegram integration is working."
  });
  return withCors(jsonResponse({ ok: true, requestId, telegram: result }));
}

async function telegramApi(env, method, body) {
  const response = await fetchWithTimeout(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    },
    TELEGRAM_TIMEOUT_MS
  );
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* handled below */ }
  if (!response.ok || parsed?.ok === false) {
    throw Error(`TELEGRAM_${response.status}:${text.slice(0, 1200)}`);
  }
  return parsed || { ok: true };
}

/* =============================================================
   READ APIs
============================================================= */
async function listPlatforms(env, requestId) {
  const result = await env.DB.prepare(`
    SELECT
      platform_id AS platformId,
      platform_name AS platformName,
      platform_type AS platformType,
      platform_url AS platformUrl,
      platform_domain AS platformDomain,
      environment,
      app_version AS appVersion,
      sdk_name AS sdkName,
      sdk_version AS sdkVersion,
      source,
      first_seen AS firstSeen,
      last_seen AS lastSeen,
      total_events AS totalEvents,
      total_pageviews AS totalPageviews,
      total_sessions AS totalSessions,
      total_visitors AS totalVisitors,
      last_ip AS lastIp,
      last_platform_ip AS lastPlatformIp,
      last_country AS lastCountry,
      last_region AS lastRegion,
      last_city AS lastCity,
      last_event_id AS lastEventId,
      last_event_type AS lastEventType,
      metadata_json AS metadataJson,
      capabilities_json AS capabilitiesJson
    FROM platforms
    ORDER BY last_seen DESC
    LIMIT 500
  `).all();

  return withCors(jsonResponse({ ok: true, requestId, count: result.results?.length || 0, platforms: result.results || [] }));
}

async function overview(request, env, requestId) {
  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get("days"));
  const since = days === "all" ? null : daysAgo(days);
  const filter = days === "all" ? "" : "WHERE received_at >= ?";
  const bind = days === "all" ? [] : [since];

  const total = await env.DB.prepare(`
    SELECT
      COUNT(*) AS events,
      COUNT(CASE WHEN event_type='pageview' THEN 1 END) AS pageviews,
      COUNT(DISTINCT platform_id || ':' || visitor_id) AS uniqueVisitors,
      COUNT(DISTINCT platform_id || ':' || session_id) AS sessions,
      COALESCE(AVG(duration_ms),0) AS avgDurationMs,
      COALESCE(AVG(max_scroll),0) AS avgScroll
    FROM events ${filter}
  `).bind(...bind).first();

  const [daily, countries, browsers, oses, devices, ips, platforms] = await Promise.all([
    grouped(env, `SELECT substr(received_at,1,10) AS day,COUNT(*) AS events,COUNT(CASE WHEN event_type='pageview' THEN 1 END) AS pageviews,COUNT(DISTINCT platform_id || ':' || visitor_id) AS uniqueVisitors FROM events ${filter} GROUP BY day ORDER BY day`, bind),
    grouped(env, `SELECT country AS label,COUNT(*) AS count FROM events ${days === "all" ? "WHERE country IS NOT NULL" : "WHERE received_at>=? AND country IS NOT NULL"} GROUP BY country ORDER BY count DESC LIMIT 30`, bind),
    grouped(env, `SELECT browser,COUNT(*) AS count FROM events ${filter} GROUP BY browser ORDER BY count DESC LIMIT 30`, bind),
    grouped(env, `SELECT os,COUNT(*) AS count FROM events ${filter} GROUP BY os ORDER BY count DESC LIMIT 30`, bind),
    grouped(env, `SELECT device,COUNT(*) AS count FROM events ${filter} GROUP BY device ORDER BY count DESC LIMIT 30`, bind),
    grouped(env, `SELECT ip,COUNT(*) AS count,MAX(city) AS city,MAX(country) AS country FROM events ${days === "all" ? "WHERE ip IS NOT NULL" : "WHERE received_at>=? AND ip IS NOT NULL"} GROUP BY ip ORDER BY count DESC LIMIT 50`, bind),
    env.DB.prepare(`SELECT platform_id AS platformId,platform_name AS platformName,platform_type AS platformType,total_events AS totalEvents,total_pageviews AS totalPageviews,total_sessions AS totalSessions,total_visitors AS totalVisitors,last_seen AS lastSeen FROM platforms ORDER BY last_seen DESC LIMIT 100`).all()
  ]);

  const events = await recentEvents(env, null, days, MAX_LIMIT);

  return withCors(jsonResponse({
    ok: true,
    requestId,
    days,
    totals: numbers(total),
    daily: daily.results || [],
    countries: countries.results || [],
    browsers: browsers.results || [],
    operatingSystems: oses.results || [],
    devices: devices.results || [],
    ips: ips.results || [],
    platforms: platforms.results || [],
    recentEvents: events
  }));
}

async function platformStats(request, env, requestId, platformIdRaw) {
  const platformId = normalizePlatformId(platformIdRaw);
  if (!platformId) return withCors(jsonResponse({ ok: false, requestId, error: "INVALID_PLATFORM_ID" }, 400));
  const days = parseDays(new URL(request.url).searchParams.get("days"));
  const data = await getPlatformSummary(env, platformId, days);
  return withCors(jsonResponse({ ok: true, requestId, ...data }));
}

async function getPlatformSummary(env, platformId, days) {
  const since = days === "all" ? null : daysAgo(days);
  const where = days === "all" ? "platform_id=?" : "platform_id=? AND received_at>=?";
  const bind = days === "all" ? [platformId] : [platformId, since];

  const platform = await env.DB.prepare(`
    SELECT
      platform_id AS platformId, platform_name AS platformName, platform_type AS platformType,
      platform_url AS platformUrl, platform_domain AS platformDomain,
      environment, app_version AS appVersion, sdk_name AS sdkName, sdk_version AS sdkVersion,
      source, first_seen AS firstSeen, last_seen AS lastSeen,
      total_events AS totalEvents, total_pageviews AS totalPageviews,
      total_sessions AS totalSessions, total_visitors AS totalVisitors,
      last_ip AS lastIp, last_platform_ip AS lastPlatformIp,
      last_country AS lastCountry, last_region AS lastRegion, last_city AS lastCity,
      last_event_id AS lastEventId, last_event_type AS lastEventType,
      metadata_json AS metadataJson, capabilities_json AS capabilitiesJson
    FROM platforms WHERE platform_id=?
  `).bind(platformId).first();

  if (!platform) {
    return {
      platformId,
      platform: null,
      site: null,
      totals: { views: 0, uniqueVisitors: 0, sessions: 0, events: 0, avgDurationMs: 0, avgScroll: 0 },
      daily: [], countries: [], browsers: [], operatingSystems: [], devices: [], ips: [], topPages: [], recentEvents: []
    };
  }

  const totals = await env.DB.prepare(`
    SELECT COUNT(*) AS events,
      COUNT(CASE WHEN event_type='pageview' THEN 1 END) AS views,
      COUNT(DISTINCT visitor_id) AS uniqueVisitors,
      COUNT(DISTINCT session_id) AS sessions,
      COALESCE(AVG(duration_ms),0) AS avgDurationMs,
      COALESCE(AVG(max_scroll),0) AS avgScroll
    FROM events WHERE ${where}
  `).bind(...bind).first();

  const recent = await recentEvents(env, platformId, days, MAX_LIMIT);
  const [daily, countries, browsers, oses, devices, ips, pages] = await Promise.all([
    env.DB.prepare(`SELECT substr(received_at,1,10) AS day,COUNT(*) AS events,COUNT(CASE WHEN event_type='pageview' THEN 1 END) AS views,COUNT(DISTINCT visitor_id) AS uniqueVisitors,COUNT(DISTINCT session_id) AS sessions FROM events WHERE ${where} GROUP BY day ORDER BY day`).bind(...bind).all(),
    env.DB.prepare(`SELECT country AS label,COUNT(*) AS count FROM events WHERE ${where} AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 30`).bind(...bind).all(),
    env.DB.prepare(`SELECT browser,COUNT(*) AS count FROM events WHERE ${where} GROUP BY browser ORDER BY count DESC LIMIT 30`).bind(...bind).all(),
    env.DB.prepare(`SELECT os,COUNT(*) AS count FROM events WHERE ${where} GROUP BY os ORDER BY count DESC LIMIT 30`).bind(...bind).all(),
    env.DB.prepare(`SELECT device,COUNT(*) AS count FROM events WHERE ${where} GROUP BY device ORDER BY count DESC LIMIT 30`).bind(...bind).all(),
    env.DB.prepare(`SELECT ip,COUNT(*) AS count,MAX(city) AS city,MAX(country) AS country,MAX(browser) AS browser,MAX(os) AS os,MAX(device) AS device FROM events WHERE ${where} AND ip IS NOT NULL GROUP BY ip ORDER BY count DESC LIMIT 50`).bind(...bind).all(),
    env.DB.prepare(`SELECT path,title,COUNT(*) AS views FROM events WHERE ${where} AND event_type='pageview' GROUP BY path,title ORDER BY views DESC LIMIT 50`).bind(...bind).all()
  ]);

  return {
    platformId,
    platform,
    site: platform,
    totals: numbers(totals),
    daily: daily.results || [],
    countries: countries.results || [],
    browsers: browsers.results || [],
    operatingSystems: oses.results || [],
    devices: devices.results || [],
    ips: ips.results || [],
    topPages: pages.results || [],
    recentEvents: recent
  };
}

async function platformVisitors(request, env, requestId, platformIdRaw) {
  const platformId = normalizePlatformId(platformIdRaw);
  if (!platformId) return withCors(jsonResponse({ ok: false, requestId, error: "INVALID_PLATFORM_ID" }, 400));
  const limit = boundedLimit(new URL(request.url).searchParams.get("limit"), 100);
  const rows = await env.DB.prepare(`
    SELECT * FROM platform_visitors WHERE platform_id=? ORDER BY last_seen DESC LIMIT ?
  `).bind(platformId, limit).all();
  return withCors(jsonResponse({ ok: true, requestId, platformId, count: rows.results?.length || 0, visitors: rows.results || [] }));
}

async function platformSessions(request, env, requestId, platformIdRaw) {
  const platformId = normalizePlatformId(platformIdRaw);
  if (!platformId) return withCors(jsonResponse({ ok: false, requestId, error: "INVALID_PLATFORM_ID" }, 400));
  const limit = boundedLimit(new URL(request.url).searchParams.get("limit"), 100);
  const rows = await env.DB.prepare(`
    SELECT * FROM platform_sessions WHERE platform_id=? ORDER BY last_seen DESC LIMIT ?
  `).bind(platformId, limit).all();
  return withCors(jsonResponse({ ok: true, requestId, platformId, count: rows.results?.length || 0, sessions: rows.results || [] }));
}

async function platformEvents(request, env, requestId, platformIdRaw) {
  const url = new URL(request.url);
  const platformId = platformIdRaw ? normalizePlatformId(platformIdRaw) : null;
  if (platformIdRaw && !platformId) return withCors(jsonResponse({ ok: false, requestId, error: "INVALID_PLATFORM_ID" }, 400));
  const limit = boundedLimit(url.searchParams.get("limit"), 100);
  const days = parseDays(url.searchParams.get("days"));
  const since = days === "all" ? null : daysAgo(days);
  const rows = platformId
    ? days === "all"
      ? await env.DB.prepare(`SELECT * FROM events WHERE platform_id=? ORDER BY rowid DESC LIMIT ?`).bind(platformId, limit).all()
      : await env.DB.prepare(`SELECT * FROM events WHERE platform_id=? AND received_at>=? ORDER BY rowid DESC LIMIT ?`).bind(platformId, since, limit).all()
    : days === "all"
      ? await env.DB.prepare(`SELECT * FROM events ORDER BY rowid DESC LIMIT ?`).bind(limit).all()
      : await env.DB.prepare(`SELECT * FROM events WHERE received_at>=? ORDER BY rowid DESC LIMIT ?`).bind(since, limit).all();

  return withCors(jsonResponse({
    ok: true,
    requestId,
    platformId,
    days,
    count: rows.results?.length || 0,
    events: rows.results || []
  }));
}

async function recentEvents(env, platformId, days, limit) {
  const since = days === "all" ? null : daysAgo(days);
  const select = `
    SELECT
      id,
      received_at AS receivedAt,
      occurred_at AS occurredAt,
      event_type AS eventType,
      event_version AS eventVersion,
      platform_id AS platformId,
      platform_name AS platformName,
      platform_type AS platformType,
      platform_url AS platformUrl,
      platform_domain AS platformDomain,
      environment,
      app_version AS appVersion,
      sdk_name AS sdkName,
      sdk_version AS sdkVersion,
      source,
      user_id AS userId,
      session_id AS sessionId,
      visitor_id AS visitorId,
      anonymous_id AS anonymousId,
      trace_id AS traceId,
      request_id AS requestId,
      page_url AS pageUrl,
      path,
      query_string AS queryString,
      title,
      referrer,
      referrer_host AS referrerHost,
      language,
      accept_language AS acceptLanguage,
      timezone,
      country,
      region,
      region_code AS regionCode,
      city,
      continent,
      colo,
      asn,
      as_organization AS asOrganization,
      latitude,
      longitude,
      postal_code AS postalCode,
      metro_code AS metroCode,
      ip,
      ip_hash AS ipHash,
      platform_ip AS platformIp,
      forwarded_for AS forwardedFor,
      ip_source AS ipSource,
      user_agent AS userAgent,
      browser,
      browser_version AS browserVersion,
      os,
      os_version AS osVersion,
      device,
      device_vendor AS deviceVendor,
      device_model AS deviceModel,
      screen_width AS screenWidth,
      screen_height AS screenHeight,
      viewport_width AS viewportWidth,
      viewport_height AS viewportHeight,
      device_pixel_ratio AS devicePixelRatio,
      color_depth AS colorDepth,
      connection_type AS connectionType,
      connection_downlink AS connectionDownlink,
      connection_rtt AS connectionRtt,
      connection_save_data AS connectionSaveData,
      http_method AS httpMethod,
      request_url AS requestUrl,
      request_scheme AS requestScheme,
      request_host AS requestHost,
      request_path AS requestPath,
      request_query AS requestQuery,
      cf_ray AS cfRay,
      tls_version AS tlsVersion,
      client_tcp_rtt AS clientTcpRtt,
      client_quic_rtt AS clientQuicRtt,
      bot_score AS botScore,
      verified_bot AS verifiedBot,
      ja3,
      ja4,
      response_status AS responseStatus,
      duration_ms AS durationMs,
      max_scroll AS maxScroll,
      clicks,
      outbound_clicks AS outboundClicks,
      utm_source AS utmSource,
      utm_medium AS utmMedium,
      utm_campaign AS utmCampaign,
      utm_term AS utmTerm,
      utm_content AS utmContent,
      data_json AS dataJson,
      metadata_json AS metadataJson,
      headers_json AS headersJson,
      cf_json AS cfJson,
      request_json AS requestJson,
      payload_json AS payloadJson,
      raw_event_json AS rawEventJson
    FROM events
  `;
  if (platformId) {
    return days === "all"
      ? (await env.DB.prepare(`${select} WHERE platform_id=? ORDER BY rowid DESC LIMIT ?`).bind(platformId, limit).all()).results || []
      : (await env.DB.prepare(`${select} WHERE platform_id=? AND received_at>=? ORDER BY rowid DESC LIMIT ?`).bind(platformId, since, limit).all()).results || [];
  }
  return days === "all"
    ? (await env.DB.prepare(`${select} ORDER BY rowid DESC LIMIT ?`).bind(limit).all()).results || []
    : (await env.DB.prepare(`${select} WHERE received_at>=? ORDER BY rowid DESC LIMIT ?`).bind(since, limit).all()).results || [];
}

/* =============================================================
   ADMIN
============================================================= */
async function adminEvents(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok: false, requestId, error: "UNAUTHORIZED" }, 401));
  const url = new URL(request.url);
  return platformEvents(request, env, requestId, url.searchParams.get("platform") || null);
}

async function adminEventDetail(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok: false, requestId, error: "UNAUTHORIZED" }, 401));
  const id = clean(new URL(request.url).searchParams.get("id"), 128);
  if (!id) return withCors(jsonResponse({ ok: false, requestId, error: "EVENT_ID_REQUIRED" }, 400));
  const row = await env.DB.prepare(`SELECT * FROM events WHERE id=? LIMIT 1`).bind(id).first();
  if (!row) return withCors(jsonResponse({ ok: false, requestId, error: "EVENT_NOT_FOUND" }, 404));
  return withCors(jsonResponse({ ok: true, requestId, event: row }));
}

async function adminArchiveRetry(request, env, ctx, requestId, eventId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok: false, requestId, error: "UNAUTHORIZED" }, 401));
  const id = clean(eventId, 128);
  if (!id) return withCors(jsonResponse({ ok: false, requestId, error: "EVENT_ID_REQUIRED" }, 400));

  const row = await env.DB.prepare(`SELECT * FROM events WHERE id=? LIMIT 1`).bind(id).first();
  if (!row) return withCors(jsonResponse({ ok: false, requestId, error: "EVENT_NOT_FOUND" }, 404));
  const event = rowToEvent(row);

  const task = (async () => {
    try {
      const result = await archiveToGithub(env, event, requestId, { manualRetry: true });
      return result;
    } catch (error) {
      log("error", "ARCHIVE_RETRY_FAILED", {
        requestId,
        eventId: id,
        error: String(error?.message || error)
      });
      return { ok: false, error: String(error?.message || error) };
    }
  })();

  if (ctx?.waitUntil) {
    ctx.waitUntil(task);
    return withCors(jsonResponse({ ok: true, requestId, eventId: id, accepted: true, background: true }, 202));
  }
  const result = await task;
  return withCors(jsonResponse({ ok: Boolean(result?.ok), requestId, eventId: id, result }, result?.ok ? 200 : 502));
}

function adminAuthorized(request, env) {
  return Boolean(env.ADMIN_KEY && request.headers.get("X-Admin-Key") === env.ADMIN_KEY);
}

async function adminSetPlatformKey(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok: false, requestId, error: "UNAUTHORIZED" }, 401));
  let body;
  try { body = await request.json(); } catch { return withCors(jsonResponse({ ok: false, requestId, error: "INVALID_JSON" }, 400)); }
  const platformId = normalizePlatformId(body.platformId || body.platform || body.platformName || body.name);
  const apiKey = clean(body.apiKey, 512);
  if (!platformId || !apiKey) return withCors(jsonResponse({ ok: false, requestId, error: "PLATFORM_ID_AND_API_KEY_REQUIRED" }, 400));

  const name = clean(body.platformName || body.name || platformId, 160) || platformId;
  const type = clean(body.platformType || body.type || "generic", 80) || "generic";
  const hash = await sha256(apiKey);
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT OR IGNORE INTO platforms(platform_id,platform_name,platform_type,first_seen,last_seen,total_events,total_pageviews,total_sessions,total_visitors,api_key_hash,metadata_json,capabilities_json)
    VALUES(?,?,?,?,?,0,0,0,0,?,?,'{}')
  `).bind(platformId, name, type, now, now, hash, "{}").run();

  await env.DB.prepare(`
    UPDATE platforms SET platform_name=?,platform_type=?,api_key_hash=?,api_key_updated_at=? WHERE platform_id=?
  `).bind(name, type, hash, now, platformId).run();

  return withCors(jsonResponse({ ok: true, requestId, platformId, platformName: name, platformType: type, configured: true }));
}

async function adminNotifications(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok: false, requestId, error: "UNAUTHORIZED" }, 401));
  const limit = boundedLimit(new URL(request.url).searchParams.get("limit"), 50);
  const result = await env.DB.prepare(`SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT ?`).bind(limit).all();
  return withCors(jsonResponse({ ok: true, requestId, count: result.results?.length || 0, notifications: result.results || [] }));
}

/* =============================================================
   HEALTH
============================================================= */
async function systemHealth(env, requestId, probeGithub) {
  const health = await buildHealth(env, requestId, probeGithub);
  return withCors(jsonResponse(health, health.ok ? 200 : 503));
}

async function buildHealth(env, requestId, probeGithub = false) {
  const checks = {
    worker: {
      status: "ok",
      version: VERSION,
      requestDriven: true,
      noCronRequired: true
    },
    configuration: {
      status: env.DB && env.GITHUB_OWNER && env.GITHUB_REPO && env.GITHUB_BRANCH ? "ok" : "warning",
      d1Binding: Boolean(env.DB),
      githubToken: Boolean(env.GITHUB_TOKEN),
      githubOwner: env.GITHUB_OWNER || null,
      githubRepository: env.GITHUB_REPO || null,
      githubBranch: env.GITHUB_BRANCH || null,
      telegramEnabled: String(env.TELEGRAM_ENABLED ?? "false").toLowerCase() === "true",
      telegramConfigured: telegramEnabled(env),
      telegramBotToken: Boolean(env.TELEGRAM_BOT_TOKEN),
      telegramAdminConfigured: Boolean(env.TELEGRAM_ADMIN_CHAT_ID)
    },
    database: await checkDatabase(env),
    github: await checkGithub(env, probeGithub),
    telemetry: await checkTelemetry(env)
  };

  const statuses = Object.values(checks).map(x => x.status);
  const overall = statuses.includes("error") ? "error" : statuses.includes("warning") || statuses.includes("stale") ? "degraded" : "healthy";
  return {
    ok: overall !== "error",
    requestId,
    service: SERVICE,
    version: VERSION,
    generatedAt: new Date().toISOString(),
    overall,
    checks
  };
}

async function checkDatabase(env) {
  const started = Date.now();
  const expectedTables = ["schema_meta", "platforms", "platform_visitors", "platform_sessions", "events", "event_archives", "notification_log"];
  const expectedColumns = {
    events: EVENT_COLUMNS,
    platforms: PLATFORM_COLUMNS,
    platform_visitors: VISITOR_COLUMNS,
    platform_sessions: SESSION_COLUMNS
  };
  try {
    if (!env.DB) throw Error("D1 binding DB is missing");
    await env.DB.prepare("SELECT 1 AS ok").first();

    const tables = await env.DB.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table'
      AND name IN (${expectedTables.map(() => "?").join(",")})
      ORDER BY name
    `).bind(...expectedTables).all();
    const tableNames = new Set((tables.results || []).map(row => row.name));
    const missingTables = expectedTables.filter(name => !tableNames.has(name));

    const columnResults = await Promise.all(
      Object.entries(expectedColumns).map(async ([table, columns]) => {
        const result = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
        const actual = (result.results || []).map(row => row.name);
        const missing = columns.filter(name => !actual.includes(name));
        const unexpected = actual.filter(name => !columns.includes(name));
        return [table, { actual, expected: columns, missing, unexpected }];
      })
    );
    const columnChecks = Object.fromEntries(columnResults);
    const schemaMismatch = Object.values(columnChecks).some(check => check.missing.length || check.unexpected.length || check.actual.length !== check.expected.length);

    let counts = { platforms: 0, events: 0, sessions: 0, visitors: 0, archives: 0, notifications: 0 };
    let latestEvent = null;
    if (missingTables.length === 0) {
      const countRow = await env.DB.prepare(`
        SELECT
          (SELECT COUNT(*) FROM platforms) AS platforms,
          (SELECT COUNT(*) FROM events) AS events,
          (SELECT COUNT(*) FROM platform_sessions) AS sessions,
          (SELECT COUNT(*) FROM platform_visitors) AS visitors,
          (SELECT COUNT(*) FROM event_archives) AS archives,
          (SELECT COUNT(*) FROM notification_log) AS notifications
      `).first();
      counts = {
        platforms: Number(countRow?.platforms || 0),
        events: Number(countRow?.events || 0),
        sessions: Number(countRow?.sessions || 0),
        visitors: Number(countRow?.visitors || 0),
        archives: Number(countRow?.archives || 0),
        notifications: Number(countRow?.notifications || 0)
      };
      latestEvent = await env.DB.prepare(`
        SELECT received_at,platform_id,event_type,ip,platform_ip
        FROM events ORDER BY rowid DESC LIMIT 1
      `).first();
    }

    const healthy = missingTables.length === 0 && !schemaMismatch;
    return {
      status: healthy ? "ok" : "error",
      message: healthy ? "D1 is reachable and Universal schema is present" : "D1 schema is incomplete or does not match the Worker contract",
      latencyMs: Date.now() - started,
      expectedTableCount: expectedTables.length,
      tableCount: tableNames.size,
      missingTables,
      eventColumnCount: columnChecks.events?.actual.length || 0,
      expectedEventColumnCount: EVENT_COLUMNS.length,
      columnChecks: Object.fromEntries(Object.entries(columnChecks).map(([name, check]) => [name, {
        actualCount: check.actual.length,
        expectedCount: check.expected.length,
        missing: check.missing,
        unexpected: check.unexpected
      }])),
      counts,
      latestEvent: latestEvent ? {
        receivedAt: latestEvent.received_at,
        platformId: latestEvent.platform_id,
        eventType: latestEvent.event_type,
        hasIp: Boolean(latestEvent.ip),
        hasPlatformIp: Boolean(latestEvent.platform_ip)
      } : null
    };
  } catch (error) {
    return {
      status: "error",
      message: "D1 health check failed",
      latencyMs: Date.now() - started,
      error: String(error?.message || error)
    };
  }
}

async function checkGithub(env, probe) {
  const configured = Boolean(env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO && env.GITHUB_BRANCH);
  if (!configured) {
    return { status: "warning", message: "GitHub archive is not fully configured", configured: false, probed: false };
  }
  if (!probe) {
    return { status: "ok", message: "GitHub configuration present (probe disabled)", configured: true, probed: false };
  }

  const started = Date.now();
  try {
    const response = await fetchWithTimeout(
      `${GH_API}/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`,
      { method: "GET", headers: githubHeaders(env) },
      10000
    );
    const text = await response.text();
    if (!response.ok) throw Error(`GitHub ${response.status}: ${text.slice(0, 700)}`);
    const data = JSON.parse(text);
    return {
      status: "ok",
      message: "Authenticated GitHub access works",
      configured: true,
      probed: true,
      latencyMs: Date.now() - started,
      repository: data.full_name,
      defaultBranch: data.default_branch,
      rateLimit: {
        limit: Number(response.headers.get("x-ratelimit-limit") || 0),
        remaining: Number(response.headers.get("x-ratelimit-remaining") || 0),
        used: Number(response.headers.get("x-ratelimit-used") || 0)
      }
    };
  } catch (error) {
    return {
      status: "error",
      message: "GitHub probe failed",
      configured: true,
      probed: true,
      latencyMs: Date.now() - started,
      error: String(error?.message || error)
    };
  }
}

async function checkTelemetry(env) {
  try {
    const row = await env.DB.prepare(`
      SELECT received_at,platform_id,event_type FROM events ORDER BY rowid DESC LIMIT 1
    `).first();
    if (!row) return { status: "warning", message: "No telemetry has been received yet", latestEventAt: null, ageSeconds: null };
    const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(row.received_at).getTime()) / 1000));
    return {
      status: ageSeconds <= 300 ? "ok" : "stale",
      message: ageSeconds <= 300 ? "Recent telemetry received" : "No event received within the last five minutes",
      latestEventAt: row.received_at,
      latestPlatformId: row.platform_id,
      latestEventType: row.event_type,
      ageSeconds
    };
  } catch (error) {
    return { status: "error", message: String(error?.message || error) };
  }
}

/* =============================================================
   API CONTRACT
============================================================= */
function apiContract() {
  return {
    contractVersion: "4.1",
    identityField: "platformId",
    genericPayload: true,
    arbitraryEventTypes: true,
    preservesRawPayload: true,
    rawIpStored: true,
    platformIpSupported: true,
    dynamicFolders: true,
    telegramNotification: true,
    noCron: true,
    eventColumnCount: EVENT_COLUMNS.length,
    endpoints: {
      collect: "POST /v1/events",
      collectCompatibility: ["POST /v1/collect", "POST /collect"],
      platforms: "GET /v1/platforms",
      overview: "GET /v1/overview?days=7",
      platform: "GET /v1/platforms/<platformId>?days=7",
      platformEvents: "GET /v1/platforms/<platformId>/events?days=7&limit=100",
      visitors: "GET /v1/platforms/<platformId>/visitors?limit=100",
      sessions: "GET /v1/platforms/<platformId>/sessions?limit=100",
      allEvents: "GET /v1/events?days=7&limit=100",
      statsCompatibility: "GET /v1/stats?platform=<platformId>&days=7",
      health: "GET /v1/health?probe=github",
      schema: "GET /v1/schema",
      adminEvents: "GET /v1/admin/events",
      adminNotifications: "GET /v1/admin/notifications",
      adminEventDetail: "GET /v1/admin/event?id=<eventId>",
      adminArchiveRetry: "POST /v1/admin/archive-retry/<eventId>",
      adminPlatformKey: "POST /v1/admin/platform-key",
      telegramWebhook: "POST /telegram/webhook",
      telegramSetup: "GET /telegram/setup",
      telegramTest: "GET /telegram/test"
    },
    requiredForCollect: ["platformId"],
    recommendedForCollect: [
      "platformName", "platformType", "platformUrl", "platformDomain", "environment",
      "appVersion", "sdkName", "sdkVersion", "eventType", "eventId", "identity", "page",
      "screen", "viewport", "connection", "data", "metadata", "platformIp"
    ],
    recommendedEventTypes: [...RECOMMENDED_EVENT_TYPES],
    customEventTypesAllowed: true
  };
}

/* =============================================================
   PLATFORM KEY
============================================================= */
async function validateOptionalPlatformKey(env, platformId, key) {
  const enforce = String(env.REQUIRE_PLATFORM_KEY || "false").toLowerCase() === "true";
  if (!key) return enforce ? { ok: false, error: "PLATFORM_KEY_REQUIRED", status: 401 } : { ok: true };
  try {
    const row = await env.DB.prepare(`SELECT api_key_hash FROM platforms WHERE platform_id=? LIMIT 1`).bind(platformId).first();
    if (!row || !row.api_key_hash) {
      return enforce
        ? { ok: false, error: "PLATFORM_KEY_INVALID", status: 401 }
        : { ok: true };
    }
    const candidate = await sha256(key);
    return candidate === row.api_key_hash
      ? { ok: true }
      : { ok: false, error: "PLATFORM_KEY_INVALID", status: 401 };
  } catch (error) {
    return enforce
      ? { ok: false, error: `PLATFORM_KEY_CHECK_FAILED:${String(error?.message || error)}`, status: 503 }
      : { ok: true };
  }
}

/* =============================================================
   ROW MAPPING
============================================================= */
function rowToEvent(row) {
  return {
    eventId: row.id,
    receivedAt: row.received_at,
    occurredAt: row.occurred_at,
    eventType: row.event_type,
    eventVersion: row.event_version,
    platformId: row.platform_id,
    platformName: row.platform_name,
    platformType: row.platform_type,
    platformUrl: row.platform_url,
    platformDomain: row.platform_domain,
    environment: row.environment,
    appVersion: row.app_version,
    sdkName: row.sdk_name,
    sdkVersion: row.sdk_version,
    source: row.source,
    userId: row.user_id,
    sessionId: row.session_id,
    visitorId: row.visitor_id,
    anonymousId: row.anonymous_id,
    traceId: row.trace_id,
    requestId: row.request_id,
    pageUrl: row.page_url,
    path: row.path,
    queryString: row.query_string,
    title: row.title,
    referrer: row.referrer,
    referrerHost: row.referrer_host,
    language: row.language,
    acceptLanguage: row.accept_language,
    timezone: row.timezone,
    country: row.country,
    region: row.region,
    regionCode: row.region_code,
    city: row.city,
    continent: row.continent,
    colo: row.colo,
    asn: row.asn,
    asOrganization: row.as_organization,
    latitude: row.latitude,
    longitude: row.longitude,
    postalCode: row.postal_code,
    metroCode: row.metro_code,
    ip: row.ip,
    ipHash: row.ip_hash,
    platformIp: row.platform_ip,
    forwardedFor: row.forwarded_for,
    ipSource: row.ip_source,
    userAgent: row.user_agent,
    browser: row.browser,
    browserVersion: row.browser_version,
    os: row.os,
    osVersion: row.os_version,
    device: row.device,
    deviceVendor: row.device_vendor,
    deviceModel: row.device_model,
    screenWidth: row.screen_width,
    screenHeight: row.screen_height,
    viewportWidth: row.viewport_width,
    viewportHeight: row.viewport_height,
    devicePixelRatio: row.device_pixel_ratio,
    colorDepth: row.color_depth,
    connectionType: row.connection_type,
    connectionDownlink: row.connection_downlink,
    connectionRtt: row.connection_rtt,
    connectionSaveData: Boolean(row.connection_save_data),
    httpMethod: row.http_method,
    requestUrl: row.request_url,
    requestScheme: row.request_scheme,
    requestHost: row.request_host,
    requestPath: row.request_path,
    requestQuery: row.request_query,
    cfRay: row.cf_ray,
    tlsVersion: row.tls_version,
    clientTcpRtt: row.client_tcp_rtt,
    clientQuicRtt: row.client_quic_rtt,
    botScore: row.bot_score,
    verifiedBot: row.verified_bot,
    ja3: row.ja3,
    ja4: row.ja4,
    responseStatus: row.response_status,
    durationMs: row.duration_ms,
    maxScroll: row.max_scroll,
    clicks: row.clicks,
    outboundClicks: row.outbound_clicks,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmTerm: row.utm_term,
    utmContent: row.utm_content,
    dataJson: row.data_json,
    metadataJson: row.metadata_json,
    headersJson: row.headers_json,
    cfJson: row.cf_json,
    requestJson: row.request_json,
    payloadJson: row.payload_json,
    rawEventJson: row.raw_event_json
  };
}

/* =============================================================
   HELPERS
============================================================= */
function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
}

function normalizePath(value) {
  const raw = String(value || "/").replace(/\/+/g, "/");
  return raw === "/" ? "/" : raw.replace(/\/+$/, "");
}

function normalizePlatformId(value) {
  const source = clean(value, 96);
  if (!source) return null;
  const normalized = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (!normalized || normalized.includes("..") || normalized.startsWith(".git")) return null;
  return normalized.slice(0, 80);
}

function safePath(value) {
  const result = String(value || "unknown")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return result || "unknown";
}

function clean(value, max = 256) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\u0000/g, "").trim();
  return text ? text.slice(0, max) : null;
}

function safeInt(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function safeFloat(value, min, max) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

function normalizeEventType(value) {
  const normalized = String(value ?? "custom")
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "_")
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, 80);
  return normalized || "custom";
}

function normalizeOccurredAt(value, fallback) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  // Do not discard valid historical client timestamps. Only prevent absurd future timestamps.
  const now = Date.now();
  if (date.getTime() > now + 24 * 60 * 60 * 1000) return fallback;
  return date.toISOString();
}

function parseDays(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "all") return "all";
  const number = Number(value || 7);
  return Number.isFinite(number) ? Math.min(MAX_DAYS, Math.max(1, Math.trunc(number))) : 7;
}

function daysAgo(days) {
  return new Date(Date.now() - Number(days) * 86400000).toISOString();
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/i.test(url.protocol) ? url.href.slice(0, 8192) : null;
  } catch {
    return null;
  }
}

function hostOf(value) {
  try { return new URL(value).hostname.slice(0, 255); } catch { return null; }
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeJson(value, maxBytes) {
  try {
    const serialized = JSON.stringify(value ?? {});
    if (new TextEncoder().encode(serialized).byteLength <= maxBytes) return serialized;
    return JSON.stringify({
      truncated: true,
      reason: "json_size_limit",
      maxBytes,
      preview: typeof serialized === "string" ? serialized.slice(0, Math.max(0, maxBytes - 1200)) : ""
    });
  } catch (error) {
    return JSON.stringify({ serializationError: true, message: String(error?.message || error) });
  }
}

function truncate(value, max) {
  const text = String(value || "");
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

function boundedLimit(value, fallback) {
  const number = Number(value || fallback);
  return Number.isFinite(number) ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(number))) : fallback;
}

function grouped(env, sql, bind) {
  return bind.length ? env.DB.prepare(sql).bind(...bind).all() : env.DB.prepare(sql).all();
}

function numbers(row) {
  const out = {};
  for (const [key, value] of Object.entries(row || {})) out[key] = Number(value || 0);
  return out;
}

function parseUtm(value) {
  const out = { source: null, medium: null, campaign: null, term: null, content: null };
  if (!value) return out;
  try {
    const url = new URL(value);
    out.source = clean(url.searchParams.get("utm_source"), 256);
    out.medium = clean(url.searchParams.get("utm_medium"), 256);
    out.campaign = clean(url.searchParams.get("utm_campaign"), 256);
    out.term = clean(url.searchParams.get("utm_term"), 256);
    out.content = clean(url.searchParams.get("utm_content"), 256);
  } catch { /* not a valid URL */ }
  return out;
}

function redactSecrets(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 24) return "[MAX_DEPTH]";
  if (Array.isArray(value)) return value.slice(0, 500).map(item => redactSecrets(item, depth + 1));
  if (typeof value !== "object") return value;

  const output = {};
  for (const [key, item] of Object.entries(value).slice(0, 1000)) {
    if (/password|passwd|secret|token|authorization|cookie|set-cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|private[-_]?key|client[-_]?secret|signature/i.test(key)) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = redactSecrets(item, depth + 1);
    }
  }
  return output;
}

function buildSafeHeaderSnapshot(headers) {
  const output = {};
  for (const [key, value] of headers.entries()) {
    if (/authorization|cookie|set-cookie|proxy-authorization|x-api-key|x-platform-key|x-admin-key|token|secret|password/i.test(key)) continue;
    output[key] = clean(value, 4096);
  }
  return output;
}

function redactUrl(value) {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|key|password|auth|cookie|signature|code/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.href.slice(0, 8192);
  } catch {
    return clean(value, 8192);
  }
}

async function sha256(input) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(input || "")));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
}

function base64Utf8(value) {
  const bytes = new TextEncoder().encode(value);
  let output = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    output += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(output);
}

function githubHeaders(env) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "X-GitHub-Api-Version": GH_API_VERSION,
    "User-Agent": SERVICE
  };
}

async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(milliseconds) {
  let seconds = Math.max(0, Math.round(Number(milliseconds || 0) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainder}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function log(level, event, data) {
  const payload = { ts: new Date().toISOString(), level, event, ...data };
  if (level === "error") console.error(JSON.stringify(payload));
  else if (level === "warn") console.warn(JSON.stringify(payload));
  else console.log(JSON.stringify(payload));
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
  headers.set("Access-Control-Max-Age", "86400");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function uaVersion(userAgent, regex) {
  const match = String(userAgent || "").match(regex);
  return match?.[1] || null;
}

function parseUA(userAgent) {
  let browser = "Other";
  let browserVersion = null;
  let os = "Other";
  let osVersion = null;
  let device = "Desktop";

  if (/EdgA\//i.test(userAgent)) {
    browser = "Edge Android";
    browserVersion = uaVersion(userAgent, /EdgA\/([\d.]+)/i);
  } else if (/EdgiOS\//i.test(userAgent)) {
    browser = "Edge iOS";
    browserVersion = uaVersion(userAgent, /EdgiOS\/([\d.]+)/i);
  } else if (/Edg\//i.test(userAgent)) {
    browser = "Edge";
    browserVersion = uaVersion(userAgent, /Edg\/([\d.]+)/i);
  } else if (/OPR\//i.test(userAgent)) {
    browser = "Opera";
    browserVersion = uaVersion(userAgent, /OPR\/([\d.]+)/i);
  } else if (/SamsungBrowser\//i.test(userAgent)) {
    browser = "Samsung Internet";
    browserVersion = uaVersion(userAgent, /SamsungBrowser\/([\d.]+)/i);
  } else if (/CriOS\//i.test(userAgent)) {
    browser = "Chrome iOS";
    browserVersion = uaVersion(userAgent, /CriOS\/([\d.]+)/i);
  } else if (/Chrome\//i.test(userAgent)) {
    browser = "Chrome";
    browserVersion = uaVersion(userAgent, /Chrome\/([\d.]+)/i);
  } else if (/Firefox\//i.test(userAgent)) {
    browser = "Firefox";
    browserVersion = uaVersion(userAgent, /Firefox\/([\d.]+)/i);
  } else if (/Version\/[\d.]+.*Safari/i.test(userAgent)) {
    browser = "Safari";
    browserVersion = uaVersion(userAgent, /Version\/([\d.]+)/i);
  }

  if (/Windows/i.test(userAgent)) os = "Windows";
  else if (/Android/i.test(userAgent)) {
    os = "Android";
    osVersion = uaVersion(userAgent, /Android\s([\d.]+)/i);
  } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
    os = "iOS";
    osVersion = (uaVersion(userAgent, /OS\s([\d_]+)/i) || "").replace(/_/g, ".") || null;
  } else if (/Mac OS X/i.test(userAgent)) {
    os = "macOS";
    osVersion = (uaVersion(userAgent, /Mac OS X\s([\d_.]+)/i) || "").replace(/_/g, ".") || null;
  } else if (/CrOS/i.test(userAgent)) os = "ChromeOS";
  else if (/Linux/i.test(userAgent)) os = "Linux";

  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)) device = "Tablet";
  else if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(userAgent)) device = "Mobile";

  return { browser, browserVersion, os, osVersion, device };
}
