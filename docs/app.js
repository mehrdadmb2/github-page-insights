(() => {
  "use strict";

  const C = window.PAGE_INSIGHTS_CONFIG || {};
  const WORKER = String(C.workerUrl || "").replace(/\/+$/, "");
  const GITHUB = `https://api.github.com/repos/${encodeURIComponent(C.githubOwner || "")}/${encodeURIComponent(C.githubRepo || "")}`;
  const BRANCH = C.githubBranch || "main";
  const state = {
    sites: [], filteredSites: [], selected: null,
    range: Number(C.defaultRangeDays || 7),
    stats: null, timer: null, githubCache: new Map(), siteStats: new Map(),
    loading: false
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const els = {
    boot: $("#boot"), bootPct: $("#bootPct"), bootLine: $(".boot-line i"),
    metrics: $("#metrics"), siteList: $("#siteList"), siteCount: $("#siteCount"),
    inventoryState: $("#inventoryState"), siteSearch: $("#siteSearch"), range: $("#rangeSelect"),
    siteTitle: $("#siteTitle"), siteMeta: $("#siteMeta"), siteAvatar: $("#siteAvatar"),
    rangeBadge: $("#rangeBadge"), dataBadge: $("#dataBadge"), traffic: $("#trafficChart"),
    trafficEmpty: $("#trafficEmpty"), trafficSummary: $("#trafficSummary"), deviceDonut: $("#deviceDonut"),
    deviceCenter: $("#deviceCenter"), deviceLegend: $("#deviceLegend"), countryList: $("#countryList"),
    pageList: $("#pageList"), browserList: $("#browserList"), osList: $("#osList"), recentRows: $("#recentRows"),
    recentStatus: $("#recentStatus"), statusText: $("#statusText"), lastSync: $("#lastSync"), toastStack: $("#toastStack")
  };

  const colors = ["#7cf7ff", "#6e7bff", "#ba6bff", "#ef68ff", "#87ffbb"];

  init();

  async function init() {
    bind();
    bootAnimation();
    applyTheme(localStorage.getItem("gpi-theme") || "dark");
    try {
      await discoverSites();
      await refresh();
      state.timer = setInterval(() => { if (!document.hidden) refresh(true); }, Math.max(30000, Number(C.autoRefreshMs || 45000)));
    } catch (error) {
      handleError(error, "Unable to initialize analytics. Check Worker and repository configuration.");
    }
  }

  function bind() {
    $("#refreshBtn").addEventListener("click", () => refresh(false));
    $("#themeBtn").addEventListener("click", () => applyTheme(document.documentElement.classList.contains("light") ? "dark" : "light"));
    $("#focusSiteBtn").addEventListener("click", () => $("#explorer")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    $("#allSitesBtn").addEventListener("click", () => selectSite(null));
    els.range.addEventListener("change", () => { state.range = Number(els.range.value); refresh(false); });
    els.siteSearch.addEventListener("input", renderSiteRail);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(true); });
    window.addEventListener("resize", debounce(() => { if (state.stats) drawTraffic(state.stats.daily || []); }, 180));
  }

  function bootAnimation() {
    let pct = 0;
    const tick = setInterval(() => {
      pct = Math.min(100, pct + Math.round(7 + Math.random() * 14));
      els.bootPct.textContent = `${pct}%`;
      els.bootLine.style.width = `${pct}%`;
      if (pct >= 100) {
        clearInterval(tick);
        setTimeout(() => els.boot.classList.add("hide"), 280);
      }
    }, 95);
  }

  async function discoverSites() {
    els.inventoryState.textContent = "SCANNING";
    const cached = readLocalCache("gpi-sites");
    if (cached && (Date.now() - cached.at) < 5 * 60 * 1000) {
      state.sites = cached.data;
    } else {
      const items = await githubJson(`${GITHUB}/contents/data/sites?ref=${encodeURIComponent(BRANCH)}`);
      state.sites = (Array.isArray(items) ? items : [])
        .filter(x => x.type === "dir")
        .map(x => ({ siteId: x.name, siteName: prettifySiteName(x.name), htmlUrl: x.html_url }))
        .sort((a,b) => a.siteName.localeCompare(b.siteName));
      writeLocalCache("gpi-sites", state.sites);
    }
    els.siteCount.textContent = `${state.sites.length} site${state.sites.length === 1 ? "" : "s"}`;
    if (state.selected && !state.sites.some(s => s.siteId === state.selected)) state.selected = null;
    renderSiteRail();
    els.inventoryState.textContent = state.sites.length ? "READY" : "EMPTY";
  }

  async function refresh(silent) {
    if (state.loading) return;
    state.loading = true;
    els.statusText.textContent = "SYNC";
    try {
      if (!state.sites.length) await discoverSites();
      if (state.selected) await loadSelected(); else await loadAll();
      await loadRecent();
      const stamp = new Date();
      els.lastSync.textContent = `updated ${stamp.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"})}`;
      els.statusText.textContent = "LIVE";
    } catch (error) {
      els.statusText.textContent = "DEGRADED";
      if (!silent) handleError(error, "Analytics request failed. Existing data was kept on screen.");
    } finally {
      state.loading = false;
    }
  }

  async function loadAll() {
    const data = await workerJson(`/api/stats?days=${encodeURIComponent(state.range)}`);
    state.stats = normalizeStats(data);
    renderScope({ site: null, stats: state.stats });
  }

  async function loadSelected() {
    const key = `${state.selected}:${state.range}`;
    let stats = state.siteStats.get(key);
    if (!stats) {
      const data = await workerJson(`/api/stats?site=${encodeURIComponent(state.selected)}&days=${encodeURIComponent(state.range)}`);
      stats = normalizeStats(data);
      state.siteStats.set(key, stats);
    }
    state.stats = stats;
    const site = state.sites.find(s => s.siteId === state.selected) || { siteId: state.selected, siteName: state.selected };
    renderScope({ site, stats });
  }

  function selectSite(id) {
    state.selected = id;
    renderSiteRail();
    refresh(false);
  }

  function renderSiteRail() {
    const q = (els.siteSearch.value || "").trim().toLowerCase();
    state.filteredSites = state.sites.filter(s => !q || `${s.siteId} ${s.siteName}`.toLowerCase().includes(q));
    els.siteList.innerHTML = "";
    if (!state.filteredSites.length) {
      els.siteList.innerHTML = `<div class="site-empty">No matching projects.<br>Try a different search term.</div>`;
      return;
    }
    const all = document.createElement("div");
    all.className = `site-item ${state.selected === null ? "active" : ""}`;
    all.innerHTML = `<b>All tracked sites <span class="site-kpi">Σ</span></b><small>Aggregate across ${state.sites.length} projects</small>`;
    all.onclick = () => selectSite(null);
    els.siteList.appendChild(all);
    state.filteredSites.forEach(site => {
      const el = document.createElement("div");
      el.className = `site-item ${state.selected === site.siteId ? "active" : ""}`;
      const cached = latestSiteViews(site.siteId);
      el.innerHTML = `<b>${escapeHtml(site.siteName)} ${cached !== null ? `<span class="site-kpi">${formatNumber(cached)}</span>` : ""}</b><small>${escapeHtml(site.siteId)}</small>`;
      el.onclick = () => selectSite(site.siteId);
      els.siteList.appendChild(el);
    });
  }

  function renderScope({ site, stats }) {
    const totals = stats?.totals || {};
    const all = !site;
    els.siteTitle.textContent = site?.siteName || "All tracked sites";
    els.siteMeta.textContent = all ? `Aggregated telemetry across ${state.sites.length} discovered projects` : `${formatNumber(totals.events || 0)} events · ${formatNumber(totals.pageviews || 0)} page views · ${formatNumber(totals.unique_visitors || 0)} visitors`;
    els.siteAvatar.textContent = all ? "ALL" : initials(site.siteName || site.siteId);
    els.rangeBadge.textContent = `LAST ${state.range} DAYS`;
    els.dataBadge.textContent = "SYNCED";
    renderMetrics(totals);
    drawTraffic(stats?.daily || []);
    renderDevice(stats?.devices || []);
    renderCountries(stats?.countries || []);
    renderPages(stats?.pages || []);
    renderMiniBars(stats?.browsers || [], els.browserList, "browser");
    renderMiniBars(stats?.operatingSystems || [], els.osList, "os");
  }

  function renderMetrics(t) {
    const avgSec = Math.round(Number(t.avg_duration_ms || 0) / 1000);
    const cards = [
      ["PAGE VIEWS", t.pageviews || 0, "⌁", `${formatNumber(t.events || 0)} total events`],
      ["UNIQUE VISITORS", t.unique_visitors || 0, "◉", `${formatNumber(t.sessions || 0)} sessions`],
      ["AVG. DURATION", formatDuration(t.avg_duration_ms || 0), "◌", `avg. scroll ${Math.round(Number(t.avg_scroll || 0))}%`],
      ["ACTIVE PROJECTS", state.sites.length, "◆", `${state.selected ? "site scope selected" : "dynamic inventory"}`]
    ];
    els.metrics.innerHTML = cards.map(([label,value,icon,sub]) => `<article class="metric-card panel"><div class="metric-top"><span class="metric-label">${label}</span><span class="metric-icon">${icon}</span></div><b class="metric-value">${escapeHtml(String(value))}</b><div class="metric-delta">${escapeHtml(sub)}</div></article>`).join("");
  }

  function drawTraffic(daily) {
    const canvas = els.traffic, rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, window.devicePixelRatio || 1), width = Math.max(320, Math.floor(rect.width)), height = Math.max(220, Math.floor(rect.height));
    canvas.width = width * dpr; canvas.height = height * dpr;
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,width,height);
    if (!daily.length) { els.trafficEmpty.classList.remove("hide"); els.trafficSummary.textContent = "0 views"; return; }
    els.trafficEmpty.classList.add("hide");
    const values = daily.map(x => Number(x.pageviews || 0)), max = Math.max(1, ...values);
    const left = 28, right = 12, top = 18, bottom = 36, chartW = width-left-right, chartH = height-top-bottom;
    ctx.strokeStyle = "rgba(140,160,200,.12)"; ctx.lineWidth = 1;
    for (let i=0;i<4;i++){ const y=top + chartH*(i/3); ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke(); }
    const points = values.map((v,i)=>{ const x=left + (daily.length===1?chartW/2:chartW*(i/(daily.length-1))); const y=top+chartH-(v/max)*chartH; return [x,y]; });
    const gradient=ctx.createLinearGradient(0,top,0,height);gradient.addColorStop(0,"rgba(124,247,255,.30)");gradient.addColorStop(1,"rgba(124,247,255,0)");
    ctx.beginPath();ctx.moveTo(points[0][0],height-bottom);points.forEach(([x,y])=>ctx.lineTo(x,y));ctx.lineTo(points.at(-1)[0],height-bottom);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle="#7cf7ff";ctx.lineWidth=2.7;ctx.shadowBlur=12;ctx.shadowColor="#7cf7ff";ctx.stroke();ctx.shadowBlur=0;
    points.forEach(([x,y],i)=>{ctx.beginPath();ctx.arc(x,y,3.2,0,Math.PI*2);ctx.fillStyle="#061018";ctx.fill();ctx.strokeStyle="#7cf7ff";ctx.lineWidth=1.5;ctx.stroke(); if(i===daily.length-1){ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.strokeStyle="rgba(124,247,255,.18)";ctx.stroke();}});
    ctx.fillStyle="#7886a5";ctx.font="10px Inter";daily.forEach((x,i)=>{if(i%Math.max(1,Math.ceil(daily.length/6))===0 || i===daily.length-1){const p=points[i];ctx.fillText(shortDate(x.date),Math.max(left,p[0]-18),height-10);}});
    const total=values.reduce((a,b)=>a+b,0);els.trafficSummary.textContent=`${formatNumber(total)} views`;
  }

  function renderDevice(rows) {
    const data = normalizeRows(rows, "device"), total=data.reduce((a,b)=>a+b.count,0)||1, top=data.slice(0,4);
    const mobile = ((data.find(x=>/mobile/i.test(x.label))?.count||0)/total)*100;
    const stops = []; let acc=0; top.forEach((x,i)=>{const pct=x.count/total*100;stops.push(`${colors[i]} ${acc}% ${acc+pct}%`);acc+=pct;}); if(acc<100)stops.push(`rgba(255,255,255,.08) ${acc}% 100%`);
    els.deviceDonut.style.background=`conic-gradient(${stops.join(",")})`;
    els.deviceCenter.textContent=`${Math.round(mobile)}%`;
    els.deviceLegend.innerHTML=top.length?top.map((x,i)=>`<div class="legend-row"><span><i style="background:${colors[i]}"></i>${escapeHtml(x.label)}</span><b>${Math.round(x.count/total*100)}%</b></div>`).join(""):emptyText();
  }

  function renderCountries(rows){renderRank(rows.map(x=>({label:x.country || "Unknown",count:Number(x.count||0)})), els.countryList, true);}
  function renderPages(rows){renderRank(rows.map(x=>({label:x.path || "/",count:Number(x.count||0),title:x.title||""})), els.pageList, true);}
  function renderRank(rows, target, withBar){ const data=rows.sort((a,b)=>b.count-a.count).slice(0,8), max=Math.max(1,...data.map(x=>x.count));target.innerHTML=data.length?data.map((x,i)=>`<div class="rank-row"><span class="rank-no">${String(i+1).padStart(2,"0")}</span><div class="rank-main"><span class="rank-label" title="${escapeHtml(x.title||x.label)}">${escapeHtml(x.label)}</span>${withBar?`<div class="rank-bar"><i style="width:${Math.round(x.count/max*100)}%"></i></div>`:""}</div><b class="rank-value">${formatNumber(x.count)}</b></div>`).join(""):emptyText(); }
  function renderMiniBars(rows,target,key){const data=normalizeRows(rows,key).slice(0,6),max=Math.max(1,...data.map(x=>x.count));target.innerHTML=data.length?data.map(x=>`<div class="mini-row"><span title="${escapeHtml(x.label)}">${escapeHtml(x.label)}</span><div class="mini-track"><i style="width:${Math.round(x.count/max*100)}%"></i></div><b>${formatCompact(x.count)}</b></div>`).join(""):emptyText();}

  async function loadRecent(){
    els.recentStatus.textContent="loading archive…";
    try {
      const sites = state.selected ? state.sites.filter(s=>s.siteId===state.selected) : state.sites;
      const jobs = [];
      sites.slice(0, 20).forEach(site => jobs.push(loadSiteRecent(site)));
      const all = (await Promise.all(jobs)).flat().sort((a,b)=>new Date(b.event?.received_at||b.event?.receivedAt||b.received_at||b.receivedAt||0)-new Date(a.event?.received_at||a.event?.receivedAt||a.received_at||a.receivedAt||0)).slice(0, Number(C.recentLimit||25));
      els.recentRows.innerHTML = all.length ? all.map(renderRecentRow).join("") : `<tr><td colspan="7" class="muted">No archived events found for the current scope.</td></tr>`;
      els.recentStatus.textContent=`${all.length} archived events`;
    } catch (error) {
      els.recentRows.innerHTML=`<tr><td colspan="7" class="muted">Recent archive unavailable right now.</td></tr>`;
      els.recentStatus.textContent="archive unavailable";
      if (!state.loading) console.warn(error);
    }
  }

  async function loadSiteRecent(site){
    const events=[];
    for(let d=0;d<Math.max(1,Number(C.maxRecentDaysToScan||3));d++){
      const date=new Date(Date.now()-d*86400000); const path=`data/sites/${encodeURIComponent(site.siteId)}/events/${date.getUTCFullYear()}/${String(date.getUTCMonth()+1).padStart(2,'0')}/${String(date.getUTCDate()).padStart(2,'0')}`;
      const cacheKey=path, cached=state.githubCache.get(cacheKey);
      let items=cached;
      if(!items){ items=await githubJson(`${GITHUB}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`); state.githubCache.set(cacheKey,items); }
      if(!Array.isArray(items)) continue;
      for(const item of items.filter(x=>x.type==='file').slice(-12)){
        const rawKey=`raw:${item.download_url}`; let data=state.githubCache.get(rawKey); if(!data){ data=await githubJson(item.download_url); state.githubCache.set(rawKey,data); }
        if(data?.event){events.push(data);} else if(data?.schemaVersion && data.event){events.push(data);}
      }
    }
    return events;
  }

  function renderRecentRow(wrapper){
    const e=wrapper.event||wrapper; const site=wrapper.site||{}; const at=e.received_at||e.receivedAt||wrapper.archivedAt||wrapper.received_at||wrapper.receivedAt;
    const path=e.path||e.page_path||e.pagePath||"/"; const loc=[e.city,e.country].filter(Boolean).join(", ")||"—"; const device=e.device||e.device_type||"Unknown"; const dur=e.duration_ms||e.durationMs||0; const ref=e.referrer_host||e.referrerHost||"Direct";
    return `<tr><td>${escapeHtml(formatDateTime(at))}</td><td>${escapeHtml(site.name||site.siteName||e.siteName||e.site_id||e.siteId||"—")}</td><td title="${escapeHtml(e.page_url||e.pageUrl||path)}">${escapeHtml(path)}</td><td>${escapeHtml(loc)}</td><td><span class="pill">${escapeHtml(device)}</span></td><td>${escapeHtml(formatDuration(dur))}</td><td>${escapeHtml(ref)}</td></tr>`;
  }

  function normalizeStats(data){return data||{totals:{},countries:[],browsers:[],operatingSystems:[],devices:[],pages:[],daily:[]};}
  function normalizeRows(rows,key){ if(!Array.isArray(rows)) return Object.entries(rows||{}).map(([label,count])=>({label,count:Number(count||0)})); return rows.map(x=>({label:x[key]||x.name||x.label||"Unknown",count:Number(x.count||0)})).filter(x=>x.count>=0); }
  function latestSiteViews(id){const v=state.siteStats.get(`${id}:${state.range}`);return v?.totals?.pageviews ?? null;}
  function prettifySiteName(id){return String(id).replace(/[-_.]+/g,' ').replace(/\b\w/g,m=>m.toUpperCase());}
  function initials(s){const a=String(s).trim().split(/\s+/).slice(0,2);return a.map(x=>x[0]).join('').toUpperCase()||"PI";}
  function shortDate(x){try{return new Date(`${x}T00:00:00Z`).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});}catch{return x||"";}}
  function formatNumber(n){return new Intl.NumberFormat().format(Number(n)||0)}
  function formatCompact(n){const x=Number(n)||0;return x>=1000?`${(x/1000).toFixed(x>=10000?0:1)}k`:String(Math.round(x));}
  function formatDuration(ms){let s=Math.max(0,Math.round(Number(ms||0)/1000));if(s<60)return `${s}s`;const m=Math.floor(s/60),r=s%60;return `${m}m ${r}s`;}
  function formatDateTime(x){try{return new Date(x).toLocaleString(undefined,{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});}catch{return "—";}}
  function emptyText(){return `<div class="muted" style="font-size:10px;padding:16px 0">No data available in this range.</div>`;}
  function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
  function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
  function readLocalCache(k){try{const x=JSON.parse(localStorage.getItem(k)||"null");return x?.data?x:null}catch{return null}}
  function writeLocalCache(k,data){try{localStorage.setItem(k,JSON.stringify({at:Date.now(),data}))}catch{}}

  async function workerJson(path){const r=await fetch(`${WORKER}${path}`,{cache:'no-store'});if(!r.ok){let t="";try{t=await r.text()}catch{}throw new Error(`Worker ${r.status}: ${t.slice(0,250)}`)}return r.json();}
  async function githubJson(url){const r=await fetch(url,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});if(!r.ok) throw new Error(`GitHub ${r.status}: ${url}`);return r.json();}
  function handleError(error,message){console.error(error);toast(message,true);}
  function toast(message,error=false){const el=document.createElement('div');el.className=`toast${error?' error':''}`;el.textContent=message;els.toastStack.appendChild(el);setTimeout(()=>el.remove(),4200);}
  function applyTheme(theme){document.documentElement.classList.toggle('light',theme==='light');localStorage.setItem('gpi-theme',theme);}
})();