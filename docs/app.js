(function () {
  "use strict";

  const C = window.PAGE_INSIGHTS_CONFIG || {};
  const W = String(C.workerUrl || "").replace(/\/+$/, "");
  const REQUEST_TIMEOUT = Number(C.requestTimeoutMs || 12000);
  const $ = id => document.getElementById(id);
  const el = {
    boot: $("boot"), overall: $("overallBadge"),
    hWorker: $("h-worker"), hD1: $("h-d1"), hGh: $("h-gh"), hTg: $("h-tg"),
    healthMeta: $("healthMeta"), platform: $("platformSelect"), search: $("platformSearch"),
    events: $("eventsBody"), count: $("eventCount"), traffic: $("trafficChart"),
    platformBars: $("platformBars"), countries: $("countries"), browsers: $("browsers"),
    oses: $("oses"), ips: $("ips"), last: $("s-last"), lastSub: $("s-last-sub"),
    trafficInfo: $("trafficInfo"), toast: $("toasts"), modal: $("eventModal"),
    modalTitle: $("eventModalTitle"), modalBody: $("eventModalBody")
  };

  const state = {
    days: String(C.defaultRangeDays || 7),
    platform: "*",
    platforms: [],
    data: null,
    health: null,
    events: new Map(),
    loading: false,
    lastGoodData: null
  };

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const fmt = value => new Intl.NumberFormat().format(Number(value) || 0);
  const dur = ms => {
    let seconds = Math.max(0, Math.round((Number(ms) || 0) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };
  const dt = value => {
    try {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      return date.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
    } catch {
      return "—";
    }
  };

  async function api(path) {
    if (!W) throw Error("workerUrl is not configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetch(`${W}${path}`, { cache: "no-store", signal: controller.signal });
      let body = null;
      try { body = await response.json(); } catch { /* non-json failure */ }
      if (!response.ok) {
        throw Error(`HTTP ${response.status}${body?.error ? ` — ${body.error}` : ""}`);
      }
      return body;
    } catch (error) {
      if (error?.name === "AbortError") throw Error("Request timed out");
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function toast(message, error = false) {
    if (!el.toast) return;
    const node = document.createElement("div");
    node.className = `toast${error ? " error" : ""}`;
    node.textContent = message;
    el.toast.appendChild(node);
    setTimeout(() => node.remove(), 4500);
  }

  function setHealthCard(node, status, title, sub) {
    if (!node) return;
    node.innerHTML = `<b>${esc(title)}</b><strong>${esc(status)}</strong><small>${esc(sub)}</small>`;
  }

  async function loadHealth(showError = false, probeGithub = false) {
    try {
      const health = await api(probeGithub ? "/v1/health?probe=github" : "/v1/health");
      state.health = health;
      if (el.overall) el.overall.textContent = String(health.overall || "unknown").toUpperCase();
      setHealthCard(el.hWorker, health.checks?.worker?.status || "unknown", "Worker", "Reachability");
      setHealthCard(el.hD1, health.checks?.database?.status || "unknown", "D1", "Schema & counts");
      setHealthCard(el.hGh, health.checks?.github?.status || "unknown", "GitHub", "Archive/API");
      setHealthCard(
        el.hTg,
        health.checks?.configuration?.telegramConfigured ? "configured" : "not configured",
        "Telegram",
        health.checks?.configuration?.telegramConfigured ? "Notification path" : "Configuration"
      );
      const db = health.checks?.database || {};
      if (el.healthMeta) {
        el.healthMeta.textContent = `${fmt(db.counts?.platforms)} platforms · ${fmt(db.counts?.events)} events · ${fmt(db.counts?.visitors)} visitors · ${fmt(db.counts?.sessions)} sessions · ${fmt(db.counts?.archives)} archives · last telemetry ${db.latestEvent?.receivedAt ? dt(db.latestEvent.receivedAt) : "never"}`;
      }
      return health;
    } catch (error) {
      setHealthCard(el.hWorker, "error", "Worker", "unreachable");
      setHealthCard(el.hD1, "unknown", "D1", "not checked");
      setHealthCard(el.hGh, "unknown", "GitHub", "not checked");
      setHealthCard(el.hTg, "unknown", "Telegram", "not checked");
      if (el.overall) el.overall.textContent = "ERROR";
      if (el.healthMeta) el.healthMeta.textContent = error.message;
      if (showError) toast(`Health check failed: ${error.message}`, true);
      return null;
    }
  }

  function renderPlatformSelect() {
    if (!el.platform) return;
    el.platform.innerHTML = `<option value="*">All platforms</option>` + state.platforms.map(platform =>
      `<option value="${esc(platform.platformId)}">${esc(platform.platformName)} · ${esc(platform.platformType)}${platform.environment ? ` · ${esc(platform.environment)}` : ""}</option>`
    ).join("");
    el.platform.value = state.platform;
    filterPlatforms();
  }

  async function loadPlatforms() {
    const result = await api("/v1/platforms");
    state.platforms = Array.isArray(result?.platforms) ? result.platforms : [];
    renderPlatformSelect();
    return result;
  }

  async function loadData() {
    const overviewPath = state.platform === "*"
      ? `/v1/overview?days=${encodeURIComponent(state.days)}`
      : `/v1/platforms/${encodeURIComponent(state.platform)}?days=${encodeURIComponent(state.days)}`;
    const primary = await api(overviewPath);

    let recent = primary.recentEvents || [];
    try {
      const suffix = state.platform === "*" ? "" : `&platform=${encodeURIComponent(state.platform)}`;
      const response = await api(`/v1/events?days=${encodeURIComponent(state.days)}&limit=${Number(C.recentLimit || 50)}${suffix}`);
      recent = response?.events || recent;
    } catch {
      // Keep recent events from the primary response instead of failing the whole dashboard.
    }

    primary.recentEvents = recent;
    primary.eventCount = recent.length;
    state.data = primary;
    state.lastGoodData = primary;
    state.events.clear();
    for (const event of recent) {
      const id = event?.id || event?.eventId;
      if (id) state.events.set(id, event);
    }
    render(primary);
    return primary;
  }

  async function refresh(showToast = true) {
    if (state.loading) return;
    state.loading = true;
    try {
      await Promise.all([loadPlatforms(), loadHealth(false)]);
      await loadData();
      if (showToast) toast("Data refreshed");
    } catch (error) {
      if (state.lastGoodData) {
        render(state.lastGoodData);
        toast(`Refresh failed; showing last good data: ${error.message}`, true);
      } else {
        toast(`Refresh failed: ${error.message}`, true);
      }
    } finally {
      state.loading = false;
    }
  }

  function render(data) {
    const totals = data?.totals || {};
    $("s-platforms").textContent = fmt(state.platform === "*" ? (data.platforms || state.platforms).length : 1);
    $("s-platforms-sub").textContent = state.platform === "*" ? "discovered dynamically" : (data.platform?.platformName || state.platform);
    $("s-events").textContent = fmt(totals.events ?? totals.totalEvents ?? 0);
    $("s-visitors").textContent = fmt(totals.uniqueVisitors ?? 0);
    $("s-sessions").textContent = fmt(totals.sessions ?? 0);
    $("s-duration").textContent = dur(totals.avgDurationMs || 0);

    const last = (data.recentEvents || [])[0];
    if (el.last) el.last.textContent = last ? dt(last.receivedAt || last.occurredAt) : "—";
    if (el.lastSub) el.lastSub.textContent = last ? (last.platformName || last.platformId || "") : "no telemetry";
    if (el.trafficInfo) el.trafficInfo.textContent = `${(data.daily || []).length} buckets`;

    renderTraffic(data.daily || []);
    renderPlatforms(data.platforms || state.platforms || []);
    renderList(el.countries, data.countries || [], "label");
    renderList(el.browsers, data.browsers || [], "browser");
    renderList(el.oses, data.operatingSystems || [], "os");
    renderList(el.ips, data.ips || [], "ip");
    renderEvents((data.recentEvents || []).slice(0, Number(C.recentLimit || 50)));
  }

  function renderTraffic(rows) {
    if (!el.traffic) return;
    el.traffic.innerHTML = "";
    const values = rows.map(row => Number(row.views ?? row.pageviews ?? row.events ?? 0));
    const max = Math.max(1, ...values);
    rows.forEach((row, index) => {
      const column = document.createElement("div");
      column.className = "barcol";
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = `${Math.max(3, (values[index] / max) * 100)}%`;
      bar.title = `${row.day || ""}: ${fmt(values[index])}`;
      column.appendChild(bar);
      el.traffic.appendChild(column);
    });
    if (!rows.length) el.traffic.innerHTML = `<div class="muted">No traffic data yet.</div>`;
  }

  function renderPlatforms(rows) {
    if (!el.platformBars) return;
    const array = (rows || []).map(row => ({
      name: row.platformName || row.platform_id || "Unknown",
      count: Number(row.totalPageviews ?? row.views ?? row.count ?? 0)
    })).sort((a, b) => b.count - a.count).slice(0, 8);
    const max = Math.max(1, ...array.map(row => row.count));
    el.platformBars.innerHTML = array.length
      ? array.map(row => `<div class="bar-row"><div class="bar-row-head"><span>${esc(row.name)}</span><b>${fmt(row.count)}</b></div><div class="track"><div class="fill" style="width:${(row.count / max) * 100}%"></div></div></div>`).join("")
      : `<div class="muted">No platforms yet.</div>`;
  }

  function renderList(node, rows, key) {
    if (!node) return;
    const array = (rows || []).map(row => ({
      label: row.label ?? row[key] ?? row.ip ?? "Unknown",
      count: Number(row.count ?? 0)
    })).sort((a, b) => b.count - a.count).slice(0, 10);
    node.innerHTML = array.length
      ? array.map(row => `<div class="list-row"><span>${esc(row.label)}</span><b>${fmt(row.count)}</b></div>`).join("")
      : `<div class="muted">No data.</div>`;
  }

  function renderEvents(rows) {
    if (!el.events) return;
    if (el.count) el.count.textContent = `${rows.length} events`;
    el.events.innerHTML = rows.length ? rows.map(event => {
      const id = event.id || event.eventId || "";
      return `<tr class="event-row" data-event-id="${esc(id)}">
        <td>${esc(dt(event.receivedAt || event.occurredAt))}</td>
        <td>${esc(event.platformName || event.platformId || "—")}</td>
        <td>${esc(event.eventType || event.type || "—")}</td>
        <td><code>${esc(event.ip || "—")}</code></td>
        <td>${esc([event.city, event.region, event.country].filter(Boolean).join(", ") || "—")}</td>
        <td>${esc(event.device || "—")}</td>
        <td>${esc(event.browser || "—")}</td>
        <td title="${esc(event.pageUrl || "")}">${esc(event.path || "/")}</td>
        <td>${esc(dur(event.durationMs || 0))}</td>
      </tr>`;
    }).join("") : `<tr><td colspan="9" class="muted">No events.</td></tr>`;

    el.events.querySelectorAll(".event-row").forEach(row => {
      row.addEventListener("click", () => showEvent(row.dataset.eventId));
    });
  }

  function detailRow(label, value) {
    return `<div class="detail-row"><span>${esc(label)}</span><b>${esc(value ?? "—")}</b></div>`;
  }

  function prettyJson(value) {
    try {
      return JSON.stringify(typeof value === "string" ? JSON.parse(value || "{}") : value || {}, null, 2);
    } catch {
      return String(value || "");
    }
  }

  function showEvent(id) {
    const event = state.events.get(id);
    if (!event || !el.modal || !el.modalBody) return;
    const field = (snake, camel) => event[snake] ?? event[camel];
    el.modalTitle.textContent = `${field("event_type", "eventType") || "event"} · ${field("platform_name", "platformName") || field("platform_id", "platformId") || ""}`;
    el.modalBody.innerHTML = `
      <div class="detail-grid">
        ${detailRow("Event ID", field("id", "eventId"))}
        ${detailRow("Request ID", field("request_id", "requestId"))}
        ${detailRow("Trace ID", field("trace_id", "traceId"))}
        ${detailRow("Received", dt(field("received_at", "receivedAt")))}
        ${detailRow("Occurred", dt(field("occurred_at", "occurredAt")))}
        ${detailRow("Platform", field("platform_name", "platformName") || field("platform_id", "platformId"))}
        ${detailRow("Platform type", field("platform_type", "platformType"))}
        ${detailRow("Platform URL", field("platform_url", "platformUrl"))}
        ${detailRow("Platform domain", field("platform_domain", "platformDomain"))}
        ${detailRow("Platform IP", field("platform_ip", "platformIp"))}
        ${detailRow("Client IP", field("ip", "ip"))}
        ${detailRow("IP source", field("ip_source", "ipSource"))}
        ${detailRow("Country / Region / City", [event.country, event.region, event.city].filter(Boolean).join(" / "))}
        ${detailRow("ASN", event.asn ? `${event.asn}${event.asOrganization ? ` · ${event.asOrganization}` : ""}` : "")}
        ${detailRow("Browser", `${event.browser || ""}${event.browserVersion ? ` ${event.browserVersion}` : ""}`)}
        ${detailRow("OS", `${event.os || ""}${event.osVersion ? ` ${event.osVersion}` : ""}`)}
        ${detailRow("Device", [event.device, event.deviceVendor, event.deviceModel].filter(Boolean).join(" · "))}
        ${detailRow("Screen", [event.screenWidth, event.screenHeight].filter(value => value != null).join("×"))}
        ${detailRow("Viewport", [event.viewportWidth, event.viewportHeight].filter(value => value != null).join("×"))}
        ${detailRow("Duration", dur(event.durationMs))}
        ${detailRow("Scroll", `${event.maxScroll ?? 0}%`)}
        ${detailRow("Clicks", `${event.clicks ?? 0} / ${event.outboundClicks ?? 0} outbound`)}
        ${detailRow("Page", field("page_url", "pageUrl"))}
        ${detailRow("Path", event.path)}
        ${detailRow("Referrer", field("referrer", "referrerHost"))}
        ${detailRow("UTM", [event.utmSource, event.utmMedium, event.utmCampaign, event.utmTerm, event.utmContent].filter(Boolean).join(" / "))}
      </div>
      <details><summary>data_json</summary><pre>${esc(prettyJson(field("data_json", "dataJson")))}</pre></details>
      <details><summary>metadata_json</summary><pre>${esc(prettyJson(field("metadata_json", "metadataJson")))}</pre></details>
      <details><summary>headers_json</summary><pre>${esc(prettyJson(field("headers_json", "headersJson")))}</pre></details>
      <details><summary>request_json</summary><pre>${esc(prettyJson(field("request_json", "requestJson")))}</pre></details>
      <details><summary>cf_json</summary><pre>${esc(prettyJson(field("cf_json", "cfJson")))}</pre></details>
      <details><summary>payload_json</summary><pre>${esc(prettyJson(field("payload_json", "payloadJson")))}</pre></details>
      <details><summary>raw_event_json</summary><pre>${esc(prettyJson(field("raw_event_json", "rawEventJson")))}</pre></details>`;
    el.modal.classList.add("show");
    el.modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    el.modal?.classList.remove("show");
    el.modal?.setAttribute("aria-hidden", "true");
  }

  function theme() {
    const light = document.documentElement.dataset.theme === "light";
    const next = light ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("uei-theme", next); } catch { /* ignore */ }
  }

  function filterPlatforms() {
    const query = String(el.search?.value || "").toLowerCase().trim();
    [...(el.platform?.options || [])].forEach(option => {
      if (!option.value) return;
      option.hidden = Boolean(query && !option.text.toLowerCase().includes(query));
    });
  }

  $("refreshBtn")?.addEventListener("click", () => refresh(true));
  $("healthBtn")?.addEventListener("click", () => loadHealth(true, true));
  $("diagBtn")?.addEventListener("click", () => loadHealth(true, true));
  $("themeBtn")?.addEventListener("click", theme);
  el.search?.addEventListener("input", filterPlatforms);
  el.platform?.addEventListener("change", () => {
    state.platform = el.platform.value;
    loadData().catch(error => toast(`Platform load failed: ${error.message}`, true));
  });
  document.querySelectorAll("#rangeSeg button").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll("#rangeSeg button").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      state.days = button.dataset.days;
      loadData().catch(error => toast(`Range load failed: ${error.message}`, true));
    });
  });

  window.closeEventModal = closeModal;
  el.modal?.addEventListener("click", event => {
    if (event.target === el.modal) closeModal();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeModal();
  });
  window.addEventListener("error", event => console.error(event.error || event.message));
  window.addEventListener("unhandledrejection", event => console.error(event.reason));

  if ($("footVersion")) $("footVersion").textContent = "v9 universal";

  (async () => {
    try {
      try { document.documentElement.dataset.theme = localStorage.getItem("uei-theme") || "dark"; } catch { /* ignore */ }
      await new Promise(resolve => setTimeout(resolve, 500));
      el.boot?.classList.add("hidden");
      await refresh(false);
    } catch (error) {
      toast(`Dashboard initialization failed: ${error.message}`, true);
    }

    setInterval(() => refresh(false), Math.max(30000, Number(C.autoRefreshMs || 45000)));
  })();
})();
