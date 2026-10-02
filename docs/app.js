(function(){
  "use strict";

  const C = window.PAGE_INSIGHTS_CONFIG || {};
  const WORKER = String(C.workerUrl || "").replace(/\/+$/g, "");
  const state = {
    days: String(C.defaultRangeDays || 7),
    platform: "*",
    platforms: [],
    overview: null,
    detail: null,
    events: [],
    health: null,
    clientKind: "browser",
    loading: false,
    advanced: false,
    cache: loadCache(),
    lastPayloadSource: "none"
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    livePill: $("livePill"), liveText: $("liveText"), refresh: $("refreshBtn"),
    platform: $("platformSelect"), search: $("platformSearch"), range: $("rangeSeg"),
    lastSync: $("lastSync"), overall: $("overallBadge"), healthMeta: $("healthMeta"),
    heroStatus: $("heroStatus"), heroViews: $("heroViews"), heroVisitors: $("heroVisitors"), heroSessions: $("heroSessions"),
    platformBars: $("platformBars"), platformCount: $("platformCount"), traffic: $("trafficChart"), trafficInfo: $("trafficInfo"),
    eventsBody: $("eventsBody"), eventCount: $("eventCount"), advanced: $("advancedSection"),
    countries: $("countries"), clientRank: $("clientRank"), ips: $("ips"), topPages: $("topPages"),
    sources: $("sources"), eventTypes: $("eventTypes"), statuses: $("statuses"),
    drawer: $("eventDrawer"), backdrop: $("drawerBackdrop"), drawerTitle: $("drawerTitle"), drawerBody: $("drawerBody"),
    detailModal: $("detailModal"), detailModalTitle: $("detailModalTitle"), detailModalBody: $("detailModalBody"),
    footerVersion: $("footVersion"), toasts: $("toasts")
  };

  const num = (v) => new Intl.NumberFormat("en-US").format(Number(v) || 0);
  const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const pick = (obj, ...keys) => { for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k]; return null; };
  const fmtDate = (value) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined,{month:"short",day:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}); };
  const ago = (value) => { const d = new Date(value).getTime(); if(!Number.isFinite(d)) return "—"; const s=Math.max(0,Math.floor((Date.now()-d)/1000)); if(s<60)return `${s}s ago`; if(s<3600)return `${Math.floor(s/60)}m ago`; if(s<86400)return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago`; };
  const duration = (ms) => { const s=Math.max(0,Math.round(n(ms)/1000)); if(s<60)return `${s}s`; const m=Math.floor(s/60); if(m<60)return `${m}m ${s%60}s`; return `${Math.floor(m/60)}h ${m%60}m`; };
  const safeArray = (x) => Array.isArray(x) ? x : [];

  function toast(message, kind="info") {
    if (!el.toasts) return;
    const node=document.createElement("div"); node.className=`toast ${kind}`; node.textContent=message; el.toasts.appendChild(node);
    setTimeout(()=>node.remove(),4500);
  }

  function setLive(kind,text) {
    if(!el.livePill) return;
    el.livePill.classList.remove("ok","error");
    if(kind) el.livePill.classList.add(kind);
    if(el.liveText) el.liveText.textContent=text;
  }

  function updateLastSync() {
    if(el.lastSync) el.lastSync.textContent=`Updated ${new Date().toLocaleTimeString()}`;
  }

  function buildUrl(path, params) {
    const q = new URLSearchParams(params || {});
    const suffix=q.toString(); return `${WORKER}${path}${suffix ? (path.includes("?")?"&":"?")+suffix : ""}`;
  }

  async function api(path, params={}, options={}) {
    if(!WORKER) throw new Error("Worker URL is missing.");
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),Number(C.requestTimeoutMs||12000));
    try{
      const response=await fetch(buildUrl(path,params),{cache:"no-store",signal:controller.signal,headers:{Accept:"application/json",...(options.headers||{})}});
      let body=null; try{body=await response.json();}catch{}
      if(!response.ok) throw new Error(`HTTP ${response.status}${body?.error?` — ${body.error}`:""}`);
      return body;
    } finally { clearTimeout(timer); }
  }

  function cacheKey(){return `${state.platform}|${state.days}`;}
  function loadCache(){try{return JSON.parse(localStorage.getItem("uei_dashboard_v121")||"{}");}catch{return {};}}
  function saveCache(){try{localStorage.setItem("uei_dashboard_v121",JSON.stringify(state.cache));}catch{}}

  function currentData(){ return state.platform === "*" ? (state.overview || {}) : (state.detail || {}); }
  function totals(d){ const t=d?.totals||{}; return {events:n(pick(t,"events")),views:n(pick(t,"pageviews","views")),visitors:n(pick(t,"uniqueVisitors","visitors")),sessions:n(pick(t,"sessions")),duration:n(pick(t,"avgDurationMs")),scroll:n(pick(t,"avgScroll"))}; }

  function populatePlatforms(filter="") {
    const q=String(filter).trim().toLowerCase();
    if(!el.platform)return;
    el.platform.innerHTML="";
    const all=document.createElement("option"); all.value="*"; all.textContent="All platforms"; el.platform.appendChild(all);
    safeArray(state.platforms).filter(p=>!q || String(p.platformName||"").toLowerCase().includes(q) || String(p.platformId||"").toLowerCase().includes(q)).forEach(p=>{
      const o=document.createElement("option");o.value=p.platformId;o.textContent=`${p.platformName||p.platformId} · ${p.platformId}`;el.platform.appendChild(o);
    });
    el.platform.value=state.platform;
  }

  function renderKpis(d){
    const t=totals(d), platformCount=state.platform === "*" ? state.platforms.length : 1;
    if($("k-platforms")) $("k-platforms").textContent=num(platformCount);
    if($("k-platforms-sub")) $("k-platforms-sub").textContent=state.platform === "*" ? "Discovered automatically" : (d.platform?.platformName||state.platform);
    if($("k-pageviews")) $("k-pageviews").textContent=num(t.views);
    if($("k-visitors")) $("k-visitors").textContent=num(t.visitors);
    if($("k-sessions")) $("k-sessions").textContent=num(t.sessions);
    if($("k-events")) $("k-events").textContent=num(t.events);
    if($("k-duration")) $("k-duration").textContent=duration(t.duration);
    if($("k-scroll")) $("k-scroll").textContent=`${Math.round(t.scroll)}%`;
    const latest=safeArray(d.recentEvents)[0];
    if($("k-last")) $("k-last").textContent=latest?ago(latest.receivedAt):"—";
    if($("k-last-sub")) $("k-last-sub").textContent=latest?`${latest.eventType||"event"} · ${latest.platformId||state.platform}`:"Waiting for telemetry";
    if(el.heroViews) el.heroViews.textContent=num(t.views);
    if(el.heroVisitors) el.heroVisitors.textContent=`${num(t.visitors)} visitors`;
    if(el.heroSessions) el.heroSessions.textContent=`${num(t.sessions)} sessions`;
    if(el.heroStatus) el.heroStatus.textContent=state.lastPayloadSource === "cache" ? "Showing last good snapshot" : "Live telemetry loaded";
  }

  function renderHealth(h){
    state.health=h||null;
    const overall=String(h?.overall||"unknown").toLowerCase();
    if(el.overall){el.overall.textContent=overall.toUpperCase();el.overall.className=`status-badge ${overall}`;}
    const checks=h?.checks||{};
    const setCard=(id,status,label,detail)=>{const node=$(id);if(!node)return;node.className=`health-card ${status||"unknown"}`;node.innerHTML=`<span>${label[0]}</span><b>${esc(label)}</b><strong>${esc(String(status||"unknown").toUpperCase())}</strong><small>${esc(detail||"")}</small>`;};
    setCard("h-worker",checks.worker?.status||"unknown","⚙️ Worker",checks.worker?.version||"Runtime");
    setCard("h-d1",checks.database?.status||"unknown","🗄️ D1",checks.database?.message||"Database");
    setCard("h-gh",checks.github?.status||"unknown","📦 GitHub",checks.github?.message||"Archive");
    const tg=checks.configuration?.telegramConfigured ? "ok" : (checks.configuration?.telegramEnabled ? "warning" : "warning");
    setCard("h-tg",tg,"🤖 Telegram",checks.configuration?.telegramConfigured?"Configured":"Not configured");
    if(el.healthMeta) el.healthMeta.textContent=`${fmtDate(h?.generatedAt)} · ${checks.database?.counts?.events??0} events · ${checks.database?.counts?.platforms??0} platforms`;
  }

  function renderTraffic(rows){
    const list=safeArray(rows); if(!el.traffic)return;
    if(!list.length){el.traffic.innerHTML='<div class="empty">No activity in this range.</div>';if(el.trafficInfo)el.trafficInfo.textContent="0 events";return;}
    const width=1000,height=300,pad={l:44,r:18,t:24,b:36},max=Math.max(1,...list.map(r=>n(pick(r,"events","pageviews","views"))));
    const xs=i=>pad.l+(list.length===1?(width-pad.l-pad.r)/2:i*(width-pad.l-pad.r)/(list.length-1));
    const ys=v=>height-pad.b-(v/max)*(height-pad.t-pad.b);
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox",`0 0 ${width} ${height}`);svg.setAttribute("role","img");svg.setAttribute("aria-label","Activity trend");
    const defs=document.createElementNS("http://www.w3.org/2000/svg","defs"),grad=document.createElementNS("http://www.w3.org/2000/svg","linearGradient");grad.id="trafficGradient";grad.setAttribute("x1","0");grad.setAttribute("x2","0");grad.setAttribute("y1","0");grad.setAttribute("y2","1");
    const s1=document.createElementNS("http://www.w3.org/2000/svg","stop");s1.setAttribute("offset","0%");s1.setAttribute("stop-color","rgba(114,228,255,.24)");const s2=document.createElementNS("http://www.w3.org/2000/svg","stop");s2.setAttribute("offset","100%");s2.setAttribute("stop-color","rgba(114,228,255,0)");grad.append(s1,s2);defs.appendChild(grad);svg.appendChild(defs);
    for(let i=0;i<4;i++){const y=pad.t+i*(height-pad.t-pad.b)/3,l=document.createElementNS("http://www.w3.org/2000/svg","line");l.setAttribute("x1",pad.l);l.setAttribute("x2",width-pad.r);l.setAttribute("y1",y);l.setAttribute("y2",y);l.setAttribute("class","chart-grid");svg.appendChild(l);}
    let path=""; list.forEach((r,i)=>{const v=n(pick(r,"events","pageviews","views"));path+=`${i?"L":"M"} ${xs(i)} ${ys(v)}`;});
    const area=document.createElementNS("http://www.w3.org/2000/svg","path");area.setAttribute("d",`${path} L ${xs(list.length-1)} ${height-pad.b} L ${xs(0)} ${height-pad.b} Z`);area.setAttribute("class","chart-area");svg.appendChild(area);
    const line=document.createElementNS("http://www.w3.org/2000/svg","path");line.setAttribute("d",path);line.setAttribute("class","chart-line");svg.appendChild(line);
    list.forEach((r,i)=>{if(i===0 || i===list.length-1 || i%Math.max(1,Math.ceil(list.length/7))===0){const c=document.createElementNS("http://www.w3.org/2000/svg","circle");c.setAttribute("cx",xs(i));c.setAttribute("cy",ys(n(pick(r,"events","pageviews","views"))));c.setAttribute("r",5);c.setAttribute("class","chart-dot");c.addEventListener("mouseenter",()=>{if(el.trafficInfo)el.trafficInfo.textContent=`${r.day||"day"} · ${num(pick(r,"events","pageviews","views"))} events`});svg.appendChild(c);}});
    el.traffic.innerHTML="";el.traffic.appendChild(svg);if(el.trafficInfo)el.trafficInfo.textContent=`${num(list.reduce((a,r)=>a+n(pick(r,"events","pageviews","views")),0))} events`;
  }

  function renderPlatforms(rows){
    const list=safeArray(rows), max=Math.max(1,...list.map(r=>n(r.totalEvents))); if(el.platformCount)el.platformCount.textContent=`${num(list.length)} found`;
    if(!el.platformBars){return;} if(!list.length){el.platformBars.innerHTML='<div class="empty">No connected platforms yet.</div>';return;}
    el.platformBars.innerHTML=list.slice(0,15).map((r,i)=>`<div class="platform-row" data-platform="${esc(r.platformId)}"><div class="platform-name"><strong>${esc(r.platformName||r.platformId)}</strong><small>${esc(r.platformId||"")} · ${esc(r.platformType||"generic")}</small></div><div class="platform-track"><div class="platform-fill" style="width:${Math.max(3,Math.round(n(r.totalEvents)/max*100))}%"></div></div><div class="platform-value">${num(r.totalPageviews||r.totalEvents||0)}</div></div>`).join("");
    el.platformBars.querySelectorAll("[data-platform]").forEach(node=>node.addEventListener("click",()=>{state.platform=node.dataset.platform;populatePlatforms(el.search?.value||"");loadData();}));
  }

  function rankRows(target, rows, labelKeys, valueKeys, secondaryKeys=[]){
    if(!target)return; const list=safeArray(rows).filter(Boolean).slice(0,12);
    if(!list.length){target.innerHTML='<div class="empty">No data available for this range.</div>';return;}
    target.innerHTML=list.map((r,i)=>{const label=pick(r,...labelKeys)||"Unknown";const value=n(pick(r,...valueKeys));const secondary=secondaryKeys.map(k=>pick(r,k)).filter(Boolean).join(" · ");return `<div class="rank-row"><div class="rank-no">${i+1}</div><div class="rank-main"><strong>${esc(label)}</strong>${secondary?`<small>${esc(secondary)}</small>`:""}</div><div class="rank-value">${num(value)}</div></div>`;}).join("");
  }

  function renderAdvanced(d){
    rankRows(el.countries,d.countries||[],["label","country"],["count","events"]);
    const rows=state.clientKind==="browser"?d.browsers:state.clientKind==="os"?d.operatingSystems:d.devices;
    const keys=state.clientKind==="browser"?["browser"]:state.clientKind==="os"?["os"]:["device"];
    rankRows(el.clientRank,rows,keys,["count","events"]);
    rankRows(el.ips,d.ips||[],["ip"],["count","events"],["city","country"]);
    rankRows(el.topPages,d.topPages||[],["title","path"],["views","count"],["path"]);
    const sourceRows = safeArray(d.sources).length ? d.sources : deriveSources(state.events);
    rankRows(el.sources,sourceRows,["label"],["count","events"]);
    const types = safeArray(d.eventTypes).length ? d.eventTypes : deriveCounts(state.events,e=>e.eventType||"custom");
    renderCards(el.eventTypes,types,(k)=>k);
    const statuses = safeArray(d.statuses).length ? d.statuses : deriveCounts(state.events,e=>String(e.responseStatus||"200"));
    renderCards(el.statuses,statuses,(k)=>`HTTP ${k}`);
  }

  function renderCards(target,map,labeler=(k)=>k){if(!target)return;const a=Array.from(map.entries()).sort((x,y)=>y[1]-x[1]).slice(0,10);target.innerHTML=a.length?a.map(([k,v])=>`<div class="event-type-card"><b>${esc(labeler(k))}</b><span>${num(v)}</span></div>`).join(""):"<div class='empty'>No data available.</div>";}
  function deriveCounts(events,keyFn){const m=new Map();safeArray(events).forEach(e=>{const k=String(keyFn(e));m.set(k,(m.get(k)||0)+1)});return m;}
  function deriveSources(events){return Array.from(deriveCounts(events,e=>e.referrerHost||e.utmSource||"direct"),([label,count])=>({label,count}));}

  function renderEvents(rows){
    const list=safeArray(rows).slice(0,Number(C.recentLimit||60));state.events=list;if(el.eventCount)el.eventCount.textContent=num(list.length);
    if(!el.eventsBody)return;
    el.eventsBody.innerHTML=list.length?list.map((r,i)=>`<tr data-event-index="${i}"><td title="${esc(fmtDate(r.receivedAt))}">${esc(ago(r.receivedAt))}</td><td><strong>${esc(r.platformName||r.platformId||"—")}</strong></td><td><span class="pill-type">${esc(r.eventType||"custom")}</span></td><td class="ip-text">${esc(r.ip||"—")}</td><td>${esc([r.city,r.region,r.country].filter(Boolean).join(" · ")||"—")}</td><td>${esc([r.device,r.os].filter(Boolean).join(" · ")||"—")}</td><td class="page-text" title="${esc(r.path||r.pageUrl||"")}">${esc(r.path||r.title||r.pageUrl||"—")}</td></tr>`).join(""):`<tr><td colspan="7"><div class="empty">No events found.</div></td></tr>`;
    el.eventsBody.querySelectorAll("[data-event-index]").forEach(row=>row.addEventListener("click",()=>openEvent(list[Number(row.dataset.eventIndex)])));
  }

  function normalizePlatformResponse(b){
    if(!b || typeof b!=="object") return null;
    return b.ok===false ? null : b;
  }

  async function loadGlobal(){
    const key=cacheKey();
    const [overviewResult, healthResult] = await Promise.allSettled([
      api("/v1/overview",{days:state.days,lite:1}),
      api("/v1/health",{quick:1})
    ]);

    if(overviewResult.status === "fulfilled") state.platforms=safeArray(overviewResult.value?.platforms);
    if(overviewResult.status === "fulfilled") {
      state.overview=overviewResult.value;
      state.cache[key]={...(state.cache[key]||{}),platforms:state.platforms,overview:state.overview};
      state.lastPayloadSource="live";
      saveCache();
    } else {
      const cached=state.cache[key];
      if(!cached?.overview) throw overviewResult.reason || new Error("Overview unavailable.");
      state.overview=cached.overview;
      state.platforms=safeArray(cached.platforms || state.platforms);
      state.lastPayloadSource="cache";
      toast(`Live overview unavailable. Showing the last good snapshot. ${overviewResult.reason?.message || ""}`.trim(),"error");
    }

    if(healthResult.status === "fulfilled") renderHealth(healthResult.value);
    else if(!state.health && state.lastPayloadSource === "cache") renderHealth({overall:"degraded",generatedAt:null,checks:{}});

    populatePlatforms(el.search?.value||"");
    renderAll();
    return overviewResult.status === "fulfilled";
  }
  async function loadPlatform(){
    if(state.platform==="*") return loadGlobal();
    const key=cacheKey();
    try{
      const detail=normalizePlatformResponse(await api(`/v1/platforms/${encodeURIComponent(state.platform)}`,{days:state.days,...(state.advanced?{}:{lite:1})}));
      if(!detail) throw new Error("Platform not found.");
      state.detail=detail;
      state.lastPayloadSource="live";
      state.cache[key]={...(state.cache[key]||{}),platforms:state.platforms,detail};
      saveCache();
      populatePlatforms(el.search?.value||"");
      renderAll();
      return true;
    }catch(error){
      const cached=state.cache[key];
      if(cached?.detail){
        state.detail=cached.detail;
        state.lastPayloadSource="cache";
        populatePlatforms(el.search?.value||"");
        renderAll();
        toast(`Platform refresh failed. Showing the last good snapshot. ${error.message}`,"error");
        return false;
      }
      throw error;
    }
  }
  function renderVisitorSnapshot(d){
    if(!el.visitorSnapshot) return;
    const latest=safeArray(d?.recentEvents)[0];
    if(!latest){
      el.visitorSnapshot.innerHTML='<div class="empty compact">No pageview has been recorded in this range yet.</div>';
      if(el.visitorSnapshotSub)el.visitorSnapshotSub.textContent="The latest pageview carries the visitor context in the same request.";
      return;
    }
    const items=[
      ["🌐 IP",latest.ip], ["📍 Location",[latest.city,latest.region,latest.country].filter(Boolean).join(" · ")],
      ["🗺️ IP coordinates",[latest.latitude,latest.longitude].filter(Boolean).join(", ")],
      ["🏢 ASN / Network",[latest.asn,latest.asOrganization].filter(Boolean).join(" · ")],
      ["📡 Cloudflare POP",latest.colo], ["💻 Device",[latest.device,latest.deviceVendor,latest.deviceModel].filter(Boolean).join(" ")],
      ["🌍 Operating system",[latest.os,latest.osVersion].filter(Boolean).join(" ")], ["🧭 Browser",[latest.browser,latest.browserVersion].filter(Boolean).join(" ")],
      ["🖥️ Screen",[latest.screenWidth,latest.screenHeight].filter(Boolean).join(" × ")], ["↔️ Viewport",[latest.viewportWidth,latest.viewportHeight].filter(Boolean).join(" × ")],
      ["🧮 Pixel ratio",latest.devicePixelRatio], ["🗣️ Language",latest.language], ["🕒 Timezone",latest.timezone],
      ["📶 Connection",[latest.connectionType,latest.connectionDownlink?`${latest.connectionDownlink} Mbps`:null,latest.connectionRtt?`${latest.connectionRtt} ms RTT`:null].filter(Boolean).join(" · ")],
      ["🔗 Referrer",latest.referrerHost||latest.referrer], ["📄 Page",latest.path||latest.pageUrl], ["🧑 Visitor ID",latest.visitorId], ["🪪 Session ID",latest.sessionId]
    ];
    el.visitorSnapshot.innerHTML=items.map(([label,value])=>`<div class="visitor-item"><span>${esc(label)}</span><strong>${esc(value||"Not available")}</strong></div>`).join("");
    if(el.visitorSnapshotSub)el.visitorSnapshotSub.textContent=`Captured ${fmtDate(latest.receivedAt)} · ${esc(latest.eventType||"pageview")} · client context resolved by Worker`;
  }

  function renderAll(){
    const d=currentData();renderKpis(d);renderVisitorSnapshot(d);renderTraffic(d.daily||[]);renderPlatforms(state.platform==="*"?(d.platforms||state.platforms):state.platforms.filter(p=>p.platformId===state.platform));renderEvents(d.recentEvents||[]);
    if(el.footerVersion)el.footerVersion.textContent=String(state.health?.version||C.appVersion||"—");
    if(state.advanced)renderAdvanced(d);
    updateLastSync();setLive(state.lastPayloadSource==="cache"?"error":"ok",state.lastPayloadSource==="cache"?"Cached":"Live");
  }

  function openEvent(event){
    if(!event||!el.drawer)return;
    el.drawerTitle.textContent=event.eventId||event.eventType||"Event";
    const pairs=[
      ["Event ID",event.eventId],["Type",event.eventType],["Platform",event.platformName||event.platformId],["Received",fmtDate(event.receivedAt)],
      ["IP",event.ip],["IP hash",event.ipHash],["Country",event.country],["Region",event.region],["City",event.city],["ASN",event.asn],
      ["Browser",[event.browser,event.browserVersion].filter(Boolean).join(" ")],["OS",[event.os,event.osVersion].filter(Boolean).join(" ")],
      ["Device",[event.device,event.deviceVendor,event.deviceModel].filter(Boolean).join(" ")],["Screen",[event.screenWidth,event.screenHeight].filter(Boolean).join(" × ")],["Viewport",[event.viewportWidth,event.viewportHeight].filter(Boolean).join(" × ")],
      ["Pixel ratio",event.devicePixelRatio],["Language",event.language],["Timezone",event.timezone],["Connection",[event.connectionType,event.connectionDownlink?`${event.connectionDownlink} Mbps`:null,event.connectionRtt?`${event.connectionRtt} ms RTT`:null].filter(Boolean).join(" · ")],
      ["Coordinates",[event.latitude,event.longitude].filter(Boolean).join(", ")],["Postal / Metro",[event.postalCode,event.metroCode].filter(Boolean).join(" / ")],
      ["Cloudflare POP",event.colo],["ASN / Organization",[event.asn,event.asOrganization].filter(Boolean).join(" · ")],["Page",event.pageUrl||event.path],["Referrer",event.referrer||event.referrerHost],
      ["Duration",duration(event.durationMs)],["Scroll",`${n(event.maxScroll)}%`],["Clicks",event.clicks],["Outbound clicks",event.outboundClicks],["Request ID",event.requestId],["CF-Ray",event.cfRay]
    ];
    const block=(label,value)=>`<div class="detail-item"><span>${esc(label)}</span><b>${esc(value??"—")}</b></div>`;
    const jsonBlock=(label,value)=>`<div class="json-box"><header>${esc(label)}</header><pre>${esc(pretty(value))}</pre></div>`;
    el.drawerBody.innerHTML=`<div class="detail-grid">${pairs.map(p=>block(...p)).join("")}</div>${jsonBlock("data_json",parseJson(event.dataJson))}${jsonBlock("metadata_json",parseJson(event.metadataJson))}${jsonBlock("request_json",parseJson(event.requestJson))}${jsonBlock("cf_json",parseJson(event.cfJson))}`;
    el.drawer.classList.add("open");el.backdrop?.classList.add("open");el.drawer.setAttribute("aria-hidden","false");
  }
  function closeDrawer(){el.drawer?.classList.remove("open");el.backdrop?.classList.remove("open");el.drawer?.setAttribute("aria-hidden","true");}
  function parseJson(v){if(v==null||v==="")return {};try{return typeof v==="string"?JSON.parse(v):v}catch{return v;}}
  function pretty(v){try{return JSON.stringify(v,null,2)}catch{return String(v??"")}}

  async function openAdvanced(){
    if(!el.advanced)return;
    state.advanced=true;
    el.advanced.classList.remove("hidden");
    try{
      if(state.platform==="*"){
        const full=await api("/v1/overview",{days:state.days});
        state.overview={...(state.overview||{}),...full};
      }else{
        const full=await api(`/v1/platforms/${encodeURIComponent(state.platform)}`,{days:state.days});
        state.detail=full;
      }
      state.lastPayloadSource="live";
      const key=cacheKey();
      state.cache[key]={...(state.cache[key]||{}),platforms:state.platforms,overview:state.overview,detail:state.detail};
      saveCache();
      renderAll();
      toast("Advanced analytics loaded.","success");
    }catch(error){
      renderAdvanced(currentData());
      toast(`Advanced analytics unavailable: ${error.message}`,"error");
    }
    el.advanced.scrollIntoView({behavior:"smooth",block:"start"});
  }
  function closeAdvanced(){state.advanced=false;el.advanced?.classList.add("hidden");}

  function exportCsv(){
    const rows=state.events||[];if(!rows.length){toast("There are no events to export.","error");return;}
    const cols=["receivedAt","eventId","platformId","eventType","ip","country","region","city","browser","os","device","path","durationMs","maxScroll","clicks","outboundClicks"];
    const csv=[cols.join(","),...rows.map(r=>cols.map(k=>`"${String(r?.[k]??"").replace(/"/g,'""')}"`).join(","))].join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`uei-events-${new Date().toISOString().slice(0,19).replace(/:/g,"-")}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function bind(){
    el.refresh?.addEventListener("click",()=>loadData(true));
    el.platform?.addEventListener("change",async(e)=>{state.platform=e.target.value;state.detail=null;setLive(null,"Loading");try{await loadData(true);}catch(err){setLive("error","Offline");toast(err.message,"error");}});
    el.search?.addEventListener("input",()=>populatePlatforms(el.search.value));
    el.range?.querySelectorAll("button").forEach(btn=>btn.addEventListener("click",async()=>{el.range.querySelectorAll("button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");state.days=btn.dataset.days;try{await loadData(true);}catch(err){toast(err.message,"error");}}));
    document.querySelectorAll("#clientTabs button")?.forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll("#clientTabs button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");state.clientKind=btn.dataset.kind;renderAdvanced(currentData());}));
    $("advancedBtn")?.addEventListener("click",()=>state.advanced?closeAdvanced():openAdvanced());
    $("advancedCloseBtn")?.addEventListener("click",closeAdvanced);
    $("exportBtn")?.addEventListener("click",exportCsv);
    $("closeDrawer")?.addEventListener("click",closeDrawer);el.backdrop?.addEventListener("click",closeDrawer);
    $("closeDetailModal")?.addEventListener("click",()=>$("detailModal")?.classList.remove("open"));
    document.addEventListener("keydown",e=>{if(e.key==="Escape"){closeDrawer();$("detailModal")?.classList.remove("open");}});
  }

  async function loadData(manual=false){
    if(state.loading)return;state.loading=true;if(manual)setLive(null,"Refreshing");
    try{await (state.platform==="*"?loadGlobal():loadPlatform());}
    catch(error){setLive("error","Offline");toast(`Unable to load analytics: ${error.message}`,"error");}
    finally{state.loading=false;}
  }

  async function init(){
    bind();setLive(null,"Connecting");
    try{await loadData(false);}catch(e){toast(e.message,"error");}
    const interval=Math.max(120000,Number(C.autoRefreshMs||180000));
    setInterval(()=>{if(!document.hidden)loadData(false);},interval);
    setInterval(()=>{if(!document.hidden && state.health)api("/v1/health",{quick:1}).then(h=>{renderHealth(h);}).catch(()=>{});},Math.max(180000,Number(C.healthRefreshMs||300000)));
  }

  init();
})();
