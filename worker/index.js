const VERSION = "7.0.0";
const SERVICE = "universal-event-insights-worker";
const GH_API = "https://api.github.com";
const GH_API_VERSION = "2026-03-10";
const MAX_BODY = 128 * 1024;
const MAX_DAYS = 365;
const MAX_LIMIT = 500;
const TELEGRAM_MAX = 4096;
const DEFAULT_NOTIFY_MODE = "visitor";

const EVENT_TYPES = new Set([
  "pageview", "heartbeat", "pageleave", "visibility", "click",
  "outbound_click", "scroll", "request", "login", "logout",
  "purchase", "error", "custom"
]);

const CORS_ALLOW_HEADERS = "Content-Type, Authorization, X-Admin-Key, X-Platform-Key, X-API-Key";

export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    const url = new URL(request.url);

    log("info", "REQUEST_START", { requestId, method: request.method, path: url.pathname });

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    try {
      const path = url.pathname.replace(/\/+$/, "") || "/";

      if (request.method === "GET" && path === "/") {
        return withCors(jsonResponse({
          ok: true,
          service: SERVICE,
          version: VERSION,
          status: "online",
          architecture: "universal-request-driven",
          noCronRequired: true,
          endpoints: apiContract().endpoints
        }));
      }

      if (request.method === "GET" && ["/health", "/v1/health", "/api/system-health", "/api/health"].includes(path)) {
        const probe = url.searchParams.get("probe") === "github";
        return systemHealth(request, env, requestId, probe);
      }

      if (request.method === "GET" && ["/v1/schema", "/api/schema"].includes(path)) {
        return withCors(jsonResponse({ ok: true, service: SERVICE, version: VERSION, ...apiContract() }));
      }

      if (request.method === "POST" && ["/v1/events", "/v1/collect", "/collect"].includes(path)) {
        return collect(request, env, ctx, requestId, started);
      }

      if (request.method === "GET" && ["/v1/platforms", "/api/platforms", "/api/sites"].includes(path)) {
        return listPlatforms(request, env, requestId);
      }

      if (request.method === "GET" && ["/v1/overview", "/api/overview"].includes(path)) {
        return overview(request, env, requestId);
      }

      if (request.method === "GET" && path.startsWith("/v1/platforms/")) {
        const rest = path.slice("/v1/platforms/".length);
        const [platformId, action] = rest.split("/");
        if (!platformId) return withCors(jsonResponse({ ok: false, requestId, error: "PLATFORM_ID_REQUIRED" }, 400));
        if (action === "events") return platformEvents(request, env, requestId, decodeURIComponent(platformId));
        if (!action) return platformStats(request, env, requestId, decodeURIComponent(platformId));
      }

      if (request.method === "GET" && path.startsWith("/api/platform/")) {
        const rest = path.slice("/api/platform/".length);
        const [platformId] = rest.split("/");
        return platformStats(request, env, requestId, decodeURIComponent(platformId));
      }

      if (request.method === "GET" && path.startsWith("/api/site/")) {
        const platformId = decodeURIComponent(path.slice("/api/site/".length));
        return platformStats(request, env, requestId, platformId);
      }

      if (request.method === "GET" && path === "/v1/events") {
        return platformEvents(request, env, requestId, url.searchParams.get("platform") || url.searchParams.get("site"));
      }

      if (request.method === "GET" && path === "/v1/stats") {
        const platformId = url.searchParams.get("platform") || url.searchParams.get("site");
        return platformId
          ? platformStats(request, env, requestId, platformId)
          : overview(request, env, requestId);
      }

      if (request.method === "GET" && path === "/api/stats") {
        const platformId = url.searchParams.get("platform") || url.searchParams.get("site");
        return platformId
          ? platformStats(request, env, requestId, platformId)
          : overview(request, env, requestId);
      }

      if (request.method === "GET" && ["/v1/admin/events", "/api/admin/events"].includes(path)) {
        return adminEvents(request, env, requestId);
      }

      if (request.method === "GET" && path === "/v1/admin/notifications") {
        return adminNotifications(request, env, requestId);
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
      log("error", "UNHANDLED_ERROR", { requestId, error: String(error?.message || error), stack: error?.stack || null, elapsedMs: Date.now() - started });
      return withCors(jsonResponse({ ok: false, requestId, error: "INTERNAL_ERROR", message: env.DEBUG === "true" ? String(error?.message || error) : "Request failed" }, 500));
    }
  }
};

/* =============================================================
   COLLECTOR
============================================================= */
async function collect(request, env, ctx, requestId, started) {
  if (!env.DB) return withCors(jsonResponse({ ok: false, requestId, error: "D1_NOT_CONFIGURED" }, 503));

  const body = await readJson(request);
  if (body.error) return withCors(jsonResponse({ ok: false, requestId, error: body.error }, body.status || 400));

  let event;
  try {
    event = await normalizeEvent(request, body.data);
  } catch (error) {
    log("warn", "VALIDATION_ERROR", { requestId, error: String(error?.message || error) });
    return withCors(jsonResponse({ ok: false, requestId, error: String(error?.message || error) }, 400));
  }

  const providedApiKey = request.headers.get("X-Platform-Key") || request.headers.get("X-API-Key");
  const authCheck = await validateOptionalPlatformKey(env, event.platformId, providedApiKey);
  if (!authCheck.ok) return withCors(jsonResponse({ ok: false, requestId, error: authCheck.error }, authCheck.status || 401));

  log("info", "COLLECT_START", {
    requestId, eventId: event.eventId, platformId: event.platformId,
    eventType: event.eventType, ip: event.ip || null
  });

  let storage;
  try {
    storage = await storeEvent(env, event);
  } catch (error) {
    log("error", "D1_STORE_FAILED", { requestId, eventId: event.eventId, platformId: event.platformId, error: String(error?.message || error), stack: error?.stack || null });
    return withCors(jsonResponse({ ok: false, accepted: false, requestId, eventId: event.eventId, platformId: event.platformId, stored: { d1: false, github: false }, error: "D1_STORE_FAILED", details: String(error?.message || error) }, 500));
  }

  let archive;
  try {
    archive = await archiveToGithub(env, event, requestId, storage);
  } catch (error) {
    log("error", "GITHUB_ARCHIVE_FAILED", { requestId, eventId: event.eventId, platformId: event.platformId, error: String(error?.message || error) });
    archive = { ok: false, error: String(error?.message || error) };
  }

  // Telegram is notification-only and does not decide whether the telemetry request succeeds.
  if (shouldNotify(env, event, storage)) {
    const task = sendTelegramVisitNotification(env, event, storage, requestId).catch(err => {
      log("error", "TELEGRAM_NOTIFICATION_FAILED", { requestId, eventId: event.eventId, error: String(err?.message || err) });
    });
    if (ctx?.waitUntil) ctx.waitUntil(task);
    else await task;
  }

  const success = archive.ok;
  log("info", "COLLECT_COMPLETE", { requestId, eventId: event.eventId, platformId: event.platformId, github: archive.ok, elapsedMs: Date.now() - started });

  return withCors(jsonResponse({
    ok: true,
    accepted: true,
    version: VERSION,
    requestId,
    eventId: event.eventId,
    platformId: event.platformId,
    eventType: event.eventType,
    stored: { d1: true, github: success },
    telegram: { enabled: telegramEnabled(env), notified: Boolean(storage.notifyEligible) },
    d1: { newVisitor: storage.newVisitor, newSession: storage.newSession },
    github: archive,
    receivedAt: event.receivedAt,
    elapsedMs: Date.now() - started
  }, success ? 201 : 202));
}

async function readJson(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return { error: "PAYLOAD_TOO_LARGE", status: 413 };
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return { error: "PAYLOAD_TOO_LARGE", status: 413 };
  if (!raw.trim()) return { error: "EMPTY_BODY", status: 400 };
  try { return { data: JSON.parse(raw) }; } catch { return { error: "INVALID_JSON", status: 400 }; }
}

async function normalizeEvent(request, p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) throw Error("INVALID_PAYLOAD");

  const platformId = normalizePlatformId(p.platformId || p.platform_id || p.platform || p.platformName || p.platform_name || p.name || p.app || p.application || p.source);
  if (!platformId) throw Error("PLATFORM_ID_REQUIRED");

  const platformName = clean(p.platformName || p.platform_name || p.name || p.label || platformId, 160) || platformId;
  const platformType = clean(p.platformType || p.platform_type || p.typeName || "generic", 80) || "generic";

  const rawType = String(p.eventType || p.event_type || p.type || "custom");
  const eventType = EVENT_TYPES.has(rawType) ? rawType : "custom";

  const eventId = clean(p.eventId || p.event_id || crypto.randomUUID(), 128) || crypto.randomUUID();
  const ip = clean(request.headers.get("CF-Connecting-IP") || request.headers.get("True-Client-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim(), 128);
  const userAgent = clean(request.headers.get("User-Agent") || p.userAgent || p.user_agent, 4096) || "";
  const ua = parseUA(userAgent);
  const ipHash = ip ? await sha256(`${platformId}|${ip}`) : null;

  const visitorId = clean(p.visitorId || p.visitor_id, 128) || (ipHash ? ipHash.slice(0, 32) : `anon-${crypto.randomUUID().replaceAll("-", "")}`);
  const sessionId = clean(p.sessionId || p.session_id, 128) || (await sha256(`${platformId}|${visitorId}|${Math.floor(Date.now() / 3600000)}`)).slice(0, 40);

  const page = p.page && typeof p.page === "object" ? p.page : {};
  const screen = p.screen && typeof p.screen === "object" ? p.screen : {};
  const viewport = p.viewport && typeof p.viewport === "object" ? p.viewport : {};
  const connection = p.connection && typeof p.connection === "object" ? p.connection : {};

  let payloadJson = "{}";
  try {
    payloadJson = JSON.stringify(p);
    if (new TextEncoder().encode(payloadJson).byteLength > 96 * 1024) payloadJson = JSON.stringify({ truncated: true, reason: "payload_size_limit" });
  } catch { payloadJson = JSON.stringify({ serializationError: true }); }

  let dataObject = {};
  if (p.data && typeof p.data === "object" && !Array.isArray(p.data)) {
    try {
      const ds = JSON.stringify(p.data);
      dataObject = new TextEncoder().encode(ds).byteLength <= 16384 ? JSON.parse(ds) : { truncated: true, reason: "data_size_limit" };
    } catch { dataObject = { serializationError: true }; }
  }

  const receivedAt = new Date().toISOString();
  const occurredAt = safeDate(p.timestamp || p.occurredAt || p.occurred_at).toISOString();

  return {
    eventId, receivedAt, occurredAt, eventType,
    platformId, platformName, platformType,
    sessionId, visitorId,
    pageUrl: validUrl(p.pageUrl || page.url),
    path: clean(p.path || p.pagePath || p.page_path || page.path, 4096),
    title: clean(p.title || page.title, 512),
    referrer: validUrl(p.referrer || page.referrer),
    referrerHost: hostOf(validUrl(p.referrer || page.referrer)),
    language: clean(p.language || p.lang || request.headers.get("Accept-Language"), 128),
    timezone: clean(p.timezone || request.cf?.timezone, 128),
    country: clean(request.cf?.country, 32),
    region: clean(request.cf?.region || request.cf?.regionCode, 128),
    city: clean(request.cf?.city, 128),
    continent: clean(request.cf?.continent, 16),
    colo: clean(request.cf?.colo, 32),
    asn: safeInt(request.cf?.asn, 0, 999999999),
    asOrganization: clean(request.cf?.asOrganization, 256),
    latitude: clean(request.cf?.latitude, 32),
    longitude: clean(request.cf?.longitude, 32),
    postalCode: clean(request.cf?.postalCode, 32),
    metroCode: clean(request.cf?.metroCode, 32),
    tlsVersion: clean(request.cf?.tlsVersion, 64),
    clientTcpRtt: safeInt(request.cf?.clientTcpRtt, 0, 600000),
    clientQuicRtt: safeInt(request.cf?.clientQuicRtt, 0, 600000),
    ip,
    ipHash,
    userAgent,
    browser: ua.browser,
    browserVersion: ua.browserVersion,
    os: ua.os,
    osVersion: ua.osVersion,
    device: ua.device,
    screenWidth: safeInt(screen.width ?? p.screenWidth, 0, 100000),
    screenHeight: safeInt(screen.height ?? p.screenHeight, 0, 100000),
    viewportWidth: safeInt(viewport.width ?? p.viewportWidth, 0, 100000),
    viewportHeight: safeInt(viewport.height ?? p.viewportHeight, 0, 100000),
    durationMs: safeInt(p.durationMs ?? p.duration_ms, 0, 86400000) || 0,
    maxScroll: safeInt(p.maxScroll ?? p.scrollDepth ?? p.scroll_depth, 0, 100) || 0,
    clicks: safeInt(p.clicks, 0, 100000) || 0,
    outboundClicks: safeInt(p.outboundClicks ?? p.outbound_clicks, 0, 100000) || 0,
    devicePixelRatio: safeFloat(screen.devicePixelRatio ?? p.devicePixelRatio, 0, 20),
    colorDepth: safeInt(screen.colorDepth ?? p.colorDepth, 0, 128),
    connectionType: clean(connection.type || p.connectionType, 64),
    connectionDownlink: safeFloat(connection.downlink ?? p.connectionDownlink, 0, 100000),
    connectionRtt: safeInt(connection.rtt ?? p.connectionRtt, 0, 600000),
    connectionSaveData: Boolean(connection.saveData ?? p.connectionSaveData),
    data: dataObject,
    dataJson: safeMetadata(p.data || p.payload || {}),
    payloadJson,
    metadataJson: safeMetadata(p.metadata),
    rawEventJson: safeMetadata({ source: "normalized", requestHeaders: { acceptLanguage: request.headers.get("Accept-Language") || null } })
  };
}

/* =============================================================
   D1 STORAGE
============================================================= */
async function storeEvent(env, e) {
  const existingEvent = await env.DB.prepare(`SELECT id FROM events WHERE id=? LIMIT 1`).bind(e.eventId).first();
  if (existingEvent) return { duplicate: true, newVisitor: false, newSession: false, notifyEligible: false };

  await env.DB.prepare(`INSERT OR IGNORE INTO platforms(platform_id,platform_name,platform_type,first_seen,last_seen,total_events,total_pageviews,total_sessions,total_visitors) VALUES(?,?,?,?,?,0,0,0,0)`)
    .bind(e.platformId, e.platformName, e.platformType, e.receivedAt, e.receivedAt).run();

  const visitorInsert = await env.DB.prepare(`INSERT OR IGNORE INTO platform_visitors(platform_id,visitor_id,first_seen,last_seen,last_ip,country,city,browser,os,device) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .bind(e.platformId,e.visitorId,e.receivedAt,e.receivedAt,e.ip,e.country,e.city,e.browser,e.os,e.device).run();
  const newVisitor = Number(visitorInsert?.meta?.changes || 0) > 0;

  const sessionInsert = await env.DB.prepare(`INSERT OR IGNORE INTO platform_sessions(platform_id,session_id,visitor_id,first_seen,last_seen,duration_ms,event_count,pageviews,max_scroll,ip,country,city,browser,os,device) VALUES(?,?,?,?,?,?,1,?,?,?,?,?,?,?,?)`)
    .bind(e.platformId,e.sessionId,e.visitorId,e.occurredAt,e.receivedAt,e.durationMs,e.eventType === "pageview" ? 1 : 0,e.maxScroll,e.ip,e.country,e.city,e.browser,e.os,e.device).run();
  const newSession = Number(sessionInsert?.meta?.changes || 0) > 0;

  const eventColumns = [
    "id","received_at","occurred_at","event_type","platform_id","platform_name","platform_type","session_id","visitor_id",
    "page_url","path","title","referrer","referrer_host","language","timezone","country","region","city","continent","colo",
    "asn","as_organization","latitude","longitude","postal_code","metro_code","tls_version","client_tcp_rtt","client_quic_rtt",
    "ip","ip_hash","user_agent","browser","browser_version","os","os_version","device","screen_width","screen_height",
    "viewport_width","viewport_height","device_pixel_ratio","color_depth","connection_type","connection_downlink","connection_rtt",
    "connection_save_data","duration_ms","max_scroll","clicks","outbound_clicks","data_json","payload_json","metadata_json","raw_event_json"
  ];
  const eventValues = eventColumns.map(() => "?").join(",");
  await env.DB.prepare(`INSERT INTO events(${eventColumns.join(",")}) VALUES(${eventValues})`)
    .bind(
      e.eventId,e.receivedAt,e.occurredAt,e.eventType,e.platformId,e.platformName,e.platformType,e.sessionId,e.visitorId,
      e.pageUrl,e.path,e.title,e.referrer,e.referrerHost,e.language,e.timezone,e.country,e.region,e.city,e.continent,e.colo,e.asn,e.asOrganization,
      e.latitude,e.longitude,e.postalCode,e.metroCode,e.tlsVersion,e.clientTcpRtt,e.clientQuicRtt,e.ip,e.ipHash,e.userAgent,e.browser,e.browserVersion,
      e.os,e.osVersion,e.device,e.screenWidth,e.screenHeight,e.viewportWidth,e.viewportHeight,e.devicePixelRatio,e.colorDepth,e.connectionType,
      e.connectionDownlink,e.connectionRtt,e.connectionSaveData ? 1 : 0,e.durationMs,e.maxScroll,e.clicks,e.outboundClicks,e.dataJson,e.payloadJson,e.metadataJson,e.rawEventJson
    ).run();

  await env.DB.prepare(`UPDATE platform_sessions SET last_seen=?,duration_ms=max(duration_ms,?),event_count=event_count+1,pageviews=pageviews+?,max_scroll=max(max_scroll,?),ip=COALESCE(?,ip),country=COALESCE(?,country),city=COALESCE(?,city),browser=COALESCE(?,browser),os=COALESCE(?,os),device=COALESCE(?,device) WHERE platform_id=? AND session_id=?`)
    .bind(e.receivedAt,e.durationMs,e.eventType === "pageview" ? 1 : 0,e.maxScroll,e.ip,e.country,e.city,e.browser,e.os,e.device,e.platformId,e.sessionId).run();

  await env.DB.prepare(`UPDATE platform_visitors SET last_seen=?,last_ip=?,country=COALESCE(?,country),city=COALESCE(?,city),browser=COALESCE(?,browser),os=COALESCE(?,os),device=COALESCE(?,device) WHERE platform_id=? AND visitor_id=?`)
    .bind(e.receivedAt,e.ip,e.country,e.city,e.browser,e.os,e.device,e.platformId,e.visitorId).run();

  await env.DB.prepare(`UPDATE platforms SET last_seen=?,total_events=total_events+1,total_pageviews=total_pageviews+?,total_sessions=total_sessions+?,total_visitors=total_visitors+? WHERE platform_id=?`)
    .bind(e.receivedAt,e.eventType === "pageview" ? 1 : 0,newSession ? 1 : 0,newVisitor ? 1 : 0,e.platformId).run();

  return {
    duplicate: false,
    newVisitor,
    newSession,
    notifyEligible: shouldNotifyEvent(e, newVisitor, newSession)
  };
}

/* =============================================================
   GITHUB ARCHIVE
============================================================= */
async function archiveToGithub(env, e, requestId, storage) {
  if (String(env.GITHUB_ARCHIVE_ENABLED || "true") !== "true") return { ok: false, skipped: true, reason: "disabled" };
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) return { ok: false, skipped: true, reason: "github_not_configured" };

  const d = new Date(e.receivedAt);
  const year = d.getUTCFullYear().toString();
  const month = String(d.getUTCMonth()+1).padStart(2,"0");
  const day = String(d.getUTCDate()).padStart(2,"0");
  const stamp = e.receivedAt.replace(/:/g,"-").replace(/\.\d{3}Z$/i,"").replace(/[^0-9TZ-]/g,"");
  const path = `data/platforms/${safePath(e.platformId)}/events/${year}/${month}/${day}/${stamp}_${safePath(e.eventId)}.json`;

  const archive = {
    schemaVersion: "7.0",
    service: SERVICE,
    workerVersion: VERSION,
    requestId,
    archivedAt: new Date().toISOString(),
    platform: { id: e.platformId, name: e.platformName, type: e.platformType },
    storage,
    event: e
  };

  const url = `${GH_API}/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetchWithTimeout(url, {
    method: "PUT",
    headers: githubHeaders(env),
    body: JSON.stringify({
      message: `analytics: ${e.platformId}/${e.eventType}/${e.eventId}`,
      content: base64Utf8(JSON.stringify(archive,null,2)),
      branch: env.GITHUB_BRANCH || "main",
      committer: { name: "Universal Event Insights", email: "universal-event-insights@users.noreply.github.com" }
    })
  }, 15000);

  const text = await response.text();
  if (!response.ok) throw Error(`GITHUB_${response.status}:${text.slice(0,1800)}`);

  let result = {};
  try { result = JSON.parse(text); } catch {}
  return { ok: true, status: response.status, path, commitSha: result?.commit?.sha || null, fileSha: result?.content?.sha || null };
}

/* =============================================================
   TELEGRAM
============================================================= */
function telegramEnabled(env) {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_ADMIN_CHAT_ID && String(env.TELEGRAM_ENABLED || "true") === "true");
}

function notifyMode(env) {
  const m = String(env.TELEGRAM_NOTIFY_MODE || DEFAULT_NOTIFY_MODE).toLowerCase();
  return ["off","event","session","visitor"].includes(m) ? m : DEFAULT_NOTIFY_MODE;
}

function shouldNotifyEvent(e, newVisitor, newSession) {
  // pageview/request/custom all count as use. Heartbeat-only events do not create noise.
  if (!["heartbeat","visibility","scroll"].includes(e.eventType)) return newVisitor || newSession;
  return false;
}

function shouldNotify(env, e, storage) {
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
    `⚡ <b>Event:</b> ${escapeHtml(e.eventType)}`,
    `🕒 <b>Time:</b> ${escapeHtml(e.receivedAt)}`,
    `🌐 <b>IP:</b> <code>${escapeHtml(e.ip || "unknown")}</code>`,
    `📍 <b>Location:</b> ${escapeHtml([e.city,e.region,e.country].filter(Boolean).join(", ") || "unknown")}`,
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
    `🆔 <b>Request:</b> <code>${escapeHtml(requestId)}</code>`
  ];
  if (e.pageUrl) lines.push(`🔎 <b>URL:</b> ${escapeHtml(e.pageUrl).slice(0, 800)}`);
  const message = lines.join("\n").slice(0, TELEGRAM_MAX);
  try {
    const result = await telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: message, parse_mode: "HTML", disable_web_page_preview: true });
    if (env.DB) await env.DB.prepare(`INSERT OR REPLACE INTO notification_log(event_id,platform_id,channel,sent_at,status,message_id,error) VALUES(?,?,?,?,?,?,?)`).bind(e.eventId,e.platformId,"telegram",new Date().toISOString(),"sent",String(result?.result?.message_id || ""),null).run();
    return result;
  } catch (error) {
    if (env.DB) { try { await env.DB.prepare(`INSERT OR REPLACE INTO notification_log(event_id,platform_id,channel,sent_at,status,message_id,error) VALUES(?,?,?,?,?,?,?)`).bind(e.eventId,e.platformId,"telegram",new Date().toISOString(),"failed",null,String(error?.message || error).slice(0,1000)).run(); } catch {} }
    throw error;
  }
}

async function telegramWebhook(request, env, ctx, requestId) {
  if (!env.TELEGRAM_BOT_TOKEN) return jsonResponse({ ok: false, requestId, error: "TELEGRAM_NOT_CONFIGURED" }, 503);
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) return jsonResponse({ ok: false, requestId, error: "INVALID_WEBHOOK_SECRET" }, 401);

  let update;
  try { update = await request.json(); } catch { return jsonResponse({ ok: false, requestId, error: "INVALID_JSON" }, 400); }
  const message = update?.message;
  if (!message?.chat?.id || typeof message.text !== "string") return jsonResponse({ ok: true, ignored: true });

  if (String(message.chat.id) !== String(env.TELEGRAM_ADMIN_CHAT_ID)) return jsonResponse({ ok: true, ignored: true });

  const text = message.text.trim();
  const task = handleTelegramCommand(env, message, text, requestId);
  if (ctx?.waitUntil) ctx.waitUntil(task);
  else await task;
  return jsonResponse({ ok: true });
}

async function handleTelegramCommand(env, message, text, requestId) {
  const [command, ...args] = text.split(/\s+/);
  const cmd = command.toLowerCase().split("@")[0];

  if (cmd === "/start" || cmd === "/help") {
    return telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: "🤖 <b>Universal Event Insights</b>\n\n/status — system status\n/platforms — list platforms\n/platform &lt;id&gt; — platform summary\n/last &lt;id&gt; — recent events\n/whoami — admin chat id", parse_mode: "HTML" });
  }

  if (cmd === "/whoami") {
    return telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: `🪪 Chat ID: <code>${escapeHtml(String(message.chat.id))}</code>`, parse_mode: "HTML" });
  }

  if (cmd === "/status") {
    const health = await buildHealth(env, requestId, false);
    const c = health.checks;
    const txt = [
      `🛰️ <b>System: ${escapeHtml(health.overall)}</b>`,
      `⚙️ Worker: ${escapeHtml(c.worker.status)}`,
      `🗄️ D1: ${escapeHtml(c.database.status)} — ${c.database.counts?.events ?? 0} events`,
      `🌐 GitHub: ${escapeHtml(c.github.status)}`,
      `📡 Telemetry: ${escapeHtml(c.telemetry.status)}`,
      `🧩 Platforms: ${c.database.counts?.platforms ?? 0}`
    ].join("\n");
    return telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: txt, parse_mode: "HTML" });
  }

  if (cmd === "/platforms") {
    const rows = await env.DB.prepare(`SELECT platform_id,platform_name,platform_type,last_seen,total_events,total_pageviews FROM platforms ORDER BY last_seen DESC LIMIT 50`).all();
    const textOut = rows.results?.length
      ? ["🧩 <b>Platforms</b>", ...rows.results.map((x,i)=>`${i+1}. <b>${escapeHtml(x.platform_name)}</b> <code>${escapeHtml(x.platform_id)}</code> — ${x.total_pageviews || 0} views`)].join("\n")
      : "📭 No platforms yet.";
    return telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: textOut.slice(0, TELEGRAM_MAX), parse_mode: "HTML" });
  }

  if (cmd === "/platform") {
    const platformId = normalizePlatformId(args[0]);
    if (!platformId) return telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: "Usage: /platform <platform-id>" });
    const data = await getPlatformSummary(env, platformId, 7);
    if (!data.site) return telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: "Platform not found." });
    const txt = [
      `🧩 <b>${escapeHtml(data.site.platformName)}</b>`,
      `ID: <code>${escapeHtml(data.site.platformId)}</code>`,
      `Type: ${escapeHtml(data.site.platformType)}`,
      `👁 Views: ${data.totals.views}`,
      `👤 Visitors: ${data.totals.uniqueVisitors}`,
      `🧭 Sessions: ${data.totals.sessions}`,
      `⏱ Avg duration: ${formatDuration(data.totals.avgDurationMs)}`,
      `📍 Top country: ${escapeHtml(data.countries?.[0]?.label || "unknown")}`
    ].join("\n");
    return telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: txt, parse_mode: "HTML" });
  }

  if (cmd === "/last") {
    const platformId = normalizePlatformId(args[0]);
    if (!platformId) return telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: "Usage: /last <platform-id>" });
    const rows = await env.DB.prepare(`SELECT received_at,event_type,ip,city,country,path,duration_ms FROM events WHERE platform_id=? ORDER BY rowid DESC LIMIT 8`).bind(platformId).all();
    const out = rows.results?.length ? ["🕘 <b>Recent events</b>", ...rows.results.map(x=>`${escapeHtml(x.received_at)} — ${escapeHtml(x.event_type)} — <code>${escapeHtml(x.ip || "unknown")}</code> — ${escapeHtml(x.city || x.country || "unknown")} — ${escapeHtml(x.path || "/")}`)].join("\n") : "📭 No events.";
    return telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: out.slice(0, TELEGRAM_MAX), parse_mode: "HTML" });
  }

  return telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: "Unknown command. Use /help" });
}

async function telegramSetup(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok: false, requestId, error: "UNAUTHORIZED" }, 401));
  if (!env.TELEGRAM_BOT_TOKEN) return withCors(jsonResponse({ ok: false, requestId, error: "TELEGRAM_BOT_TOKEN_MISSING" }, 503));
  const webhookUrl = new URL("/telegram/webhook", request.url).toString();
  const result = await telegramApi(env, "setWebhook", {
    url: webhookUrl,
    secret_token: env.TELEGRAM_WEBHOOK_SECRET || undefined,
    allowed_updates: ["message"]
  });
  return withCors(jsonResponse({ ok: true, requestId, webhookUrl, telegram: result }));
}

async function telegramTest(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok: false, requestId, error: "UNAUTHORIZED" }, 401));
  if (!telegramEnabled(env)) return withCors(jsonResponse({ ok: false, requestId, error: "TELEGRAM_NOT_CONFIGURED" }, 503));
  const result = await telegramApi(env, "sendMessage", { chat_id: env.TELEGRAM_ADMIN_CHAT_ID, text: "✅ Universal Event Insights Telegram integration is working." });
  return withCors(jsonResponse({ ok: true, requestId, telegram: result }));
}

async function telegramApi(env, method, body) {
  const response = await fetchWithTimeout(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }, 10000);
  const text = await response.text();
  if (!response.ok) throw Error(`TELEGRAM_${response.status}:${text.slice(0,1200)}`);
  return JSON.parse(text);
}

/* =============================================================
   PLATFORM LIST / OVERVIEW / STATS / EVENTS
============================================================= */
async function listPlatforms(request, env, requestId) {
  const { results = [] } = await env.DB.prepare(`SELECT platform_id AS platformId,platform_name AS platformName,platform_type AS platformType,first_seen AS firstSeen,last_seen AS lastSeen,total_events AS totalEvents,total_pageviews AS totalPageviews,total_sessions AS totalSessions,total_visitors AS totalVisitors FROM platforms ORDER BY last_seen DESC`).all();
  return withCors(jsonResponse({ ok: true, requestId, count: results.length, platforms: results }));
}

async function overview(request, env, requestId) {
  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get("days"));
  const since = days === "all" ? null : daysAgo(days);
  const total = days === "all"
    ? await env.DB.prepare(`SELECT COUNT(*) AS events,COUNT(CASE WHEN event_type='pageview' THEN 1 END) AS pageviews,COUNT(DISTINCT visitor_id) AS uniqueVisitors,COUNT(DISTINCT session_id) AS sessions,COALESCE(AVG(duration_ms),0) AS avgDurationMs,COALESCE(AVG(max_scroll),0) AS avgScroll FROM events`).first()
    : await env.DB.prepare(`SELECT COUNT(*) AS events,COUNT(CASE WHEN event_type='pageview' THEN 1 END) AS pageviews,COUNT(DISTINCT visitor_id) AS uniqueVisitors,COUNT(DISTINCT session_id) AS sessions,COALESCE(AVG(duration_ms),0) AS avgDurationMs,COALESCE(AVG(max_scroll),0) AS avgScroll FROM events WHERE received_at>=?`).bind(since).first();

  const [daily,countries,browsers,oses,devices,ips,platforms] = await Promise.all([
    grouped(env, `SELECT substr(received_at,1,10) AS day,COUNT(*) AS events,COUNT(CASE WHEN event_type='pageview' THEN 1 END) AS pageviews,COUNT(DISTINCT visitor_id) AS uniqueVisitors FROM events ${days === "all" ? "" : "WHERE received_at>=?"} GROUP BY day ORDER BY day`, days, since),
    grouped(env, `SELECT country AS label,COUNT(*) AS count FROM events ${days === "all" ? "WHERE country IS NOT NULL" : "WHERE received_at>=? AND country IS NOT NULL"} GROUP BY country ORDER BY count DESC LIMIT 30`, days, since),
    grouped(env, `SELECT browser,COUNT(*) AS count FROM events ${days === "all" ? "" : "WHERE received_at>=?"} GROUP BY browser ORDER BY count DESC LIMIT 30`, days, since),
    grouped(env, `SELECT os,COUNT(*) AS count FROM events ${days === "all" ? "" : "WHERE received_at>=?"} GROUP BY os ORDER BY count DESC LIMIT 30`, days, since),
    grouped(env, `SELECT device,COUNT(*) AS count FROM events ${days === "all" ? "" : "WHERE received_at>=?"} GROUP BY device ORDER BY count DESC LIMIT 30`, days, since),
    grouped(env, `SELECT ip,COUNT(*) AS count,MAX(city) AS city,MAX(country) AS country FROM events ${days === "all" ? "WHERE ip IS NOT NULL" : "WHERE received_at>=? AND ip IS NOT NULL"} GROUP BY ip ORDER BY count DESC LIMIT 50`, days, since),
    env.DB.prepare(`SELECT platform_id AS platformId,platform_name AS platformName,platform_type AS platformType,total_events AS totalEvents,total_pageviews AS totalPageviews,total_sessions AS totalSessions,total_visitors AS totalVisitors,last_seen AS lastSeen FROM platforms ORDER BY last_seen DESC LIMIT 100`).all()
  ]);

  return withCors(jsonResponse({
    ok: true, requestId, days, totals: nums(total),
    daily: daily.results || [], countries: countries.results || [], browsers: browsers.results || [],
    operatingSystems: oses.results || [], devices: devices.results || [], ips: ips.results || [],
    platforms: platforms.results || []
  }));
}

async function platformStats(request, env, requestId, platformId) {
  const normalized = normalizePlatformId(platformId);
  if (!normalized) return withCors(jsonResponse({ ok:false,requestId,error:"INVALID_PLATFORM_ID" },400));
  const days = parseDays(new URL(request.url).searchParams.get("days"));
  const data = await getPlatformSummary(env, normalized, days);
  return withCors(jsonResponse({ ok:true,requestId,...data }));
}

async function getPlatformSummary(env, platformId, days) {
  const since = days === "all" ? null : daysAgo(days);
  const site = await env.DB.prepare(`SELECT platform_id AS platformId,platform_name AS platformName,platform_type AS platformType,first_seen AS firstSeen,last_seen AS lastSeen,total_events AS totalEvents,total_pageviews AS totalPageviews,total_sessions AS totalSessions,total_visitors AS totalVisitors FROM platforms WHERE platform_id=?`).bind(platformId).first();
  if (!site) return { platformId, site:null, totals:{views:0,uniqueVisitors:0,sessions:0,events:0,avgDurationMs:0,avgScroll:0},daily:[],countries:[],browsers:[],operatingSystems:[],devices:[],ips:[],topPages:[],recentEvents:[] };
  const where = days === "all" ? "platform_id=?" : "platform_id=? AND received_at>=?";
  const bind = days === "all" ? [platformId] : [platformId,since];
  const totals = await env.DB.prepare(`SELECT COUNT(*) AS events,COUNT(CASE WHEN event_type='pageview' THEN 1 END) AS views,COUNT(DISTINCT visitor_id) AS uniqueVisitors,COUNT(DISTINCT session_id) AS sessions,COALESCE(AVG(duration_ms),0) AS avgDurationMs,COALESCE(AVG(max_scroll),0) AS avgScroll FROM events WHERE ${where}`).bind(...bind).first();
  const [daily,countries,browsers,oses,devices,ips,pages,recent] = await Promise.all([
    env.DB.prepare(`SELECT substr(received_at,1,10) AS day,COUNT(*) AS events,COUNT(CASE WHEN event_type='pageview' THEN 1 END) AS views,COUNT(DISTINCT visitor_id) AS uniqueVisitors,COUNT(DISTINCT session_id) AS sessions FROM events WHERE ${where} GROUP BY day ORDER BY day`).bind(...bind).all(),
    env.DB.prepare(`SELECT country AS label,COUNT(*) AS count FROM events WHERE ${where} AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 30`).bind(...bind).all(),
    env.DB.prepare(`SELECT browser,COUNT(*) AS count FROM events WHERE ${where} GROUP BY browser ORDER BY count DESC LIMIT 30`).bind(...bind).all(),
    env.DB.prepare(`SELECT os,COUNT(*) AS count FROM events WHERE ${where} GROUP BY os ORDER BY count DESC LIMIT 30`).bind(...bind).all(),
    env.DB.prepare(`SELECT device,COUNT(*) AS count FROM events WHERE ${where} GROUP BY device ORDER BY count DESC LIMIT 30`).bind(...bind).all(),
    env.DB.prepare(`SELECT ip,COUNT(*) AS count,MAX(city) AS city,MAX(country) AS country,MAX(browser) AS browser,MAX(os) AS os,MAX(device) AS device FROM events WHERE ${where} AND ip IS NOT NULL GROUP BY ip ORDER BY count DESC LIMIT 50`).bind(...bind).all(),
    env.DB.prepare(`SELECT path,title,COUNT(*) AS views FROM events WHERE ${where} AND event_type='pageview' GROUP BY path,title ORDER BY views DESC LIMIT 50`).bind(...bind).all(),
    env.DB.prepare(`SELECT id,received_at AS receivedAt,occurred_at AS occurredAt,event_type AS eventType,session_id AS sessionId,visitor_id AS visitorId,path,title,page_url AS pageUrl,referrer_host AS referrerHost,ip,country,region,city,continent,colo,asn,as_organization AS asOrganization,browser,browser_version AS browserVersion,os,os_version AS osVersion,device,user_agent AS userAgent,duration_ms AS durationMs,max_scroll AS maxScroll,clicks,outbound_clicks AS outboundClicks FROM events WHERE platform_id=? ORDER BY rowid DESC LIMIT 200`).bind(platformId).all()
  ]);
  return {
    platformId,
    site,
    totals: nums(totals),
    daily: daily.results || [],
    countries: countries.results || [],
    browsers: browsers.results || [],
    operatingSystems: oses.results || [],
    devices: devices.results || [],
    ips: ips.results || [],
    topPages: pages.results || [],
    recentEvents: recent.results || []
  };
}

async function platformEvents(request, env, requestId, platformId) {
  const url = new URL(request.url);
  const normalized = platformId ? normalizePlatformId(platformId) : null;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number(url.searchParams.get("limit") || 100)) || 100));
  const days = parseDays(url.searchParams.get("days"));
  const since = days === "all" ? null : daysAgo(days);
  let rows;
  if (normalized) {
    rows = days === "all"
      ? await env.DB.prepare(`SELECT * FROM events WHERE platform_id=? ORDER BY rowid DESC LIMIT ?`).bind(normalized,limit).all()
      : await env.DB.prepare(`SELECT * FROM events WHERE platform_id=? AND received_at>=? ORDER BY rowid DESC LIMIT ?`).bind(normalized,since,limit).all();
  } else {
    rows = days === "all"
      ? await env.DB.prepare(`SELECT * FROM events ORDER BY rowid DESC LIMIT ?`).bind(limit).all()
      : await env.DB.prepare(`SELECT * FROM events WHERE received_at>=? ORDER BY rowid DESC LIMIT ?`).bind(since,limit).all();
  }
  return withCors(jsonResponse({ ok:true,requestId,platformId:normalized,days,count:rows.results?.length||0,events:rows.results||[] }));
}

/* =============================================================
   ADMIN
============================================================= */
async function adminEvents(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok:false,requestId,error:"UNAUTHORIZED" },401));
  return platformEvents(request, env, requestId, new URL(request.url).searchParams.get("platform"));
}

function adminAuthorized(request, env) {
  return Boolean(env.ADMIN_KEY && request.headers.get("X-Admin-Key") === env.ADMIN_KEY);
}

/* =============================================================
   ADMIN PLATFORM KEYS / NOTIFICATIONS
============================================================= */
async function adminSetPlatformKey(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ ok:false,requestId,error:"UNAUTHORIZED" },401));
  let body; try { body = await request.json(); } catch { return withCors(jsonResponse({ok:false,requestId,error:"INVALID_JSON"},400)); }
  const platformId = normalizePlatformId(body.platformId || body.platform || body.platformName || body.name);
  const apiKey = clean(body.apiKey, 512);
  if (!platformId || !apiKey) return withCors(jsonResponse({ok:false,requestId,error:"PLATFORM_ID_AND_API_KEY_REQUIRED"},400));
  const name = clean(body.platformName || body.name || platformId, 160) || platformId;
  const type = clean(body.platformType || body.type || "generic", 80) || "generic";
  const hash = await sha256(apiKey);
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT OR IGNORE INTO platforms(platform_id,platform_name,platform_type,first_seen,last_seen,total_events,total_pageviews,total_sessions,total_visitors,api_key_hash,metadata_json) VALUES(?,?,?,?,?,0,0,0,0,?,?)`).bind(platformId,name,type,now,now,hash,"{}").run();
  await env.DB.prepare(`UPDATE platforms SET platform_name=?,platform_type=?,api_key_hash=? WHERE platform_id=?`).bind(name,type,hash,platformId).run();
  return withCors(jsonResponse({ok:true,requestId,platformId,platformName:name,platformType:type,configured:true}));
}

async function adminNotifications(request, env, requestId) {
  if (!adminAuthorized(request, env)) return withCors(jsonResponse({ok:false,requestId,error:"UNAUTHORIZED"},401));
  const url = new URL(request.url);
  const limit = Math.min(200,Math.max(1,Math.trunc(Number(url.searchParams.get("limit")||50))||50));
  const result = await env.DB.prepare(`SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT ?`).bind(limit).all();
  return withCors(jsonResponse({ok:true,requestId,count:result.results?.length||0,notifications:result.results||[]}));
}

/* =============================================================
   SYSTEM HEALTH
============================================================= */
async function systemHealth(request, env, requestId, probeGithub) {
  const health = await buildHealth(env, requestId, probeGithub);
  return withCors(jsonResponse(health, health.ok ? 200 : 503));
}

async function buildHealth(env, requestId, probeGithub) {
  const checks = {
    worker: { status:"ok", version:VERSION, requestDriven:true, noCronRequired:true },
    configuration: {
      status: env.DB && env.GITHUB_OWNER && env.GITHUB_REPO && env.GITHUB_BRANCH ? "ok" : "warning",
      d1Binding:Boolean(env.DB), githubToken:Boolean(env.GITHUB_TOKEN), githubOwner:env.GITHUB_OWNER||null,
      githubRepository:env.GITHUB_REPO||null, githubBranch:env.GITHUB_BRANCH||null,
      telegramEnabled:telegramEnabled(env), telegramBotToken:Boolean(env.TELEGRAM_BOT_TOKEN), telegramAdminConfigured:Boolean(env.TELEGRAM_ADMIN_CHAT_ID)
    },
    database: await checkDatabase(env),
    github: await checkGithub(env, probeGithub),
    telemetry: await checkTelemetry(env)
  };
  const statuses = Object.values(checks).map(x=>x.status);
  const overall = statuses.includes("error") ? "error" : statuses.includes("warning") || statuses.includes("stale") ? "degraded" : "healthy";
  return { ok: overall !== "error", requestId, service:SERVICE,version:VERSION,generatedAt:new Date().toISOString(),overall,checks };
}

async function checkDatabase(env) {
  const started = Date.now();
  try {
    if (!env.DB) throw Error("D1 binding DB is missing");
    await env.DB.prepare("SELECT 1 AS ok").first();
    const tables = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('platforms','platform_visitors','platform_sessions','events','notification_log')`).all();
    const col = await env.DB.prepare(`PRAGMA table_info(events)`).all();
    const names = new Set((col.results||[]).map(x=>x.name));
    const required = ["id","received_at","event_type","platform_id","platform_name","platform_type","session_id","visitor_id","ip","ip_hash","data_json","payload_json","metadata_json"];
    const missingColumns = required.filter(x=>!names.has(x));
    const tableNames = new Set((tables.results||[]).map(x=>x.name));
    const missingTables = ["platforms","platform_visitors","platform_sessions","events","notification_log"].filter(x=>!tableNames.has(x));
    const counts = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM platforms) AS platforms,(SELECT COUNT(*) FROM events) AS events,(SELECT COUNT(*) FROM platform_sessions) AS sessions,(SELECT COUNT(*) FROM platform_visitors) AS visitors`).first();
    const latest = await env.DB.prepare(`SELECT received_at,platform_id,event_type,ip FROM events ORDER BY rowid DESC LIMIT 1`).first();
    return { status: missingColumns.length || missingTables.length ? "error":"ok", message: missingColumns.length || missingTables.length ? "Schema incomplete":"D1 is reachable and schema matches Universal Event Insights", latencyMs:Date.now()-started, missingColumns,missingTables,counts:{platforms:Number(counts?.platforms||0),events:Number(counts?.events||0),sessions:Number(counts?.sessions||0),visitors:Number(counts?.visitors||0)},latestEvent:latest?{receivedAt:latest.received_at,platformId:latest.platform_id,eventType:latest.event_type,hasIp:Boolean(latest.ip)}:null };
  } catch (error) {
    return { status:"error",message:"D1 health check failed",latencyMs:Date.now()-started,error:String(error?.message||error) };
  }
}

async function checkGithub(env, probe) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) return { status:"warning", message:"GitHub archive is not fully configured", configured:false };
  if (!probe) return { status:"ok", message:"GitHub configuration present (probe disabled)", configured:true, probed:false, repository:`${env.GITHUB_OWNER}/${env.GITHUB_REPO}` };
  const started = Date.now();
  try {
    const r = await fetchWithTimeout(`${GH_API}/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`, { headers: githubHeaders(env) }, 10000);
    const body = await r.text();
    if (!r.ok) throw Error(`GitHub ${r.status}: ${body.slice(0,500)}`);
    const data = JSON.parse(body);
    return { status:"ok",message:"Authenticated GitHub access works",configured:true,probed:true,latencyMs:Date.now()-started,repository:data.full_name,defaultBranch:data.default_branch,rateLimit:{limit:Number(r.headers.get("x-ratelimit-limit")||0),remaining:Number(r.headers.get("x-ratelimit-remaining")||0),used:Number(r.headers.get("x-ratelimit-used")||0)}};
  } catch (error) {
    return { status:"error",message:"GitHub probe failed",configured:true,probed:true,latencyMs:Date.now()-started,error:String(error?.message||error) };
  }
}

async function checkTelemetry(env) {
  try {
    const row = await env.DB.prepare(`SELECT received_at,platform_id,event_type FROM events ORDER BY rowid DESC LIMIT 1`).first();
    if (!row) return { status:"warning",message:"No telemetry has been received yet",latestEventAt:null,ageSeconds:null };
    const ageSeconds = Math.max(0, Math.floor((Date.now()-new Date(row.received_at).getTime())/1000));
    return { status: ageSeconds <= 300 ? "ok":"stale",message: ageSeconds <= 300 ? "Recent telemetry received":"No event received within the last five minutes",latestEventAt:row.received_at,latestPlatformId:row.platform_id,latestEventType:row.event_type,ageSeconds };
  } catch (error) { return { status:"error",message:String(error?.message||error) }; }
}

/* =============================================================
   API CONTRACT
============================================================= */
function apiContract() {
  return {
    contractVersion:"1.0",
    identityField:"platformId",
    genericPayload:true,
    dynamicFolders:true,
    telegramNotification:true,
    endpoints:{
      collect:"POST /v1/events",
      platforms:"GET /v1/platforms",
      overview:"GET /v1/overview?days=7",
      platform:"GET /v1/platforms/<platformId>?days=7",
      platformEvents:"GET /v1/platforms/<platformId>/events?days=7&limit=100",
      allEvents:"GET /v1/events?days=7&limit=100",
      statsCompatibility:"GET /v1/stats?platform=<platformId>&days=7",
      health:"GET /v1/health?probe=github",
      schema:"GET /v1/schema",
      adminEvents:"GET /v1/admin/events",
      adminNotifications:"GET /v1/admin/notifications",
      adminPlatformKey:"POST /v1/admin/platform-key",
      telegramWebhook:"POST /telegram/webhook"
    },
    requiredForCollect:["platformId"],
    recommendedForCollect:["platformName","platformType","eventType","eventId","sessionId","visitorId","timestamp","data","metadata"],
    eventTypes:[...EVENT_TYPES]
  };
}

/* =============================================================
   OPTIONAL PLATFORM KEY
============================================================= */
async function validateOptionalPlatformKey(env, platformId, key) {
  const enforce = String(env.REQUIRE_PLATFORM_KEY || "false").toLowerCase() === "true";
  if (!key) return enforce ? {ok:false,error:"PLATFORM_KEY_REQUIRED",status:401} : {ok:true};
  try {
    const row = await env.DB.prepare(`SELECT api_key_hash FROM platforms WHERE platform_id=? LIMIT 1`).bind(platformId).first();
    if (!row || !row.api_key_hash) return {ok: enforce ? false:true,error:enforce ? "PLATFORM_KEY_INVALID":undefined,status:enforce ? 401:200};
    const candidate = await sha256(key);
    return candidate === row.api_key_hash ? {ok:true} : {ok:false,error:"PLATFORM_KEY_INVALID",status:401};
  } catch { return enforce ? {ok:false,error:"PLATFORM_KEY_CHECK_FAILED",status:503}:{ok:true}; }
}

/* =============================================================
   HELPERS
============================================================= */
async function grouped(env, sql, days, since) { return days === "all" ? env.DB.prepare(sql).all() : env.DB.prepare(sql).bind(since).all(); }
function nums(row){ const out={}; for(const [k,v] of Object.entries(row||{})) out[k]=Number(v||0); return out; }
function normalizePlatformId(value){ const s=clean(value,96); if(!s)return null; const n=s.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^[-.]+|[-.]+$/g,""); if(!n||n.includes("..")||n.startsWith(".git"))return null; return n.slice(0,80); }
function safePath(v){return(String(v||"unknown").replace(/[^a-zA-Z0-9._-]/g,"-").replace(/-+/g,"-").replace(/^[-.]+|[-.]+$/g,"").slice(0,80)||"unknown");}
function clean(v,max=256){if(v===null||v===undefined)return null;const s=String(v).replace(/\u0000/g,"").trim();return s?s.slice(0,max):null;}
function safeInt(v,min,max){if(v===null||v===undefined||v==="")return null;const n=Number(v);if(!Number.isFinite(n))return null;return Math.min(max,Math.max(min,Math.trunc(n)));}
function safeFloat(v,min,max){if(v===null||v===undefined||v==="")return null;const n=Number(v);if(!Number.isFinite(n))return null;return Math.min(max,Math.max(min,n));}
function safeDate(v){if(!v)return new Date();const d=new Date(v);if(Number.isNaN(d.getTime()))return new Date();const now=Date.now(),t=d.getTime();if(t<now-7*86400000||t>now+5*60000)return new Date();return d;}
function daysAgo(days){return new Date(Date.now()-Number(days)*86400000).toISOString();}
function parseDays(raw){if(String(raw||"").toLowerCase()==="all")return "all";const n=Number(raw||7);return Number.isFinite(n)?Math.min(MAX_DAYS,Math.max(1,Math.trunc(n))):7;}
function validUrl(v){try{const u=new URL(v);return /^https?:$/i.test(u.protocol)?u.href:null;}catch{return null;}}
function hostOf(v){try{return new URL(v).hostname.slice(0,255);}catch{return null;}}
function safeMetadata(v){if(!v||typeof v!=="object")return "{}";try{const s=JSON.stringify(v);return new TextEncoder().encode(s).byteLength>12288?JSON.stringify({truncated:true}):s;}catch{return JSON.stringify({serializationError:true});}}
async function sha256(input){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(input||"")));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function base64Utf8(value){const bytes=new TextEncoder().encode(value);let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out);}
function githubHeaders(env){return{Accept:"application/vnd.github+json",Authorization:`Bearer ${env.GITHUB_TOKEN}`,"X-GitHub-Api-Version":GH_API_VERSION,"User-Agent":SERVICE};}
async function fetchWithTimeout(url,options,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...options,signal:c.signal});}finally{clearTimeout(t);}}
function formatDuration(ms){let s=Math.max(0,Math.round(Number(ms||0)/1000));if(s<60)return `${s}s`;const m=Math.floor(s/60),r=s%60;return `${m}m ${r}s`;}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
function log(level,event,data){const payload={ts:new Date().toISOString(),level,event,...data}; if(level==="error")console.error(JSON.stringify(payload));else if(level==="warn")console.warn(JSON.stringify(payload));else console.log(JSON.stringify(payload));}
function withCors(response){const h=new Headers(response.headers);h.set("Access-Control-Allow-Origin","*");h.set("Access-Control-Allow-Methods","GET,POST,OPTIONS");h.set("Access-Control-Allow-Headers",CORS_ALLOW_HEADERS);h.set("Access-Control-Max-Age","86400");h.set("Cache-Control","no-store");return new Response(response.body,{status:response.status,headers:h});}
function jsonResponse(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});}
function uaVersion(ua, re){const m=ua.match(re);return m?.[1]||null;}
function parseUA(ua){let browser="Other",browserVersionValue=null,os="Other",osVersion=null,device="Desktop";if(/EdgA\//i.test(ua)){browser="Edge Android";browserVersionValue=uaVersion(ua,/EdgA\/([\d.]+)/i);}else if(/EdgiOS\//i.test(ua)){browser="Edge iOS";browserVersionValue=uaVersion(ua,/EdgiOS\/([\d.]+)/i);}else if(/Edg\//i.test(ua)){browser="Edge";browserVersionValue=uaVersion(ua,/Edg\/([\d.]+)/i);}else if(/OPR\//i.test(ua)){browser="Opera";browserVersionValue=uaVersion(ua,/OPR\/([\d.]+)/i);}else if(/SamsungBrowser\//i.test(ua)){browser="Samsung Internet";browserVersionValue=uaVersion(ua,/SamsungBrowser\/([\d.]+)/i);}else if(/CriOS\//i.test(ua)){browser="Chrome iOS";browserVersionValue=uaVersion(ua,/CriOS\/([\d.]+)/i);}else if(/Chrome\//i.test(ua)){browser="Chrome";browserVersionValue=uaVersion(ua,/Chrome\/([\d.]+)/i);}else if(/Firefox\//i.test(ua)){browser="Firefox";browserVersionValue=uaVersion(ua,/Firefox\/([\d.]+)/i);}else if(/Version\/[\d.]+.*Safari/i.test(ua)){browser="Safari";browserVersionValue=uaVersion(ua,/Version\/([\d.]+)/i);}if(/Windows/i.test(ua)){os="Windows";}else if(/Android/i.test(ua)){os="Android";osVersion=uaVersion(ua,/Android\s([\d.]+)/i);}else if(/iPhone|iPad|iPod/i.test(ua)){os="iOS";osVersion=(uaVersion(ua,/OS\s([\d_]+)/i)||"").replace(/_/g,".")||null;}else if(/Mac OS X/i.test(ua)){os="macOS";osVersion=(uaVersion(ua,/Mac OS X\s([\d_.]+)/i)||"").replace(/_/g,".")||null;}else if(/CrOS/i.test(ua)){os="ChromeOS";}else if(/Linux/i.test(ua)){os="Linux";}if(/iPad|Tablet|Android(?!.*Mobile)/i.test(ua))device="Tablet";else if(/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua))device="Mobile";return{browser,browserVersion:browserVersionValue,os,osVersion,device};}
