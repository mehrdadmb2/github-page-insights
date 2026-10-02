/* Universal Event Insights Browser SDK v12.1.1 — Basic-first, low-frequency collector */
(function () {
  "use strict";

  if (window.__UEI_SDK_LOADED__) return;
  window.__UEI_SDK_LOADED__ = true;

  const C = window.PAGE_INSIGHTS_CONFIG || {};
  const worker = String(C.workerUrl || "").replace(/\/+$/, "");
  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content || "";
  const value = (...xs) => xs.find((x) => x !== undefined && x !== null && String(x).trim() !== "") || "";

  const platformId = String(value(
    C.platformId,
    meta("page-insights-platform-id"),
    meta("page-insights-site-id"),
    meta("uei-platform-id"),
    location.hostname,
    "web"
  )).trim();

  const platformName = String(value(
    C.platformName,
    meta("page-insights-platform-name"),
    meta("page-insights-site-name"),
    meta("uei-platform-name"),
    platformId
  )).trim();

  const platformType = String(value(
    C.platformType,
    meta("page-insights-platform-type"),
    meta("uei-platform-type"),
    "web"
  )).trim();

  const environment = String(value(
    C.environment,
    meta("page-insights-environment"),
    "production"
  )).trim();

  if (!worker || !platformId) return;

  const storageKey = `uei_v121_${platformId}`;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const pageStart = Date.now();

  function uuid() {
    try { return crypto.randomUUID(); } catch {
      return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function storage(kind) {
    try { return kind === "session" ? sessionStorage : localStorage; } catch { return null; }
  }

  function getOrCreate(kind, key) {
    const store = storage(kind);
    if (!store) return uuid();
    try {
      const full = `${storageKey}_${key}`;
      const old = store.getItem(full);
      if (old) return old;
      const id = uuid();
      store.setItem(full, id);
      return id;
    } catch { return uuid(); }
  }

  const visitorId = getOrCreate("local", "visitor");

  function sessionId() {
    const store = storage("session");
    const timeout = Math.max(5 * 60 * 1000, Number(C.sessionTimeoutMs || 30 * 60 * 1000));
    const now = Date.now();
    if (!store) return uuid();
    try {
      const id = store.getItem(`${storageKey}_session`);
      const at = Number(store.getItem(`${storageKey}_session_at`) || 0);
      if (id && now - at < timeout) {
        store.setItem(`${storageKey}_session_at`, String(now));
        return id;
      }
      const next = uuid();
      store.setItem(`${storageKey}_session`, next);
      store.setItem(`${storageKey}_session_at`, String(now));
      return next;
    } catch { return uuid(); }
  }

  const currentSessionId = sessionId();
  const userId = C.userId || null;
  const anonymousId = C.anonymousId || null;

  function screenInfo() {
    return {
      width: window.screen?.width ?? null,
      height: window.screen?.height ?? null,
      devicePixelRatio: window.devicePixelRatio || 1,
      colorDepth: window.screen?.colorDepth ?? null,
      orientation: window.screen?.orientation?.type || null
    };
  }

  function viewportInfo() {
    return {
      width: window.innerWidth ?? null,
      height: window.innerHeight ?? null
    };
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

  function clientHints() {
    try {
      const u = navigator.userAgentData;
      if (!u) return null;
      return {
        mobile: Boolean(u.mobile),
        platform: u.platform || null,
        brands: Array.isArray(u.brands) ? u.brands.slice(0, 8).map(x => ({ brand: x.brand, version: x.version })) : []
      };
    } catch { return null; }
  }

  function pageInfo() {
    return {
      url: location.href,
      path: location.pathname,
      queryString: location.search.slice(1),
      title: document.title || null,
      referrer: document.referrer || null,
      referrerHost: (() => { try { return document.referrer ? new URL(document.referrer).hostname : null; } catch { return null; } })()
    };
  }

  function buildEvent() {
    return {
      platformId,
      platformName,
      platformType,
      environment,
      platformUrl: C.platformUrl || location.origin,
      platformDomain: location.hostname,
      appVersion: C.appVersion || null,
      source: "browser",
      sdkName: "universal-event-insights-browser",
      sdkVersion: "12.1.1",
      eventType: "pageview",
      eventId: uuid(),
      timestamp: new Date().toISOString(),
      identity: {
        visitorId,
        sessionId: currentSessionId,
        userId,
        anonymousId
      },
      page: pageInfo(),
      language: navigator.language || null,
      timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } })(),
      screen: screenInfo(),
      viewport: viewportInfo(),
      connection: connectionInfo(),
      clientHints: clientHints(),
      userAgent: navigator.userAgent || null,
      durationMs: Math.max(0, Date.now() - pageStart),
      maxScroll: 0,
      clicks: 0,
      outboundClicks: 0,
      data: {
        collectionMode: "basic",
        requestPolicy: "one-pageview-per-load"
      },
      metadata: {
        pageHost: location.hostname,
        pageProtocol: location.protocol
      }
    };
  }

  function updateStatus(state, detail) {
    try {
      window.dispatchEvent(new CustomEvent("uei:telemetry", { detail: { state, detail: detail || null } }));
    } catch { /* CustomEvent may be unavailable in very old browsers. */ }
  }

  async function sendOnce(body) {
    const timeoutMs = Math.max(4000, Number(C.requestTimeoutMs || 10000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${worker}/v1/events`, {
        method: "POST",
        // text/plain is a CORS-safelisted content type, so a cross-origin GitHub Pages
        // page can send the JSON body without triggering an extra OPTIONS preflight.
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: JSON.stringify(body),
        keepalive: true,
        cache: "no-store",
        signal: controller.signal
      });
      let payload = null;
      try { payload = await response.json(); } catch { /* response body may be empty */ }
      if (!response.ok) {
        updateStatus("failed", payload?.error || `HTTP ${response.status}`);
        return false;
      }
      updateStatus("sent", payload || null);
      return true;
    } catch (error) {
      updateStatus("failed", String(error?.message || error || "network error"));
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  // Advanced telemetry is opt-in and intentionally does not affect Basic collection.
  const advanced = C.advanced === true || C.advancedTelemetry === true;
  if (advanced) {
    // Optional advanced hooks are exposed through a small explicit API instead of
    // automatically attaching high-frequency listeners.
    window.PAGE_INSIGHTS_TRACK = function (eventType, data, metadata) {
      const cleanType = String(eventType || "custom").slice(0, 80);
      const event = buildEvent();
      event.eventType = cleanType;
      event.eventId = uuid();
      event.data = data && typeof data === "object" ? data : {};
      event.metadata = metadata && typeof metadata === "object" ? metadata : {};
      return sendOnce(event);
    };
  }

  // Prevent accidental duplicate executions caused by both sync/defer loaders or SPA
  // re-initialization in the same tab within a very small window.
  const tab = storage("session");
  try {
    const markerKey = `${storageKey}_last_pageview_at`;
    const last = Number(tab?.getItem(markerKey) || 0);
    if (Date.now() - last < 1500) return;
    tab?.setItem(markerKey, String(Date.now()));
  } catch { /* continue */ }

  updateStatus("sending");
  void sendOnce(buildEvent());
})();
