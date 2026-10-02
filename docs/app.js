(function () {
  "use strict";

  const C = window.PAGE_INSIGHTS_CONFIG || {};
  const W = String(C.workerUrl || "").replace(/\/+$/, "");
  const VERSION = String(C.appVersion || "12.2.0");
  const $ = (id) => document.getElementById(id);

  const state = {
    days: String(C.defaultRangeDays || 7),
    platform: "*",
    overview: null,
    platforms: [],
    loading: false,
    stale: false,
    clientKind: "browser",
    codeKind: "curl",
    theme: localStorage.getItem("uei-pages-theme") || "dark",
    cacheKey: "uei_dashboard_cache_v122"
  };

  const el = {
    connection: $("connectionPill"),
    refresh: $("refreshBtn"),
    theme: $("themeBtn"),
    platform: $("platformSelect"),
    search: $("platformSearch"),
    healthBtn: $("healthBtn"),
    connectBtn: $("connectBtn"),
    workerVersion: $("workerVersion"),
    lastSync: $("lastSync"),
    metrics: $("metrics"),
    healthTitle: $("healthTitle"),
    overallBadge: $("overallBadge"),
    healthMeta: $("healthMeta"),
    healthWorker: $("healthWorker"),
    healthWorkerText: $("healthWorkerText"),
    healthData: $("healthData"),
    healthDataText: $("healthDataText"),
    healthArchive: $("healthArchive"),
    healthArchiveText: $("healthArchiveText"),
    healthTelegram: $("healthTelegram"),
    healthTelegramText: $("healthTelegramText"),
    rangeSeg: $("rangeSeg"),
    trafficChart: $("trafficChart"),
    trafficSummary: $("trafficSummary"),
    platformBars: $("platformBars"),
    platformCount: $("platformCount"),
    clientTabs: $("clientTabs"),
    clientRank: $("clientRank"),
    countries: $("countries"),
    ips: $("ips"),
    eventCount: $("eventCount"),
    eventsBody: $("eventsBody"),
    topPages: $("topPages"),
    eventTypes: $("eventTypes"),
    sources: $("sources"),
    statuses: $("statuses"),
    drawer: $("eventDrawer"),
    backdrop: $("drawerBackdrop"),
    drawerTitle: $("drawerTitle"),
    drawerBody: $("drawerBody"),
    toasts: $("toasts"),
    codeTabs: document.querySelectorAll(".code-tabs button"),
    codeBlock: $("codeBlock"),
    copyCodeBtn: $("copyCodeBtn"),
    exportBtn: $("exportBtn")
  };

  const required = Object.entries(el).filter(([key, value]) => value == null && !["codeTabs"].includes(key));
  if (required.length) {
    console.error("GitHub Page Insights: missing required DOM nodes", required.map(([key]) => key));
    return;
  }

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const n = (v) => new Intl.NumberFormat("en-US").format(Number(v) || 0);
  const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, num(v)));
  const formatDuration = (ms) => {
    const s = Math.max(0, Math.round(num(ms) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };
  const formatDate = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, {
      month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  };
  const timeAgo = (v) => {
    const d = new Date(v).getTime();
    if (!Number.isFinite(d)) return "—";
    const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };
  const apiPath = (base) => `${base}${base.includes("?") ? "&" : "?"}days=${encodeURIComponent(state.days)}`;

  function toast(message, error = false) {
    const item = document.createElement("div");
    item.className = `toast ${error ? "error" : ""}`;
    item.textContent = message;
    el.toasts.appendChild(item);
    setTimeout(() => item.remove(), 4200);
  }

  function setStatus(kind, label) {
    el.connection.className = `status-pill ${kind}`;
    const target = el.connection.querySelector("span");
    if (target) target.textContent = label;
  }

  async function request(path, options = {}) {
    if (!W) throw new Error("Worker URL is not configured.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(C.requestTimeoutMs || 12000));
    try {
      const response = await fetch(W + path, {
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
        ...options
      });
      let body = null;
      try { body = await response.json(); } catch (_) {}
      if (!response.ok) {
        const reason = body?.error || body?.message || `HTTP ${response.status}`;
        const error = new Error(reason);
        error.status = response.status;
        error.body = body;
        throw error;
      }
      return body;
    } finally {
      clearTimeout(timer);
    }
  }

  function saveCache(data) {
    try {
      localStorage.setItem(state.cacheKey, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (_) {}
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(state.cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.data || null;
    } catch (_) {
      return null;
    }
  }

  function applyTheme() {
    document.documentElement.dataset.theme = state.theme;
    try { localStorage.setItem("uei-pages-theme", state.theme); } catch (_) {}
  }

  function normalizeOverview(data) {
    const source = data && typeof data === "object" ? data : {};
    source.totals = source.totals || {};
    source.daily = Array.isArray(source.daily) ? source.daily : [];
    source.countries = Array.isArray(source.countries) ? source.countries : [];
    source.browsers = Array.isArray(source.browsers) ? source.browsers : [];
    source.operatingSystems = Array.isArray(source.operatingSystems) ? source.operatingSystems : [];
    source.devices = Array.isArray(source.devices) ? source.devices : [];
    source.ips = Array.isArray(source.ips) ? source.ips : [];
    source.platforms = Array.isArray(source.platforms) ? source.platforms : [];
    source.recentEvents = Array.isArray(source.recentEvents) ? source.recentEvents : [];
    return source;
  }

  function setMetric(icon, label, value, note, tone = "blue") {
    return `<article class="metric-card ${tone}"><div class="metric-top"><span class="metric-icon">${icon}</span><span class="metric-label">${esc(label)}</span></div><strong class="metric-value">${esc(value)}</strong><span class="metric-note">${esc(note || "")}</span></article>`;
  }

  function renderMetrics(data) {
    const t = data.totals || {};
    const last = data.recentEvents?.[0];
    el.metrics.innerHTML = [
      setMetric("👁️", "Pageviews", n(t.pageviews ?? t.views), `${state.days === "all" ? "All available time" : `Last ${state.days} day${state.days === "1" ? "" : "s"}`}`, "blue"),
      setMetric("👤", "Unique visitors", n(t.uniqueVisitors), "Distinct visitor IDs", "violet"),
      setMetric("🧭", "Sessions", n(t.sessions), "Distinct sessions", "pink"),
      setMetric("📦", "Total events", n(t.events), "All event types", "cyan"),
      setMetric("⏱️", "Avg duration", formatDuration(t.avgDurationMs), "Collected duration", "green"),
      setMetric("📜", "Avg scroll", `${Math.round(num(t.avgScroll))}%`, "From recorded events", "amber"),
      setMetric("🧩", "Platforms", n(state.platform === "*" ? data.platforms.length : 1), state.platform === "*" ? "Discovered from D1" : state.platform, "indigo"),
      setMetric("🕒", "Last activity", last ? timeAgo(last.receivedAt) : "—", last ? `${last.platformName || last.platformId} · ${last.eventType || "event"}` : "No event yet", "slate")
    ].join("");
  }

  function populatePlatforms(filter = "") {
    const q = filter.trim().toLowerCase();
    const rows = state.platforms.filter((p) => {
      const id = String(p.platformId || "").toLowerCase();
      const name = String(p.platformName || "").toLowerCase();
      return !q || id.includes(q) || name.includes(q);
    });
    el.platform.innerHTML = `<option value="*">All platforms · ${state.platforms.length}</option>`;
    for (const p of rows) {
      const option = document.createElement("option");
      option.value = p.platformId;
      option.textContent = `${p.platformName || p.platformId} · ${p.platformId}`;
      el.platform.appendChild(option);
    }
    el.platform.value = state.platforms.some((p) => p.platformId === state.platform) ? state.platform : "*";
  }

  function currentRows(data, key) {
    return Array.isArray(data?.[key]) ? data[key] : [];
  }

  function renderTraffic(rows) {
    const data = Array.isArray(rows) ? rows : [];
    if (!data.length) {
      el.trafficChart.innerHTML = `<div class="empty-state"><span>📈</span><strong>No traffic points for this range</strong><small>There may be no pageviews in the selected period yet.</small></div>`;
      el.trafficSummary.textContent = "0 events";
      return;
    }
    const width = 960, height = 300, left = 48, right = 18, top = 22, bottom = 46;
    const max = Math.max(1, ...data.map((r) => num(r.events ?? r.pageviews ?? r.views)));
    const x = (i) => data.length === 1 ? width / 2 : left + i * (width - left - right) / (data.length - 1);
    const y = (v) => height - bottom - num(v) / max * (height - top - bottom);
    const points = data.map((r, i) => `${x(i)},${y(r.events ?? r.pageviews ?? r.views)}`).join(" ");
    const area = `${points} ${x(data.length - 1)},${height - bottom} ${x(0)},${height - bottom}`;
    const grid = [0, 1, 2, 3].map((i) => {
      const yy = top + i * (height - top - bottom) / 3;
      const value = Math.round(max * (1 - i / 3));
      return `<line x1="${left}" x2="${width - right}" y1="${yy}" y2="${yy}"/><text x="${left - 10}" y="${yy + 4}" text-anchor="end">${n(value)}</text>`;
    }).join("");
    const labels = data.map((r, i) => {
      if (!(i % Math.max(1, Math.ceil(data.length / 8)) === 0 || i === data.length - 1)) return "";
      const raw = String(r.day || "");
      return `<text class="chart-x" x="${x(i)}" y="${height - 12}" text-anchor="middle">${esc(raw.slice(5) || raw.slice(0, 10))}</text>`;
    }).join("");
    const dots = data.map((r, i) => `<circle class="chart-dot" cx="${x(i)}" cy="${y(r.events ?? r.pageviews ?? r.views)}" r="4"><title>${esc(r.day || "")} · ${n(r.events ?? r.pageviews ?? r.views)} events</title></circle>`).join("");
    el.trafficChart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Traffic chart"><g class="chart-grid">${grid}</g><polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${points}"/>${dots}${labels}</svg>`;
    const total = data.reduce((sum, r) => sum + num(r.events ?? r.pageviews ?? r.views), 0);
    el.trafficSummary.textContent = `${n(total)} events`;
  }

  function renderPlatformBars(rows) {
    const list = (rows || []).slice().sort((a, b) => num(b.totalEvents) - num(a.totalEvents)).slice(0, 10);
    el.platformCount.textContent = n((rows || []).length);
    if (!list.length) {
      el.platformBars.innerHTML = `<div class="empty-state compact"><span>🧩</span><strong>No platforms yet</strong><small>Send the first event with a stable platformId.</small></div>`;
      return;
    }
    const max = Math.max(1, ...list.map((r) => num(r.totalEvents)));
    el.platformBars.innerHTML = list.map((r) => `<div class="bar-row"><div class="bar-head"><strong>${esc(r.platformName || r.platformId)}</strong><span>${n(r.totalEvents)} events</span></div><div class="bar-track"><span style="width:${Math.max(3, Math.round(num(r.totalEvents) / max * 100))}%"></span></div><div class="bar-meta"><span>${esc(r.platformId || "")}</span><span>${n(r.totalPageviews)} views</span></div></div>`).join("");
  }

  function rankRows(rows, labelFn, countFn, extraFn) {
    if (!rows.length) return `<div class="empty-state compact"><span>📭</span><strong>No data</strong><small>No records were returned for this range.</small></div>`;
    return rows.slice(0, 10).map((r, i) => `<div class="rank-row"><span class="rank-no">${i + 1}</span><div class="rank-main"><strong>${esc(labelFn(r))}</strong>${extraFn ? `<small>${esc(extraFn(r))}</small>` : ""}</div><strong class="rank-value">${n(countFn(r))}</strong></div>`).join("");
  }

  function renderClient() {
    const map = {
      browser: ["browsers", (r) => r.browser || "Unknown"],
      os: ["operatingSystems", (r) => r.os || "Unknown"],
      device: ["devices", (r) => r.device || "Unknown"]
    };
    const [key, labelFn] = map[state.clientKind];
    const rows = currentRows(state.overview, key);
    el.clientRank.innerHTML = rankRows(rows, labelFn, (r) => r.count);
  }

  function renderCountries(rows) {
    el.countries.innerHTML = rankRows(rows, (r) => r.label || "Unknown", (r) => r.count, (r) => r.label === "Unknown" ? "IP geolocation unavailable" : "IP geolocation");
  }

  function renderIps(rows) {
    el.ips.innerHTML = rankRows(rows, (r) => r.ip || "Unknown", (r) => r.count, (r) => [r.city, r.country, r.browser, r.os].filter(Boolean).join(" · ") || "No enrichment data");
  }

  function renderEvents(rows) {
    const data = (rows || []).slice(0, Number(C.recentLimit || 50));
    el.eventCount.textContent = n(data.length);
    if (!data.length) {
      el.eventsBody.innerHTML = `<tr><td colspan="7"><div class="table-empty">📭 No events returned for the selected range.</div></td></tr>`;
      return;
    }
    el.eventsBody.innerHTML = data.map((r, i) => `<tr data-index="${i}" tabindex="0" title="Open event details"><td><strong>${esc(timeAgo(r.receivedAt))}</strong><small>${esc(formatDate(r.receivedAt))}</small></td><td><span class="event-pill">${esc(r.eventType || "custom")}</span><small>${esc(r.platformName || r.platformId || "—")}</small></td><td><code>${C.showRawIp ? esc(r.ip || "—") : "hidden"}</code></td><td>${esc([r.city, r.region, r.country].filter(Boolean).join(" · ") || "—")}</td><td>${esc([r.device, r.deviceModel].filter(Boolean).join(" · ") || "—")}</td><td>${esc([r.browser, r.os].filter(Boolean).join(" · ") || "—")}</td><td class="page-cell"><strong>${esc(r.title || r.path || "—")}</strong><small>${esc(r.path || r.pageUrl || "")}</small></td></tr>`).join("");
    el.eventsBody.querySelectorAll("tr[data-index]").forEach((row) => {
      const open = () => openEvent(data[Number(row.dataset.index)]);
      row.addEventListener("click", open);
      row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  function renderTopPages(rows) {
    const list = (rows || []).slice(0, 10);
    el.topPages.innerHTML = rankRows(list, (r) => r.title || r.path || "Unknown", (r) => r.views, (r) => r.path || "");
  }

  function renderEventTypes(events) {
    const map = new Map();
    for (const e of events || []) {
      const key = e.eventType || "custom";
      map.set(key, (map.get(key) || 0) + 1);
    }
    const list = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    el.eventTypes.innerHTML = list.length ? list.map(([type, count]) => `<div class="event-type-card"><span>${esc(type)}</span><strong>${n(count)}</strong></div>`).join("") : `<div class="empty-state compact"><span>🧾</span><strong>No event types</strong><small>Recent events are empty.</small></div>`;
  }

  function renderSources(events) {
    const map = new Map();
    for (const e of events || []) {
      const key = e.referrerHost || e.utmSource || "direct";
      map.set(key, (map.get(key) || 0) + 1);
    }
    const list = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, count]) => ({ label, count }));
    el.sources.innerHTML = rankRows(list, (r) => r.label, (r) => r.count);
  }

  function renderStatuses(events) {
    const map = new Map();
    for (const e of events || []) {
      const key = e.responseStatus ? String(e.responseStatus) : "N/A";
      map.set(key, (map.get(key) || 0) + 1);
    }
    const list = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    el.statuses.innerHTML = list.length ? list.map(([status, count]) => `<div class="event-type-card"><span>HTTP ${esc(status)}</span><strong>${n(count)}</strong></div>`).join("") : `<div class="empty-state compact"><span>🟢</span><strong>No status data</strong><small>HTTP status was not included in recent events.</small></div>`;
  }

  function renderAll() {
    if (!state.overview) return;
    const data = normalizeOverview(state.overview);
    renderMetrics(data);
    renderTraffic(data.daily);
    renderPlatformBars(data.platforms);
    renderClient();
    renderCountries(data.countries);
    renderIps(data.ips);
    renderEvents(data.recentEvents);
    renderTopPages(data.topPages);
    renderEventTypes(data.recentEvents);
    renderSources(data.recentEvents);
    renderStatuses(data.recentEvents);
  }

  function setHealthCard(node, textNode, status, text) {
    node.className = `health-card ${status || "pending"}`;
    textNode.textContent = text || "Not checked";
  }

  function applyBasicHealth(message, good = true) {
    el.healthTitle.textContent = good ? "Dashboard data is available" : "Worker could not be reached";
    el.healthMeta.textContent = message;
    el.overallBadge.className = `badge ${good ? "badge-success" : "badge-danger"}`;
    el.overallBadge.textContent = good ? "ONLINE" : "OFFLINE";
    setHealthCard(el.healthWorker, el.healthWorkerText, good ? "ok" : "error", good ? `API reachable · v${VERSION}` : "Worker request failed");
    setHealthCard(el.healthData, el.healthDataText, state.overview ? "ok" : "pending", state.overview ? `${n(state.overview.totals?.events)} events loaded` : "No dashboard data");
    setHealthCard(el.healthArchive, el.healthArchiveText, "pending", "Run Health Check");
    setHealthCard(el.healthTelegram, el.healthTelegramText, "pending", "Run Health Check");
  }

  function renderFullHealth(h) {
    const checks = h?.checks || {};
    const overall = String(h?.overall || "unknown");
    el.healthTitle.textContent = overall === "healthy" ? "All monitored services are healthy" : overall === "degraded" ? "Service is online with warnings" : "One or more checks failed";
    el.healthMeta.textContent = `${h?.generatedAt ? formatDate(h.generatedAt) : "—"} · ${checks.database?.counts?.events ?? 0} events · ${checks.database?.counts?.platforms ?? 0} platforms`;
    el.overallBadge.className = `badge ${overall === "healthy" ? "badge-success" : overall === "degraded" ? "badge-warning" : "badge-danger"}`;
    el.overallBadge.textContent = overall.toUpperCase();
    const w = checks.worker;
    const d = checks.database;
    const g = checks.github;
    const t = checks.configuration;
    setHealthCard(el.healthWorker, el.healthWorkerText, w?.status === "ok" ? "ok" : "error", w?.version ? `Worker v${w.version}` : w?.status || "Unknown");
    setHealthCard(el.healthData, el.healthDataText, d?.status === "ok" ? "ok" : d?.status === "warning" ? "warning" : "error", d?.counts ? `${n(d.counts.events)} events · ${n(d.counts.visitors)} visitors` : d?.status || "Unknown");
    setHealthCard(el.healthArchive, el.healthArchiveText, g?.status === "ok" ? "ok" : g?.status === "warning" ? "warning" : "error", g?.message || g?.status || "Unknown");
    setHealthCard(el.healthTelegram, el.healthTelegramText, t?.telegramConfigured ? "ok" : "warning", t?.telegramConfigured ? "Configured" : "Not configured");
    el.workerVersion.textContent = w?.version ? `v${w.version}` : "—";
  }

  async function checkHealth() {
    setStatus("pending", "Checking health…");
    try {
      const health = await request("/v1/health?probe=github");
      renderFullHealth(health);
      setStatus(health.ok ? "ok" : "error", health.ok ? "Online" : "Issues detected");
    } catch (error) {
      applyBasicHealth(`Health request failed: ${error.message}`, false);
      setStatus("error", "Offline");
      toast(`Health check failed: ${error.message}`, true);
    }
  }

  async function refresh() {
    if (state.loading) return;
    state.loading = true;
    setStatus("pending", "Loading…");
    try {
      let data;
      if (state.platform === "*") {
        data = await request(apiPath("/v1/overview"));
      } else {
        data = await request(apiPath(`/v1/platforms/${encodeURIComponent(state.platform)}`));
      }
      state.overview = normalizeOverview(data);
      if (state.platform === "*") state.platforms = state.overview.platforms;
      saveCache(state.overview);
      state.stale = false;
      renderAll();
      applyBasicHealth(`Loaded ${n(state.overview.totals?.events)} events from the Worker.`, true);
      el.lastSync.textContent = new Date().toLocaleTimeString();
      el.workerVersion.textContent = `Pages ${VERSION}`;
      setStatus("ok", "Live");
      if (state.platform === "*") populatePlatforms(el.search.value);
    } catch (error) {
      const cached = loadCache();
      if (cached) {
        state.overview = normalizeOverview(cached);
        state.platforms = state.overview.platforms;
        state.stale = true;
        renderAll();
        populatePlatforms(el.search.value);
        applyBasicHealth(`Worker unavailable. Showing the last successful snapshot from ${formatDate(new Date(JSON.parse(localStorage.getItem(state.cacheKey) || "{}")?.savedAt))}.`, false);
        el.overallBadge.textContent = "STALE";
        el.overallBadge.className = "badge badge-warning";
        setStatus("error", "Offline · cached data");
        toast(`Worker unavailable: ${error.message}. Cached data is shown.`, true);
      } else {
        state.overview = null;
        state.platforms = [];
        el.metrics.innerHTML = `<div class="global-empty"><span>⚠️</span><div><strong>Could not load analytics</strong><p>${esc(error.message)}</p><button class="btn primary" id="retryInline">Retry</button></div></div>`;
        [el.trafficChart, el.platformBars, el.clientRank, el.countries, el.ips, el.topPages, el.eventTypes, el.sources, el.statuses].forEach((node) => { node.innerHTML = `<div class="empty-state compact"><span>⚠️</span><strong>Unavailable</strong><small>Worker data could not be loaded.</small></div>`; });
        $("retryInline")?.addEventListener("click", refresh);
        applyBasicHealth(`Worker unavailable: ${error.message}`, false);
        setStatus("error", "Offline");
      }
    } finally {
      state.loading = false;
    }
  }

  async function selectPlatform() {
    await refresh();
  }

  function detailRows(event) {
    const pairs = [
      ["Event ID", event.eventId || event.id],
      ["Event type", event.eventType],
      ["Platform", event.platformName || event.platformId],
      ["Received", event.receivedAt ? formatDate(event.receivedAt) : null],
      ["IP", C.showRawIp ? event.ip : "hidden"],
      ["IP hash", event.ipHash],
      ["Platform IP", C.showPlatformIp ? event.platformIp : "hidden"],
      ["Country", event.country], ["Region", event.region], ["City", event.city],
      ["Latitude", event.latitude], ["Longitude", event.longitude],
      ["ASN", event.asn], ["Organization", event.asOrganization],
      ["Browser", [event.browser, event.browserVersion].filter(Boolean).join(" ")],
      ["OS", [event.os, event.osVersion].filter(Boolean).join(" ")],
      ["Device", [event.device, event.deviceVendor, event.deviceModel].filter(Boolean).join(" · ")],
      ["Screen", event.screenWidth && event.screenHeight ? `${event.screenWidth} × ${event.screenHeight}` : null],
      ["Viewport", event.viewportWidth && event.viewportHeight ? `${event.viewportWidth} × ${event.viewportHeight}` : null],
      ["Timezone", event.timezone], ["Language", event.language],
      ["Page", event.pageUrl || event.path], ["Referrer", event.referrer],
      ["Duration", formatDuration(event.durationMs)], ["Scroll", `${num(event.maxScroll)}%`],
      ["Visitor ID", event.visitorId], ["Session ID", event.sessionId],
      ["CF-Ray", event.cfRay], ["Request ID", event.requestId]
    ];
    return pairs.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => `<div class="detail-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("");
  }

  function pretty(value) {
    try { return JSON.stringify(typeof value === "string" ? JSON.parse(value) : value || {}, null, 2); } catch (_) { return String(value || "{}"); }
  }

  function openEvent(event) {
    el.drawerTitle.textContent = event.eventId || event.id || "Event details";
    el.drawerBody.innerHTML = `<div class="detail-grid">${detailRows(event)}</div><div class="json-section"><h3>Custom data</h3><pre>${esc(pretty(event.dataJson))}</pre></div><div class="json-section"><h3>Metadata</h3><pre>${esc(pretty(event.metadataJson))}</pre></div><div class="json-section"><h3>Cloudflare snapshot</h3><pre>${esc(pretty(event.cfJson))}</pre></div><div class="json-section"><h3>Request snapshot</h3><pre>${esc(pretty(event.requestJson))}</pre></div>`;
    el.drawer.classList.add("open");
    el.backdrop.classList.add("open");
    el.drawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    el.drawer.classList.remove("open");
    el.backdrop.classList.remove("open");
    el.drawer.setAttribute("aria-hidden", "true");
  }

  function apiExamples(kind) {
    const payload = {
      platformId: "my-website",
      platformName: "My Website",
      platformType: "web",
      eventType: "pageview",
      eventId: "stable-unique-event-id",
      identity: { visitorId: "visitor-123", sessionId: "session-123" },
      page: { url: "https://example.com/", path: "/", title: "Home", referrer: "" },
      screen: { width: 1920, height: 1080, devicePixelRatio: 1 },
      viewport: { width: 1440, height: 900 },
      data: { sdkMode: "basic" }
    };
    if (kind === "js") return `const response = await fetch("${W}/v1/events", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${JSON.stringify(payload, null, 2)})\n});\nconsole.log(await response.json());`;
    if (kind === "py") return `import requests\n\npayload = ${JSON.stringify(payload, null, 2)}\nr = requests.post("${W}/v1/events", json=payload, timeout=15)\nprint(r.status_code, r.json())`;
    return `curl -X POST "${W}/v1/events" \\\n  -H "Content-Type: application/json" \\\n  --data '${JSON.stringify(payload)}'`;
  }

  function renderCode() {
    const kind = state.codeKind;
    el.codeBlock.textContent = apiExamples(kind);
    el.codeTabs.forEach((button) => button.classList.toggle("active", button.dataset.code === kind));
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(el.codeBlock.textContent || "");
      toast("API example copied.");
    } catch (_) {
      toast("Clipboard access is not available in this browser.", true);
    }
  }

  function exportCsv() {
    const rows = state.overview?.recentEvents || [];
    if (!rows.length) return toast("There are no recent events to export.", true);
    const cols = ["receivedAt", "eventId", "platformId", "eventType", "ip", "country", "region", "city", "browser", "os", "device", "path", "durationMs", "maxScroll", "visitorId", "sessionId"];
    const csv = [cols.join(","), ...rows.map((row) => cols.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `github-page-insights-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bind() {
    el.refresh.addEventListener("click", refresh);
    el.healthBtn.addEventListener("click", checkHealth);
    el.theme.addEventListener("click", () => { state.theme = state.theme === "dark" ? "light" : "dark"; applyTheme(); });
    el.platform.addEventListener("change", () => { state.platform = el.platform.value; selectPlatform(); });
    el.search.addEventListener("input", () => populatePlatforms(el.search.value));
    el.rangeSeg.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      el.rangeSeg.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
      button.classList.add("active");
      state.days = button.dataset.days || "7";
      refresh();
    }));
    el.clientTabs.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
      el.clientTabs.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
      button.classList.add("active");
      state.clientKind = button.dataset.kind || "browser";
      renderClient();
    }));
    el.backdrop.addEventListener("click", closeDrawer);
    $("closeDrawer")?.addEventListener("click", closeDrawer);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
    el.exportBtn.addEventListener("click", exportCsv);
    el.codeTabs.forEach((button) => button.addEventListener("click", () => { state.codeKind = button.dataset.code || "curl"; renderCode(); }));
    el.copyCodeBtn.addEventListener("click", copyCode);
  }

  async function init() {
    applyTheme();
    bind();
    populatePlatforms();
    renderCode();
    applyBasicHealth("Connecting to the Worker…", true);
    await refresh();
    const interval = Number(C.autoRefreshMs || 120000);
    if (Number.isFinite(interval) && interval >= 60000) {
      setInterval(() => { if (!document.hidden) refresh(); }, interval);
    }
  }

  init().catch((error) => {
    console.error(error);
    applyBasicHealth(`Startup error: ${error.message}`, false);
    setStatus("error", "Offline");
  });
})();
