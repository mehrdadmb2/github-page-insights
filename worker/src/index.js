
const VERSION = "5.0.0";
const SERVICE = "github-page-insights-worker";
const GH_API = "https://api.github.com";
const GH_API_VERSION = "2026-03-10";
const MAX_BODY = 64 * 1024;
const MAX_DAYS = 90;
const ALLOWED_TYPES = new Set(["pageview","heartbeat","pageleave","visibility","click","outbound_click","scroll","error","custom"]);

export default {
  async fetch(request, env) {
    const requestId = crypto.randomUUID();
    const started = Date.now();
    const url = new URL(request.url);
    console.log("REQUEST_START", { requestId, method: request.method, path: url.pathname });

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    try {
      if (url.pathname === "/" && request.method === "GET") return cors(json({ service: SERVICE, version: VERSION, status: "online", architecture: "request-driven-no-cron", endpoints: { collect: "POST /collect", sites: "GET /api/sites", overview: "GET /api/overview?days=7", site: "GET /api/site/<siteId>?days=7", stats: "GET /api/stats?site=<siteId>&days=7", admin: "GET /api/admin/events" } }));
      if (url.pathname === "/health" && request.method === "GET") return health(request, env, requestId);
      if (url.pathname === "/collect" && request.method === "POST") return collect(request, env, requestId, started);
      if (url.pathname === "/api/sites" && request.method === "GET") return listSites(request, env, requestId);
      if (url.pathname === "/api/overview" && request.method === "GET") return overview(request, env, requestId, url.searchParams.get("days"));
      if (url.pathname.startsWith("/api/site/") && request.method === "GET") return siteStats(request, env, requestId, decodeURIComponent(url.pathname.slice("/api/site/".length)), url.searchParams.get("days"));
      if (url.pathname === "/api/stats" && request.method === "GET") return statsCompat(request, env, requestId);
      if (url.pathname === "/api/admin/events" && request.method === "GET") return adminEvents(request, env, requestId);
      if (url.pathname === "/collect") return cors(json({ ok: false, requestId, error: "METHOD_NOT_ALLOWED", expected: "POST" }, 405));
      return cors(json({ ok: false, requestId, error: "NOT_FOUND" }, 404));
    } catch (err) {
      console.error("UNHANDLED_ERROR", { requestId, error: String(err?.message || err), stack: err?.stack, elapsedMs: Date.now() - started });
      return cors(json({ ok: false, requestId, error: "INTERNAL_ERROR", message: env.DEBUG === "true" ? String(err?.message || err) : "Request failed" }, 500));
    }
  }
};

async function collect(request, env, requestId, started) {
  if (!env.DB) return cors(json({ ok: false, requestId, error: "D1_NOT_CONFIGURED" }, 503));
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY) return cors(json({ ok: false, requestId, error: "PAYLOAD_TOO_LARGE" }, 413));
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY) return cors(json({ ok: false, requestId, error: "PAYLOAD_TOO_LARGE" }, 413));
  let p; try { p = JSON.parse(raw); } catch { return cors(json({ ok: false, requestId, error: "INVALID_JSON" }, 400)); }
  let event;
  try { event = await normalizeEvent(request, p); } catch (e) { console.warn("VALIDATION_ERROR", { requestId, error: String(e?.message || e) }); return cors(json({ ok: false, requestId, error: String(e?.message || e) }, 400)); }

  let d1;
  try { d1 = await storeD1(env, event); } catch (e) {
    console.error("D1_STORE_FAILED", { requestId, eventId: event.eventId, siteId: event.siteId, error: String(e?.message || e), stack: e?.stack });
    return cors(json({ ok: false, requestId, accepted: false, eventId: event.eventId, siteId: event.siteId, stored: { d1: false, github: false }, error: "D1_STORE_FAILED", details: String(e?.message || e) }, 500));
  }

  try {
    const github = await archiveGithub(env, event, requestId, d1);
    console.log("COLLECT_SUCCESS", { requestId, eventId: event.eventId, siteId: event.siteId, elapsedMs: Date.now() - started, githubPath: github.path });
    return cors(json({ ok: true, accepted: true, version: VERSION, requestId, eventId: event.eventId, siteId: event.siteId, eventType: event.eventType, stored: { d1: true, github: true }, d1, github, receivedAt: event.receivedAt, elapsedMs: Date.now() - started }, 201));
  } catch (e) {
    console.error("GITHUB_ARCHIVE_FAILED", { requestId, eventId: event.eventId, siteId: event.siteId, error: String(e?.message || e), stack: e?.stack });
    return cors(json({ ok: false, accepted: true, requestId, eventId: event.eventId, siteId: event.siteId, stored: { d1: true, github: false }, error: "GITHUB_ARCHIVE_FAILED", details: String(e?.message || e), elapsedMs: Date.now() - started }, 502));
  }
}

async function normalizeEvent(request, p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) throw Error("INVALID_PAYLOAD");
  const siteId = normalizeSiteId(p.siteId || p.site_id);
  if (!siteId) throw Error("SITE_ID_REQUIRED");
  const siteName = clean(p.siteName || p.site_name || siteId, 160) || siteId;
  const eventType = ALLOWED_TYPES.has(String(p.type || p.eventType || "pageview")) ? String(p.type || p.eventType) : "custom";
  const eventId = clean(p.eventId || p.event_id || crypto.randomUUID(), 128) || crypto.randomUUID();
  const sessionId = clean(p.sessionId || p.session_id || crypto.randomUUID(), 128) || crypto.randomUUID();
  const visitorId = clean(p.visitorId || p.visitor_id || crypto.randomUUID(), 128) || crypto.randomUUID();
  const cf = request.cf || {};
  const ua = clean(request.headers.get("User-Agent") || p.userAgent || p.user_agent, 4096) || "";
  const parsed = parseUA(ua);
  const ip = clean(request.headers.get("CF-Connecting-IP") || request.headers.get("True-Client-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim(), 128);
  const ipHash = ip ? await sha256(`${siteId}|${ip}`) : null;
  const pageUrl = validUrl(p.pageUrl || p.page?.url);
  const referrer = validUrl(p.referrer || p.page?.referrer);
  const metadata = safeMetadata(p.metadata);
  const screen = p.screen && typeof p.screen === "object" ? p.screen : {};
  const viewport = p.viewport && typeof p.viewport === "object" ? p.viewport : {};
  const connection = p.connection && typeof p.connection === "object" ? p.connection : {};
  const receivedAt = new Date().toISOString();
  const occurredAt = safeDate(p.timestamp || p.occurredAt || p.occurred_at).toISOString();
  return {
    eventId, receivedAt, occurredAt, eventType, siteId, siteName, sessionId, visitorId,
    pageUrl, path: clean(p.path || p.pagePath || p.page_path, 4096), title: clean(p.title || p.page?.title, 512),
    referrer, referrerHost: hostOf(referrer), language: clean(p.language || p.lang || request.headers.get("Accept-Language"), 128),
    timezone: clean(p.timezone || cf.timezone, 128), country: clean(cf.country, 32), region: clean(cf.region || cf.regionCode, 128),
    city: clean(cf.city, 128), continent: clean(cf.continent, 16), colo: clean(cf.colo, 32), asn: safeInt(cf.asn, 0, 999999999),
    asOrganization: clean(cf.asOrganization, 256), latitude: clean(cf.latitude, 32), longitude: clean(cf.longitude, 32), postalCode: clean(cf.postalCode, 32),
    tlsVersion: clean(cf.tlsVersion, 64), clientTcpRtt: safeInt(cf.clientTcpRtt, 0, 600000), clientQuicRtt: safeInt(cf.clientQuicRtt, 0, 600000),
    ip, ipHash, userAgent: ua, browser: parsed.browser, os: parsed.os, device: parsed.device,
    screenWidth: safeInt(screen.width || p.screenWidth, 0, 100000), screenHeight: safeInt(screen.height || p.screenHeight, 0, 100000),
    viewportWidth: safeInt(viewport.width || p.viewportWidth, 0, 100000), viewportHeight: safeInt(viewport.height || p.viewportHeight, 0, 100000),
    devicePixelRatio: safeFloat(screen.devicePixelRatio || p.devicePixelRatio, 0, 20), colorDepth: safeInt(screen.colorDepth || p.colorDepth, 0, 128),
    connectionType: clean(connection.type || p.connectionType, 64), connectionDownlink: safeFloat(connection.downlink || p.connectionDownlink, 0, 100000),
    connectionRtt: safeInt(connection.rtt || p.connectionRtt, 0, 600000), connectionSaveData: Boolean(connection.saveData || p.connectionSaveData),
    durationMs: safeInt(p.durationMs || p.duration_ms, 0, 86400000) || 0, maxScroll: safeInt(p.maxScroll || p.scrollDepth || p.scroll_depth, 0, 100) || 0,
    clicks: safeInt(p.clicks, 0, 100000) || 0, outboundClicks: safeInt(p.outboundClicks || p.outbound_clicks, 0, 100000) || 0, metadataJson: metadata
  };
}

async function storeD1(env, e) {
  await env.DB.prepare(`INSERT INTO sites(site_id,site_name,first_seen,last_seen,views,unique_visitors,sessions) VALUES(?,?,?,?,?,?,?) ON CONFLICT(site_id) DO UPDATE SET site_name=excluded.site_name,last_seen=excluded.last_seen`).bind(e.siteId,e.siteName,e.receivedAt,e.receivedAt,e.eventType === "pageview" ? 1 : 0,0,0).run();
  const existingVisitor = await env.DB.prepare(`SELECT 1 FROM events WHERE site_id=? AND visitor_id=? LIMIT 1`).bind(e.siteId,e.visitorId).first();
  const existingSession = await env.DB.prepare(`SELECT 1 FROM visitor_sessions WHERE site_id=? AND session_id=? LIMIT 1`).bind(e.siteId,e.sessionId).first();
  await env.DB.prepare(`INSERT INTO events(id,received_at,event_type,site_id,site_name,session_id,visitor_id,page_url,path,title,referrer,referrer_host,language,timezone,country,region,city,continent,colo,asn,ip,ip_hash,user_agent,browser,os,device,screen_width,screen_height,viewport_width,viewport_height,duration_ms,max_scroll,clicks,outbound_clicks,exported) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`).bind(
    e.eventId,e.receivedAt,e.eventType,e.siteId,e.siteName,e.sessionId,e.visitorId,e.pageUrl,e.path,e.title,e.referrer,e.referrerHost,e.language,e.timezone,e.country,e.region,e.city,e.continent,e.colo,e.asn,e.ip,e.ipHash,e.userAgent,e.browser,e.os,e.device,e.screenWidth,e.screenHeight,e.viewportWidth,e.viewportHeight,e.durationMs,e.maxScroll,e.clicks,e.outboundClicks
  ).run();
  await upsertSession(env,e,!!existingSession);
  await env.DB.prepare(`UPDATE sites SET views=views+?,unique_visitors=unique_visitors+?,sessions=sessions+?,last_seen=? WHERE site_id=?`).bind(e.eventType === "pageview" ? 1 : 0, existingVisitor ? 0 : 1, existingSession ? 0 : 1, e.receivedAt, e.siteId).run();
  return { newVisitor: !existingVisitor, newSession: !existingSession };
}

async function upsertSession(env,e,exists) {
  if (!exists) return env.DB.prepare(`INSERT INTO visitor_sessions(site_id,session_id,visitor_id,first_seen,last_seen,duration_ms,views,max_scroll) VALUES(?,?,?,?,?,?,?,?)`).bind(e.siteId,e.sessionId,e.visitorId,e.occurredAt,e.receivedAt,e.durationMs,e.eventType === "pageview" ? 1 : 0,e.maxScroll).run();
  return env.DB.prepare(`UPDATE visitor_sessions SET visitor_id=?,last_seen=?,duration_ms=max(duration_ms,?),views=views+?,max_scroll=max(max_scroll,?) WHERE site_id=? AND session_id=?`).bind(e.visitorId,e.receivedAt,e.durationMs,e.eventType === "pageview" ? 1 : 0,e.maxScroll,e.siteId,e.sessionId).run();
}

async function archiveGithub(env,e,requestId,d1) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) throw Error("GITHUB_CONFIGURATION_MISSING");
  const d = new Date(e.receivedAt); const y=String(d.getUTCFullYear()).padStart(4,"0"), m=String(d.getUTCMonth()+1).padStart(2,"0"), day=String(d.getUTCDate()).padStart(2,"0");
  const stamp = e.receivedAt.replace(/:/g,"-").replace(/\.\d{3}Z$/i,"").replace(/[^0-9TZ-]/g,"");
  const path = `data/sites/${safePath(e.siteId)}/events/${y}/${m}/${day}/${stamp}_${safePath(e.eventId)}.json`;
  const obj={schemaVersion:"5.0",service:SERVICE,workerVersion:VERSION,requestId,archivedAt:new Date().toISOString(),site:{id:e.siteId,name:e.siteName},storage:{d1:true,github:true},event:e,d1};
  const result = await githubPut(env,path,obj);
  return { status: result.status, path, commitSha: result.commitSha, fileSha: result.fileSha };
}

async function githubPut(env,path,obj) {
  const url=`${GH_API}/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;
  const body={message:`analytics: ${obj.event.siteId}/${obj.event.eventType}/${obj.event.eventId}`,content:base64Utf8(JSON.stringify(obj,null,2)),branch:env.GITHUB_BRANCH || "main",committer:{name:"GitHub Page Insights",email:"github-page-insights@users.noreply.github.com"}};
  const r=await fetchWithTimeout(url,{method:"PUT",headers:ghHeaders(env),body:JSON.stringify(body)},15000); const txt=await r.text();
  if(!r.ok) throw Error(`GITHUB_${r.status}:${txt.slice(0,1600)}`);
  let j={}; try{j=JSON.parse(txt)}catch{} return {status:r.status,commitSha:j?.commit?.sha || null,fileSha:j?.content?.sha || null};
}

async function listSites(request,env,requestId){
  const {results=[]}=await env.DB.prepare(`SELECT s.site_id AS siteId,s.site_name AS siteName,s.first_seen AS firstSeen,s.last_seen AS lastSeen,COALESCE((SELECT COUNT(*) FROM events e WHERE e.site_id=s.site_id AND e.event_type='pageview'),0) AS views,COALESCE((SELECT COUNT(DISTINCT visitor_id) FROM events e WHERE e.site_id=s.site_id),0) AS uniqueVisitors,COALESCE((SELECT COUNT(*) FROM visitor_sessions v WHERE v.site_id=s.site_id),0) AS sessions FROM sites s ORDER BY s.last_seen DESC`).all();
  return cors(json({ok:true,requestId,sites:results.map(x=>({...x,views:Number(x.views||0),uniqueVisitors:Number(x.uniqueVisitors||0),sessions:Number(x.sessions||0)}))}));
}

async function overview(request,env,requestId,rawDays){
  const days=parseDays(rawDays); const since=days === "all" ? null : daysAgo(days); const today=dayStart();
  const total=days === "all" ? await env.DB.prepare(`SELECT COUNT(*) totalViews,COUNT(DISTINCT visitor_id) uniqueVisitors,COUNT(DISTINCT session_id) sessions,COALESCE(AVG(duration_ms),0) avgDurationMs,COALESCE(AVG(max_scroll),0) avgScroll FROM events WHERE event_type='pageview'`).first() : await env.DB.prepare(`SELECT COUNT(*) totalViews,COUNT(DISTINCT visitor_id) uniqueVisitors,COUNT(DISTINCT session_id) sessions,COALESCE(AVG(duration_ms),0) avgDurationMs,COALESCE(AVG(max_scroll),0) avgScroll FROM events WHERE event_type='pageview' AND received_at>=?`).bind(since).first();
  const t=await env.DB.prepare(`SELECT COUNT(*) views,COUNT(DISTINCT visitor_id) uniqueVisitors,COUNT(DISTINCT session_id) sessions FROM events WHERE event_type='pageview' AND received_at>=?`).bind(today).first();
  const daily=await env.DB.prepare(`SELECT substr(received_at,1,10) day,COUNT(*) views,COUNT(DISTINCT visitor_id) uniqueVisitors,COUNT(DISTINCT session_id) sessions FROM events WHERE event_type='pageview' ${days==='all'?"":"AND received_at>=?"} GROUP BY day ORDER BY day`).bind(...(days==='all'?[]:[since])).all();
  const countries=await grouped(env,`SELECT country label,COUNT(*) count FROM events WHERE event_type='pageview' ${days==='all'?"":"AND received_at>=?"} AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 30`,days,since);
  const browsers=await grouped(env,`SELECT browser browser,COUNT(*) count FROM events WHERE event_type='pageview' ${days==='all'?"":"AND received_at>=?"} GROUP BY browser ORDER BY count DESC LIMIT 30`,days,since);
  const operatingSystems=await grouped(env,`SELECT os os,COUNT(*) count FROM events WHERE event_type='pageview' ${days==='all'?"":"AND received_at>=?"} GROUP BY os ORDER BY count DESC LIMIT 30`,days,since);
  const devices=await grouped(env,`SELECT device device,COUNT(*) count FROM events WHERE event_type='pageview' ${days==='all'?"":"AND received_at>=?"} GROUP BY device ORDER BY count DESC LIMIT 30`,days,since);
  const ips=await grouped(env,`SELECT ip ip,COUNT(*) count FROM events WHERE event_type='pageview' ${days==='all'?"":"AND received_at>=?"} AND ip IS NOT NULL GROUP BY ip ORDER BY count DESC LIMIT 25`,days,since);
  const eventTypes=await grouped(env,`SELECT event_type type,COUNT(*) count FROM events WHERE ${days==='all'?"1=1":"received_at>=?"} GROUP BY event_type ORDER BY count DESC`,days,since);
  const pages=await grouped(env,`SELECT path path,title title,COUNT(*) count FROM events WHERE event_type='pageview' ${days==='all'?"":"AND received_at>=?"} GROUP BY path,title ORDER BY count DESC LIMIT 30`,days,since);
  return cors(json({ok:true,requestId,totalViews:Number(total?.totalViews||0),uniqueVisitors:Number(total?.uniqueVisitors||0),sessions:Number(total?.sessions||0),avgDurationMs:Number(total?.avgDurationMs||0),avgScroll:Number(total?.avgScroll||0),today:{views:Number(t?.views||0),uniqueVisitors:Number(t?.uniqueVisitors||0),sessions:Number(t?.sessions||0),date:today.slice(0,10)},days,daily:daily.results||[],countries:mapRows(countries.results||[],'label','country'),browsers:browsers.results||[],operatingSystems:operatingSystems.results||[],devices:devices.results||[],ips:ips.results||[],eventTypes:eventTypes.results||[],pages:pages.results||[]}));
}

async function siteStats(request,env,requestId,siteId,rawDays){
  if(!safeSiteId(siteId)) return cors(json({ok:false,requestId,error:"INVALID_SITE_ID"},400));
  const days=parseDays(rawDays); const since=days==='all'?null:daysAgo(days); const today=dayStart(); const site=await env.DB.prepare(`SELECT site_id siteId,site_name siteName FROM sites WHERE site_id=?`).bind(siteId).first();
  if(!site) return cors(json({ok:true,requestId,siteId,siteName:siteId,views:0,uniqueVisitors:0,sessions:0,avgDurationMs:0,avgScroll:0,today:{views:0,uniqueVisitors:0,sessions:0,date:today.slice(0,10)},last7Days:[],series:[],devices:{},topPages:[],recentVisits:[],countries:[],browsers:[],operatingSystems:[],ips:[],eventTypes:[]}));
  const total=days==='all'?await env.DB.prepare(`SELECT COUNT(*) views,COUNT(DISTINCT visitor_id) uniqueVisitors,COUNT(DISTINCT session_id) sessions,COALESCE(AVG(duration_ms),0) avgDurationMs,COALESCE(AVG(max_scroll),0) avgScroll FROM events WHERE site_id=? AND event_type='pageview'`).bind(siteId).first():await env.DB.prepare(`SELECT COUNT(*) views,COUNT(DISTINCT visitor_id) uniqueVisitors,COUNT(DISTINCT session_id) sessions,COALESCE(AVG(duration_ms),0) avgDurationMs,COALESCE(AVG(max_scroll),0) avgScroll FROM events WHERE site_id=? AND event_type='pageview' AND received_at>=?`).bind(siteId,since).first();
  const t=await env.DB.prepare(`SELECT COUNT(*) views,COUNT(DISTINCT visitor_id) uniqueVisitors,COUNT(DISTINCT session_id) sessions FROM events WHERE site_id=? AND event_type='pageview' AND received_at>=?`).bind(siteId,today).first();
  const series=await env.DB.prepare(`SELECT substr(received_at,1,10) day,COUNT(*) views,COUNT(DISTINCT visitor_id) uniqueVisitors,COUNT(DISTINCT session_id) sessions FROM events WHERE site_id=? AND event_type='pageview' ${days==='all'?"":"AND received_at>=?"} GROUP BY day ORDER BY day`).bind(...(days==='all'?[siteId]:[siteId,since])).all();
  const countries=await groupedSite(env,`SELECT country label,COUNT(*) count FROM events WHERE site_id=? AND event_type='pageview' ${days==='all'?"":"AND received_at>=?"} AND country IS NOT NULL GROUP BY country ORDER BY count DESC LIMIT 30`,siteId,days,since);
  const browsers=await groupedSite(env,`SELECT browser browser,COUNT(*) count FROM events WHERE site_id=? AND event_type='pageview' ${days==='all'?"":"AND received_at>=?"} GROUP BY browser ORDER BY count DESC LIMIT 30`,siteId,days,since);
  const operatingSystems=await groupedSite(env,`SELECT os os,COUNT(*) count FROM events WHERE site_id=? AND event_type='pageview' ${days==='all'?"":"AND received_at>=?"} GROUP BY os ORDER BY count DESC LIMIT 30`,siteId,days,since);
  const devices=await groupedSite(env,`SELECT device device,COUNT(*) count FROM events WHERE site_id=? AND event_type='pageview' ${days==='all'?"":"AND received_at>=?"} GROUP BY device ORDER BY count DESC LIMIT 30`,siteId,days,since);
  const ips=await groupedSite(env,`SELECT ip ip,COUNT(*) count,MAX(city) city,MAX(country) country,MAX(browser) browser,MAX(os) os,MAX(device) device FROM events WHERE site_id=? AND event_type='pageview' ${days==='all'?"":"AND received_at>=?"} AND ip IS NOT NULL GROUP BY ip ORDER BY count DESC LIMIT 25`,siteId,days,since);
  const eventTypes=await groupedSite(env,`SELECT event_type type,COUNT(*) count FROM events WHERE site_id=? ${days==='all'?"":"AND received_at>=?"} GROUP BY event_type ORDER BY count DESC`,siteId,days,since);
  const pages=await groupedSite(env,`SELECT path path,title title,COUNT(*) views FROM events WHERE site_id=? AND event_type='pageview' ${days==='all'?"":"AND received_at>=?"} GROUP BY path,title ORDER BY views DESC LIMIT 30`,siteId,days,since);
  const visits=await env.DB.prepare(`SELECT id,received_at receivedAt,event_type type,site_id siteId,site_name siteName,session_id sessionId,visitor_id visitorId,page_url pageUrl,path,title,referrer_host referrerHost,ip,ip_hash ipHash,country,region,city,continent,colo,asn,browser,os,device,user_agent userAgent,duration_ms durationMs,max_scroll maxScroll,screen_width screenWidth,screen_height screenHeight,viewport_width viewportWidth,viewport_height viewportHeight,language,timezone FROM events WHERE site_id=? ORDER BY rowid DESC LIMIT 150`).bind(siteId).all();
  const devicesObj=Object.fromEntries((devices.results||[]).map(x=>[x.device||"Unknown",Number(x.count||0)]));
  return cors(json({ok:true,requestId,siteId,siteName:site.siteName,views:Number(total?.views||0),uniqueVisitors:Number(total?.uniqueVisitors||0),sessions:Number(total?.sessions||0),avgDurationMs:Number(total?.avgDurationMs||0),avgScroll:Number(total?.avgScroll||0),today:{views:Number(t?.views||0),uniqueVisitors:Number(t?.uniqueVisitors||0),sessions:Number(t?.sessions||0),date:today.slice(0,10)},last7Days:series.results||[],series:series.results||[],devices:devicesObj,topPages:pages.results||[],recentVisits:visits.results||[],countries:mapRows(countries.results||[],'label','country'),browsers:browsers.results||[],operatingSystems:operatingSystems.results||[],ips:ips.results||[],eventTypes:eventTypes.results||[]}));
}

async function statsCompat(request,env,requestId){
  const url=new URL(request.url); const site=url.searchParams.get("site"); if(site) return siteStats(request,env,requestId,site,url.searchParams.get("days")); return overview(request,env,requestId,url.searchParams.get("days"));
}

async function adminEvents(request,env,requestId){
  if(!env.ADMIN_KEY || request.headers.get("X-Admin-Key") !== env.ADMIN_KEY) return cors(json({ok:false,requestId,error:"UNAUTHORIZED"},401));
  const url=new URL(request.url); const site=url.searchParams.get("site"); const limit=Math.min(500,Math.max(1,Number(url.searchParams.get("limit")||100))); let q, bind=[];
  if(site){ const safe=normalizeSiteId(site); if(!safe) return cors(json({ok:false,requestId,error:"INVALID_SITE_ID"},400)); q=`SELECT * FROM events WHERE site_id=? ORDER BY rowid DESC LIMIT ?`; bind=[safe,limit]; } else { q=`SELECT * FROM events ORDER BY rowid DESC LIMIT ?`; bind=[limit]; }
  const {results=[]}=await env.DB.prepare(q).bind(...bind).all(); return cors(json({ok:true,requestId,count:results.length,events:results}));
}

async function health(request,env,requestId){
  let db=false,dbError=null; if(env.DB){try{const r=await env.DB.prepare(`SELECT 1 ok`).first();db=r?.ok===1;}catch(e){dbError=String(e?.message||e)}}
  return cors(json({ok:true,requestId,service:SERVICE,version:VERSION,time:new Date().toISOString(),architecture:"request-driven-no-cron",database:{configured:Boolean(env.DB),reachable:db,error:dbError},github:{configured:Boolean(env.GITHUB_TOKEN&&env.GITHUB_OWNER&&env.GITHUB_REPO&&env.GITHUB_BRANCH),owner:env.GITHUB_OWNER||null,repository:env.GITHUB_REPO||null,branch:env.GITHUB_BRANCH||null}}));
}

async function grouped(env,sql,days,since){return days==='all'?env.DB.prepare(sql).all():env.DB.prepare(sql).bind(since).all();}
async function groupedSite(env,sql,siteId,days,since){return days==='all'?env.DB.prepare(sql).bind(siteId).all():env.DB.prepare(sql).bind(siteId,since).all();}
function mapRows(rows,source,target){return rows.map(x=>({...x,[target]:x[source]}));}
function parseDays(raw){if(String(raw||"").toLowerCase()==="all")return "all";const n=Math.max(1,Math.min(MAX_DAYS,Number(raw||7)));return Number.isFinite(n)?Math.trunc(n):7;}
function daysAgo(days){return new Date(Date.now()-Number(days)*86400000).toISOString();}
function dayStart(){const d=new Date();return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())).toISOString();}
function normalizeSiteId(v){const s=clean(v,80)?.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9._-]+/g,"-").replace(/-+/g,"-").replace(/^[-.]+|[-.]+$/g,"");if(!s||s.includes("..")||s.startsWith(".git"))return null;return s.slice(0,64);}
function safeSiteId(v){return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(String(v||""));}
function safePath(v){return String(v||"unknown").replace(/[^a-zA-Z0-9._-]/g,"-").replace(/-+/g,"-").replace(/^[-.]+|[-.]+$/g,"").slice(0,80)||"unknown";}
function clean(v,n=256){if(v===null||v===undefined)return null;const s=String(v).replace(/\u0000/g,"").trim();return s?s.slice(0,n):null;}
function safeInt(v,min,max){if(v===null||v===undefined||v==="")return null;const n=Number(v);if(!Number.isFinite(n))return null;return Math.min(max,Math.max(min,Math.trunc(n)));}
function safeFloat(v,min,max){if(v===null||v===undefined||v==="")return null;const n=Number(v);if(!Number.isFinite(n))return null;return Math.min(max,Math.max(min,n));}
function validUrl(v){try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:null}catch{return null}}
function hostOf(v){try{return new URL(v).hostname.slice(0,255)}catch{return null}}
function safeDate(v){if(!v)return new Date();const d=new Date(v);if(Number.isNaN(d.getTime()))return new Date();const now=Date.now();if(d.getTime()<now-7*86400000||d.getTime()>now+5*60000)return new Date();return d;}
function safeMetadata(v){if(!v||typeof v!=="object"||Array.isArray(v))return "{}";try{const s=JSON.stringify(v);return new TextEncoder().encode(s).byteLength>12288?JSON.stringify({truncated:true}):s}catch{return JSON.stringify({serializationError:true})}}
function parseUA(ua){let browser="Other",os="Other",device="Desktop";if(/EdgA\//i.test(ua))browser="Edge Android";else if(/EdgiOS\//i.test(ua))browser="Edge iOS";else if(/Edg\//i.test(ua))browser="Edge";else if(/OPR\//i.test(ua))browser="Opera";else if(/SamsungBrowser\//i.test(ua))browser="Samsung Internet";else if(/CriOS\//i.test(ua))browser="Chrome iOS";else if(/Chrome\//i.test(ua))browser="Chrome";else if(/Firefox\//i.test(ua))browser="Firefox";else if(/Version\/[\d.]+.*Safari/i.test(ua))browser="Safari";if(/Windows/i.test(ua))os="Windows";else if(/Android/i.test(ua))os="Android";else if(/iPhone|iPad|iPod/i.test(ua))os="iOS";else if(/Mac OS X/i.test(ua))os="macOS";else if(/CrOS/i.test(ua))os="ChromeOS";else if(/Linux/i.test(ua))os="Linux";if(/iPad|Tablet|Android(?!.*Mobile)/i.test(ua))device="Tablet";else if(/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua))device="Mobile";return{browser,os,device};}
function ghHeaders(env){return{Accept:"application/vnd.github+json",Authorization:`Bearer ${env.GITHUB_TOKEN}`,"X-GitHub-Api-Version":GH_API_VERSION,"User-Agent":SERVICE,"Content-Type":"application/json"};}
async function fetchWithTimeout(url,options,ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...options,signal:c.signal})}finally{clearTimeout(t)}}
function base64Utf8(s){const bytes=new TextEncoder().encode(s);let out="";for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out);}
async function sha256(input){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(input||"")));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function cors(r){const h=new Headers(r.headers);h.set("Access-Control-Allow-Origin","*");h.set("Access-Control-Allow-Methods","GET,POST,OPTIONS");h.set("Access-Control-Allow-Headers","Content-Type,Authorization,X-Admin-Key");h.set("Access-Control-Max-Age","86400");h.set("Cache-Control","no-store");return new Response(r.body,{status:r.status,headers:h});}
function json(o,status=200){return new Response(JSON.stringify(o),{status,headers:{"Content-Type":"application/json; charset=utf-8"}});}
