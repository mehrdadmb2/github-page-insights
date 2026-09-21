(function () {
  "use strict";
  if (window.__UNIVERSAL_EVENT_INSIGHTS__) return;
  window.__UNIVERSAL_EVENT_INSIGHTS__ = true;

  const C = window.UNIVERSAL_EVENT_INSIGHTS_CONFIG || {};
  const script = document.currentScript;
  const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
  const worker = String(C.workerUrl || script?.dataset?.workerUrl || meta("uei-worker-url") || "").replace(/\/+$/, "");
  if (!worker) return;

  const slug = (v) => String(v || "").trim().toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80);
  const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const get = (s, k) => { try { return s.getItem(k); } catch { return null; } };
  const put = (s, k, v) => { try { s.setItem(k, v); } catch {} };

  const platformId = slug(script?.dataset?.platformId || meta("uei-platform-id") || meta("page-insights-site-id") || C.platformId || location.hostname || "unknown-platform");
  const platformName = script?.dataset?.platformName || meta("uei-platform-name") || meta("page-insights-site-name") || C.platformName || document.title || platformId;
  const platformType = script?.dataset?.platformType || meta("uei-platform-type") || C.platformType || "web";
  const sampleRate = Math.max(0, Math.min(1, Number(C.sampleRate ?? 1)));
  if (Math.random() > sampleRate) return;

  let visitorId = get(localStorage, `uei:visitor:${platformId}`);
  if (!visitorId) { visitorId = id(); put(localStorage, `uei:visitor:${platformId}`, visitorId); }

  let session = null;
  try { session = JSON.parse(get(sessionStorage, `uei:session:${platformId}`) || "null"); } catch {}
  if (!session || !session.id || Date.now() - Number(session.lastSeen || 0) > 30 * 60 * 1000) session = { id: id(), lastSeen: Date.now() };
  session.lastSeen = Date.now();
  put(sessionStorage, `uei:session:${platformId}`, JSON.stringify(session));

  const state = { startedAt: Date.now(), maxScroll: 0, clicks: 0, outboundClicks: 0, ended: false };
  const connection = () => {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return c ? { type: c.effectiveType || c.type || null, downlink: c.downlink ?? null, rtt: c.rtt ?? null, saveData: !!c.saveData } : null;
  };
  const timezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } };
  const base = (type, data, extra) => ({
    platformId, platformName, platformType, eventType: type, eventId: id(), sessionId: session.id, visitorId,
    timestamp: new Date().toISOString(), pageUrl: location.href, path: location.pathname + location.search,
    title: document.title || "", referrer: document.referrer || "", language: navigator.language || "",
    timezone: timezone(), screen: { width: screen.width || 0, height: screen.height || 0, devicePixelRatio: devicePixelRatio || 1, colorDepth: screen.colorDepth || 0 },
    viewport: { width: innerWidth || 0, height: innerHeight || 0 }, connection: connection(),
    durationMs: Math.max(0, Date.now() - state.startedAt), maxScroll: state.maxScroll, clicks: state.clicks,
    outboundClicks: state.outboundClicks, data: data || {}, metadata: { sdk: "universal-event-insights-js", visibility: document.visibilityState, ...(extra || {}) }
  });

  function send(type, data, opts = {}) {
    if (state.ended && type !== "pageleave") return;
    const body = JSON.stringify(base(type, data, opts.metadata));
    const endpoint = `${worker}/v1/events`;
    if (opts.keepalive && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }))) return; } catch {}
    }
    fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, mode: "cors", credentials: "omit", keepalive: !!opts.keepalive }).catch(() => {});
  }

  function updateScroll() {
    const d = document.documentElement;
    const total = Math.max(1, d.scrollHeight - innerHeight);
    state.maxScroll = Math.max(state.maxScroll, Math.min(100, Math.round((scrollY / total) * 100)));
  }
  function click(e) {
    state.clicks++;
    const a = e.target?.closest?.("a[href]");
    if (a) { try { if (new URL(a.href, location.href).origin !== location.origin) state.outboundClicks++; } catch {} }
  }
  function visibility() { send(document.hidden ? "visibility" : "heartbeat", { hidden: document.hidden }); }
  function leave() { if (state.ended) return; state.ended = true; send("pageleave", {}, { keepalive: true }); }

  window.UniversalEventInsights = {
    platformId,
    track(type, data, extra) { send(type || "custom", data || {}, { metadata: extra || {} }); },
    flush() { send("heartbeat", { manual: true }); }
  };
  window.GitHubPageInsights = window.UniversalEventInsights;

  send("pageview");
  const heartbeatMs = Math.max(15000, Number(C.heartbeatMs || 30000));
  const timer = setInterval(() => { if (!document.hidden && !state.ended) send("heartbeat"); }, heartbeatMs);
  addEventListener("scroll", updateScroll, { passive: true });
  addEventListener("click", click, { capture: true, passive: true });
  addEventListener("visibilitychange", visibility);
  addEventListener("pagehide", leave, { capture: true });
  addEventListener("beforeunload", leave, { capture: true });
  addEventListener("pagehide", () => clearInterval(timer), { once: true });
})();
