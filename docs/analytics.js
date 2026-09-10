(() => {
  "use strict";

  const meta = name => document.querySelector(`meta[name="${name}"]`)?.content?.trim() || "";
  const config = window.PAGE_INSIGHTS_CONFIG || {};
  const worker = String(config.workerUrl || "").replace(/\/+$/, "");
  const siteId = normalize(meta("page-insights-site-id") || document.documentElement.dataset.pageInsightsSiteId || location.hostname);
  const siteName = (meta("page-insights-site-name") || document.documentElement.dataset.pageInsightsSiteName || document.title || siteId).slice(0,160);
  const SESSION_KEY = `gpi-session:${siteId}`;
  const VISITOR_KEY = "gpi-visitor";
  const started = Date.now();
  let sessionId = localStorage.getItem(SESSION_KEY);
  let visitorId = localStorage.getItem(VISITOR_KEY);
  if (!sessionId) { sessionId = uuid(); localStorage.setItem(SESSION_KEY, sessionId); }
  if (!visitorId) { visitorId = uuid(); localStorage.setItem(VISITOR_KEY, visitorId); }
  let maxScroll = 0;
  let clicks = 0;
  let outboundClicks = 0;
  let lastSent = 0;
  let pageviewSent = false;
  const heartbeatMs = Math.max(10000, Number(config.heartbeatMs || 15000));

  function normalize(v){return String(v||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^[-.]+|[-.]+$/g,"").slice(0,64) || "site";}
  function uuid(){return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;}
  function screenInfo(){return {width:screen.width,height:screen.height,devicePixelRatio:devicePixelRatio||1,colorDepth:screen.colorDepth||0};}
  function viewportInfo(){return {width:innerWidth,height:innerHeight};}
  function connectionInfo(){const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;return c ? {type:c.effectiveType||c.type||null,downlink:c.downlink,rtt:c.rtt,saveData:!!c.saveData}:null;}
  function payload(type, extra={}){return {siteId,siteName,eventType:type,type,sessionId,visitorId,timestamp:new Date().toISOString(),pageUrl:location.href,path:location.pathname+location.search,title:document.title,referrer:document.referrer,language:navigator.language,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,screen:screenInfo(),viewport:viewportInfo(),connection:connectionInfo(),durationMs:Date.now()-started,maxScroll,clicks,outboundClicks,metadata:{source:"github-page-insights-analytics",version:"1.0.0"},...extra};}
  function send(type,extra={}){const body=JSON.stringify(payload(type,extra)); if (!worker || lastSent && type==="pageview" && pageviewSent) return; lastSent=Date.now(); if (navigator.sendBeacon && body.length < 60000) {try{const blob=new Blob([body],{type:"application/json"}); if(navigator.sendBeacon(`${worker}/collect`,blob)) return true;}catch{} } fetch(`${worker}/collect`,{method:"POST",headers:{"Content-Type":"application/json"},body,keepalive:true,credentials:"omit"}).catch(()=>{}); return true;}
  function scrollPercent(){const root=document.documentElement;const max=Math.max(1,root.scrollHeight-innerHeight);return Math.min(100,Math.round((scrollY/max)*100));}
  send("pageview"); pageviewSent=true;
  const interval=setInterval(()=>send("heartbeat"),heartbeatMs);
  addEventListener("scroll",()=>{const p=scrollPercent();if(p>maxScroll){maxScroll=p;if(p===25||p===50||p===75||p===90||p===100)send("scroll");}},{passive:true});
  addEventListener("click",e=>{clicks++;const a=e.target?.closest?.("a[href]");if(a){try{const u=new URL(a.href,location.href);if(u.origin!==location.origin){outboundClicks++;send("outbound_click",{metadata:{href:a.href,text:(a.textContent||"").trim().slice(0,200)}});}}catch{}}});
  addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")send("visibility");});
  addEventListener("pagehide",()=>{clearInterval(interval);send("pageleave");});
  addEventListener("beforeunload",()=>send("pageleave"));
  window.GitHubPageInsights = {siteId,siteName,sessionId,visitorId,track:(type,metadata)=>send(String(type||"custom"),{metadata:metadata||{}}),flush:()=>send("heartbeat")};
})();
