(function () {
  "use strict";

  const C = window.PAGE_INSIGHTS_CONFIG || {};
  const W = String(C.workerUrl || "").replace(/\/+$/, "");
  const $ = (id) => document.getElementById(id);

  const state = {
    days: String(C.defaultRangeDays || 7),
    platform: "*",
    overview: null,
    platformStats: null,
    platforms: [],
    events: [],
    health: null,
    loading: false,
    theme: localStorage.getItem("uei-theme") || "midnight",
    clientKind: "browser",
    source: "live",
    refreshedAt: null,
    eventQuery: "",
    eventType: "*",
    visibleEvents: 50,
    cache: Object.create(null)
  };

  const el = {
    boot: $("boot"),
    live: $("livePill"),
    liveLabel: $("liveLabel"),
    liveMeta: $("liveMeta"),
    lastSync: $("lastSync"),
    platform: $("platformSelect"),
    search: $("platformSearch"),
    traffic: $("trafficSvg"),
    chartTip: $("chartTip"),
    trafficInfo: $("trafficInfo"),
    trafficWindowLabel: $("trafficWindowLabel"),
    platformBars: $("platformBars"),
    platformCards: $("platformCards"),
    platformCount: $("platformCount"),
    countries: $("countries"),
    geoCount: $("geoCount"),
    clientRank: $("clientRank"),
    ips: $("ips"),
    eventsBody: $("eventsBody"),
    eventCount: $("eventCount"),
    eventSearch: $("eventSearch"),
    eventTypeFilter: $("eventTypeFilter"),
    tableHint: $("tableHint"),
    topPages: $("topPages"),
    topPagesSource: $("topPagesSource"),
    eventTypes: $("eventTypes"),
    sources: $("sources"),
    statuses: $("statuses"),
    drawer: $("eventDrawer"),
    backdrop: $("drawerBackdrop"),
    drawerTitle: $("drawerTitle"),
    drawerSubtitle: $("drawerSubtitle"),
    drawerBody: $("drawerBody"),
    admin: $("adminDialog"),
    adminInput: $("adminKeyInput"),
    adminResult: $("adminResult")
  };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));

  const number = (value) => new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
  const decimal = (value, digits = 1) => new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(Number(value) || 0);
  const safeNum = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const compact = (value) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
  const nowIso = () => new Date().toISOString();

  function duration(ms) {
    const seconds = Math.max(0, Math.round(safeNum(ms) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  function formatDate(value, withSeconds = true) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: withSeconds
    }).format(date);
  }

  function relativeTime(value) {
    const date = new Date(value).getTime();
    if (!Number.isFinite(date)) return "—";
    const diff = Math.max(0, Math.floor((Date.now() - date) / 1000));
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function parseJson(value) {
    if (value == null || value === "") return {};
    if (typeof value === "object") return value;
    try { return JSON.parse(value); } catch { return value; }
  }

  function get(obj, ...keys) {
    for (const key of keys) {
      const value = obj?.[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
  }

  function eventValue(event, key, fallback = null) {
    if (!event) return fallback;
    if (event[key] !== undefined && event[key] !== null && event[key] !== "") return event[key];
    const aliases = {
      eventId: ["id"],
      receivedAt: ["received_at"],
      occurredAt: ["occurred_at"],
      eventType: ["event_type"],
      eventVersion: ["event_version"],
      platformId: ["platform_id"],
      platformName: ["platform_name"],
      platformType: ["platform_type"],
      platformUrl: ["platform_url"],
      platformDomain: ["platform_domain"],
      appVersion: ["app_version"],
      sdkName: ["sdk_name"],
      sdkVersion: ["sdk_version"],
      pageUrl: ["page_url"],
      queryString: ["query_string"],
      referrerHost: ["referrer_host"],
      regionCode: ["region_code"],
      asOrganization: ["as_organization"],
      ipHash: ["ip_hash"],
      platformIp: ["platform_ip"],
      forwardedFor: ["forwarded_for"],
      ipSource: ["ip_source"],
      userAgent: ["user_agent"],
      browserVersion: ["browser_version"],
      osVersion: ["os_version"],
      deviceVendor: ["device_vendor"],
      deviceModel: ["device_model"],
      screenWidth: ["screen_width"],
      screenHeight: ["screen_height"],
      viewportWidth: ["viewport_width"],
      viewportHeight: ["viewport_height"],
      devicePixelRatio: ["device_pixel_ratio"],
      colorDepth: ["color_depth"],
      connectionType: ["connection_type"],
      connectionDownlink: ["connection_downlink"],
      connectionRtt: ["connection_rtt"],
      connectionSaveData: ["connection_save_data"],
      httpMethod: ["http_method"],
      requestUrl: ["request_url"],
      requestScheme: ["request_scheme"],
      requestHost: ["request_host"],
      requestPath: ["request_path"],
      requestQuery: ["request_query"],
      cfRay: ["cf_ray"],
      tlsVersion: ["tls_version"],
      clientTcpRtt: ["client_tcp_rtt"],
      clientQuicRtt: ["client_quic_rtt"],
      botScore: ["bot_score"],
      verifiedBot: ["verified_bot"],
      responseStatus: ["response_status"],
      durationMs: ["duration_ms"],
      maxScroll: ["max_scroll"],
      outboundClicks: ["outbound_clicks"],
      utmSource: ["utm_source"],
      utmMedium: ["utm_medium"],
      utmCampaign: ["utm_campaign"],
      utmTerm: ["utm_term"],
      utmContent: ["utm_content"],
      dataJson: ["data_json"],
      metadataJson: ["metadata_json"],
      headersJson: ["headers_json"],
      cfJson: ["cf_json"],
      requestJson: ["request_json"],
      payloadJson: ["payload_json"],
      rawEventJson: ["raw_event_json"]
    };
    for (const alias of aliases[key] || []) {
      if (event[alias] !== undefined && event[alias] !== null && event[alias] !== "") return event[alias];
    }
    return fallback;
  }

  function normalizeEvent(event) {
    if (!event || typeof event !== "object") return null;
    const normalized = { ...event };
    const keys = [
      "eventId","receivedAt","occurredAt","eventType","eventVersion","platformId","platformName","platformType",
      "platformUrl","platformDomain","environment","appVersion","sdkName","sdkVersion","source","userId","sessionId",
      "visitorId","anonymousId","traceId","requestId","pageUrl","path","queryString","title","referrer","referrerHost",
      "language","acceptLanguage","timezone","country","region","regionCode","city","continent","colo","asn",
      "asOrganization","latitude","longitude","postalCode","metroCode","ip","ipHash","platformIp","forwardedFor",
      "ipSource","userAgent","browser","browserVersion","os","osVersion","device","deviceVendor","deviceModel",
      "screenWidth","screenHeight","viewportWidth","viewportHeight","devicePixelRatio","colorDepth","connectionType",
      "connectionDownlink","connectionRtt","connectionSaveData","httpMethod","requestUrl","requestScheme","requestHost",
      "requestPath","requestQuery","cfRay","tlsVersion","clientTcpRtt","clientQuicRtt","botScore","verifiedBot",
      "responseStatus","durationMs","maxScroll","clicks","outboundClicks","utmSource","utmMedium","utmCampaign",
      "utmTerm","utmContent","dataJson","metadataJson","headersJson","cfJson","requestJson","payloadJson","rawEventJson"
    ];
    for (const key of keys) normalized[key] = eventValue(event, key, normalized[key] ?? null);
    normalized.data = get(normalized, "data") || parseJson(normalized.dataJson);
    normalized.metadata = get(normalized, "metadata") || parseJson(normalized.metadataJson);
    return normalized;
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function normalizeOverview(value) {
    const data = value || {};
    return {
      ...data,
      totals: data.totals || {},
      daily: normalizeArray(data.daily),
      countries: normalizeArray(data.countries),
      browsers: normalizeArray(data.browsers),
      operatingSystems: normalizeArray(data.operatingSystems),
      devices: normalizeArray(data.devices),
      ips: normalizeArray(data.ips),
      platforms: normalizeArray(data.platforms),
      recentEvents: normalizeArray(data.recentEvents).map(normalizeEvent).filter(Boolean)
    };
  }

  function cacheKey() {
    return `dashboard|${state.platform}|${state.days}`;
  }

  function readCache(key) {
    if (state.cache[key]) return state.cache[key];
    try {
      const raw = localStorage.getItem(`uei-dashboard:${key}`);
      if (!raw) return null;
      const value = JSON.parse(raw);
      state.cache[key] = value;
      return value;
    } catch {
      return null;
    }
  }

  function saveCache(key, value) {
    state.cache[key] = value;
    try {
      localStorage.setItem(`uei-dashboard:${key}`, JSON.stringify(value));
    } catch {
      // Local storage can be disabled; memory cache remains available.
    }
  }

  function toast(message, isError = false) {
    const node = document.createElement("div");
    node.className = `toast ${isError ? "error" : ""}`;
    node.innerHTML = `<span>${isError ? "⚠️" : "✓"}</span><div>${esc(message)}</div>`;
    $("toasts").appendChild(node);
    setTimeout(() => node.remove(), 4600);
  }

  function setLive(mode, label, meta = "") {
    el.live.classList.remove("ok", "warn", "error");
    if (mode === "ok") el.live.classList.add("ok");
    if (mode === "warn") el.live.classList.add("warn");
    if (mode === "error") el.live.classList.add("error");
    el.liveLabel.textContent = label;
    el.liveMeta.textContent = meta || "—";
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    try { localStorage.setItem("uei-theme", state.theme); } catch {}
    const button = $("themeBtn");
    if (button) button.title = state.theme === "midnight" ? "Switch to blue-hour dark theme" : "Switch to midnight dark theme";
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copied to clipboard.");
    } catch {
      toast("Clipboard access is unavailable in this browser.", true);
    }
  }

  function setStat(id, value, sub) {
    const node = $(id);
    if (!node) return;
    node.textContent = value;
    const subNode = $(`${id}-sub`);
    if (subNode && sub !== undefined) subNode.textContent = sub;
  }

  function requestPath(base, days = state.days) {
    return `${base}${base.includes("?") ? "&" : "?"}days=${encodeURIComponent(days)}`;
  }

  async function api(path, options = {}) {
    if (!W) throw new Error("Worker URL is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(C.requestTimeoutMs || 12000));
    try {
      const response = await fetch(`${W}${path}`, {
        cache: "no-store",
        signal: controller.signal,
        ...options
      });
      let body = null;
      try { body = await response.json(); } catch {}
      if (!response.ok) {
        const code = body?.error ? ` — ${body.error}` : "";
        throw new Error(`HTTP ${response.status}${code}`);
      }
      return body;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Request timed out.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  function currentData() {
    return state.platform === "*" ? state.overview : (state.platformStats || state.overview);
  }

  function currentEvents() {
    const data = currentData();
    return normalizeArray(data?.recentEvents).map(normalizeEvent).filter(Boolean);
  }

  function setEmpty(container, icon, title, note) {
    container.innerHTML = `<div class="empty-state"><span>${icon}</span><strong>${esc(title)}</strong><small>${esc(note || "No records available for the selected window.")}</small></div>`;
  }

  function setHealthCard(id, status, label, detail) {
    const node = $(id);
    if (!node) return;
    const normalized = String(status || "unknown").toLowerCase();
    node.className = `health-card ${normalized}`;
    node.innerHTML = `<span>${esc(label)}</span><strong>${esc(normalized.toUpperCase())}</strong><small>${esc(detail || "")}</small>`;
  }

  function renderHealth() {
    const health = state.health || {};
    const overall = String(health.overall || "unknown").toLowerCase();
    el.liveMeta.textContent = `${overall}`;
    $("overallBadge").textContent = overall.toUpperCase();
    $("overallBadge").className = `status-badge ${overall}`;
    $("healthTitle").textContent = overall === "healthy"
      ? "All core dependencies are responding."
      : overall === "degraded"
        ? "The Worker is responding with one or more partial dependencies."
        : overall === "error"
          ? "One or more core dependencies reported an error."
          : "Health status is not available yet.";

    const checks = health.checks || {};
    setHealthCard("h-worker", checks.worker?.status || "unknown", "⚙️ Worker", checks.worker?.version ? `v${checks.worker.version}` : "Runtime");
    setHealthCard("h-d1", checks.database?.status || "unknown", "🗄️ D1", checks.database?.eventColumnCount ? `${checks.database.eventColumnCount} event columns` : "Schema & data");
    setHealthCard("h-gh", checks.github?.status || "unknown", "📦 GitHub", checks.github?.message || "Archive / API");
    const telegramConfigured = Boolean(checks.configuration?.telegramConfigured);
    setHealthCard("h-tg", telegramConfigured ? "ok" : "degraded", "✈️ Telegram", telegramConfigured ? "Configured" : "Optional / disabled");
    const countEvents = checks.database?.counts?.events ?? 0;
    const countPlatforms = checks.database?.counts?.platforms ?? 0;
    $("healthMeta").textContent = `${health.generatedAt ? formatDate(health.generatedAt) : "—"} · ${number(countEvents)} events · ${number(countPlatforms)} platforms`;
    const version = checks.worker?.version || "11.x";
    $("footVersion").textContent = version;
  }

  function renderHealthError(error) {
    $("overallBadge").textContent = "ERROR";
    $("overallBadge").className = "status-badge error";
    $("healthTitle").textContent = "Health endpoint is currently unreachable.";
    $("healthMeta").textContent = error?.message || "Unknown health error";
    setHealthCard("h-worker", "error", "⚙️ Worker", "Unreachable");
    setHealthCard("h-d1", "unknown", "🗄️ D1", "Not checked");
    setHealthCard("h-gh", "unknown", "📦 GitHub", "Not checked");
    setHealthCard("h-tg", "unknown", "✈️ Telegram", "Not checked");
  }

  function populatePlatforms(query = "") {
    const q = query.trim().toLowerCase();
    const filtered = state.platforms.filter((platform) => {
      const id = String(platform.platformId || "").toLowerCase();
      const name = String(platform.platformName || "").toLowerCase();
      const type = String(platform.platformType || "").toLowerCase();
      return !q || id.includes(q) || name.includes(q) || type.includes(q);
    });

    el.platform.innerHTML = `<option value="*">All platforms</option>`;
    for (const platform of filtered) {
      const option = document.createElement("option");
      option.value = String(platform.platformId || "");
      option.textContent = `${platform.platformName || platform.platformId} · ${platform.platformId}`;
      el.platform.appendChild(option);
    }
    el.platform.value = state.platform === "*" || state.platforms.some((p) => String(p.platformId) === state.platform)
      ? state.platform
      : "*";

    renderPlatformCards(filtered);
  }

  function renderKpis(data) {
    const totals = data?.totals || {};
    const platformCount = state.platform === "*" ? state.platforms.length : 1;
    setStat("k-platforms", number(platformCount), state.platform === "*" ? "Discovered platforms" : "Selected platform");
    setStat("k-events", number(totals.events), "Selected time window");
    setStat("k-pageviews", number(totals.pageviews ?? totals.views ?? 0));
    setStat("k-visitors", number(totals.uniqueVisitors ?? 0));
    setStat("k-sessions", number(totals.sessions ?? 0));
    setStat("k-duration", duration(totals.avgDurationMs ?? 0));
    setStat("k-scroll", `${Math.round(safeNum(totals.avgScroll))}%`);

    const events = currentEvents();
    const latest = events[0];
    if (latest) {
      setStat("k-last", relativeTime(latest.receivedAt));
      $("k-last-sub").textContent = `${latest.platformName || latest.platformId || "Unknown"} · ${latest.eventType || "custom"}`;
      el.lastSync.title = formatDate(latest.receivedAt);
    } else {
      setStat("k-last", "—");
      $("k-last-sub").textContent = "No event loaded in this window";
    }
  }

  function renderTraffic(rows) {
    const svg = el.traffic;
    const data = normalizeArray(rows).map((row) => ({
      day: String(row.day || "").slice(0, 10),
      events: safeNum(row.events),
      pageviews: safeNum(row.pageviews ?? row.views),
      visitors: safeNum(row.uniqueVisitors)
    }));

    svg.innerHTML = "";
    el.chartTip.classList.remove("show");
    const width = 1000;
    const height = 340;
    const padding = { left: 62, right: 28, top: 28, bottom: 46 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;
    const max = Math.max(1, ...data.map((r) => r.events));
    const x = (index) => data.length <= 1 ? padding.left + innerW / 2 : padding.left + (index * innerW) / (data.length - 1);
    const y = (value) => padding.top + innerH - (value / max) * innerH;

    const ns = (tag, attrs = {}) => {
      const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      svg.appendChild(node);
      return node;
    };

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.innerHTML = `
      <linearGradient id="trafficArea" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#52e7ff" stop-opacity=".28"/>
        <stop offset="100%" stop-color="#52e7ff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="trafficLine" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stop-color="#52e7ff"/>
        <stop offset="50%" stop-color="#739cff"/>
        <stop offset="100%" stop-color="#bc7dff"/>
      </linearGradient>`;
    svg.appendChild(defs);

    for (let i = 0; i < 4; i++) {
      const yy = padding.top + (i * innerH) / 3;
      ns("line", { x1: padding.left, x2: width - padding.right, y1: yy, y2: yy, class: "chart-grid" });
      const label = ns("text", { x: padding.left - 12, y: yy + 4, class: "chart-axis-label", "text-anchor": "end" });
      label.textContent = compact(Math.round(max * (1 - i / 3)));
    }

    if (!data.length) {
      const text = ns("text", { x: width / 2, y: height / 2, class: "chart-empty", "text-anchor": "middle" });
      text.textContent = "No traffic data available for this window";
      el.trafficInfo.textContent = "0 events";
      el.trafficWindowLabel.textContent = state.days === "all" ? "All time" : `Last ${state.days} days`;
      return;
    }

    let linePath = "";
    data.forEach((row, index) => { linePath += `${index ? "L" : "M"} ${x(index)} ${y(row.events)} `; });
    const areaPath = `${linePath} L ${x(data.length - 1)} ${height - padding.bottom} L ${x(0)} ${height - padding.bottom} Z`;
    ns("path", { d: areaPath, class: "chart-area" });
    ns("path", { d: linePath, class: "chart-line" });

    data.forEach((row, index) => {
      const point = ns("circle", { cx: x(index), cy: y(row.events), r: data.length > 20 ? 3.5 : 5, class: "chart-dot" });
      point.addEventListener("mouseenter", (event) => showChartTip(event, row));
      point.addEventListener("mousemove", (event) => moveChartTip(event));
      point.addEventListener("mouseleave", hideChartTip);
      if (index % Math.max(1, Math.ceil(data.length / 8)) === 0 || index === data.length - 1) {
        const label = ns("text", { x: x(index), y: height - 16, class: "chart-axis-label", "text-anchor": "middle" });
        label.textContent = row.day.slice(5);
      }
    });

    const total = data.reduce((sum, row) => sum + row.events, 0);
    el.trafficInfo.textContent = `${number(total)} events`;
    el.trafficWindowLabel.textContent = state.days === "all" ? "All time" : `Last ${state.days} days`;
  }

  function showChartTip(event, row) {
    el.chartTip.innerHTML = `<strong>${esc(row.day)}</strong><span>⚡ ${number(row.events)} events</span><span>👁 ${number(row.pageviews)} pageviews</span><span>🧑 ${number(row.visitors)} visitors</span>`;
    el.chartTip.classList.add("show");
    moveChartTip(event);
  }

  function moveChartTip(event) {
    const shell = el.chartTip.parentElement.getBoundingClientRect();
    el.chartTip.style.left = `${Math.min(shell.width - 190, Math.max(10, event.clientX - shell.left + 12))}px`;
    el.chartTip.style.top = `${Math.max(10, event.clientY - shell.top - 18)}px`;
  }

  function hideChartTip() { el.chartTip.classList.remove("show"); }

  function renderPlatformBars(rows) {
    const list = normalizeArray(rows)
      .slice()
      .sort((a, b) => safeNum(b.totalEvents) - safeNum(a.totalEvents))
      .slice(0, 10);
    if (!list.length) return setEmpty(el.platformBars, "🌐", "No platform mix", "The current response does not contain platform aggregates.");

    const max = Math.max(1, ...list.map((r) => safeNum(r.totalEvents)));
    el.platformBars.innerHTML = list.map((row, index) => {
      const value = safeNum(row.totalEvents);
      const percent = Math.max(2, Math.round((value / max) * 100));
      const selected = String(row.platformId) === state.platform;
      return `<button class="mix-row ${selected ? "selected" : ""}" data-platform="${esc(row.platformId)}">
        <span class="mix-index">${index + 1}</span>
        <span class="mix-main"><strong>${esc(row.platformName || row.platformId || "Unknown")}</strong><small>${esc(row.platformType || "platform")} · ${esc(row.platformId || "")}</small><i><b style="width:${percent}%"></b></i></span>
        <span class="mix-value">${number(value)}</span>
      </button>`;
    }).join("");

    el.platformBars.querySelectorAll("[data-platform]").forEach((button) => button.addEventListener("click", () => selectPlatform(button.dataset.platform)));
  }

  function renderPlatformCards(rows) {
    const list = normalizeArray(rows).sort((a, b) => new Date(b.lastSeen || 0) - new Date(a.lastSeen || 0));
    $("platformCount").textContent = number(list.length);
    if (!list.length) return setEmpty(el.platformCards, "🧩", "No platforms found", "The Worker has not returned any registered platforms yet.");

    el.platformCards.innerHTML = list.slice(0, 24).map((platform) => {
      const active = String(platform.platformId) === state.platform;
      const events = safeNum(platform.totalEvents);
      const sessions = safeNum(platform.totalSessions);
      const visitors = safeNum(platform.totalVisitors);
      const last = platform.lastSeen ? relativeTime(platform.lastSeen) : "never";
      return `<button class="platform-card ${active ? "active" : ""}" data-platform="${esc(platform.platformId)}">
        <div class="platform-card-top"><span class="platform-icon">${platformIcon(platform.platformType)}</span><span class="status-dot ${last === "never" ? "idle" : "live"}"></span></div>
        <div class="platform-card-name">${esc(platform.platformName || platform.platformId || "Unnamed platform")}</div>
        <div class="platform-card-id">${esc(platform.platformId || "—")}</div>
        <div class="platform-tags"><span>${esc(platform.platformType || "custom")}</span><span>${esc(platform.environment || "production")}</span></div>
        <div class="platform-card-stats"><span><b>${compact(events)}</b><small>events</small></span><span><b>${compact(visitors)}</b><small>visitors</small></span><span><b>${compact(sessions)}</b><small>sessions</small></span></div>
        <div class="platform-card-foot"><span>Last seen ${esc(last)}</span><span>→</span></div>
      </button>`;
    }).join("");
    el.platformCards.querySelectorAll("[data-platform]").forEach((button) => button.addEventListener("click", () => selectPlatform(button.dataset.platform)));
  }

  function platformIcon(type) {
    const value = String(type || "").toLowerCase();
    if (value.includes("telegram")) return "✈️";
    if (value.includes("api")) return "🔌";
    if (value.includes("mobile")) return "📱";
    if (value.includes("python")) return "🐍";
    if (value.includes("web")) return "🌐";
    if (value.includes("service")) return "⚙️";
    return "🧩";
  }

  function renderRanks(container, rows, getLabel, getCount, emptyIcon = "📊", emptyTitle = "No data") {
    const list = normalizeArray(rows).filter(Boolean).slice(0, 10);
    if (!list.length) return setEmpty(container, emptyIcon, emptyTitle, "No records were returned for the selected window.");
    container.innerHTML = list.map((row, index) => {
      const label = getLabel(row) || "Unknown";
      const count = safeNum(getCount(row));
      return `<div class="rank-row"><span class="rank-no">${String(index + 1).padStart(2, "0")}</span><span class="rank-main"><strong title="${esc(label)}">${esc(label)}</strong><small>${number(count)} events</small></span><span class="rank-value">${number(count)}</span></div>`;
    }).join("");
  }

  function renderGeo(rows) {
    el.geoCount.textContent = number(normalizeArray(rows).length);
    renderRanks(el.countries, rows, (row) => row.label, (row) => row.count, "🌍", "No country data");
  }

  function renderClient() {
    const data = currentData() || {};
    const mapping = {
      browser: data.browsers,
      os: data.operatingSystems,
      device: data.devices
    };
    const rows = normalizeArray(mapping[state.clientKind]);
    const labelKey = state.clientKind === "browser" ? "browser" : state.clientKind === "os" ? "os" : "device";
    renderRanks(el.clientRank, rows, (row) => row[labelKey], (row) => row.count, "🖥️", "No client data");
  }

  function renderIps(rows) {
    const list = normalizeArray(rows).slice(0, 10);
    if (!list.length) return setEmpty(el.ips, "🌐", "No IP data", "No event IP records were returned.");
    el.ips.innerHTML = list.map((row, index) => {
      const location = [row.city, row.region, row.country].filter(Boolean).join(" · ") || "Unknown location";
      return `<div class="rank-row"><span class="rank-no">${String(index + 1).padStart(2, "0")}</span><span class="rank-main"><strong class="mono" title="${esc(row.ip || "—")}">${esc(row.ip || "—")}</strong><small>${esc(location)}</small></span><span class="rank-value">${number(row.count)}</span></div>`;
    }).join("");
  }

  function buildEventSearchText(event) {
    return [
      event.eventId, event.eventType, event.platformId, event.platformName, event.ip, event.country, event.region, event.city,
      event.browser, event.os, event.device, event.path, event.title, event.pageUrl, event.referrer, event.referrerHost,
      event.utmSource, event.utmMedium, event.utmCampaign, event.requestPath, event.responseStatus
    ].filter(Boolean).join(" ").toLowerCase();
  }

  function filteredEvents() {
    const events = state.events || [];
    const q = state.eventQuery.trim().toLowerCase();
    return events.filter((event) => {
      const typeOk = state.eventType === "*" || String(event.eventType || "custom") === state.eventType;
      const queryOk = !q || buildEventSearchText(event).includes(q);
      return typeOk && queryOk;
    });
  }

  function refreshEventTypeFilter() {
    const current = state.eventType;
    const types = [...new Set((state.events || []).map((event) => String(event.eventType || "custom")))].sort();
    el.eventTypeFilter.innerHTML = `<option value="*">All event types</option>${types.map((type) => `<option value="${esc(type)}">${esc(type)}</option>`).join("")}`;
    el.eventTypeFilter.value = types.includes(current) ? current : "*";
    state.eventType = el.eventTypeFilter.value;
  }

  function renderEvents() {
    const allFiltered = filteredEvents();
    const data = allFiltered.slice(0, state.visibleEvents);
    el.eventCount.textContent = number(allFiltered.length);
    $("loadMoreEvents").style.display = allFiltered.length > data.length ? "inline-flex" : "none";

    if (!data.length) {
      el.eventsBody.innerHTML = `<tr><td colspan="7"><div class="table-empty"><span>🔎</span><strong>No matching events</strong><small>Try clearing the event search or changing the event type.</small></div></td></tr>`;
      el.tableHint.textContent = `${number(allFiltered.length)} matching events`;
      return;
    }

    el.eventsBody.innerHTML = data.map((event, index) => {
      const id = esc(event.eventId || `event-${index}`);
      const location = [event.city, event.region, event.country].filter(Boolean).join(" · ") || "—";
      const client = [event.device, event.browser].filter(Boolean).join(" · ") || "—";
      const page = event.path || event.title || event.pageUrl || "—";
      const ip = C.showRawIp ? event.ip : "hidden";
      const status = safeNum(event.responseStatus);
      const statusClass = status >= 500 ? "danger" : status >= 400 ? "warn" : status >= 200 ? "ok" : "neutral";
      return `<tr data-event-id="${id}">
        <td><strong>${esc(relativeTime(event.receivedAt))}</strong><small>${esc(formatDate(event.receivedAt))}</small></td>
        <td><strong>${esc(event.platformName || event.platformId || "—")}</strong><small>${esc(event.platformId || "")}</small></td>
        <td><span class="event-pill">${esc(event.eventType || "custom")}</span></td>
        <td><span class="mono">${esc(ip || "—")}</span></td>
        <td><span class="truncate">${esc(location)}</span></td>
        <td><span class="truncate">${esc(client)}</span></td>
        <td><span class="truncate" title="${esc(page)}">${esc(page)}</span>${status ? `<small class="http-chip ${statusClass}">HTTP ${status}</small>` : ""}</td>
      </tr>`;
    }).join("");

    el.eventsBody.querySelectorAll("tr[data-event-id]").forEach((row) => row.addEventListener("click", () => {
      const event = state.events.find((item) => String(item.eventId) === String(row.dataset.eventId));
      openEvent(event);
    }));
    el.tableHint.textContent = `Showing ${number(data.length)} of ${number(allFiltered.length)} matching events`;
  }

  function deriveTopPagesFromEvents(events) {
    const map = new Map();
    for (const event of events) {
      if (String(event.eventType || "") !== "pageview") continue;
      const key = event.path || event.requestPath || "/";
      const title = event.title || key;
      const previous = map.get(key) || { path: key, title, views: 0 };
      previous.views += 1;
      map.set(key, previous);
    }
    return [...map.values()].sort((a, b) => b.views - a.views).slice(0, 10);
  }

  function renderTopPages(data) {
    let rows = normalizeArray(data);
    let source = "Live aggregate";
    if (!rows.length) {
      rows = deriveTopPagesFromEvents(state.events || []);
      source = state.platform === "*" ? "Derived from latest events" : "Derived from latest events";
    }
    el.topPagesSource.textContent = source;
    if (!rows.length) return setEmpty(el.topPages, "📄", "No page data", "No pageview records were returned for this window.");
    el.topPages.innerHTML = rows.slice(0, 10).map((row, index) => `<div class="rank-row"><span class="rank-no">${String(index + 1).padStart(2, "0")}</span><span class="rank-main"><strong title="${esc(row.title || row.path)}">${esc(row.title || row.path || "—")}</strong><small>${esc(row.path || "")}</small></span><span class="rank-value">${number(row.views)}</span></div>`).join("");
  }

  function renderEventTypes() {
    const map = new Map();
    for (const event of state.events || []) {
      const type = event.eventType || "custom";
      map.set(type, (map.get(type) || 0) + 1);
    }
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!rows.length) return setEmpty(el.eventTypes, "⚡", "No event types", "The current event list is empty.");
    el.eventTypes.innerHTML = rows.map(([type, count]) => `<div class="event-type-card"><div><span>${eventTypeIcon(type)}</span><strong>${esc(type)}</strong></div><b>${number(count)}</b><small>events</small></div>`).join("");
  }

  function eventTypeIcon(type) {
    const value = String(type || "").toLowerCase();
    if (value.includes("pageview")) return "👁";
    if (value.includes("heartbeat")) return "💓";
    if (value.includes("click")) return "🖱️";
    if (value.includes("error")) return "⚠️";
    if (value.includes("login")) return "🔐";
    if (value.includes("request")) return "🔌";
    return "⚡";
  }

  function renderSources() {
    const map = new Map();
    for (const event of state.events || []) {
      const data = event.data || parseJson(event.dataJson);
      const metadata = event.metadata || parseJson(event.metadataJson);
      const source = event.referrerHost || event.utmSource || data?.utm_source || data?.source || metadata?.utm_source || "Direct / unknown";
      map.set(String(source), (map.get(String(source)) || 0) + 1);
    }
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (!rows.length) return setEmpty(el.sources, "🧭", "No traffic source data", "Referrer and UTM fields are not present in the loaded event list.");
    el.sources.innerHTML = rows.map(([label, count], index) => `<div class="rank-row"><span class="rank-no">${String(index + 1).padStart(2, "0")}</span><span class="rank-main"><strong title="${esc(label)}">${esc(label)}</strong><small>Derived from referrer / UTM</small></span><span class="rank-value">${number(count)}</span></div>`).join("");
  }

  function renderStatuses() {
    const map = new Map();
    for (const event of state.events || []) {
      const status = event.responseStatus == null || event.responseStatus === "" ? "No status" : String(event.responseStatus);
      map.set(status, (map.get(status) || 0) + 1);
    }
    const rows = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!rows.length) return setEmpty(el.statuses, "🛡️", "No HTTP status data", "No loaded events expose a response status.");
    el.statuses.innerHTML = rows.map(([status, count]) => {
      const numeric = Number(status);
      const tone = !Number.isFinite(numeric) ? "neutral" : numeric >= 500 ? "danger" : numeric >= 400 ? "warn" : "ok";
      return `<div class="event-type-card status-card ${tone}"><div><span>${tone === "ok" ? "✓" : tone === "warn" ? "!" : tone === "danger" ? "×" : "•"}</span><strong>HTTP ${esc(status)}</strong></div><b>${number(count)}</b><small>events</small></div>`;
    }).join("");
  }

  function renderApiExamples() {
    const payload = {
      platformId: "my-platform",
      platformName: "My Platform",
      platformType: "web",
      eventType: "pageview",
      sessionId: "session-123",
      visitorId: "visitor-123",
      page: { url: "https://example.com/dashboard", path: "/dashboard", title: "Dashboard" },
      data: { source: "demo" }
    };
    $("curlCode").textContent = `curl -X POST "${W}/v1/events" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(payload)}'`;
    $("jsCode").textContent = `const response = await fetch("${W}/v1/events", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${JSON.stringify(payload, null, 2)})\n});\nconsole.log(await response.json());`;
    $("pyCode").textContent = `import requests\n\npayload = ${JSON.stringify(payload, null, 2)}\nresponse = requests.post("${W}/v1/events", json=payload, timeout=15)\nprint(response.status_code, response.json())`;
  }

  function renderAll() {
    const data = currentData();
    if (!data) return;
    renderKpis(data);
    renderTraffic(data.daily || []);
    renderPlatformBars(state.platform === "*" ? (data.platforms || state.platforms) : (state.platforms || []));
    renderGeo(data.countries || []);
    renderClient();
    renderIps(data.ips || []);
    state.events = normalizeArray(data.recentEvents).map(normalizeEvent).filter(Boolean);
    refreshEventTypeFilter();
    renderEvents();
    renderTopPages(data.topPages || []);
    renderEventTypes();
    renderSources();
    renderStatuses();
    renderApiExamples();
    populatePlatforms(el.search.value || "");
    updateSourceBadge();
  }

  function updateSourceBadge() {
    const stale = state.source === "stale";
    setLive(stale ? "warn" : "ok", stale ? "Stale snapshot" : "Live", stale ? "cached" : formatDate(state.refreshedAt || nowIso(), false));
    el.lastSync.textContent = stale
      ? `Showing the last healthy dashboard snapshot · ${formatDate(state.refreshedAt || nowIso())}`
      : `Synchronized ${formatDate(state.refreshedAt || nowIso())}`;
    el.lastSync.classList.toggle("stale-text", stale);
  }

  async function fetchDashboardSnapshot() {
    if (state.platform === "*") {
      const results = await Promise.allSettled([
        api(requestPath("/v1/overview")),
        api("/v1/platforms"),
        api(requestPath("/v1/events") + `&limit=${Math.min(100, Number(C.recentLimit || 100))}`)
      ]);
      const overviewResult = results[0];
      const platformsResult = results[1];
      const eventsResult = results[2];

      if (overviewResult.status !== "fulfilled") throw overviewResult.reason;
      state.overview = normalizeOverview(overviewResult.value);
      saveCache(cacheKey(), state.overview);
      if (platformsResult.status === "fulfilled") state.platforms = normalizeArray(platformsResult.value?.platforms);
      if (eventsResult.status === "fulfilled") state.overview.recentEvents = normalizeArray(eventsResult.value?.events).map(normalizeEvent).filter(Boolean);
      state.platformStats = null;
      return;
    }

    const [statsResult, eventsResult] = await Promise.allSettled([
      api(requestPath(`/v1/platforms/${encodeURIComponent(state.platform)}`)),
      api(`${requestPath(`/v1/platforms/${encodeURIComponent(state.platform)}/events`)}&limit=${Math.min(100, Number(C.recentLimit || 100))}`)
    ]);
    if (statsResult.status !== "fulfilled") throw statsResult.reason;
    state.platformStats = normalizeOverview(statsResult.value);
    saveCache(cacheKey(), state.platformStats);
    if (eventsResult.status === "fulfilled") state.platformStats.recentEvents = normalizeArray(eventsResult.value?.events).map(normalizeEvent).filter(Boolean);
  }

  async function refresh({ silent = false, healthOnly = false } = {}) {
    if (state.loading && !healthOnly) return;
    if (!healthOnly) state.loading = true;
    if (!silent) setLive("warn", "Syncing", "network");
    try {
      const healthPromise = api("/v1/health");
      if (healthOnly) {
        state.health = await healthPromise;
        renderHealth();
        return;
      }

      const dashboardPromise = fetchDashboardSnapshot();
      const [healthResult, dashboardResult] = await Promise.allSettled([healthPromise, dashboardPromise]);
      if (healthResult.status === "fulfilled") {
        state.health = healthResult.value;
        renderHealth();
      } else {
        renderHealthError(healthResult.reason);
      }

      if (dashboardResult.status !== "fulfilled") {
        const cached = readCache(cacheKey());
        if (!cached) throw dashboardResult.reason;
        if (state.platform === "*") state.overview = normalizeOverview(cached);
        else state.platformStats = normalizeOverview(cached);
        state.source = "stale";
        toast("Live data could not be refreshed. The last healthy snapshot is still displayed.", true);
      } else {
        state.source = "live";
      }

      state.refreshedAt = new Date().toISOString();
      renderAll();
      if (state.source === "live") setLive("ok", "Live", formatDate(state.refreshedAt, false));
    } catch (error) {
      const cached = readCache(cacheKey());
      if (cached) {
        if (state.platform === "*") state.overview = normalizeOverview(cached);
        else state.platformStats = normalizeOverview(cached);
        state.source = "stale";
        state.refreshedAt = new Date().toISOString();
        renderAll();
        setLive("warn", "Stale snapshot", "cached");
        toast(`Refresh failed: ${error?.message || "Unknown error"}. Showing cached data.`, true);
      } else {
        setLive("error", "Offline", "no cache");
        toast(`Dashboard refresh failed: ${error?.message || "Unknown error"}`, true);
        renderEmptyDashboard();
      }
    } finally {
      if (!healthOnly) {
        state.loading = false;
        document.body.classList.remove("is-loading");
      }
    }
  }

  function renderEmptyDashboard() {
    setStat("k-platforms", "—", "Unavailable");
    setStat("k-events", "—", "Unavailable");
    setStat("k-pageviews", "—");
    setStat("k-visitors", "—");
    setStat("k-sessions", "—");
    setStat("k-duration", "—");
    setStat("k-scroll", "—");
    setStat("k-last", "—");
    for (const container of [el.countries, el.clientRank, el.ips, el.platformBars, el.platformCards, el.topPages, el.eventTypes, el.sources, el.statuses]) {
      setEmpty(container, "⌁", "Data unavailable", "Reconnect to the Worker or wait for the next automatic refresh.");
    }
    renderEvents();
  }

  async function selectPlatform(platformId) {
    const id = String(platformId || "*");
    if (state.platform === id && (id === "*" || state.platformStats)) return;
    state.platform = id;
    el.platform.value = id;
    state.visibleEvents = 50;
    state.eventQuery = "";
    state.eventType = "*";
    el.eventSearch.value = "";
    setLive("warn", "Loading", id === "*" ? "overview" : "platform");
    state.loading = true;
    document.body.classList.add("is-loading");
    try {
      await fetchDashboardSnapshot();
      state.source = "live";
      state.refreshedAt = new Date().toISOString();
      renderAll();
    } catch (error) {
      const cached = readCache(cacheKey());
      if (cached) {
        if (state.platform === "*") state.overview = normalizeOverview(cached);
        else state.platformStats = normalizeOverview(cached);
        state.source = "stale";
        state.refreshedAt = new Date().toISOString();
        renderAll();
        toast(`Could not load ${id}; showing its last saved snapshot.`, true);
      } else {
        toast(`Platform load failed: ${error?.message || "Unknown error"}`, true);
        renderEmptyDashboard();
      }
    } finally {
      state.loading = false;
      document.body.classList.remove("is-loading");
    }
  }

  function openEvent(event) {
    if (!event) return;
    const details = [
      ["Event ID", event.eventId], ["Event type", event.eventType], ["Platform", event.platformName || event.platformId],
      ["Received", formatDate(event.receivedAt)], ["Occurred", formatDate(event.occurredAt)], ["IP", C.showRawIp ? event.ip : "hidden"],
      ["IP hash", event.ipHash], ["Platform IP", C.showPlatformIp ? event.platformIp : "hidden"], ["Country", event.country], ["Region", event.region],
      ["City", event.city], ["ASN", event.asn], ["Organization", event.asOrganization], ["Browser", [event.browser, event.browserVersion].filter(Boolean).join(" ")],
      ["OS", [event.os, event.osVersion].filter(Boolean).join(" ")], ["Device", [event.device, event.deviceModel].filter(Boolean).join(" ")],
      ["Page", event.pageUrl || event.path], ["Referrer", event.referrer], ["Duration", duration(event.durationMs)], ["Scroll", `${safeNum(event.maxScroll)}%`],
      ["Clicks", event.clicks], ["Outbound clicks", event.outboundClicks], ["Request ID", event.requestId], ["CF-Ray", event.cfRay], ["HTTP status", event.responseStatus],
      ["User agent", event.userAgent], ["IP source", event.ipSource]
    ];
    el.drawerTitle.textContent = event.eventId || "Event";
    el.drawerSubtitle.textContent = `${event.eventType || "custom"} · ${event.platformName || event.platformId || "Unknown platform"}`;
    el.drawerBody.innerHTML = `
      <div class="drawer-section"><div class="section-title">Core metadata</div><div class="detail-grid">${details.map(([key, value]) => `<div class="detail-item"><span>${esc(key)}</span><b>${esc(value ?? "—")}</b></div>`).join("")}</div></div>
      ${jsonBox("data", event.data ?? parseJson(event.dataJson))}
      ${jsonBox("metadata", event.metadata ?? parseJson(event.metadataJson))}
      ${jsonBox("cloudflare", parseJson(event.cfJson))}
      ${jsonBox("request", parseJson(event.requestJson))}
      ${jsonBox("raw event", parseJson(event.rawEventJson))}`;
    el.drawer.dataset.eventId = event.eventId || "";
    el.drawer.classList.add("open");
    el.backdrop.classList.add("open");
    el.drawer.setAttribute("aria-hidden", "false");
  }

  function jsonBox(label, value) {
    let textValue;
    try { textValue = JSON.stringify(value ?? {}, null, 2); } catch { textValue = String(value ?? ""); }
    const limit = Number(C.maxJsonPreviewChars || 16000);
    if (textValue.length > limit) textValue = `${textValue.slice(0, limit)}\n… truncated …`;
    return `<div class="json-box"><div class="json-head"><span>${esc(label)}</span><button data-copy-json="${esc(textValue)}">Copy</button></div><pre>${esc(textValue)}</pre></div>`;
  }

  function closeDrawer() {
    el.drawer.classList.remove("open");
    el.backdrop.classList.remove("open");
    el.drawer.setAttribute("aria-hidden", "true");
  }

  function openAdmin(eventId) {
    closeDrawer();
    el.admin.dataset.eventId = eventId || "";
    el.adminResult.innerHTML = "";
    el.admin.classList.add("open");
    el.admin.setAttribute("aria-hidden", "false");
    el.adminInput.focus();
  }

  function closeAdmin() {
    el.admin.classList.remove("open");
    el.admin.setAttribute("aria-hidden", "true");
  }

  async function loadAdmin() {
    const key = el.adminInput.value.trim();
    const eventId = el.admin.dataset.eventId;
    if (!key || !eventId) return toast("Both Admin Key and Event ID are required.", true);
    el.adminResult.innerHTML = `<div class="loading-box">Loading protected event detail…</div>`;
    try {
      const body = await api(`/v1/admin/event?id=${encodeURIComponent(eventId)}`, { headers: { "X-Admin-Key": key } });
      el.adminResult.innerHTML = `<pre>${esc(JSON.stringify(body, null, 2))}</pre>`;
    } catch (error) {
      el.adminResult.innerHTML = `<div class="error-box">${esc(error?.message || "Admin request failed.")}</div>`;
    }
  }

  function exportCsv() {
    const rows = filteredEvents();
    if (!rows.length) return toast("There are no matching events to export.", true);
    const columns = [
      "receivedAt","eventId","platformId","platformName","eventType","ip","platformIp","country","region","city",
      "browser","os","device","path","pageUrl","referrer","responseStatus","durationMs","maxScroll","clicks","outboundClicks"
    ];
    const csv = [columns.join(","), ...rows.map((row) => columns.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `uei-events-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
    toast(`Exported ${number(rows.length)} events.`);
  }

  function bind() {
    $("refreshBtn").addEventListener("click", () => refresh());
    $("healthBtn").addEventListener("click", () => refresh({ healthOnly: true }));
    $("themeBtn").addEventListener("click", () => {
      state.theme = state.theme === "midnight" ? "bluehour" : "midnight";
      applyTheme();
    });
    el.platform.addEventListener("change", (event) => selectPlatform(event.target.value));
    el.search.addEventListener("input", () => populatePlatforms(el.search.value));
    document.querySelectorAll("#rangeSeg button").forEach((button) => button.addEventListener("click", async () => {
      document.querySelectorAll("#rangeSeg button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.days = button.dataset.days || "7";
      await refresh();
    }));
    document.querySelectorAll("#clientTabs button").forEach((button) => button.addEventListener("click", () => {
      document.querySelectorAll("#clientTabs button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.clientKind = button.dataset.kind || "browser";
      renderClient();
    }));
    el.eventSearch.addEventListener("input", () => { state.eventQuery = el.eventSearch.value; state.visibleEvents = 50; renderEvents(); });
    el.eventTypeFilter.addEventListener("change", () => { state.eventType = el.eventTypeFilter.value; state.visibleEvents = 50; renderEvents(); });
    $("loadMoreEvents").addEventListener("click", () => { state.visibleEvents += 50; renderEvents(); });
    $("resetEventFilters").addEventListener("click", () => { state.eventQuery = ""; state.eventType = "*"; state.visibleEvents = 50; el.eventSearch.value = ""; refreshEventTypeFilter(); renderEvents(); });
    $("exportBtn").addEventListener("click", exportCsv);
    $("clearCacheBtn").addEventListener("click", () => {
      state.cache = Object.create(null);
      try {
        for (let index = localStorage.length - 1; index >= 0; index--) {
          const key = localStorage.key(index);
          if (key?.startsWith("uei-dashboard:")) localStorage.removeItem(key);
        }
      } catch {}
      toast("Local dashboard cache cleared.");
      refresh();
    });
    el.backdrop.addEventListener("click", closeDrawer);
    $("closeDrawer").addEventListener("click", closeDrawer);
    $("closeAdmin").addEventListener("click", closeAdmin);
    $("cancelAdminBtn").addEventListener("click", closeAdmin);
    $("loadAdminBtn").addEventListener("click", loadAdmin);
    $("openAdminFromDrawer").addEventListener("click", () => openAdmin(el.drawer.dataset.eventId));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { closeDrawer(); closeAdmin(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r") { event.preventDefault(); refresh(); }
    });
    document.addEventListener("click", (event) => {
      const copyButton = event.target.closest("[data-copy-code]");
      if (copyButton) return copyText($(copyButton.dataset.copyCode)?.textContent || "");
      const quickCopy = event.target.closest("[data-copy]");
      if (quickCopy) return copyText(String(quickCopy.dataset.copy).replace("${WORKER}", W));
      const openButton = event.target.closest("[data-open]");
      if (openButton) window.open(`${W}${openButton.dataset.open}`, "_blank", "noopener,noreferrer");
      const jsonCopy = event.target.closest("[data-copy-json]");
      if (jsonCopy) copyText(jsonCopy.dataset.copyJson || "");
    });
  }

  async function init() {
    applyTheme();
    bind();
    document.querySelectorAll("#rangeSeg button").forEach((button) => button.classList.toggle("active", String(button.dataset.days) === state.days));
    renderApiExamples();
    setTimeout(() => el.boot.classList.add("hidden"), 550);
    document.body.classList.add("is-loading");
    await refresh();
    setInterval(() => { if (!document.hidden) refresh({ silent: true }); }, Number(C.autoRefreshMs || 45000));
    setInterval(() => { if (!document.hidden) refresh({ healthOnly: true, silent: true }); }, Number(C.healthRefreshMs || 120000));
    setInterval(() => {
      if (!document.hidden && state.events?.length) renderEvents();
    }, 30000);
  }

  window.addEventListener("online", () => refresh({ silent: true }));
  window.addEventListener("offline", () => setLive("warn", "Browser offline", "network"));
  init().catch((error) => {
    setLive("error", "Startup error", "failed");
    toast(`Startup failed: ${error?.message || "Unknown error"}`, true);
    renderEmptyDashboard();
    el.boot.classList.add("hidden");
  });
})();
