(function(){
  "use strict";

  const C=window.PAGE_INSIGHTS_CONFIG||{};
  const WORKER=String(C.workerUrl||"").replace(/\/+$/g,"");
  const $=id=>document.getElementById(id);
  const state={days:String(C.defaultRangeDays||7),platform:"*",platforms:[],overview:null,detail:null,events:[],health:null,clientKind:"browser",advanced:false,loading:false,cache:loadCache(),lastPayloadSource:"none"};
  const el={
    livePill:$('livePill'),liveText:$('liveText'),refresh:$('refreshBtn'),platform:$('platformSelect'),search:$('platformSearch'),range:$('rangeSeg'),lastSync:$('lastSync'),overall:$('overallBadge'),healthMeta:$('healthMeta'),
    heroViews:$('heroViews'),heroVisitors:$('heroVisitors'),heroSessions:$('heroSessions'),heroStatus:$('heroStatus'),platformBars:$('platformBars'),platformCount:$('platformCount'),traffic:$('trafficChart'),trafficInfo:$('trafficInfo'),
    eventsBody:$('eventsBody'),eventCount:$('eventCount'),advanced:$('advancedSection'),countries:$('countries'),clientRank:$('clientRank'),ips:$('ips'),topPages:$('topPages'),sources:$('sources'),eventTypes:$('eventTypes'),statuses:$('statuses'),
    drawer:$('eventDrawer'),backdrop:$('drawerBackdrop'),drawerTitle:$('drawerTitle'),drawerBody:$('drawerBody'),toasts:$('toasts'),footerVersion:$('footVersion')
  };

  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>new Intl.NumberFormat('en-US').format(Number(v)||0);
  const n=v=>Number.isFinite(Number(v))?Number(v):0;
  const pick=(o,...keys)=>{for(const k of keys){if(o&&o[k]!==undefined&&o[k]!==null)return o[k]}return null};
  const arr=v=>Array.isArray(v)?v:[];
  const date=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('en-US',{month:'short',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'})};
  const ago=v=>{const t=new Date(v).getTime();if(!Number.isFinite(t))return'—';const s=Math.max(0,Math.floor((Date.now()-t)/1000));if(s<60)return `${s}s ago`;if(s<3600)return `${Math.floor(s/60)}m ago`;if(s<86400)return `${Math.floor(s/3600)}h ago`;return `${Math.floor(s/86400)}d ago`};
  const duration=ms=>{const s=Math.max(0,Math.round(n(ms)/1000));if(s<60)return `${s}s`;const m=Math.floor(s/60);if(m<60)return `${m}m ${s%60}s`;return `${Math.floor(m/60)}h ${m%60}m`};
  const parseJson=v=>{if(v==null||v==='')return{};if(typeof v!=='string')return v;try{return JSON.parse(v)}catch{return v}};
  const pretty=v=>{try{return JSON.stringify(v,null,2)}catch{return String(v??'')}};

  function toast(message,kind='info'){if(!el.toasts)return;const x=document.createElement('div');x.className=`toast ${kind}`;x.textContent=message;el.toasts.appendChild(x);setTimeout(()=>x.remove(),4200)}
  function setLive(kind,text){el.livePill?.classList.remove('ok','error');if(kind)el.livePill?.classList.add(kind);if(el.liveText)el.liveText.textContent=text}
  function setText(id,value){const node=$(id);if(node)node.textContent=value}
  function cacheKey(){return `${state.platform}|${state.days}`}
  function loadCache(){try{return JSON.parse(localStorage.getItem('uei_dashboard_v121')||'{}')}catch{return{}}}
  function saveCache(){try{localStorage.setItem('uei_dashboard_v121',JSON.stringify(state.cache))}catch{}}
  function buildUrl(path,params){const q=new URLSearchParams(params||{});return `${WORKER}${path}${q.toString()?(path.includes('?')?'&':'?')+q.toString():''}`}

  async function api(path,params={}){
    if(!WORKER)throw Error('Worker URL is missing.');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),Math.max(4000,Number(C.requestTimeoutMs||12000)));
    try{
      const res=await fetch(buildUrl(path,params),{method:'GET',cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
      let body=null;try{body=await res.json()}catch{}
      if(!res.ok)throw Error(`HTTP ${res.status}${body?.error?` — ${body.error}`:''}`);
      return body||{};
    }finally{clearTimeout(timer)}
  }

  function currentData(){if(state.platform==='*')return state.overview||{};return state.detail||{}}
  function totals(d){const t=d?.totals||{};return{events:n(pick(t,'events')),views:n(pick(t,'pageviews','views')),visitors:n(pick(t,'uniqueVisitors','visitors')),sessions:n(pick(t,'sessions')),duration:n(pick(t,'avgDurationMs')),scroll:n(pick(t,'avgScroll'))}}

  function populatePlatforms(filter=''){
    if(!el.platform)return;const q=String(filter).trim().toLowerCase();const list=arr(state.platforms).filter(p=>!q||String(p.platformName||'').toLowerCase().includes(q)||String(p.platformId||'').toLowerCase().includes(q));
    el.platform.innerHTML='';const all=document.createElement('option');all.value='*';all.textContent='All platforms';el.platform.appendChild(all);
    list.forEach(p=>{const o=document.createElement('option');o.value=p.platformId;o.textContent=`${p.platformName||p.platformId} · ${p.platformId}`;el.platform.appendChild(o)});
    el.platform.value=state.platform==='*'||list.some(p=>p.platformId===state.platform)?state.platform:'*';
    if(el.platform.value!==state.platform&&state.platform!=='*')state.platform='*';
  }

  function renderKpis(d){
    const t=totals(d);const pc=state.platform==='*'?state.platforms.length:1;
    setText('k-platforms',num(pc));setText('k-platforms-sub',state.platform==='*'?'Discovered automatically':(d.platform?.platformName||state.platform));setText('k-pageviews',num(t.views));setText('k-visitors',num(t.visitors));setText('k-sessions',num(t.sessions));setText('k-events',num(t.events));setText('k-duration',duration(t.duration));setText('k-scroll',`${Math.round(t.scroll)}%`);
    const latest=arr(d.recentEvents)[0];setText('k-last',latest?ago(latest.receivedAt):'—');setText('k-last-sub',latest?`${latest.eventType||'event'} · ${latest.platformName||latest.platformId||''}`:'Waiting for telemetry');
    if(el.heroViews)el.heroViews.textContent=num(t.views);if(el.heroVisitors)el.heroVisitors.textContent=`${num(t.visitors)} visitors`;if(el.heroSessions)el.heroSessions.textContent=`${num(t.sessions)} sessions`;
    if(el.heroStatus)el.heroStatus.textContent=state.lastPayloadSource==='cache'?'Showing last good snapshot':'Live telemetry loaded';
  }

  function renderHealth(h){
    state.health=h||{};const overall=String(h?.overall||'unknown').toLowerCase();if(el.overall){el.overall.textContent=overall.toUpperCase();el.overall.className=`status-badge ${overall}`}
    const checks=h?.checks||{};
    const healthCard=(id,status,title,detail)=>{const x=$(id);if(!x)return;x.className=`health-card ${status||'unknown'}`;x.innerHTML=`<span>${title==='Worker'?'⚙️':title==='D1'?'🗄️':title==='GitHub'?'📦':'🤖'}</span><b>${esc(title)}</b><strong>${esc(String(status||'unknown').toUpperCase())}</strong><small>${esc(detail||'')}</small>`};
    healthCard('h-worker',checks.worker?.status||'unknown','Worker',checks.worker?.version||'Runtime');healthCard('h-d1',checks.database?.status||'unknown','D1',checks.database?.message||'Database');healthCard('h-gh',checks.github?.status||'unknown','GitHub',checks.github?.message||'Archive');
    const tg=checks.configuration?.telegramConfigured?'ok':(checks.configuration?.telegramEnabled?'warning':'warning');healthCard('h-tg',tg,'Telegram',checks.configuration?.telegramConfigured?'Configured':'Not configured');
    const counts=checks.database?.counts||{};if(el.healthMeta)el.healthMeta.textContent=`${date(h?.generatedAt)} · ${num(counts.events||0)} events · ${num(counts.platforms||0)} platforms`;
    if(el.footerVersion)el.footerVersion.textContent=String(h?.version||C.appVersion||'—');
  }

  function renderTraffic(rows){
    if(!el.traffic)return;const list=arr(rows);if(!list.length){el.traffic.innerHTML='<div class="empty">No activity in this range.</div>';setText('trafficInfo','0 events');return}
    const width=1100,height=300,pad={l:42,r:16,t:22,b:32},vals=list.map(r=>n(pick(r,'events','pageviews','views'))),max=Math.max(1,...vals),x=i=>pad.l+(list.length===1?(width-pad.l-pad.r)/2:i*(width-pad.l-pad.r)/(list.length-1)),y=v=>height-pad.b-(v/max)*(height-pad.t-pad.b);
    const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('role','img');svg.setAttribute('aria-label','Activity trend');
    const defs=document.createElementNS(ns,'defs'),grad=document.createElementNS(ns,'linearGradient');grad.id='trafficGradient';grad.setAttribute('x1','0');grad.setAttribute('x2','0');grad.setAttribute('y1','0');grad.setAttribute('y2','1');const a=document.createElementNS(ns,'stop');a.setAttribute('offset','0%');a.setAttribute('stop-color','rgba(116,231,255,.22)');const b=document.createElementNS(ns,'stop');b.setAttribute('offset','100%');b.setAttribute('stop-color','rgba(116,231,255,0)');grad.append(a,b);defs.appendChild(grad);svg.appendChild(defs);
    for(let i=0;i<4;i++){const yy=pad.t+i*(height-pad.t-pad.b)/3;const line=document.createElementNS(ns,'line');line.setAttribute('x1',pad.l);line.setAttribute('x2',width-pad.r);line.setAttribute('y1',yy);line.setAttribute('y2',yy);line.setAttribute('class','chart-grid');svg.appendChild(line)}
    let path='';list.forEach((r,i)=>{path+=`${i?'L':'M'} ${x(i)} ${y(vals[i])}`});const area=document.createElementNS(ns,'path');area.setAttribute('d',`${path} L ${x(list.length-1)} ${height-pad.b} L ${x(0)} ${height-pad.b} Z`);area.setAttribute('class','chart-area');svg.appendChild(area);const line=document.createElementNS(ns,'path');line.setAttribute('d',path);line.setAttribute('class','chart-line');svg.appendChild(line);
    list.forEach((r,i)=>{if(i===0||i===list.length-1||i%Math.max(1,Math.ceil(list.length/8))===0){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',x(i));c.setAttribute('cy',y(vals[i]));c.setAttribute('r',5);c.setAttribute('class','chart-dot');c.addEventListener('mouseenter',()=>{setText('trafficInfo',`${r.day||'day'} · ${num(vals[i])} events`)});svg.appendChild(c)}});
    el.traffic.innerHTML='';el.traffic.appendChild(svg);setText('trafficInfo',`${num(vals.reduce((a,v)=>a+v,0))} events`);
  }

  function renderPlatforms(rows){
    if(!el.platformBars)return;const list=arr(rows);setText('platformCount',`${num(list.length)} found`);if(!list.length){el.platformBars.innerHTML='<div class="empty compact">No connected platforms yet.</div>';return}
    const max=Math.max(1,...list.map(r=>n(r.totalEvents)));el.platformBars.innerHTML=list.slice(0,18).map(r=>`<div class="platform-row" data-platform="${esc(r.platformId||'')}"><div class="platform-name"><strong>${esc(r.platformName||r.platformId||'Unknown')}</strong><small>${esc(r.platformId||'')} · ${esc(r.platformType||'generic')}</small></div><div class="platform-track"><div class="platform-fill" style="width:${Math.max(3,Math.round(n(r.totalEvents)/max*100))}%"></div></div><div class="platform-value">${num(pick(r,'totalPageviews','totalEvents')||0)}</div></div>`).join('');
    el.platformBars.querySelectorAll('[data-platform]').forEach(node=>node.addEventListener('click',async()=>{state.platform=node.dataset.platform;await loadData(true)}));
  }

  function rankRows(target,rows,labelKeys,valueKeys,secondaryKeys=[]){if(!target)return;const list=arr(rows).slice(0,15);if(!list.length){target.innerHTML='<div class="empty compact">No data available for this range.</div>';return}target.innerHTML=list.map((r,i)=>{const label=pick(r,...labelKeys)||'Unknown';const value=n(pick(r,...valueKeys));const secondary=secondaryKeys.map(k=>pick(r,k)).filter(v=>v!==undefined&&v!==null&&v!=='').join(' · ');return `<div class="rank-row"><div class="rank-no">${i+1}</div><div class="rank-main"><strong>${esc(label)}</strong>${secondary?`<small>${esc(secondary)}</small>`:''}</div><div class="rank-value">${num(value)}</div></div>`}).join('')}
  function mapToRows(data){if(data instanceof Map)return Array.from(data.entries()).map(([label,count])=>({label,count}));return arr(data)}
  function renderCards(target,items,labelKey='label',valueKey='count'){if(!target)return;const list=items instanceof Map?Array.from(items.entries()).map(([label,count])=>({label,count})):arr(items);if(!list.length){target.innerHTML='<div class="empty compact">No data available.</div>';return}target.innerHTML=list.slice(0,12).map(x=>`<div class="event-card"><b>${esc(pick(x,labelKey,'eventType','status','name')||'Unknown')}</b><span>${num(pick(x,valueKey,'events','count')||0)}</span></div>`).join('')}
  function deriveCounts(events,keyFn){const m=new Map();arr(events).forEach(e=>{const k=String(keyFn(e)||'Unknown');m.set(k,(m.get(k)||0)+1)});return m}
  function deriveSources(events){return mapToRows(deriveCounts(events,e=>e.referrerHost||e.utmSource||'Direct'))}
  function renderAdvanced(d){
    rankRows(el.countries,d.countries||[],['label','country'],['count','events']);
    const client=state.clientKind==='browser'?d.browsers:state.clientKind==='os'?d.operatingSystems:d.devices;const labelKeys=state.clientKind==='browser'?['browser']:state.clientKind==='os'?['os']:['device'];rankRows(el.clientRank,client||[],labelKeys,['count','events']);
    rankRows(el.ips,d.ips||[],['ip'],['count','events'],['city','country']);rankRows(el.topPages,d.topPages||[],['title','path'],['views','count'],['path']);rankRows(el.sources,(arr(d.sources).length?d.sources:deriveSources(state.events)),['label','referrerHost','utmSource'],['count','events']);
    renderCards(el.eventTypes,d.eventTypes?.length?d.eventTypes:deriveCounts(state.events,e=>e.eventType||'custom'));renderCards(el.statuses,d.statuses?.length?d.statuses:deriveCounts(state.events,e=>String(e.responseStatus||'200')), 'status');
  }

  function renderEvents(rows){const list=arr(rows).slice(0,Number(C.recentLimit||60));state.events=list;setText('eventCount',num(list.length));if(!el.eventsBody)return;if(!list.length){el.eventsBody.innerHTML='<tr><td colspan="7"><div class="empty">No events found.</div></td></tr>';return}el.eventsBody.innerHTML=list.map((r,i)=>`<tr data-event-index="${i}"><td title="${esc(date(r.receivedAt))}">${esc(ago(r.receivedAt))}</td><td><strong>${esc(r.platformName||r.platformId||'—')}</strong></td><td><span class="pill-type">${esc(r.eventType||'custom')}</span></td><td class="ip-text">${esc(r.ip||'—')}</td><td>${esc([r.city,r.region,r.country].filter(Boolean).join(' · ')||'—')}</td><td>${esc([r.device,r.os].filter(Boolean).join(' · ')||'—')}</td><td class="page-text" title="${esc(r.pageUrl||r.path||'')}">${esc(r.path||r.title||r.pageUrl||'—')}</td></tr>`).join('');el.eventsBody.querySelectorAll('[data-event-index]').forEach(row=>row.addEventListener('click',()=>openEvent(list[Number(row.dataset.eventIndex)])))}

  function renderAll(){const d=currentData();renderKpis(d);renderTraffic(d.daily||[]);renderPlatforms(state.platform==='*'?(d.platforms||state.platforms):state.platforms.filter(p=>p.platformId===state.platform));renderEvents(d.recentEvents||[]);if(state.advanced)renderAdvanced(d);setLive(state.lastPayloadSource==='cache'?'error':'ok',state.lastPayloadSource==='cache'?'Cached':'Live');setText('lastSync',`Updated ${new Date().toLocaleTimeString()}`);}

  async function loadGlobal(){const key=cacheKey();const [platforms,overview,health]=await Promise.allSettled([api('/v1/platforms'),api('/v1/overview',{days:state.days,lite:state.advanced?undefined:1}),api('/v1/health',{quick:1})]);if(platforms.status==='fulfilled')state.platforms=arr(platforms.value?.platforms);if(health.status==='fulfilled')renderHealth(health.value);
    if(overview.status==='fulfilled'){state.overview=overview.value;state.lastPayloadSource='live';state.cache[key]={overview:state.overview,platforms:state.platforms};saveCache()}else{const c=state.cache[key];if(!c?.overview)throw overview.reason||Error('Overview is unavailable.');state.overview=c.overview;state.platforms=arr(c.platforms||state.platforms);state.lastPayloadSource='cache';toast(`Live overview unavailable. Showing the last good snapshot. ${overview.reason?.message||''}`.trim(),'error')}
    populatePlatforms(el.search?.value||'');renderAll();
  }
  async function loadPlatform(){const key=cacheKey();try{const detail=await api(`/v1/platforms/${encodeURIComponent(state.platform)}`,{days:state.days,lite:state.advanced?undefined:1});if(!detail||detail.ok===false)throw Error('Platform not found.');state.detail=detail;state.lastPayloadSource='live';state.cache[key]={detail:state.detail,platforms:state.platforms};saveCache();populatePlatforms(el.search?.value||'');renderAll()}catch(error){const c=state.cache[key];if(!c?.detail)throw error;state.detail=c.detail;state.lastPayloadSource='cache';populatePlatforms(el.search?.value||'');renderAll();toast(`Platform refresh failed. Showing the last good snapshot. ${error.message}`,'error')}}
  async function loadData(manual=false){if(state.loading)return;state.loading=true;if(manual)setLive(null,'Refreshing');try{await(state.platform==='*'?loadGlobal():loadPlatform())}catch(error){setLive('error','Offline');toast(`Unable to load analytics: ${error.message}`,'error')}finally{state.loading=false}}

  async function openAdvanced(){if(!el.advanced||state.advanced)return;state.advanced=true;el.advanced.classList.remove('hidden');setLive(null,'Loading advanced');try{if(state.platform==='*'){const full=await api('/v1/overview',{days:state.days});state.overview={...(state.overview||{}),...full}}else{state.detail=await api(`/v1/platforms/${encodeURIComponent(state.platform)}`,{days:state.days})}state.lastPayloadSource='live';state.cache[cacheKey()]={...(state.cache[cacheKey()]||{}),overview:state.overview,detail:state.detail,platforms:state.platforms};saveCache();renderAll();toast('Advanced analytics loaded.','success')}catch(error){renderAdvanced(currentData());toast(`Advanced analytics unavailable: ${error.message}`,'error')}el.advanced.scrollIntoView({behavior:'smooth',block:'start'})}
  function closeAdvanced(){state.advanced=false;el.advanced?.classList.add('hidden')}
  function openEvent(event){if(!event||!el.drawer)return;el.drawerTitle.textContent=event.eventId||event.eventType||'Event';const pairs=[['Event ID',event.eventId],['Type',event.eventType],['Platform',event.platformName||event.platformId],['Received',date(event.receivedAt)],['IP',event.ip],['IP hash',event.ipHash],['Country',event.country],['Region',event.region],['City',event.city],['Latitude',event.latitude],['Longitude',event.longitude],['ASN',event.asn],['Organization',event.asOrganization],['Timezone',event.timezone],['Browser',[event.browser,event.browserVersion].filter(Boolean).join(' ')],['OS',[event.os,event.osVersion].filter(Boolean).join(' ')],['Device',[event.device,event.deviceModel].filter(Boolean).join(' ')],['Screen',event.screenWidth&&event.screenHeight?`${event.screenWidth} × ${event.screenHeight}`:'—'],['Viewport',event.viewportWidth&&event.viewportHeight?`${event.viewportWidth} × ${event.viewportHeight}`:'—'],['Page',event.pageUrl||event.path],['Referrer',event.referrer||event.referrerHost],['Duration',duration(event.durationMs)],['Scroll',`${n(event.maxScroll)}%`],['Clicks',event.clicks],['Outbound clicks',event.outboundClicks],['Request ID',event.requestId],['CF-Ray',event.cfRay]];const item=(label,value)=>`<div class="detail-item"><span>${esc(label)}</span><b>${esc(value??'—')}</b></div>`;const box=(label,value)=>`<div class="json-box"><header>${esc(label)}</header><pre>${esc(pretty(value))}</pre></div>`;el.drawerBody.innerHTML=`<div class="detail-grid">${pairs.map(p=>item(...p)).join('')}</div>${box('data_json',parseJson(event.dataJson))}${box('metadata_json',parseJson(event.metadataJson))}${box('request_json',parseJson(event.requestJson))}${box('cf_json',parseJson(event.cfJson))}`;el.drawer.classList.add('open');el.backdrop?.classList.add('open');el.drawer.setAttribute('aria-hidden','false')}
  function closeDrawer(){el.drawer?.classList.remove('open');el.backdrop?.classList.remove('open');el.drawer?.setAttribute('aria-hidden','true')}
  function exportCsv(){const rows=state.events;if(!rows.length){toast('There are no events to export.','error');return}const cols=['receivedAt','eventId','platformId','eventType','ip','country','region','city','asn','browser','os','device','path','referrer','durationMs','maxScroll'];const csv=[cols.join(','),...rows.map(r=>cols.map(k=>`"${String(r?.[k]??'').replace(/"/g,'""')}"`).join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`uei-events-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}

  function bind(){
    el.refresh?.addEventListener('click',()=>loadData(true));el.platform?.addEventListener('change',()=>{state.platform=el.platform.value;state.detail=null;loadData(true)});el.search?.addEventListener('input',()=>populatePlatforms(el.search.value));
    el.range?.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{el.range.querySelectorAll('button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.days=btn.dataset.days;loadData(true)}));
    document.querySelectorAll('#clientTabs button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('#clientTabs button').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.clientKind=btn.dataset.kind;renderAdvanced(currentData())}));
    $('advancedBtn')?.addEventListener('click',()=>state.advanced?closeAdvanced():openAdvanced());$('advancedCloseBtn')?.addEventListener('click',closeAdvanced);$('exportBtn')?.addEventListener('click',exportCsv);$('closeDrawer')?.addEventListener('click',closeDrawer);el.backdrop?.addEventListener('click',closeDrawer);document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
  }
  async function init(){bind();setLive(null,'Connecting');await loadData(false);setInterval(()=>{if(!document.hidden)loadData(false)},Math.max(180000,Number(C.autoRefreshMs||300000)));setInterval(()=>{if(!document.hidden)api('/v1/health',{quick:1}).then(renderHealth).catch(()=>{})},Math.max(300000,Number(C.healthRefreshMs||600000)))}
  init().catch(error=>{setLive('error','Offline');toast(`Dashboard startup failed: ${error.message}`,'error')});
})();
