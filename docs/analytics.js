(function () {
  "use strict";

  const cfg = window.PAGE_INSIGHTS_CONFIG || {};
  const WORKER = String(cfg.workerUrl || "").replace(/\/+$/, "");
  if (!WORKER || WORKER.includes("YOUR-WORKER")) return;

  const MAX = 180;
  const state = {
    sessionId: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    visitorId: getOrCreateVisitorId(),
    startedAt: Date.now(),
    lastHeartbeat: Date.now(),
    maxScroll: 0,
    clicks: 0,
    outboundClicks: 0,
    sentStart: false,
    ended: false
  };

  if (Math.random() > Number(cfg.sampleRate ?? 1)) return;

  const site = resolveSite();
  const base = {
    siteId: site.siteId,
    siteName: site.siteName,
    pageUrl: location.href,
    path: location.pathname,
    title: document.title || "",
    referrer: document.referrer || "",
    language: navigator.language || "",
    languages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 8) : [],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screen: { width: screen.width || 0, height: screen.height || 0, pixelRatio: window.devicePixelRatio || 1 },
    viewport: { width: innerWidth || 0, height: innerHeight || 0 },
    connection: readConnection(),
    platformHints: readPlatformHints(),
    sessionId: state.sessionId,
    visitorId: state.visitorId
  };

  send({ type: "pageview", ...base }, false);
  state.sentStart = true;

  const timer = setInterval(() => {
    if (!document.hidden && !state.ended) heartbeat();
  }, Math.max(5000, Number(cfg.heartbeatMs || 15000)));

  if (cfg.trackScrollDepth !== false) addEventListener("scroll", onScroll, { passive: true });
  if (cfg.trackClicks !== false) addEventListener("click", onClick, { passive: true });
  if (cfg.trackOutboundLinks !== false) addEventListener("click", onLinkClick, { passive: true, capture: true });

  addEventListener("visibilitychange", () => {
    if (document.hidden) heartbeat(true);
  });

  addEventListener("pagehide", finish, { capture: true });
  addEventListener("beforeunload", finish, { capture: true });

  function heartbeat(force) {
    const now = Date.now();
    const elapsed = Math.max(0, now - state.lastHeartbeat);
    if (!force && elapsed < 4000) return;
    state.lastHeartbeat = now;
    send({
      type: "heartbeat",
      ...base,
      durationMs: now - state.startedAt,
      maxScroll: state.maxScroll,
      clicks: state.clicks,
      outboundClicks: state.outboundClicks
    }, false);
  }

  function finish() {
    if (state.ended) return;
    state.ended = true;
    clearInterval(timer);
    const payload = {
      type: "pageleave",
      ...base,
      durationMs: Date.now() - state.startedAt,
      maxScroll: state.maxScroll,
      clicks: state.clicks,
      outboundClicks: state.outboundClicks
    };
    send(payload, true);
  }

  function onScroll() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - innerHeight);
    state.maxScroll = Math.max(state.maxScroll, Math.min(100, Math.round((scrollY / max) * 100)));
  }

  function onClick() {
    state.clicks++;
  }

  function onLinkClick(event) {
    const el = event.target && event.target.closest ? event.target.closest("a[href]") : null;
    if (!el) return;
    try {
      const u = new URL(el.href, location.href);
      if (u.origin !== location.origin) state.outboundClicks++;
    } catch (_) {}
  }

  function send(payload, keepalive) {
    const body = JSON.stringify(payload);
    if (keepalive && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(`${WORKER}/collect`, new Blob([body], { type: "application/json" }));
        return;
      } catch (_) {}
    }
    fetch(`${WORKER}/collect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: !!keepalive,
      mode: "cors",
      credentials: "omit"
    }).catch(() => {});
  }

  function resolveSite() {
    const root = document.querySelector("[data-page-insights-site]");
    const metaId = document.querySelector('meta[name="page-insights-site-id"]');
    const metaName = document.querySelector('meta[name="page-insights-site-name"]');
    let siteId = root?.dataset.pageInsightsSite || metaId?.content || cfg.siteId;
    let siteName = root?.dataset.pageInsightsName || metaName?.content || cfg.siteName;
    if (!siteId || siteId === "auto") {
      const parts = location.hostname.split(".").filter(Boolean);
      siteId = parts.length >= 3 ? parts.slice(0, -2).join("-") : location.hostname;
    }
    if (!siteName || siteName === "Auto-detected site") siteName = document.title || siteId;
    return { siteId, siteName };
  }

  function getOrCreateVisitorId() {
    const key = "page_insights_visitor_id";
    try {
      const existing = localStorage.getItem(key);
      if (existing && existing.length <= MAX) return existing;
      const v = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, v);
      return v;
    } catch (_) {
      return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function readConnection() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return null;
    return { effectiveType: c.effectiveType || "", downlink: c.downlink ?? null, rtt: c.rtt ?? null, saveData: !!c.saveData };
  }

  function readPlatformHints() {
    return {
      userAgent: navigator.userAgent || "",
      vendor: navigator.vendor || "",
      platform: navigator.platform || "",
      webdriver: !!navigator.webdriver,
      touchPoints: navigator.maxTouchPoints || 0,
      colorDepth: screen.colorDepth || 0
    };
  }
})();
