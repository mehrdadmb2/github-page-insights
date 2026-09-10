/* GitHub Page Insights — drop-in client collector */
(function () {
  "use strict";

  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
  const root = document.documentElement;
  const script = document.currentScript;
  const cfg = window.PAGE_INSIGHTS_CONFIG || {};
  const WORKER = String(cfg.workerUrl || script?.dataset?.workerUrl || "").replace(/\/+$/, "");
  if (!WORKER) return;

  const now = Date.now();
  const siteIdRaw = script?.dataset?.siteId || meta("page-insights-site-id") || cfg.siteId || "auto";
  const siteNameRaw = script?.dataset?.siteName || meta("page-insights-site-name") || cfg.siteName || "";
  const sampleRate = Math.max(0, Math.min(1, Number(cfg.sampleRate ?? script?.dataset?.sampleRate ?? 1)));
  if (Math.random() > sampleRate) return;

  const sanitizeSiteId = (value) => {
    const original = String(value || "").trim().toLowerCase();
    if (!original || original === "auto") return "";
    return original.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 64);
  };

  const parts = location.hostname.split(".").filter(Boolean);
  const derived = parts.length >= 3 ? parts.slice(0, -2).join("-") : location.hostname;
  const siteId = sanitizeSiteId(siteIdRaw) || sanitizeSiteId(derived) || "unknown-site";
  const siteName = siteNameRaw || document.title || siteId;

  const uuid = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  };

  const storageKey = `gpi:v4:visitor:${siteId}`;
  const sessionKey = `gpi:v4:session:${siteId}`;
  const safeGet = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
  const safeSet = (storage, key, value) => { try { storage.setItem(key, value); } catch {} };

  let visitorId = safeGet(localStorage, storageKey);
  if (!visitorId) { visitorId = uuid(); safeSet(localStorage, storageKey, visitorId); }

  let session = null;
  try { session = JSON.parse(safeGet(sessionStorage, sessionKey) || "null"); } catch {}
  if (!session || !session.id || (now - Number(session.lastSeen || 0)) > 30 * 60 * 1000) {
    session = { id: uuid(), lastSeen: now };
  } else session.lastSeen = now;
  safeSet(sessionStorage, sessionKey, JSON.stringify(session));

  const state = {
    startedAt: now,
    lastSendAt: now,
    maxScroll: 0,
    clicks: 0,
    outboundClicks: 0,
    hiddenAt: 0,
    ended: false
  };

  const connection = () => {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return c ? { type: c.effectiveType || c.type || "", downlink: c.downlink ?? null, rtt: c.rtt ?? null, saveData: !!c.saveData } : null;
  };

  const payload = (eventType) => ({
    siteId,
    siteName,
    eventId: uuid(),
    eventType,
    sessionId: session.id,
    visitorId,
    timestamp: new Date().toISOString(),
    page: { url: location.href, path: location.pathname + location.search, title: document.title || "" },
    referrer: document.referrer || "",
    language: navigator.language || "",
    timezone: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })(),
    screen: { width: screen.width || 0, height: screen.height || 0, devicePixelRatio: devicePixelRatio || 1, colorDepth: screen.colorDepth || 0 },
    viewport: { width: innerWidth || 0, height: innerHeight || 0 },
    connection: connection(),
    durationMs: Math.max(0, Date.now() - state.startedAt),
    maxScroll: state.maxScroll,
    clicks: state.clicks,
    outboundClicks: state.outboundClicks,
    metadata: { collector: "github-page-insights-v4", pageVisibility: document.visibilityState }
  });

  function send(eventType, beacon = false) {
    if (state.ended && eventType !== "pageleave") return;
    const body = JSON.stringify(payload(eventType));
    const url = `${WORKER}/collect`;

    if (beacon && navigator.sendBeacon) {
      try {
        if (navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return;
      } catch {}
    }

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      mode: "cors",
      credentials: "omit",
      keepalive: beacon
    }).catch(() => {});
    state.lastSendAt = Date.now();
    session.lastSeen = Date.now();
    safeSet(sessionStorage, sessionKey, JSON.stringify(session));
  }

  function onScroll() {
    const doc = document.documentElement;
    const total = Math.max(1, doc.scrollHeight - innerHeight);
    state.maxScroll = Math.max(state.maxScroll, Math.min(100, Math.round((scrollY / total) * 100)));
  }
  function onClick(event) {
    state.clicks += 1;
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;
    try { if (new URL(anchor.href, location.href).origin !== location.origin) state.outboundClicks += 1; } catch {}
  }
  function onVisibility() {
    if (document.hidden) {
      state.hiddenAt = Date.now();
      send("visibility");
    } else if (state.hiddenAt) {
      state.hiddenAt = 0;
      send("heartbeat");
    }
  }
  function finish() {
    if (state.ended) return;
    state.ended = true;
    send("pageleave", true);
  }

  send("pageview");
  const heartbeatMs = Math.max(15000, Number(cfg.heartbeatMs || 30000));
  const timer = setInterval(() => { if (!document.hidden && !state.ended) send("heartbeat"); }, heartbeatMs);

  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("click", onClick, { passive: true, capture: true });
  addEventListener("visibilitychange", onVisibility);
  addEventListener("pagehide", finish, { capture: true });
  addEventListener("beforeunload", finish, { capture: true });
  addEventListener("pageshow", () => { state.ended = false; });

  root.dataset.pageInsightsAttached = "true";
  window.addEventListener("pagehide", () => clearInterval(timer), { once: true });
})();