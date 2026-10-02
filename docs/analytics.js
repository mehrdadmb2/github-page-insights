/* Universal Event Insights Browser SDK v12.1.0 */
(function () {
  "use strict";

  if (window.__UEI_SDK_LOADED__) return;
  window.__UEI_SDK_LOADED__ = true;

  const C = window.PAGE_INSIGHTS_CONFIG || {};
  const worker = String(C.workerUrl || "").replace(/\/+$/, "");
  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content || "";
  const configValue = (...values) => values.find((v) => v !== undefined && v !== null && String(v).trim() !== "") || "";

  const platformId = String(configValue(
    C.platformId,
    meta("page-insights-platform-id"),
    meta("page-insights-site-id"),
    meta("uei-platform-id"),
    location.hostname,
    "web"
  )).trim();

  const platformName = String(configValue(
    C.platformName,
    meta("page-insights-platform-name"),
    meta("page-insights-site-name"),
    meta("uei-platform-name"),
    platformId
  )).trim();

  const platformType = String(configValue(
    C.platformType,
    meta("page-insights-platform-type"),
    meta("uei-platform-type"),
    "web"
  )).trim();

  const environment = String(configValue(
    C.environment,
    meta("page-insights-environment"),
    "production"
  )).trim();

  if (!worker || !platformId) return;

  const storageKey = `uei_v121_${platformId}`;
  const queueKey = `${storageKey}_queue`;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const advanced = C.advanced === true || C.advancedTelemetry === true;
  // Basic mode = one browser -> Worker request per page load, with the visitor snapshot
  // attached to that request. No heartbeat, polling, click, scroll, or visibility traffic.
  const trackPageLeave = advanced && C.trackPageLeave === true;
  const trackClicks = advanced && C.trackClicks === true;
  const trackScroll = advanced && C.trackScroll === true;
  const trackVisibility = advanced && C.trackVisibility === true;
  const heartbeat = advanced && C.heartbeat === true;
  const periodicQueueFlush = advanced && C.periodicQueueFlush === true;

  let pageStart = Date.now();
  let maxScroll = 0;
  let clicks = 0;
  let outboundClicks = 0;
  let lastScrollSent = 0;
  let pageLeft = false;
  let flushBusy = false;

  function uuid() {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function safeStorage(kind) {
    try {
      return kind === "session" ? sessionStorage : localStorage;
    } catch {
      return null;
    }
  }

  function getOrCreate(kind, name) {
    const store = safeStorage(kind);
    if (!store) return uuid();
    try {
      const existing = store.getItem(`${storageKey}_${name}`);
      if (existing) return existing;
      const value = uuid();
      store.setItem(`${storageKey}_${name}`, value);
      return value;
    } catch {
      return uuid();
    }
  }

  const visitorId = getOrCreate("local", "visitor");

  function getSession() {
    const store = safeStorage("session");
    if (!store) return uuid();
    try {
      const savedId = store.getItem(`${storageKey}_session`);
      const savedAt = Number(store.getItem(`${storageKey}_session_at`) || 0);
      const now = Date.now();
      if (savedId && Number.isFinite(savedAt) && now - savedAt < Number(C.sessionTimeoutMs || 1800000)) {
        store.setItem(`${storageKey}_session_at`, String(now));
        return savedId;
      }
      const value = uuid();
      store.setItem(`${storageKey}_session`, value);
      store.setItem(`${storageKey}_session_at`, String(now));
      return value;
    } catch {
      return uuid();
    }
  }

  const sessionId = getSession();
  const userId = C.userId || null;
  const anonymousId = C.anonymousId || null;
  const platformIp = C.platformIp || meta("page-insights-platform-ip") || null;

  const screenInfo = {
    width: window.screen?.width || null,
    height: window.screen?.height || null,
    devicePixelRatio: window.devicePixelRatio || 1,
    colorDepth: window.screen?.colorDepth || 24
  };

  function clientHints() {
    try {
      const u = navigator.userAgentData;
      return u ? {
        brands: Array.isArray(u.brands) ? u.brands.map(x => ({ brand: x.brand, version: x.version })) : [],
        mobile: Boolean(u.mobile),
        platform: u.platform || null
      } : null;
    } catch {
      return null;
    }
  }

  function viewport() {
    return { width: window.innerWidth || null, height: window.innerHeight || null };
  }

  function connectionInfo() {
    return {
      effectiveType: connection?.effectiveType || null,
      type: connection?.type || null,
      downlink: connection?.downlink ?? null,
      rtt: connection?.rtt ?? null,
      saveData: Boolean(connection?.saveData)
    };
  }

  function page() {
    return {
      url: location.href,
      path: location.pathname,
      queryString: location.search.slice(1),
      title: document.title,
      referrer: document.referrer || null
    };
  }

  function getQueue() {
    try {
      const value = JSON.parse(localStorage.getItem(queueKey) || "[]");
      return Array.isArray(value) ? value.slice(-25) : [];
    } catch {
      return [];
    }
  }

  function saveQueue(queue) {
    try {
      localStorage.setItem(queueKey, JSON.stringify(queue.slice(-25)));
    } catch {
      /* storage may be unavailable */
    }
  }

  function enqueue(body) {
    const queue = getQueue();
    queue.push(body);
    saveQueue(queue);
  }

  function bodyFor(eventType, data, metadata) {
    return {
      platformId,
      platformName,
      platformType,
      environment,
      platformUrl: C.platformUrl || location.origin,
      platformDomain: location.hostname,
      appVersion: C.appVersion || null,
      platformIp,
      source: "browser",
      sdkName: "universal-event-insights-browser",
      sdkVersion: "12.1.0",
      eventType,
      eventId: uuid(),
      timestamp: new Date().toISOString(),
      identity: { visitorId, sessionId, userId, anonymousId },
      page: page(),
      screen: screenInfo,
      viewport: viewport(),
      connection: connectionInfo(),
      clientHints: clientHints(),
      collection: { mode: advanced ? "advanced" : "basic", requestPolicy: advanced ? "configurable" : "one-per-page-load" },
      durationMs: Math.max(0, Date.now() - pageStart),
      maxScroll,
      clicks,
      outboundClicks,
      data: data || {},
      metadata: metadata || {}
    };
  }

  async function post(body, keepalive) {
    const timeout = Number(C.requestTimeoutMs || 12000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${worker}/v1/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: Boolean(keepalive),
        cache: "no-store",
        signal: controller.signal
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function flushQueue() {
    if (flushBusy) return;
    const queue = getQueue();
    if (!queue.length) return;
    flushBusy = true;
    try {
      const remaining = [];
      for (const item of queue) {
        const ok = await post(item, false);
        if (!ok) remaining.push(item);
      }
      saveQueue(remaining);
    } finally {
      flushBusy = false;
    }
  }

  function recentPageviewDuplicate() {
    const store = safeStorage("session");
    if (!store) return false;
    const signature = `${location.pathname}|${location.search}`;
    try {
      const prev = JSON.parse(store.getItem(`${storageKey}_last_pageview`) || "null");
      const same = prev && prev.signature === signature && Date.now() - Number(prev.at || 0) < 3000;
      if (!same) store.setItem(`${storageKey}_last_pageview`, JSON.stringify({ signature, at: Date.now() }));
      return Boolean(same);
    } catch {
      return false;
    }
  }

  function send(eventType, data, metadata, keepalive) {
    const body = bodyFor(eventType, data, metadata);
    if (keepalive && navigator.sendBeacon) {
      try {
        const blob = new Blob([JSON.stringify(body)], { type: "text/plain;charset=UTF-8" });
        if (navigator.sendBeacon(`${worker}/v1/events`, blob)) return;
      } catch {
        /* fallback to fetch */
      }
    }
    post(body, Boolean(keepalive)).then((ok) => {
      if (!ok) enqueue(body);
    });
  }

  function updateSessionTouch() {
    const store = safeStorage("session");
    try { store?.setItem(`${storageKey}_session_at`, String(Date.now())); } catch { /* no-op */ }
  }

  function updateScroll() {
    if (!trackScroll) return;
    const root = document.documentElement;
    const body = document.body || {};
    const top = window.scrollY || root.scrollTop || 0;
    const total = Math.max(root.scrollHeight, body.scrollHeight || 0, root.offsetHeight || 0, body.offsetHeight || 0) - window.innerHeight;
    maxScroll = total > 0 ? Math.min(100, Math.round((top / total) * 100)) : 100;
    if (maxScroll - lastScrollSent >= 10) {
      lastScrollSent = maxScroll;
      send("scroll", { depth: maxScroll }, {});
    }
    updateSessionTouch();
  }

  if (trackScroll) window.addEventListener("scroll", updateScroll, { passive: true });

  if (trackClicks) {
    window.addEventListener("click", (event) => {
      clicks += 1;
      updateSessionTouch();
      const target = {
        tag: event.target?.tagName || null,
        id: event.target?.id || null,
        className: typeof event.target?.className === "string" ? event.target.className.slice(0, 160) : null
      };
      send("click", { target }, {}, false);
      const anchor = event.target?.closest?.("a");
      if (anchor?.href && anchor.origin !== location.origin) {
        outboundClicks += 1;
        send("outbound_click", { href: anchor.href, text: (anchor.textContent || "").trim().slice(0, 180) }, {}, false);
      }
    }, { passive: true });
  }

  if (trackVisibility) {
    document.addEventListener("visibilitychange", () => {
      updateSessionTouch();
      send("visibility", { state: document.visibilityState }, {});
    });
  }

  function leaveOnce(reason) {
    if (pageLeft) return;
    pageLeft = true;
    send("pageleave", {}, { reason }, true);
  }

  if (trackPageLeave) {
    window.addEventListener("pagehide", () => leaveOnce("pagehide"));
    window.addEventListener("beforeunload", () => leaveOnce("beforeunload"));
  }
  window.addEventListener("online", flushQueue);
  if (periodicQueueFlush) {
    setInterval(flushQueue, Math.max(60000, Number(C.queueFlushMs || 120000)));
  }

  if (connection?.addEventListener && advanced) {
    connection.addEventListener("change", () => send("connection_change", { connection: connectionInfo() }, {}));
  }

  if (heartbeat) {
    setInterval(() => {
      if (!pageLeft && !document.hidden) send("heartbeat", {}, {});
    }, Math.max(60000, Number(C.heartbeatMs || 120000)));
  }

  if (!recentPageviewDuplicate()) send("pageview", {}, {});
  updateSessionTouch();
  flushQueue();
})();
