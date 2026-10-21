/* GitHub Page Insights Dashboard — resilient client, v13.0.0
 * Works with the current Worker contract and gracefully degrades to lightweight endpoints,
 * per-view cache, and the public GitHub archive when a heavy overview query is unavailable.
 */
(function () {
  "use strict";

  const C = window.PAGE_INSIGHTS_CONFIG || {};
  const W = String(C.workerUrl || "").replace(/\/+$/, "");
  const VERSION = String(C.appVersion || "13.0.0");
  const $ = (id) => document.getElementById(id);
  const SAFE_STORE = {
    get(key) { try { return window.localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { window.localStorage.setItem(key, value); return true; } catch (_) { return false; } },
    remove(key) { try { window.localStorage.removeItem(key); } catch (_) {} }
  };

  const state = {
    days: String(C.defaultRangeDays || 7),
    platform: "*",
    overview: null,
    platforms: [],
    loading: false,
    stale: false,
    source: "none", // live | partial | cache | archive | none
    partialLifetime: false,
    clientKind: "browser",
    codeKind: "curl",
    theme: SAFE_STORE.get("uei-pages-theme") || "dark",
    cachePrefix: "uei_dashboard_v13",
    activeRequest: 0,
    archiveRequest: 0,
    hasResolvedOnce: false,
    initialStartedAt: Date.now()
  };

  const el = {
    connection: $("connectionPill"), refresh: $("refreshBtn"), theme: $("themeBtn"),
    platform: $("platformSelect"), search: $("platformSearch"), healthBtn: $("healthBtn"),
    connectBtn: $("connectBtn"), workerVersion: $("workerVersion"), lastSync: $("lastSync"),
    metrics: $("metrics"), healthTitle: $("healthTitle"), overallBadge: $("overallBadge"),
    healthMeta: $("healthMeta"), healthWorker: $("healthWorker"), healthWorkerText: $("healthWorkerText"),
    healthData: $("healthData"), healthDataText: $("healthDataText"), healthArchive: $("healthArchive"),
    healthArchiveText: $("healthArchiveText"), healthTelegram: $("healthTelegram"), healthTelegramText: $("healthTelegramText"),
    rangeSeg: $("rangeSeg"), trafficChart: $("trafficChart"), trafficSummary: $("trafficSummary"),
    platformBars: $("platformBars"), platformCount: $("platformCount"), clientTabs: $("clientTabs"),
    clientRank: $("clientRank"), countries: $("countries"), ips: $("ips"), eventCount: $("eventCount"),
    eventsBody: $("eventsBody"), topPages: $("topPages"), eventTypes: $("eventTypes"), sources: $("sources"),
    statuses: $("statuses"), drawer: $("eventDrawer"), backdrop: $("drawerBackdrop"),
    drawerTitle: $("drawerTitle"), drawerBody: $("drawerBody"), toasts: $("toasts"),
    codeTabs: document.querySelectorAll(".code-tabs button"), codeBlock: $("codeBlock"),
    copyCodeBtn: $("copyCodeBtn"), exportBtn: $("exportBtn"), dataNotice: $("dataNotice"),
    boot: $("bootScreen"), bootStatus: $("bootStatus"),
    bootProgress: $("bootProgressBar")
  };

  const required = Object.entries(el).filter(([key, value]) => value == null && !["codeTabs", "dataNotice", "boot", "bootStatus", "bootProgress"].includes(key));
  if (required.length) {
    console.error("GitHub Page Insights: missing required DOM nodes", required.map(([key]) => key));
    const boot = $("bootScreen");
    if (boot) boot.classList.add("boot-screen--failed");
    return;
  }

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const n = (v) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num(v));
  const clamp = (v, min, max) => Math.max(min, Math.min(max, num(v)));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const rangeLabel = () => state.days === "all" ? "All available time" : `Last ${state.days} day${state.days === "1" ? "" : "s"}`;
  const sourceKey = () => `${state.platform === "*" ? "all" : safeKey(state.platform)}_${safeKey(state.days)}`;
  const safeKey = (value) => String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 90) || "default";
  const cacheKey = () => `${state.cachePrefix}_${sourceKey()}`;
  const archiveCacheKey = () => `uei_archive_v13_${sourceKey()}`;

  function formatDuration(ms) {
    const seconds = Math.max(0, Math.round(num(ms) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, {
      year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  }

  function timeAgo(value) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "—";
    const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  function setBootMessage(message, progress) {
    if (el.bootStatus) el.bootStatus.textContent = message;
    if (el.bootProgress) el.bootProgress.style.width = `${clamp(progress, 3, 100)}%`;
  }

  let bootReleasePromise = null;
  function releaseBootScreen() {
    if (bootReleasePromise) return bootReleasePromise;
    bootReleasePromise = (async () => {
      const elapsed = Date.now() - state.initialStartedAt;
      if (elapsed < 780) await sleep(780 - elapsed);
      if (el.boot) {
        el.boot.classList.add("is-hidden");
        el.boot.setAttribute("aria-hidden", "true");
        window.setTimeout(() => { if (el.boot) el.boot.hidden = true; }, 720);
      }
    })();
    return bootReleasePromise;
  }

  function toast(message, error = false) {
    if (!el.toasts) return;
    const item = document.createElement("div");
    item.className = `toast${error ? " error" : ""}`;
    item.textContent = message;
    el.toasts.appendChild(item);
    window.setTimeout(() => item.remove(), 4800);
  }

  function setStatus(kind, label) {
    el.connection.className = `status-pill ${kind}`;
    const target = el.connection.querySelector("span");
    if (target) target.textContent = label;
    el.connection.setAttribute("aria-label", `Data connection: ${label}`);
  }

  function setNotice(kind, title, detail, actionText = "", action = null) {
    if (!el.dataNotice) return;
    if (!title && !detail) {
      el.dataNotice.hidden = true;
      el.dataNotice.innerHTML = "";
      return;
    }
    el.dataNotice.hidden = false;
    el.dataNotice.className = `data-notice ${kind || "info"}`;
    el.dataNotice.innerHTML = `<span class="notice-mark" aria-hidden="true">${kind === "error" ? "!" : kind === "warning" ? "◈" : kind === "success" ? "✓" : "i"}</span><div class="notice-copy"><strong>${esc(title || "Information")}</strong><span>${esc(detail || "")}</span></div>${actionText ? `<button type="button" class="notice-action" id="noticeAction">${esc(actionText)}</button>` : ""}`;
    if (actionText && typeof action === "function") $("noticeAction")?.addEventListener("click", action, { once: true });
  }

  async function fetchJson(url, options = {}, timeoutMs = Number(C.requestTimeoutMs || 7500)) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), Math.max(1000, timeoutMs));
    const { allowHttpErrors = false, headers: optionHeaders = {}, ...fetchOptions } = options;
    try {
      const response = await fetch(url, {
        method: "GET", cache: "no-store", credentials: "omit", redirect: "follow",
        signal: controller.signal, headers: { "Accept": "application/json", ...optionHeaders }, ...fetchOptions
      });
      const raw = await response.text();
      let body = null;
      if (raw) {
        try { body = JSON.parse(raw); }
        catch (_) {
          const preview = raw.replace(/\s+/g, " ").slice(0, 100);
          const error = new Error(`The endpoint returned non-JSON data${preview ? ` (${preview})` : ""}.`);
          error.status = response.status;
          error.code = "INVALID_JSON";
          throw error;
        }
      }
      if (!response.ok && !allowHttpErrors) {
        const reason = body?.error || body?.message || body?.detail || `HTTP ${response.status}`;
        const error = new Error(String(reason));
        error.status = response.status;
        error.body = body;
        error.code = response.status === 429 ? "RATE_LIMIT" : response.status >= 500 ? "SERVER_ERROR" : "HTTP_ERROR";
        throw error;
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        const error = new Error(`The endpoint returned an empty or invalid response (HTTP ${response.status}).`);
        error.status = response.status;
        error.code = "EMPTY_RESPONSE";
        throw error;
      }
      if (allowHttpErrors) body.__httpStatus = response.status;
      return body;
    } catch (error) {
      if (error?.name === "AbortError" || error === "timeout") {
        const timeoutError = new Error(`The Worker did not respond within ${Math.round(timeoutMs / 1000)} seconds.`);
        timeoutError.code = "TIMEOUT";
        throw timeoutError;
      }
      if (error instanceof TypeError && !error.code) error.code = "NETWORK_ERROR";
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function workerUrl(path) {
    return `${W}${path}`;
  }

  function makeApiPath(path, extra = {}) {
    const params = new URLSearchParams();
    params.set("days", state.days);
    for (const [key, value] of Object.entries(extra)) {
      if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
    }
    return `${path}?${params.toString()}`;
  }

  function isRetryable(error) {
    if (!error) return false;
    if (error.code === "TIMEOUT") return false;
    if (error.code === "NETWORK_ERROR" || error.code === "SERVER_ERROR" || error.code === "RATE_LIMIT") return true;
    return Number(error.status) >= 500 || Number(error.status) === 429;
  }

  async function request(path, options = {}) {
    if (!W) throw new Error("The Worker URL is not configured in docs/config.js.");
    const attempts = Math.max(1, Number(options.attempts || 1));
    const timeoutMs = Number(options.timeoutMs || C.requestTimeoutMs || 7500);
    const requestOptions = { ...options };
    delete requestOptions.attempts;
    delete requestOptions.timeoutMs;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try { return await fetchJson(workerUrl(path), requestOptions, timeoutMs); }
      catch (error) {
        lastError = error;
        if (attempt >= attempts || !isRetryable(error)) break;
        setBootMessage(`Reconnecting to analytics service · attempt ${attempt + 1}`, 38 + attempt * 12);
        await sleep(250 * attempt + Math.floor(Math.random() * 160));
      }
    }
    throw lastError || new Error("The request failed for an unknown reason.");
  }

  function payloadRoot(payload) {
    if (!payload || typeof payload !== "object") return {};
    if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) return payload.data;
    if (payload.overview && typeof payload.overview === "object") return payload.overview;
    if (payload.result && typeof payload.result === "object") return payload.result;
    return payload;
  }

  function mapEvent(row) {
    const source = row && typeof row === "object" ? row : {};
    const pick = (...keys) => {
      for (const key of keys) if (source[key] !== undefined && source[key] !== null) return source[key];
      return null;
    };
    return {
      ...source,
      id: pick("id", "eventId", "event_id"),
      eventId: pick("eventId", "id", "event_id"),
      receivedAt: pick("receivedAt", "received_at", "archivedAt", "timestamp"),
      occurredAt: pick("occurredAt", "occurred_at"),
      eventType: pick("eventType", "event_type") || "custom",
      platformId: pick("platformId", "platform_id"),
      platformName: pick("platformName", "platform_name"),
      platformType: pick("platformType", "platform_type"),
      pageUrl: pick("pageUrl", "page_url", "url"),
      path: pick("path", "request_path"),
      title: pick("title", "pageTitle"),
      referrerHost: pick("referrerHost", "referrer_host"),
      visitorId: pick("visitorId", "visitor_id", "userId", "user_id"),
      sessionId: pick("sessionId", "session_id"),
      browserVersion: pick("browserVersion", "browser_version"),
      osVersion: pick("osVersion", "os_version"),
      deviceModel: pick("deviceModel", "device_model"),
      screenWidth: pick("screenWidth", "screen_width"),
      screenHeight: pick("screenHeight", "screen_height"),
      viewportWidth: pick("viewportWidth", "viewport_width"),
      viewportHeight: pick("viewportHeight", "viewport_height"),
      asOrganization: pick("asOrganization", "as_organization"),
      ipHash: pick("ipHash", "ip_hash"),
      platformIp: pick("platformIp", "platform_ip"),
      responseStatus: pick("responseStatus", "response_status"),
      durationMs: pick("durationMs", "duration_ms") ?? 0,
      maxScroll: pick("maxScroll", "max_scroll") ?? 0,
      clicks: pick("clicks") ?? 0,
      outboundClicks: pick("outboundClicks", "outbound_clicks") ?? 0,
      utmSource: pick("utmSource", "utm_source"),
      dataJson: pick("dataJson", "data_json", "data"),
      metadataJson: pick("metadataJson", "metadata_json", "metadata"),
      cfJson: pick("cfJson", "cf_json", "cf"),
      requestJson: pick("requestJson", "request_json", "request")
    };
  }

  function normalizePlatform(row) {
    const p = row && typeof row === "object" ? row : {};
    return {
      ...p,
      platformId: p.platformId || p.platform_id || p.id || "",
      platformName: p.platformName || p.platform_name || p.name || p.platformId || p.platform_id || p.id || "Unnamed platform",
      platformType: p.platformType || p.platform_type || p.type || "web",
      totalEvents: num(p.totalEvents ?? p.total_events ?? p.events),
      totalPageviews: num(p.totalPageviews ?? p.total_pageviews ?? p.pageviews ?? p.views),
      totalSessions: num(p.totalSessions ?? p.total_sessions ?? p.sessions),
      totalVisitors: num(p.totalVisitors ?? p.total_visitors ?? p.visitors),
      lastSeen: p.lastSeen || p.last_seen || null
    };
  }

  function normalizeOverview(payload) {
    const source = payloadRoot(payload);
    if (source.ok === false) throw new Error(source.error || source.message || "The analytics API reported a data error.");
    const hasShape = ["totals", "daily", "platforms", "recentEvents", "events", "countries", "browsers", "ips", "topPages"].some((key) => key in source);
    if (!hasShape) throw new Error("The analytics endpoint responded, but the payload did not contain dashboard data.");
    const totals = source.totals && typeof source.totals === "object" ? source.totals : {};
    const platforms = Array.isArray(source.platforms) ? source.platforms.map(normalizePlatform).filter((p) => p.platformId) : [];
    const recentEventsRaw = Array.isArray(source.recentEvents) ? source.recentEvents : Array.isArray(source.events) ? source.events : [];
    const recentEvents = recentEventsRaw.map(mapEvent).sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));
    const normalized = {
      ...source,
      totals: {
        ...totals,
        events: num(totals.events ?? totals.totalEvents),
        pageviews: num(totals.pageviews ?? totals.views ?? totals.totalPageviews),
        uniqueVisitors: num(totals.uniqueVisitors ?? totals.unique_visitors ?? totals.totalVisitors),
        sessions: num(totals.sessions ?? totals.totalSessions),
        avgDurationMs: num(totals.avgDurationMs ?? totals.avg_duration_ms),
        avgScroll: num(totals.avgScroll ?? totals.avg_scroll)
      },
      daily: Array.isArray(source.daily) ? source.daily : [],
      countries: Array.isArray(source.countries) ? source.countries : [],
      browsers: Array.isArray(source.browsers) ? source.browsers : [],
      operatingSystems: Array.isArray(source.operatingSystems) ? source.operatingSystems : Array.isArray(source.os) ? source.os : [],
      devices: Array.isArray(source.devices) ? source.devices : [],
      ips: Array.isArray(source.ips) ? source.ips : [],
      platforms,
      recentEvents,
      topPages: Array.isArray(source.topPages) ? source.topPages : []
    };
    if (!normalized.topPages.length) normalized.topPages = aggregateTopPages(recentEvents);
    if (!normalized.daily.length && recentEvents.length) normalized.daily = aggregateDaily(recentEvents);
    if (!normalized.totals.events && recentEvents.length) normalized.totals = aggregateTotals(recentEvents);
    return normalized;
  }

  function aggregateTopPages(events) {
    const map = new Map();
    for (const event of events || []) {
      if (event.eventType && event.eventType !== "pageview") continue;
      const path = event.path || event.pageUrl || "Unknown page";
      const key = `${path}::${event.title || ""}`;
      const row = map.get(key) || { path, title: event.title || path, views: 0 };
      row.views += 1;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.views - a.views).slice(0, 20);
  }

  function aggregateDaily(events) {
    const map = new Map();
    for (const event of events || []) {
      const parsed = new Date(event.receivedAt || event.occurredAt || 0);
      if (Number.isNaN(parsed.getTime())) continue;
      const day = parsed.toISOString().slice(0, 10);
      const row = map.get(day) || { day, events: 0, pageviews: 0, views: 0 };
      row.events += 1;
      if (event.eventType === "pageview") { row.pageviews += 1; row.views += 1; }
      map.set(day, row);
    }
    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  function aggregateTotals(events) {
    const list = events || [];
    const visitors = new Set(list.map((r) => r.visitorId).filter(Boolean));
    const sessions = new Set(list.map((r) => r.sessionId).filter(Boolean));
    return {
      events: list.length,
      pageviews: list.filter((r) => r.eventType === "pageview").length,
      uniqueVisitors: visitors.size,
      sessions: sessions.size,
      avgDurationMs: list.length ? list.reduce((sum, r) => sum + num(r.durationMs), 0) / list.length : 0,
      avgScroll: list.length ? list.reduce((sum, r) => sum + num(r.maxScroll), 0) / list.length : 0
    };
  }

  function aggregateRank(events, valueKey, outputKey = valueKey, transform = (v) => v || "Unknown") {
    const map = new Map();
    for (const event of events || []) {
      const value = transform(event[valueKey]);
      map.set(value, (map.get(value) || 0) + 1);
    }
    return [...map.entries()].map(([value, count]) => ({ [outputKey]: value, label: value, count })).sort((a, b) => b.count - a.count).slice(0, 30);
  }

  function buildSampleOverview(events, platformRows, partialLifetime = false) {
    const recentEvents = (events || []).map(mapEvent).sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));
    const platforms = (platformRows || []).map(normalizePlatform).filter((p) => p.platformId);
    if (state.platform !== "*") {
      return buildPlatformSample(recentEvents.filter((r) => r.platformId === state.platform), platforms.filter((p) => p.platformId === state.platform), partialLifetime);
    }
    const totals = partialLifetime ? {
      events: platforms.reduce((s, p) => s + p.totalEvents, 0),
      pageviews: platforms.reduce((s, p) => s + p.totalPageviews, 0),
      uniqueVisitors: platforms.reduce((s, p) => s + p.totalVisitors, 0),
      sessions: platforms.reduce((s, p) => s + p.totalSessions, 0),
      avgDurationMs: 0, avgScroll: 0
    } : aggregateTotals(recentEvents);
    return {
      totals,
      daily: aggregateDaily(recentEvents),
      countries: aggregateRank(recentEvents, "country", "label"),
      browsers: aggregateRank(recentEvents, "browser", "browser"),
      operatingSystems: aggregateRank(recentEvents, "os", "os"),
      devices: aggregateRank(recentEvents, "device", "device"),
      ips: aggregateIps(recentEvents),
      platforms,
      recentEvents,
      topPages: aggregateTopPages(recentEvents),
      partialLifetime
    };
  }

  function buildPlatformSample(events, platforms, partialLifetime = false) {
    const list = events || [];
    const platform = (platforms || [])[0] || null;
    const totals = partialLifetime && platform ? {
      events: platform.totalEvents, pageviews: platform.totalPageviews,
      uniqueVisitors: platform.totalVisitors, sessions: platform.totalSessions,
      avgDurationMs: 0, avgScroll: 0
    } : aggregateTotals(list);
    return {
      totals,
      platform,
      site: platform,
      daily: aggregateDaily(list),
      countries: aggregateRank(list, "country", "label"),
      browsers: aggregateRank(list, "browser", "browser"),
      operatingSystems: aggregateRank(list, "os", "os"),
      devices: aggregateRank(list, "device", "device"),
      ips: aggregateIps(list),
      platforms: platforms || [],
      recentEvents: list,
      topPages: aggregateTopPages(list),
      partialLifetime
    };
  }

  function aggregateIps(events) {
    const map = new Map();
    for (const event of events || []) {
      if (!event.ip) continue;
      const row = map.get(event.ip) || { ip: event.ip, count: 0, city: event.city, country: event.country, browser: event.browser, os: event.os, device: event.device };
      row.count += 1;
      for (const key of ["city", "country", "browser", "os", "device"]) if (!row[key] && event[key]) row[key] = event[key];
      map.set(event.ip, row);
    }
    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 50);
  }

  function cacheOverview(data, key = cacheKey()) {
    try { SAFE_STORE.set(key, JSON.stringify({ savedAt: Date.now(), source: state.source, data })); } catch (_) {}
  }

  function readCache(key = cacheKey()) {
    try {
      const raw = SAFE_STORE.get(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const data = parsed?.data || null;
      if (!data || typeof data !== "object") return null;
      return { savedAt: num(parsed.savedAt), data, source: parsed.source || "cache" };
    } catch (_) { return null; }
  }

  function readArchiveCache() {
    try {
      const raw = SAFE_STORE.get(archiveCacheKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.data || typeof parsed.data !== "object") return null;
      const data = normalizeOverview(parsed.data);
      if (!data.recentEvents.length) return null;
      return { savedAt: num(parsed.savedAt), data };
    } catch (_) { return null; }
  }

  function readLegacyCache() {
    // Migrate only when the old single cache unmistakably matches the currently selected platform/range.
    try {
      const raw = SAFE_STORE.get("uei_dashboard_cache_v122");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const data = parsed?.data;
      if (!data || typeof data !== "object") return null;
      const root = payloadRoot(data);
      const storedDays = parsed.days ?? root.days ?? root.rangeDays ?? root.timeRange?.days;
      // The old cache key did not include a platform/range. Reuse it only when both are provable.
      if (storedDays === undefined || String(storedDays) !== String(state.days)) return null;
      if (state.platform === "*" && Array.isArray(root.platforms)) return { savedAt: num(parsed.savedAt), data: root };
      const id = root.platformId || root.platform?.platformId || root.site?.platformId;
      if (state.platform !== "*" && id === state.platform) return { savedAt: num(parsed.savedAt), data: root };
      return null;
    } catch (_) { return null; }
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme === "light" ? "light" : "dark";
    SAFE_STORE.set("uei-pages-theme", document.documentElement.dataset.theme);
    state.theme = document.documentElement.dataset.theme;
    el.theme?.setAttribute("aria-pressed", state.theme === "light" ? "true" : "false");
    el.theme?.setAttribute("title", state.theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  }

  function setMetric(icon, label, value, note, tone = "blue") {
    return `<article class="metric-card ${tone}"><div class="metric-top"><span class="metric-icon" aria-hidden="true">${icon}</span><span class="metric-label">${esc(label)}</span></div><strong class="metric-value">${esc(value)}</strong><span class="metric-note">${esc(note || "")}</span></article>`;
  }

  function renderMetrics(data) {
    const totals = data.totals || {};
    const latest = data.recentEvents?.[0];
    let commonNote = rangeLabel();
    if (state.source === "archive") commonNote = "Sample of archived events · not full totals";
    else if (state.source === "partial" && !state.partialLifetime) commonNote = `Sample of ${n(data.recentEvents?.length || 0)} recent events`;
    else if (state.source === "partial" && state.partialLifetime) commonNote = "Cumulative platform counters";
    else if (state.source === "cache") commonNote = `${rangeLabel()} · saved snapshot`;
    el.metrics.innerHTML = [
      setMetric("◉", "Pageviews", n(totals.pageviews ?? totals.views), commonNote, "blue"),
      setMetric("♙", "Unique visitors", n(totals.uniqueVisitors), state.source === "partial" && !state.partialLifetime ? "Distinct IDs in the sample" : "Distinct visitor IDs", "violet"),
      setMetric("⌁", "Sessions", n(totals.sessions), state.source === "partial" && !state.partialLifetime ? "Sessions in the sample" : "Distinct sessions", "pink"),
      setMetric("▤", "Total events", n(totals.events), commonNote, "cyan"),
      setMetric("◷", "Avg duration", state.partialLifetime ? "—" : formatDuration(totals.avgDurationMs), state.partialLifetime ? "Unavailable in fallback mode" : "Collected duration", "green"),
      setMetric("↘", "Avg scroll", state.partialLifetime ? "—" : `${Math.round(num(totals.avgScroll))}%`, state.partialLifetime ? "Unavailable in fallback mode" : "From recorded events", "amber"),
      setMetric("◈", "Platforms", n(data.platforms?.length || state.platforms.length || (state.platform !== "*" ? 1 : 0)), state.platform === "*" ? "Discovered platform IDs" : state.platform, "indigo"),
      setMetric("◴", "Last activity", latest ? timeAgo(latest.receivedAt) : (state.source === "partial" && state.partialLifetime && data.platforms?.length ? timeAgo(data.platforms.slice().sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0))[0]?.lastSeen) : "—"), latest ? `${latest.platformName || latest.platformId || "Platform"} · ${latest.eventType || "event"}` : "Most recent known activity", "slate")
    ].join("");
  }

  function populatePlatforms(filter = "") {
    const query = String(filter || "").trim().toLowerCase();
    const rows = (state.platforms || []).filter((p) => {
      const id = String(p.platformId || "").toLowerCase();
      const name = String(p.platformName || "").toLowerCase();
      return !query || id.includes(query) || name.includes(query);
    });
    el.platform.innerHTML = `<option value="*">All platforms · ${n(state.platforms.length)}</option>`;
    for (const platform of rows) {
      const option = document.createElement("option");
      option.value = platform.platformId;
      option.textContent = `${platform.platformName || platform.platformId} · ${platform.platformId}`;
      el.platform.appendChild(option);
    }
    if (state.platform !== "*" && state.platforms.some((p) => p.platformId === state.platform)) el.platform.value = state.platform;
    else if (state.platform === "*") el.platform.value = "*";
    else {
      state.platform = "*";
      el.platform.value = "*";
    }
  }

  function currentRows(data, key) { return Array.isArray(data?.[key]) ? data[key] : []; }

  function renderTraffic(rows) {
    const data = Array.isArray(rows) ? rows : [];
    if (!data.length) {
      el.trafficChart.innerHTML = `<div class="empty-state"><span class="empty-icon">↗</span><strong>No traffic points for this range</strong><small>Archived or sample-only mode may not include daily aggregates.</small></div>`;
      el.trafficSummary.textContent = "0 events";
      return;
    }
    const width = 960, height = 300, left = 52, right = 18, top = 22, bottom = 46;
    const getValue = (row) => num(row.events ?? row.pageviews ?? row.views);
    const max = Math.max(1, ...data.map(getValue));
    const x = (i) => data.length === 1 ? width / 2 : left + i * (width - left - right) / (data.length - 1);
    const y = (v) => height - bottom - getValue(v) / max * (height - top - bottom);
    const points = data.map((row, i) => `${x(i)},${y(row)}`).join(" ");
    const area = `${points} ${x(data.length - 1)},${height - bottom} ${x(0)},${height - bottom}`;
    const grid = [0, 1, 2, 3].map((i) => {
      const yy = top + i * (height - top - bottom) / 3;
      return `<line x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}"/><text x="${left - 10}" y="${yy + 4}" text-anchor="end">${n(Math.round(max * (1 - i / 3)))}</text>`;
    }).join("");
    const labels = data.map((row, i) => {
      if (!(i % Math.max(1, Math.ceil(data.length / 8)) === 0 || i === data.length - 1)) return "";
      const raw = String(row.day || "");
      return `<text class="chart-x" x="${x(i)}" y="${height - 12}" text-anchor="middle">${esc(raw.slice(5) || raw.slice(0, 10))}</text>`;
    }).join("");
    const dots = data.map((row, i) => `<circle class="chart-dot" cx="${x(i)}" cy="${y(row)}" r="4"><title>${esc(row.day || "")} · ${n(getValue(row))} events</title></circle>`).join("");
    el.trafficChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Traffic events over time"><g class="chart-grid">${grid}</g><polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${points}"/>${dots}${labels}</svg>`;
    el.trafficSummary.textContent = `${n(data.reduce((sum, row) => sum + getValue(row), 0))} events`;
  }

  function renderPlatformBars(rows) {
    const list = (rows || []).slice().sort((a, b) => num(b.totalEvents) - num(a.totalEvents)).slice(0, 10);
    el.platformCount.textContent = n((rows || []).length);
    if (!list.length) {
      el.platformBars.innerHTML = `<div class="empty-state compact"><span class="empty-icon">◈</span><strong>No platforms found</strong><small>Send the first event with a stable platformId.</small></div>`;
      return;
    }
    const max = Math.max(1, ...list.map((r) => num(r.totalEvents)));
    el.platformBars.innerHTML = list.map((row) => `<button class="bar-row ${state.platform === row.platformId ? "selected" : ""}" type="button" data-platform="${esc(row.platformId)}"><div class="bar-head"><strong>${esc(row.platformName || row.platformId)}</strong><span>${n(row.totalEvents)} events</span></div><div class="bar-track"><span style="width:${Math.max(3, Math.round(num(row.totalEvents) / max * 100))}%"></span></div><div class="bar-meta"><span>${esc(row.platformId || "")}</span><span>${n(row.totalPageviews)} views</span></div></button>`).join("");
    el.platformBars.querySelectorAll("[data-platform]").forEach((button) => button.addEventListener("click", () => {
      state.platform = button.dataset.platform || "*";
      el.platform.value = state.platform;
      refresh();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
  }

  function rankRows(rows, labelFn, countFn, extraFn) {
    if (!rows.length) return `<div class="empty-state compact"><span class="empty-icon">·</span><strong>No data in this view</strong><small>Try another range or check whether events are being collected.</small></div>`;
    return rows.slice(0, 10).map((row, index) => `<div class="rank-row"><span class="rank-no">${String(index + 1).padStart(2, "0")}</span><div class="rank-main"><strong>${esc(labelFn(row))}</strong>${extraFn ? `<small>${esc(extraFn(row))}</small>` : ""}</div><strong class="rank-value">${n(countFn(row))}</strong></div>`).join("");
  }

  function renderClient() {
    const types = { browser: ["browsers", (row) => row.browser || row.label || "Unknown"], os: ["operatingSystems", (row) => row.os || row.label || "Unknown"], device: ["devices", (row) => row.device || row.label || "Unknown"] };
    const [key, label] = types[state.clientKind] || types.browser;
    el.clientRank.innerHTML = rankRows(currentRows(state.overview, key), label, (row) => row.count);
  }

  function renderCountries(rows) {
    el.countries.innerHTML = rankRows(rows || [], (row) => row.label || row.country || "Unknown", (row) => row.count, (row) => (row.label || row.country) === "Unknown" ? "Geolocation unavailable" : "Country / region aggregate");
  }

  function renderIps(rows) {
    el.ips.innerHTML = rankRows(rows || [], (row) => row.ip || "Unknown", (row) => row.count, (row) => [row.city, row.country, row.browser, row.os].filter(Boolean).join(" · ") || "No enrichment data");
  }

  function renderEvents(rows) {
    const data = (rows || []).slice(0, Number(C.recentLimit || 60));
    el.eventCount.textContent = n(data.length);
    if (!data.length) {
      el.eventsBody.innerHTML = `<tr><td colspan="7"><div class="table-empty"><span>◌</span><strong>No events returned</strong><small>No event records were found for this range.</small></div></td></tr>`;
      return;
    }
    el.eventsBody.innerHTML = data.map((row, index) => `<tr data-index="${index}" tabindex="0" title="Open event details"><td><strong>${esc(timeAgo(row.receivedAt))}</strong><small>${esc(formatDate(row.receivedAt))}</small></td><td><span class="event-pill">${esc(row.eventType || "custom")}</span><small>${esc(row.platformName || row.platformId || "—")}</small></td><td><code>${C.showRawIp ? esc(row.ip || "—") : "hidden"}</code></td><td>${esc([row.city, row.region, row.country].filter(Boolean).join(" · ") || "—")}</td><td>${esc([row.device, row.deviceModel].filter(Boolean).join(" · ") || "—")}</td><td>${esc([row.browser, row.os].filter(Boolean).join(" · ") || "—")}</td><td class="page-cell"><strong>${esc(row.title || row.path || "—")}</strong><small>${esc(row.path || row.pageUrl || "")}</small></td></tr>`).join("");
    el.eventsBody.querySelectorAll("tr[data-index]").forEach((row) => {
      const open = () => openEvent(data[Number(row.dataset.index)]);
      row.addEventListener("click", open);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } });
    });
  }

  function renderTopPages(rows) {
    el.topPages.innerHTML = rankRows((rows || []).slice(0, 10), (row) => row.title || row.path || "Unknown page", (row) => row.views ?? row.count, (row) => row.path || "");
  }

  function renderEventTypes(events) {
    const map = new Map();
    for (const event of events || []) map.set(event.eventType || "custom", (map.get(event.eventType || "custom") || 0) + 1);
    const list = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    el.eventTypes.innerHTML = list.length ? list.map(([type, count]) => `<div class="event-type-card"><span>${esc(type)}</span><strong>${n(count)}</strong></div>`).join("") : `<div class="empty-state compact"><span class="empty-icon">▤</span><strong>No event types</strong><small>Recent event records are empty.</small></div>`;
  }

  function renderSources(events) {
    const map = new Map();
    for (const event of events || []) {
      const key = event.referrerHost || event.utmSource || "direct";
      map.set(key, (map.get(key) || 0) + 1);
    }
    const list = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, count]) => ({ label, count }));
    el.sources.innerHTML = rankRows(list, (row) => row.label, (row) => row.count);
  }

  function renderStatuses(events) {
    const map = new Map();
    for (const event of events || []) {
      const key = event.responseStatus ? String(event.responseStatus) : "N/A";
      map.set(key, (map.get(key) || 0) + 1);
    }
    const list = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    el.statuses.innerHTML = list.length ? list.map(([status, count]) => `<div class="event-type-card"><span>HTTP ${esc(status)}</span><strong>${n(count)}</strong></div>`).join("") : `<div class="empty-state compact"><span class="empty-icon">◉</span><strong>No status data</strong><small>HTTP status was not included in recent records.</small></div>`;
  }

  function renderAll() {
    if (!state.overview) return;
    const data = normalizeOverview(state.overview);
    state.overview = data;
    renderMetrics(data);
    renderTraffic(data.daily);
    renderPlatformBars(data.platforms.length ? data.platforms : state.platforms);
    renderClient(); renderCountries(data.countries); renderIps(data.ips); renderEvents(data.recentEvents);
    renderTopPages(data.topPages); renderEventTypes(data.recentEvents); renderSources(data.recentEvents); renderStatuses(data.recentEvents);
  }

  function setHealthCard(node, textNode, status, text) {
    node.className = `health-card ${status || "pending"}`;
    textNode.textContent = text || "Not checked";
  }

  function applyBasicHealth(message, quality = "live") {
    const live = quality === "live";
    const partial = quality === "partial";
    const cache = quality === "cache";
    const archive = quality === "archive";
    const healthy = live || partial;
    const title = live ? "Analytics data is live" : partial ? "Live fallback data is available" : cache ? "Showing the last saved snapshot" : archive ? "Showing the GitHub archive snapshot" : "Analytics data is unavailable";
    el.healthTitle.textContent = title;
    el.healthMeta.textContent = message;
    const badge = live ? "LIVE" : partial ? "PARTIAL" : cache ? "CACHED" : archive ? "ARCHIVE" : "UNAVAILABLE";
    el.overallBadge.className = `badge ${live ? "badge-success" : healthy ? "badge-warning" : "badge-danger"}`;
    el.overallBadge.textContent = badge;
    setHealthCard(el.healthWorker, el.healthWorkerText, live ? "ok" : partial ? "warning" : "error", live ? `Worker API reachable · Pages v${VERSION}` : partial ? "Some lightweight endpoints responded" : "Worker query could not be completed");
    setHealthCard(el.healthData, el.healthDataText, live ? "ok" : partial ? "warning" : cache || archive ? "warning" : "error", live ? `${n(state.overview?.totals?.events)} events loaded` : partial ? "Partial / sampled data; see the notice above" : cache ? "Local saved data; may be out of date" : archive ? "Public archived events; sample only" : "No usable data loaded");
    if (quality !== "live") {
      setHealthCard(el.healthArchive, el.healthArchiveText, archive ? "ok" : "pending", archive ? "Public GitHub event archive" : "Run Health Check for archive status");
    } else {
      setHealthCard(el.healthArchive, el.healthArchiveText, "pending", "Run Health Check for archive status");
    }
    setHealthCard(el.healthTelegram, el.healthTelegramText, "pending", "Run Health Check for configuration status");
  }

  function renderFullHealth(health) {
    const checks = health?.checks || {};
    const overall = String(health?.overall || "unknown").toLowerCase();
    el.healthTitle.textContent = overall === "healthy" ? "All monitored services are healthy" : overall === "degraded" ? "Service is online with warnings" : "One or more checks need attention";
    el.healthMeta.textContent = `${health?.generatedAt ? formatDate(health.generatedAt) : "—"} · ${checks.database?.counts?.events ?? 0} events · ${checks.database?.counts?.platforms ?? 0} platforms`;
    el.overallBadge.className = `badge ${overall === "healthy" ? "badge-success" : overall === "degraded" ? "badge-warning" : "badge-danger"}`;
    el.overallBadge.textContent = overall.toUpperCase();
    const worker = checks.worker, database = checks.database, github = checks.github, config = checks.configuration;
    setHealthCard(el.healthWorker, el.healthWorkerText, worker?.status === "ok" ? "ok" : "error", worker?.version ? `Worker v${worker.version}` : worker?.status || "Unknown");
    setHealthCard(el.healthData, el.healthDataText, database?.status === "ok" ? "ok" : database?.status === "warning" ? "warning" : "error", database?.counts ? `${n(database.counts.events)} events · ${n(database.counts.visitors)} visitors` : database?.message || database?.status || "Unknown");
    setHealthCard(el.healthArchive, el.healthArchiveText, github?.status === "ok" ? "ok" : github?.status === "warning" || github?.status === "stale" ? "warning" : "error", github?.message || github?.status || "Unknown");
    setHealthCard(el.healthTelegram, el.healthTelegramText, config?.telegramConfigured ? "ok" : "warning", config?.telegramConfigured ? "Configured" : "Not configured");
    el.workerVersion.textContent = worker?.version ? `Worker v${worker.version}` : `Pages v${VERSION}`;
  }

  async function checkHealth() {
    const oldText = el.healthBtn.textContent;
    el.healthBtn.disabled = true;
    el.healthBtn.textContent = "◌ Checking…";
    try {
      // Do not force a GitHub archive probe here: it can fail while the Worker itself remains reachable.
      const health = await request("/v1/health?quick=1", { attempts: 1, timeoutMs: 9000, allowHttpErrors: true });
      renderFullHealth(health);
      setStatus("ok", health.ok ? "API reachable" : "API reachable · issues");
      if (!health.ok) toast("The Worker responded, but one or more backend checks need attention.", true);
    } catch (error) {
      setStatus("error", "Worker unreachable");
      toast(`Health check could not reach the Worker: ${error.message}`, true);
    } finally {
      el.healthBtn.disabled = false;
      el.healthBtn.textContent = oldText;
    }
  }

  async function loadPartialFromApi() {
    setBootMessage("Trying lighter data endpoints…", 64);
    const [platformResult, eventsResult] = await Promise.allSettled([
      request("/v1/platforms", { attempts: 1, timeoutMs: 6000 }),
      request(makeApiPath("/v1/events", { limit: 120 }), { attempts: 1, timeoutMs: 6000 })
    ]);
    let platforms = [];
    let events = [];
    if (platformResult.status === "fulfilled") {
      const data = payloadRoot(platformResult.value);
      if (Array.isArray(data.platforms)) platforms = data.platforms.map(normalizePlatform).filter((p) => p.platformId);
    }
    if (eventsResult.status === "fulfilled") {
      const data = payloadRoot(eventsResult.value);
      const rows = Array.isArray(data.events) ? data.events : Array.isArray(data.recentEvents) ? data.recentEvents : [];
      events = rows.map(mapEvent);
    }
    if (state.platforms.length && !platforms.length) platforms = state.platforms;
    if (state.platform !== "*" && !events.length && !platforms.some((p) => p.platformId === state.platform)) {
      throw new Error("The lightweight endpoints did not return records for the selected platform.");
    }
    if (!platforms.length && !events.length) {
      const errors = [platformResult, eventsResult].filter((r) => r.status === "rejected").map((r) => r.reason?.message).filter(Boolean);
      throw new Error(errors.join(" · ") || "No platform or event data was returned.");
    }
    const lifetimeFallback = !events.length && platforms.length > 0;
    const data = buildSampleOverview(events, platforms, lifetimeFallback);
    if (state.platform !== "*" && !data.platform && !events.length) throw new Error("The selected platform did not appear in the platform directory.");
    return { data: normalizeOverview(data), platforms, lifetimeFallback };
  }

  async function loadArchiveFallback() {
    const owner = String(C.githubOwner || "mehrdadmb2");
    const repository = String(C.githubRepository || "github-page-insights");
    const branch = String(C.githubBranch || "main");
    const treeUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const response = await fetchJson(treeUrl, { headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" } }, 6500);
    const entries = Array.isArray(response.tree) ? response.tree : [];
    const filePattern = /^data\/platforms\/([^/]+)\/events\/\d{4}\/\d{2}\/\d{2}\/[^/]+\.json$/;
    let files = entries.filter((entry) => entry.type === "blob" && filePattern.test(entry.path || ""));
    if (state.platform !== "*") files = files.filter((entry) => entry.path.startsWith(`data/platforms/${state.platform}/events/`));
    const since = state.days === "all" ? null : Date.now() - num(state.days) * 86400000;
    if (since) files = files.filter((entry) => {
      const match = entry.path.match(/events\/(\d{4})\/(\d{2})\/(\d{2})\//);
      if (!match) return false;
      return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`).getTime() >= since - 86400000;
    });
    files.sort((a, b) => String(b.path).localeCompare(String(a.path)));
    files = files.slice(0, state.platform === "*" ? 24 : 36);
    if (!files.length) throw new Error("No matching public GitHub archive files were found.");

    const queue = files.slice();
    const rows = [];
    const concurrency = 6;
    async function workerLoop() {
      while (queue.length) {
        const file = queue.shift();
        if (!file) break;
        try {
          const url = `https://raw.githubusercontent.com/${owner}/${repository}/${encodeURIComponent(branch)}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
          const wrapper = await fetchJson(url, {}, 5500);
          if (wrapper?.event && typeof wrapper.event === "object") {
            const event = mapEvent(wrapper.event);
            if (!event.platformId && wrapper.platform?.id) event.platformId = wrapper.platform.id;
            if (!event.platformName && wrapper.platform?.name) event.platformName = wrapper.platform.name;
            rows.push(event);
          }
        } catch (_) { /* A single archived event must not fail the whole fallback. */ }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => workerLoop()));
    if (!rows.length) throw new Error("Archive files were listed, but none could be read.");
    const exactSince = state.days === "all" ? null : Date.now() - num(state.days) * 86400000;
    const matchingRows = exactSince ? rows.filter((row) => {
      const time = new Date(row.receivedAt || row.occurredAt || 0).getTime();
      return Number.isFinite(time) && time >= exactSince;
    }) : rows;
    rows.length = 0;
    rows.push(...matchingRows);
    rows.sort((a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0));
    if (!rows.length) throw new Error("No archived events fell inside the selected range.");
    const platformMap = new Map();
    for (const row of rows) {
      const key = row.platformId || "unknown";
      const existing = platformMap.get(key) || { platformId: key, platformName: row.platformName || key, platformType: row.platformType || "web", totalEvents: 0, totalPageviews: 0, totalVisitors: 0, totalSessions: 0, lastSeen: row.receivedAt };
      existing.totalEvents += 1;
      if (row.eventType === "pageview") existing.totalPageviews += 1;
      if (row.receivedAt && (!existing.lastSeen || new Date(row.receivedAt) > new Date(existing.lastSeen))) existing.lastSeen = row.receivedAt;
      platformMap.set(key, existing);
    }
    const platforms = [...platformMap.values()].sort((a, b) => b.totalEvents - a.totalEvents);
    const data = buildSampleOverview(rows, platforms, false);
    data.archiveSampleSize = rows.length;
    data.archiveTruncated = Boolean(response.truncated);
    SAFE_STORE.set(archiveCacheKey(), JSON.stringify({ savedAt: Date.now(), data }));
    return normalizeOverview(data);
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    state.activeRequest += 1;
    const requestId = state.activeRequest;
    const requestedSelection = sourceKey();
    el.refresh.classList.add("is-busy");
    el.refresh.disabled = true;
    setStatus("pending", "Refreshing…");
    setBootMessage("Connecting to the analytics engine…", 40);
    setNotice("", "", "");
    try {
      const path = state.platform === "*" ? makeApiPath("/v1/overview", { lite: 1 }) : makeApiPath(`/v1/platforms/${encodeURIComponent(state.platform)}`, { lite: 1 });
      let payload;
      try {
        payload = await request(path, { attempts: 2, timeoutMs: Number(C.requestTimeoutMs || 7500) });
      } catch (firstError) {
        // Older Workers generally ignore unknown query parameters. Only retry without lite=1
        // when the server explicitly rejects that query; do not repeat an expensive query after
        // a timeout because the lightweight fallback endpoints can recover faster.
        const queryRejected = String(path).includes("lite=1") && [400, 404, 422].includes(Number(firstError.status));
        if (!queryRejected) throw firstError;
        const plainPath = state.platform === "*" ? makeApiPath("/v1/overview") : makeApiPath(`/v1/platforms/${encodeURIComponent(state.platform)}`);
        payload = await request(plainPath, { attempts: 1, timeoutMs: 4500 });
      }
      let overview = normalizeOverview(payload);
      if (requestId !== state.activeRequest || requestedSelection !== sourceKey()) return;
      state.overview = overview;
      if (state.platform === "*") state.platforms = overview.platforms;
      else if (!state.platforms.length && overview.platforms?.length) state.platforms = overview.platforms;
      state.source = "live";
      state.stale = false;
      state.partialLifetime = false;
      state.hasResolvedOnce = true;
      cacheOverview(overview);
      renderAll();
      applyBasicHealth(`Loaded ${n(overview.totals?.events)} events from the Worker · ${rangeLabel()}.`, "live");
      el.lastSync.textContent = new Date().toLocaleTimeString();
      el.workerVersion.textContent = `Pages v${VERSION}`;
      setStatus("ok", "Live data");
      const rangeHasActivity = num(overview.totals?.events) > 0 || overview.recentEvents.length > 0 || overview.daily.some((row) => num(row.events ?? row.pageviews ?? row.views) > 0);
      const lifetimeHasActivity = overview.platforms.some((row) => num(row.totalEvents) > 0) || num(overview.platform?.totalEvents) > 0 || num(overview.site?.totalEvents) > 0;
      if (!rangeHasActivity && lifetimeHasActivity && state.days !== "all") {
        setNotice("warning", "Connected — no events in this time window", "The API is reachable and platforms exist, but this range contains no events. Try 30d, 90d, or All to find older activity.", "Show all time", () => {
          state.days = "all";
          el.rangeSeg.querySelectorAll("button").forEach((button) => button.classList.toggle("active", button.dataset.days === "all"));
          refresh();
        });
      } else if (!rangeHasActivity && !lifetimeHasActivity) {
        setNotice("warning", "Connected — no tracked events yet", "The API responded correctly, but no activity was found for this selection. Confirm that the tracking snippet is installed and has sent at least one event.", "Retry", () => refresh());
      } else {
        setNotice("success", "Connected to live analytics", `Updated ${el.lastSync.textContent}. Auto-refresh is enabled.`, "", null);
      }
      if (state.platform === "*") populatePlatforms(el.search.value);
      setBootMessage("Dashboard ready", 100);
    } catch (primaryError) {
      if (requestId !== state.activeRequest || requestedSelection !== sourceKey()) return;
      if (!state.hasResolvedOnce) releaseBootScreen();
      let usedFallback = false;
      try {
        const fallback = await loadPartialFromApi();
        if (requestId !== state.activeRequest || requestedSelection !== sourceKey()) return;
        state.overview = fallback.data;
        if (fallback.platforms.length) state.platforms = fallback.platforms;
        state.source = "partial";
        state.stale = false;
        state.partialLifetime = fallback.lifetimeFallback;
        state.hasResolvedOnce = true;
        renderAll();
        applyBasicHealth("The full analytics query failed, but lightweight API endpoints returned usable data. Some panels may be sampled or cumulative.", "partial");
        setStatus("warning", "Partial data");
        setNotice("warning", "Partial data mode", fallback.lifetimeFallback ? "The overview query is unavailable. Metrics use cumulative platform counters, not the selected time range; details that need events may be empty." : `The overview query is unavailable. Charts and rankings are based on up to ${n(fallback.data.recentEvents.length)} recent API events, not a complete aggregate for the selected range.`, "Retry full analytics", () => refresh());
        if (state.platform === "*") populatePlatforms(el.search.value);
        usedFallback = true;
      } catch (partialError) {
        console.warn("GitHub Page Insights lightweight fallback failed", partialError);
      }
      if (!usedFallback) {
        const cached = readCache();
        const legacy = cached ? null : readLegacyCache();
        const selectedCache = cached || legacy;
        if (selectedCache) {
          try {
            state.overview = normalizeOverview(selectedCache.data);
            if (state.platform === "*") state.platforms = state.overview.platforms;
            state.source = "cache";
            state.stale = true;
            state.partialLifetime = false;
            state.hasResolvedOnce = true;
            renderAll();
            const saved = selectedCache.savedAt ? formatDate(selectedCache.savedAt) : "an earlier visit";
            applyBasicHealth(`Worker unavailable. Showing the locally saved dashboard snapshot from ${saved}.`, "cache");
            setStatus("warning", "Saved snapshot");
            setNotice("warning", "Showing saved data", `The Worker is not responding. This snapshot was last saved ${saved}; values may be out of date.`, "Try again", () => refresh());
            if (state.platform === "*") populatePlatforms(el.search.value);
            usedFallback = true;
          } catch (cacheError) { console.warn("Saved dashboard cache was invalid", cacheError); }
        }
      }
      if (!usedFallback) {
        const savedArchive = readArchiveCache();
        if (savedArchive) {
          state.overview = savedArchive.data;
          state.platforms = savedArchive.data.platforms || [];
          state.source = "archive";
          state.stale = true;
          state.partialLifetime = false;
          state.hasResolvedOnce = true;
          renderAll();
          const savedAt = savedArchive.savedAt ? formatDate(savedArchive.savedAt) : "an earlier visit";
          applyBasicHealth(`The Worker is unavailable. Showing the saved public-archive sample from ${savedAt}; these are not complete database totals.`, "archive");
          setStatus("warning", "Saved archive sample");
          setNotice("warning", "Using a saved archive sample", `Restored ${n(savedArchive.data.recentEvents.length)} previously downloaded public events from ${savedAt}. Retry the live API to restore complete analytics.`, "Try live API", () => refresh());
          populatePlatforms(el.search.value);
          usedFallback = true;
          // Refresh the public archive in the background without blocking the recovered dashboard.
          const archiveId = ++state.archiveRequest;
          const archiveSelection = sourceKey();
          loadArchiveFallback().then((archiveData) => {
            if (archiveId !== state.archiveRequest || archiveSelection !== sourceKey() || state.source !== "archive") return;
            state.overview = archiveData;
            state.platforms = archiveData.platforms || [];
            renderAll();
            applyBasicHealth(`The Worker is unavailable. Refreshed ${archiveData.recentEvents.length} public archived events; counts remain sample-based.`, "archive");
            setStatus("warning", "Archive sample refreshed");
            setNotice("warning", "Public archive sample refreshed", `Loaded ${n(archiveData.recentEvents.length)} matching archived events. This sample is not a complete database aggregate.`, "Retry live API", () => refresh());
            populatePlatforms(el.search.value);
          }).catch((archiveError) => console.warn("Saved archive background refresh failed", archiveError));
        }
      }
      if (!usedFallback) {
        state.overview = null;
        state.source = "none";
        state.stale = false;
        state.partialLifetime = false;
        el.metrics.innerHTML = `<div class="global-empty"><span class="empty-icon">!</span><div><strong>Analytics could not be loaded</strong><p>${esc(primaryError.message || "The Worker did not return dashboard data.")}</p><button class="btn primary" id="retryInline" type="button">Retry connection</button></div></div>`;
        [el.trafficChart, el.platformBars, el.clientRank, el.countries, el.ips, el.topPages, el.eventTypes, el.sources, el.statuses].forEach((node) => {
          node.innerHTML = `<div class="empty-state compact"><span class="empty-icon">!</span><strong>Waiting for data</strong><small>Live API and fallback endpoints did not return usable results.</small></div>`;
        });
        el.eventsBody.innerHTML = `<tr><td colspan="7"><div class="table-empty"><strong>No data connection</strong><small>The dashboard will retry and can restore a local snapshot if one exists.</small></div></td></tr>`;
        $("retryInline")?.addEventListener("click", refresh);
        applyBasicHealth(`Worker request failed: ${primaryError.message || "Unknown error"}`, "none");
        setStatus("error", "Waiting for API");
        setNotice("error", "Cannot reach the live analytics API", `${primaryError.message || "Connection failed."} The dashboard is checking the public event archive as a last-resort fallback.`, "Retry", () => refresh());
        state.hasResolvedOnce = true;
        // Archive reads run in the background so this failure screen never blocks the UI.
        const archiveId = ++state.archiveRequest;
        const archiveSelection = sourceKey();
        loadArchiveFallback().then((archiveData) => {
          if (archiveId !== state.archiveRequest || archiveSelection !== sourceKey() || state.source !== "none") return;
          state.overview = archiveData;
          state.platforms = archiveData.platforms || [];
          state.source = "archive";
          state.stale = true;
          renderAll();
          applyBasicHealth(`Worker API is unavailable. Showing ${archiveData.archiveSampleSize || archiveData.recentEvents.length} recent events that were successfully archived in the public repository. This is a sample, not the full D1 totals.`, "archive");
          setStatus("warning", "Archive snapshot");
          setNotice("warning", "Public GitHub archive fallback", `Loaded ${n(archiveData.recentEvents.length)} archived events. Aggregate counts are limited to this sample and do not represent all-time totals.`, "Retry live API", () => refresh());
          populatePlatforms(el.search.value);
        }).catch((archiveError) => {
          console.warn("GitHub Pages archive fallback failed", archiveError);
          if (archiveSelection === sourceKey() && state.source === "none") {
            setNotice("error", "No online or saved data source is available", "The Worker, lightweight API fallback and public archive could not be reached. Check the Worker deployment, D1 health, and browser network access, then retry.", "Retry", () => refresh());
          }
        });
      }
      if (state.source !== "none") toast(`Live overview unavailable; using ${state.source === "partial" ? "partial API data" : state.source === "cache" ? "saved data" : "the archive snapshot"}.`, false);
    } finally {
      if (requestId === state.activeRequest) {
        state.loading = false;
        el.refresh.classList.remove("is-busy");
        el.refresh.disabled = false;
        if (!state.hasResolvedOnce || !bootReleasePromise) releaseBootScreen();
      }
    }
  }

  function detailRows(event) {
    const pairs = [
      ["Event ID", event.eventId || event.id], ["Event type", event.eventType],
      ["Platform", event.platformName || event.platformId], ["Received", event.receivedAt ? formatDate(event.receivedAt) : null],
      ["IP", C.showRawIp ? event.ip : "hidden"], ["IP hash", event.ipHash], ["Platform IP", C.showPlatformIp ? event.platformIp : "hidden"],
      ["Country", event.country], ["Region", event.region], ["City", event.city], ["Latitude", event.latitude], ["Longitude", event.longitude],
      ["ASN", event.asn], ["Organization", event.asOrganization], ["Browser", [event.browser, event.browserVersion].filter(Boolean).join(" ")],
      ["OS", [event.os, event.osVersion].filter(Boolean).join(" ")], ["Device", [event.device, event.deviceVendor, event.deviceModel].filter(Boolean).join(" · ")],
      ["Screen", event.screenWidth && event.screenHeight ? `${event.screenWidth} × ${event.screenHeight}` : null],
      ["Viewport", event.viewportWidth && event.viewportHeight ? `${event.viewportWidth} × ${event.viewportHeight}` : null],
      ["Timezone", event.timezone], ["Language", event.language], ["Page", event.pageUrl || event.path], ["Referrer", event.referrer],
      ["Duration", formatDuration(event.durationMs)], ["Scroll", `${num(event.maxScroll)}%`], ["Visitor ID", event.visitorId],
      ["Session ID", event.sessionId], ["CF-Ray", event.cfRay], ["Request ID", event.requestId]
    ];
    return pairs.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => `<div class="detail-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
  }

  function pretty(value) {
    try {
      if (typeof value === "string") return JSON.stringify(JSON.parse(value), null, 2);
      return JSON.stringify(value || {}, null, 2);
    } catch (_) { return String(value || "{}"); }
  }

  function openEvent(event) {
    if (!event) return;
    el.drawerTitle.textContent = event.eventId || event.id || "Event details";
    el.drawerBody.innerHTML = `<div class="detail-grid">${detailRows(event)}</div><div class="json-section"><h3>Custom data</h3><pre>${esc(pretty(event.dataJson))}</pre></div><div class="json-section"><h3>Metadata</h3><pre>${esc(pretty(event.metadataJson))}</pre></div><div class="json-section"><h3>Cloudflare snapshot</h3><pre>${esc(pretty(event.cfJson))}</pre></div><div class="json-section"><h3>Request snapshot</h3><pre>${esc(pretty(event.requestJson))}</pre></div>`;
    el.drawer.classList.add("open");
    el.backdrop.classList.add("open");
    el.drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");
  }

  function closeDrawer() {
    el.drawer.classList.remove("open");
    el.backdrop.classList.remove("open");
    el.drawer.setAttribute("aria-hidden", "true");
    document.body.classList.remove("drawer-open");
  }

  function apiExamples(kind) {
    const payload = {
      platformId: "my-website", platformName: "My Website", platformType: "web", eventType: "pageview",
      eventId: "stable-unique-event-id", identity: { visitorId: "visitor-123", sessionId: "session-123" },
      page: { url: "https://example.com/", path: "/", title: "Home", referrer: "" },
      screen: { width: 1920, height: 1080, devicePixelRatio: 1 }, viewport: { width: 1440, height: 900 }, data: { sdkMode: "basic" }
    };
    if (kind === "js") return `const response = await fetch("${W}/v1/events", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${JSON.stringify(payload, null, 2)})\n});\nconsole.log(await response.json());`;
    if (kind === "py") return `import requests\n\npayload = ${JSON.stringify(payload, null, 2)}\nr = requests.post("${W}/v1/events", json=payload, timeout=15)\nprint(r.status_code, r.json())`;
    return `curl -X POST "${W}/v1/events" \\\n  -H "Content-Type: application/json" \\\n  --data '${JSON.stringify(payload)}'`;
  }

  function renderCode() {
    el.codeBlock.textContent = apiExamples(state.codeKind);
    el.codeTabs.forEach((button) => button.classList.toggle("active", button.dataset.code === state.codeKind));
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed"; area.style.opacity = "0"; area.style.pointerEvents = "none";
      document.body.appendChild(area); area.select();
      const copied = document.execCommand("copy"); area.remove();
      return copied;
    } catch (_) { return false; }
  }

  async function copyCode() {
    const success = await copyText(el.codeBlock.textContent || "");
    toast(success ? "API example copied." : "Clipboard access is not available in this browser.", !success);
  }

  function exportCsv() {
    const rows = state.overview?.recentEvents || [];
    if (!rows.length) return toast("There are no recent events to export.", true);
    const cols = ["receivedAt", "eventId", "platformId", "eventType", "ip", "country", "region", "city", "browser", "os", "device", "path", "durationMs", "maxScroll", "visitorId", "sessionId"];
    const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [cols.join(","), ...rows.map((row) => cols.map((key) => cell(row[key])).join(","))].join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `github-page-insights-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    toast(`Exported ${n(rows.length)} recent events.`);
  }

  function bind() {
    el.refresh.addEventListener("click", refresh);
    el.healthBtn.addEventListener("click", checkHealth);
    el.theme.addEventListener("click", () => { state.theme = state.theme === "dark" ? "light" : "dark"; applyTheme(); });
    el.platform.addEventListener("change", () => { state.platform = el.platform.value || "*"; refresh(); });
    el.search.addEventListener("input", () => populatePlatforms(el.search.value));
    el.rangeSeg.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      el.rangeSeg.querySelectorAll("button").forEach((other) => other.classList.remove("active"));
      button.classList.add("active");
      state.days = button.dataset.days || "7";
      refresh();
    }));
    el.clientTabs.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      el.clientTabs.querySelectorAll("button").forEach((other) => other.classList.remove("active"));
      button.classList.add("active"); state.clientKind = button.dataset.kind || "browser"; renderClient();
    }));
    el.backdrop.addEventListener("click", closeDrawer);
    $("closeDrawer")?.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDrawer(); });
    el.exportBtn.addEventListener("click", exportCsv);
    el.codeTabs.forEach((button) => button.addEventListener("click", () => { state.codeKind = button.dataset.code || "curl"; renderCode(); }));
    el.copyCodeBtn.addEventListener("click", copyCode);
    document.addEventListener("visibilitychange", () => { if (!document.hidden && state.source !== "none") updateRelativeTimes(); });
  }

  function updateRelativeTimes() {
    if (!state.overview) return;
    renderEvents(state.overview.recentEvents || []);
    renderMetrics(state.overview);
  }

  async function init() {
    applyTheme();
    bind();
    populatePlatforms();
    renderCode();
    setBootMessage("Preparing dashboard modules…", 22);
    applyBasicHealth("Connecting to the analytics Worker…", "none");
    await refresh();
    const interval = Number(C.autoRefreshMs || 300000);
    if (Number.isFinite(interval) && interval >= 60000) {
      window.setInterval(() => { if (!document.hidden && !state.loading) refresh(); }, interval);
    }
  }

  init().catch((error) => {
    console.error("GitHub Page Insights startup error", error);
    applyBasicHealth(`Startup error: ${error.message || "Unknown error"}`, "none");
    setStatus("error", "Startup error");
    setBootMessage("Starting in recovery mode…", 100);
    releaseBootScreen();
  });
})();
