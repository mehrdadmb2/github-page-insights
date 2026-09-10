(() => {
  "use strict";
  const C = window.PAGE_INSIGHTS_CONFIG || {};
  const WORKER = String(C.workerUrl || "").replace(/\/+$/, "");
  const state = { sites: [], selected: null, range: String(C.defaultRangeDays || 7), stats: null, health: null, loading: false, healthLoading: false, timer: null, cache: new Map() };
  const $ = s => document.querySelector(s);
  const el = {
    boot: $("#boot"), bootPct: $("#bootPct"), bootLine: $("#bootLine"), bootLineText: $("#bootLineText"),
    status: $("#statusText"), lastSync: $("#lastSync"),
    refresh: $("#refreshBtn"), theme: $("#themeBtn"), focus: $("#focusBtn"), allSites: $("#allSitesBtn"), railRefresh: $("#railRefresh"),
    healthCenter: $("#healthCenter"), healthOverall: $("#healthOverall"), healthRefresh: $("#healthRefreshBtn"),
    workerStatus: $("#healthWorkerStatus"), workerMeta: $("#healthWorkerMeta"), dbStatus: $("#healthDbStatus"), dbMeta: $("#healthDbMeta"), ghStatus: $("#healthGithubStatus"), ghMeta: $("#healthGithubMeta"), telStatus: $("#healthTelemetryStatus"), telMeta: $("#healthTelemetryMeta"), healthEvents: $("#healthEventsCount"), healthSites: $("#healthSitesCount"), healthSessions: $("#healthSessionsCount"), healthRate: $("#healthRate"), healthLast: $("#healthLastEvent"), healthLatency: $("#healthLatency"),
    siteSearch: $("#siteSearch"), siteList: $("#siteList"), siteCount: $("#siteCount"), siteBadge: $("#siteBadge"), inventory: $("#inventoryState"),
    range: $("#rangeSelect"), rangeBadge: $("#rangeBadge"), siteTitle: $("#siteTitle"), siteMeta: $("#siteMeta"), siteAvatar: $("#siteAvatar"), metrics: $("#metrics"),
    traffic: $("#trafficChart"), trafficEmpty: $("#trafficEmpty"), trafficSummary: $("#trafficSummary"), donut: $("#deviceDonut"), deviceCenter: $("#deviceCenter"), deviceLegend: $("#deviceLegend"),
    country: $("#countryList"), pages: $("#pageList"), browser: $("#browserList"), os: $("#osList"), ips: $("#ipList"), ipSummary: $("#ipSummary"), recent: $("#recentRows"), recentStatus: $("#recentStatus"), events: $("#eventCloud"), toast: $("#toastStack"), heroEdge: $("#heroEdge")
  };
  const palette = ["#5df7ff", "#8b6cff", "#ff5fd2", "#c6ff5a", "#ffad5c", "#56a6ff"];
  init();

  async function init() {
    bind(); boot(); applyTheme(localStorage.getItem("gpi-theme") || "dark");
    try {
      await Promise.allSettled([runHealth(), discoverSites()]);
      await refresh(false);
      state.timer = setInterval(() => { if (!document.hidden) refresh(true); }, Math.max(20000, Number(C.autoRefreshMs || 45000)));
    } catch (e) { fail(e, "Initialization failed."); }
  }

  function bind() {
    el.refresh.onclick = () => refresh(false);
    el.railRefresh.onclick = () => discoverSites();
    el.healthRefresh.onclick = () => runHealth();
    el.theme.onclick = () => applyTheme(document.documentElement.classList.contains("light") ? "dark" : "light");
    el.focus.onclick = () => document.querySelector("#explorer")?.scrollIntoView({ behavior: "smooth" });
    el.allSites.onclick = () => selectSite(null);
    el.siteSearch.oninput = renderSites;
    el.range.onchange = () => { state.range = el.range.value; refresh(false); };
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(true); });
    addEventListener("resize", debounce(() => drawTraffic(state.stats?.series || []), 120));
  }

  function boot() {
    let n = 0;
    const t = setInterval(() => {
      n = Math.min(100, n + Math.floor(5 + Math.random() * 18));
      el.bootPct.textContent = `${n}%`; el.bootLine.style.width = `${n}%`;
      el.bootLineText.textContent = n < 35 ? "Connecting to analytics edge…" : n < 70 ? "Validating data plane…" : n < 95 ? "Hydrating project inventory…" : "Ready.";
      if (n >= 100) { clearInterval(t); setTimeout(() => el.boot.classList.add("hide"), 400); }
    }, 80);
  }

  function applyTheme(theme) { document.documentElement.classList.toggle("light", theme === "light"); localStorage.setItem("gpi-theme", theme); if (state.stats) drawTraffic(state.stats.series || []); }

  async function discoverSites() {
    el.inventory.textContent = "DISCOVERING";
    try {
      const data = await workerJson("/api/sites");
      const list = Array.isArray(data) ? data : Array.isArray(data?.sites) ? data.sites : [];
      state.sites = list.map(s => ({ siteId: s.siteId || s.site_id, siteName: s.siteName || s.site_name || s.siteId || "Unknown", views: Number(s.views || 0), uniqueVisitors: Number(s.uniqueVisitors || 0), sessions: Number(s.sessions || 0), lastSeen: s.lastSeen || s.last_seen || null })).filter(s => s.siteId);
      state.sites.sort((a,b) => String(a.siteName).localeCompare(String(b.siteName)));
      if (state.selected && !state.sites.some(s => s.siteId === state.selected)) state.selected = null;
      el.siteCount.textContent = `${state.sites.length} site${state.sites.length === 1 ? "" : "s"}`;
      el.inventory.textContent = state.sites.length ? "READY" : "NO DATA";
      el.siteBadge.textContent = "AUTO";
      renderSites();
      return state.sites;
    } catch (e) {
      el.inventory.textContent = "WORKER OFFLINE";
      state.sites = readCache("sites") || [];
      renderSites();
      throw e;
    }
  }

  function renderSites() {
    const q = String(el.siteSearch.value || "").trim().toLowerCase();
    const items = state.sites.filter(s => !q || `${s.siteName} ${s.siteId}`.toLowerCase().includes(q));
    el.siteList.innerHTML = `<button class="site-row ${state.selected === null ? "active" : ""}" data-site="__all__"><span class="site-mark">ALL</span><span><b>All sites</b><small>${formatNumber(state.sites.reduce((a,s)=>a+s.views,0))} views</small></span></button>` + items.map(s => `<button class="site-row ${state.selected === s.siteId ? "active" : ""}" data-site="${escapeAttr(s.siteId)}"><span class="site-mark">${escapeHtml(initials(s.siteName))}</span><span><b>${escapeHtml(s.siteName)}</b><small>${formatNumber(s.views)} views · ${formatNumber(s.uniqueVisitors)} visitors</small></span></button>`).join("");
    el.siteList.querySelectorAll("[data-site]").forEach(btn => btn.addEventListener("click", () => selectSite(btn.dataset.site === "__all__" ? null : btn.dataset.site)));
  }

  function selectSite(siteId) { state.selected = siteId; renderSites(); refresh(false); }

  async function refresh(silent = false) {
    if (state.loading) return;
    state.loading = true;
    setGlobalStatus("SYNCING", "busy");
    try {
      const endpoint = state.selected ? `/api/site/${encodeURIComponent(state.selected)}?days=${encodeURIComponent(state.range)}` : `/api/overview?days=${encodeURIComponent(state.range)}`;
      const data = await workerJson(endpoint);
      state.stats = normalizeStats(data);
      renderAll();
      await loadRecent();
      el.lastSync.textContent = `Synced ${new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"})}`;
      setGlobalStatus("LIVE", "ok");
      if (!silent) toast("Analytics synchronized", "ok");
    } catch (e) {
      setGlobalStatus("DEGRADED", "warn");
      fail(e, "Analytics data could not be loaded. Check System Health.");
    } finally { state.loading = false; }
  }

  function normalizeStats(d) {
    const totals = d.totals || {};
    return {
      views: Number(d.views ?? d.totalViews ?? totals.views ?? totals.totalViews ?? 0),
      visitors: Number(d.uniqueVisitors ?? totals.uniqueVisitors ?? 0),
      sessions: Number(d.sessions ?? totals.sessions ?? 0),
      avgDurationMs: Number(d.avgDurationMs ?? totals.avgDurationMs ?? 0),
      avgScroll: Number(d.avgScroll ?? totals.avgScroll ?? 0),
      today: d.today || { views: 0, uniqueVisitors: 0, sessions: 0 },
      series: d.series || d.last7Days || d.daily || [],
      devices: d.devices || {}, countries: d.countries || [], browsers: d.browsers || [], operatingSystems: d.operatingSystems || [], ips: d.ips || [], topPages: d.topPages || d.pages || [], eventTypes: d.eventTypes || [], recentVisits: d.recentVisits || []
    };
  }

  function renderAll() {
    const s = state.stats; const name = state.selected ? (state.sites.find(x => x.siteId === state.selected)?.siteName || state.selected) : "All sites";
    el.siteTitle.textContent = name; el.siteMeta.textContent = state.selected ? `Site ID: ${state.selected}` : "Aggregate traffic across all connected pages"; el.siteAvatar.textContent = initials(name); el.rangeBadge.textContent = state.range === "all" ? "ALL TIME" : `${state.range} ${Number(state.range) === 1 ? "DAY" : "DAYS"}`;
    el.metrics.innerHTML = [
      metric("PAGEVIEWS", s.views, "traffic", "Across selected range"), metric("UNIQUE VISITORS", s.visitors, "people", "Distinct visitor IDs"), metric("SESSIONS", s.sessions, "sessions", "Observed browsing sessions"), metric("AVG. STAY", formatDuration(s.avgDurationMs), "time", "Latest observed duration"), metric("TODAY", s.today.views || 0, "views", "UTC day"), metric("SCROLL DEPTH", `${Math.round(s.avgScroll || 0)}%`, "engagement", "Average recorded depth")
    ].join("");
    drawTraffic(s.series); renderDevice(s.devices); renderRank(s.countries, el.country, x => x.country || x.label || "Unknown", x => Number(x.count || 0)); renderRank(s.topPages, el.pages, x => x.path || "/", x => Number(x.views ?? x.count ?? 0)); renderMini(s.browsers, el.browser, "browser"); renderMini(s.operatingSystems, el.os, "os"); renderIps(s.ips); renderEvents(s.eventTypes); el.heroEdge.textContent = "ONLINE";
  }

  function metric(label, value, sub, note) { return `<article class="metric"><div class="metric-top"><span>${escapeHtml(label)}</span><i></i></div><strong>${escapeHtml(String(value))}</strong><small>${escapeHtml(sub)} · ${escapeHtml(note)}</small></article>`; }

  function drawTraffic(rows) {
    const canvas = el.traffic, ctx = canvas.getContext("2d"); const box = canvas.getBoundingClientRect(); const dpr = devicePixelRatio || 1; const w = Math.max(320, Math.floor(box.width)); const h = 260; canvas.width = w*dpr; canvas.height = h*dpr; canvas.style.height = `${h}px`; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    const data = (rows || []).map(x => ({date: x.day || x.date, value: Number(x.views ?? x.pageviews ?? 0)})).filter(x => x.date); if (!data.length) { el.trafficEmpty.classList.remove("hide"); el.trafficSummary.textContent = "No data"; return; } el.trafficEmpty.classList.add("hide"); el.trafficSummary.textContent = `${formatNumber(data.reduce((a,b)=>a+b.value,0))} views`;
    const max = Math.max(1, ...data.map(x=>x.value)); const left=34,right=16,top=18,bottom=32,cw=w-left-right,ch=h-top-bottom; const grid = getComputedStyle(document.documentElement).getPropertyValue("--grid").trim() || "rgba(255,255,255,.08)"; ctx.strokeStyle=grid; ctx.lineWidth=1; for(let i=0;i<4;i++){const y=top+(ch*i/3);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(w-right,y);ctx.stroke();}
    const pts=data.map((x,i)=>[left+(data.length===1?cw/2:cw*i/(data.length-1)),top+ch-(x.value/max)*ch]); const grad=ctx.createLinearGradient(0,top,0,h);grad.addColorStop(0,"rgba(93,247,255,.34)");grad.addColorStop(1,"rgba(93,247,255,0)");ctx.beginPath();ctx.moveTo(pts[0][0],h-bottom);pts.forEach(p=>ctx.lineTo(p[0],p[1]));pts.length&&ctx.lineTo(pts[pts.length-1][0],h-bottom);ctx.closePath();ctx.fillStyle=grad;ctx.fill();ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.strokeStyle="#5df7ff";ctx.lineWidth=2.5;ctx.shadowBlur=12;ctx.shadowColor="#5df7ff";ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();ctx.font="10px Inter";data.forEach((x,i)=>{if(i%Math.max(1,Math.ceil(data.length/6))===0||i===data.length-1)ctx.fillText(shortDate(x.date),Math.max(left,pts[i][0]-18),h-10);});
  }

  function renderDevice(data) { const rows = Array.isArray(data) ? data.map(x=>({label:x.device||"Unknown",count:Number(x.count||0)})) : Object.entries(data || {}).map(([label,count])=>({label,count:Number(count||0)})); const total=Math.max(1,rows.reduce((a,b)=>a+b.count,0)); const top=rows.sort((a,b)=>b.count-a.count).slice(0,5); let acc=0; const stops=top.map((x,i)=>{const p=x.count/total*100;const s=`${palette[i%palette.length]} ${acc}% ${acc+p}%`;acc+=p;return s;}); if(!stops.length)stops.push("rgba(255,255,255,.07) 0% 100%"); el.donut.style.background=`conic-gradient(${stops.join(",")})`; const mobile=rows.filter(x=>/mobile/i.test(x.label)).reduce((a,b)=>a+b.count,0)/total*100; el.deviceCenter.textContent=`${Math.round(mobile)}%`; el.deviceLegend.innerHTML=top.length?top.map((x,i)=>`<div class="legend-row"><span><i style="background:${palette[i%palette.length]}"></i>${escapeHtml(x.label)}</span><b>${Math.round(x.count/total*100)}%</b></div>`).join(""):empty(); }

  function renderRank(rows,target,labelFn,countFn){const data=(Array.isArray(rows)?rows:[]).map(x=>({label:labelFn(x),count:countFn(x),title:x.title||""})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,8);const max=Math.max(1,...data.map(x=>x.count));target.innerHTML=data.length?data.map((x,i)=>`<div class="rank-row"><span class="rank-no">${String(i+1).padStart(2,"0")}</span><div class="rank-main"><b title="${escapeAttr(x.title||x.label)}">${escapeHtml(x.label)}</b><div class="bar"><i style="width:${Math.round(x.count/max*100)}%"></i></div></div><strong>${formatNumber(x.count)}</strong></div>`).join(""):empty();}
  function renderMini(rows,target,key){const data=(Array.isArray(rows)?rows:[]).map(x=>({label:x[key]||x.label||"Unknown",count:Number(x.count||0)})).sort((a,b)=>b.count-a.count).slice(0,6);const max=Math.max(1,...data.map(x=>x.count));target.innerHTML=data.length?data.map(x=>`<div class="mini-row"><span>${escapeHtml(x.label)}</span><div><i style="width:${Math.round(x.count/max*100)}%"></i></div><b>${formatCompact(x.count)}</b></div>`).join(""):empty();}
  function renderIps(rows){const data=(Array.isArray(rows)?rows:[]).sort((a,b)=>Number(b.count||0)-Number(a.count||0)).slice(0,12);el.ipSummary.textContent=`${data.length} top IPs`;el.ips.innerHTML=data.length?data.map((x,i)=>`<div class="ip-card"><div class="ip-rank">${String(i+1).padStart(2,"0")}</div><div><strong>${escapeHtml(x.ip||"—")}</strong><span>${escapeHtml([x.city,x.country].filter(Boolean).join(", ")||"Unknown location")}</span><small>${escapeHtml(x.browser||"Unknown")} · ${escapeHtml(x.os||"Unknown")} · ${escapeHtml(x.device||"Unknown")} ${x.asn?`· ASN ${escapeHtml(x.asn)}`:""}</small></div><b>${formatNumber(x.count||0)}</b></div>`).join(""):empty();}
  function renderEvents(rows){const data=(Array.isArray(rows)?rows:[]).sort((a,b)=>Number(b.count||0)-Number(a.count||0));el.events.innerHTML=data.length?data.map((x,i)=>`<span class="event-chip c${i%6}"><b>${escapeHtml(x.type||x.event_type||"custom")}</b><small>${formatNumber(x.count||0)}</small></span>`).join(""):empty();}

  async function loadRecent(){
    el.recentStatus.textContent = "loading…";
    let events=[];
    try {
      if (state.selected) events = state.stats?.recentVisits || [];
      else {
        const sites = state.sites.slice(0, Math.max(1, Number(C.maxRecentSites || 30)));
        const chunks = await promisePool(sites, Math.min(4, sites.length || 1), async site => { try { const d=await workerJson(`/api/site/${encodeURIComponent(site.siteId)}?days=${Math.min(3, Number(C.maxRecentDaysToScan||3))}`); return d.recentVisits || []; } catch { return []; }});
        events = chunks.flat();
      }
      events = events.sort((a,b)=>new Date(b.receivedAt||0)-new Date(a.receivedAt||0)).slice(0, Number(C.recentLimit||40));
      el.recent.innerHTML = events.length ? events.map(renderRecent).join("") : `<tr><td colspan="9" class="empty-cell">No visitor events recorded yet.</td></tr>`;
      el.recentStatus.textContent = `${events.length} events`;
    } catch { el.recent.innerHTML=`<tr><td colspan="9" class="empty-cell">Recent events unavailable.</td></tr>`; el.recentStatus.textContent="unavailable"; }
  }

  function renderRecent(e){const name=e.siteName||state.sites.find(s=>s.siteId===e.siteId)?.siteName||e.siteId||"—";const loc=[e.city,e.country].filter(Boolean).join(", ")||"Unknown";return `<tr><td>${escapeHtml(formatDateTime(e.receivedAt||e.occurredAt))}</td><td><span class="site-tag">${escapeHtml(name)}</span></td><td><code class="ip-code">${escapeHtml(e.ip||"—")}</code></td><td><span class="loc"><b>${escapeHtml(loc)}</b>${e.asn?`<small>ASN ${escapeHtml(e.asn)}</small>`:""}</span></td><td title="${escapeAttr(e.pageUrl||e.path||"")}">${escapeHtml(e.path||"/")}</td><td>${escapeHtml(e.device||"Unknown")}</td><td>${escapeHtml(e.browser||"Unknown")}</td><td>${escapeHtml(formatDuration(e.durationMs||0))}</td><td>${escapeHtml(e.referrerHost||"Direct")}</td></tr>`;}

  async function runHealth(){
    if(state.healthLoading) return; state.healthLoading=true; setHealth("warning","CHECKING","Running live diagnostics…");
    try {
      const d=await workerJson("/api/system-health"); state.health=d; const c=d.checks||{}; const overall=d.overall||"error"; setHealthOverall(overall); setCard(el.workerStatus,el.workerMeta,c.worker,`${c.worker?.latencyMs||0} ms`); setCard(el.dbStatus,el.dbMeta,c.database,`${c.database?.counts?.events||0} events · ${c.database?.counts?.sites||0} sites`); setCard(el.ghStatus,el.ghMeta,c.github,c.github?.rateLimit?`${c.github.rateLimit.remaining}/${c.github.rateLimit.limit} API calls left`:c.github?.message||"Unavailable"); setCard(el.telStatus,el.telMeta,c.telemetry,c.telemetry?.latestEventAt?`${age(c.telemetry.ageSeconds)} · ${c.telemetry.latestSiteId||"unknown site"}`:"No events yet"); el.healthEvents.textContent=formatNumber(c.database?.counts?.events||0); el.healthSites.textContent=formatNumber(c.database?.counts?.sites||0); el.healthSessions.textContent=formatNumber(c.database?.counts?.sessions||0); el.healthRate.textContent=c.github?.rateLimit?`${formatCompact(c.github.rateLimit.remaining)} / ${formatCompact(c.github.rateLimit.limit)}`:"—"; el.healthLast.textContent=c.telemetry?.latestEventAt?new Date(c.telemetry.latestEventAt).toLocaleString([], {month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"No events"; el.healthLatency.textContent=`${formatNumber(d.elapsedMs||0)} ms`; el.heroEdge.textContent=c.worker?.status==="ok"?"ONLINE":"DEGRADED";
    } catch (e) { setHealthOverall("error"); [ [el.workerStatus,el.workerMeta], [el.dbStatus,el.dbMeta], [el.ghStatus,el.ghMeta], [el.telStatus,el.telMeta] ].forEach(([s,m])=>setCard(s,m,{status:"error"},"Diagnostic endpoint unavailable")); el.healthLatency.textContent="—"; console.error(e); }
    finally { state.healthLoading=false; }
  }
  function setHealthOverall(v){el.healthOverall.className=`health-overall ${v}`;el.healthOverall.querySelector("b").textContent=v.toUpperCase();}
  function setHealth(status,text,meta){setHealthOverall(status); el.healthWorkerMeta.textContent=meta; el.healthWorkerStatus.textContent=text;}
  function setCard(s,m,check,meta){const status=check?.status||"error";s.textContent=labelStatus(status);m.textContent=meta;const card=s.closest(".health-card");if(card)card.dataset.status=status;}

  function setGlobalStatus(text, mode){el.status.className=`status-pill ${mode}`;el.status.innerHTML=`<i></i>${escapeHtml(text)}`;}
  function labelStatus(s){return ({ok:"Operational",warning:"Warning",error:"Error",stale:"Stale",idle:"Waiting"})[s]||"Unknown";}
  function age(sec){const n=Number(sec||0);return n<60?`${n}s ago`:n<3600?`${Math.floor(n/60)}m ago`:n<86400?`${Math.floor(n/3600)}h ago`:`${Math.floor(n/86400)}d ago`;}
  function promisePool(items, concurrency, fn){let i=0;const workers=Array.from({length:Math.max(1,concurrency)},async()=>{const out=[];while(i<items.length){const idx=i++;out[idx]=await fn(items[idx]);}return out;});return Promise.all(workers).then(parts=>parts.flat());}
  async function workerJson(path){const r=await fetch(`${WORKER}${path}`,{cache:"no-store",headers:{Accept:"application/json"}});if(!r.ok){let t="";try{t=await r.text();}catch{}throw new Error(`Worker ${r.status}: ${t.slice(0,400)}`);}return r.json();}
  function fail(err,msg){console.error(err);toast(msg,"error");}
  function toast(msg,kind="ok"){const n=document.createElement("div");n.className=`toast ${kind}`;n.textContent=msg;el.toast.appendChild(n);setTimeout(()=>n.remove(),4200);}
  function empty(){return `<div class="empty">No data available.</div>`;}
  function formatNumber(n){return new Intl.NumberFormat().format(Number(n)||0);} function formatCompact(n){const x=Number(n)||0;return x>=1e6?`${(x/1e6).toFixed(1)}m`:x>=1e3?`${(x/1e3).toFixed(x>=1e4?0:1)}k`:String(Math.round(x));}
  function formatDuration(ms){let s=Math.max(0,Math.round(Number(ms||0)/1000));if(s<60)return `${s}s`;const m=Math.floor(s/60),r=s%60;return `${m}m ${r}s`;}
  function formatDateTime(x){try{return new Date(x).toLocaleString(undefined,{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"});}catch{return "—";}}
  function shortDate(x){try{return new Date(`${x}T00:00:00Z`).toLocaleDateString(undefined,{month:"short",day:"numeric",timeZone:"UTC"});}catch{return x||"";}}
  function initials(s){const a=String(s||"").trim().split(/\s+/).filter(Boolean).slice(0,2);return (a.map(x=>x[0]).join("")||"AI").toUpperCase();}
  function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));} function escapeAttr(s){return escapeHtml(s);}
  function debounce(fn,ms){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms);};}
  function readCache(k){try{return JSON.parse(localStorage.getItem(`gpi:${k}`)||"null")?.data||null;}catch{return null;}}
})();
