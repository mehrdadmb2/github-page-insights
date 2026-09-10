const GH_API = "https://api.github.com";
const VERSION = "1.0.0";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    try {
      if (url.pathname === "/health" && request.method === "GET") return json({ ok: true, service: "github-page-insights", version: VERSION });
      if (url.pathname === "/collect" && request.method === "POST") return collect(request, env);
      if (url.pathname === "/api/sites" && request.method === "GET") return listSites(env);
      if (url.pathname === "/api/overview" && request.method === "GET") return overview(env, Number(url.searchParams.get("days") || 7));
      if (url.pathname.startsWith("/api/site/") && request.method === "GET") return siteStats(env, decodeURIComponent(url.pathname.slice("/api/site/".length)), Number(url.searchParams.get("days") || 7));
      return cors(json({ ok: false, error: "not_found" }, 404));
    } catch (err) {
      return cors(json({ ok: false, error: "internal_error", message: env.DEBUG === "true" ? String(err?.stack || err) : "Request failed" }, 500));
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(flushToGithub(env));
  }
};

async function collect(request, env) {
  const maxBody = Math.min(Number(env.MAX_BODY_BYTES || 30000), 100000);
  const len = Number(request.headers.get("content-length") || 0);
  if (len > maxBody) return cors(json({ ok: false, error: "payload_too_large" }, 413));
  const raw = await request.text();
  if (raw.length > maxBody) return cors(json({ ok: false, error: "payload_too_large" }, 413));
  let p; try { p = JSON.parse(raw); } catch { return cors(json({ ok: false, error: "invalid_json" }, 400)); }

  const site = normalizeSite(p.siteId, p.siteName);
  if (!site.siteId) return cors(json({ ok: false, error: "site_id_required" }, 400));
  const eventType = ["pageview", "heartbeat", "pageleave"].includes(p.type) ? p.type : "pageview";
  const now = new Date().toISOString();
  const cf = request.cf || {};
  const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "";
  const ua = request.headers.get("User-Agent") || p.platformHints?.userAgent || "";
  const parsed = parseUserAgent(ua);
  const ipHash = await sha256(ip);
  const rawIp = env.RAW_IP_MODE === "raw" ? ip : null;
  const visitor = sanitizeToken(p.visitorId, 120) || await sha256(`${ipHash}|${p.language || ""}|${ua}`).then(x=>x.slice(0,32));
  const session = sanitizeToken(p.sessionId, 120) || crypto.randomUUID();
  const eventId = crypto.randomUUID();

  await env.DB.prepare(`INSERT INTO events (id,received_at,event_type,site_id,site_name,session_id,visitor_id,page_url,path,title,referrer,referrer_host,language,timezone,country,region,city,continent,colo,asn,ip,ip_hash,user_agent,browser,os,device,screen_width,screen_height,viewport_width,viewport_height,duration_ms,max_scroll,clicks,outbound_clicks) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(eventId,now,eventType,site.siteId,site.siteName,session,visitor,validUrl(p.pageUrl),sanitizeText(p.path,500),sanitizeText(p.title,300),validUrl(p.referrer),hostOf(p.referrer),sanitizeText(p.language,50),sanitizeText(p.timezone || cf.timezone,100),sanitizeText(cf.country,20),sanitizeText(cf.region,100),sanitizeText(cf.city,120),sanitizeText(cf.continent,30),sanitizeText(cf.colo,20),Number.isFinite(cf.asn)?cf.asn:null,rawIp,ipHash,ua,parsed.browser,parsed.os,parsed.device,numberOrNull(p.screen?.width),numberOrNull(p.screen?.height),numberOrNull(p.viewport?.width),numberOrNull(p.viewport?.height),Math.max(0,Number(p.durationMs||0)),Math.max(0,Math.min(100,Number(p.maxScroll||0))),Math.max(0,Number(p.clicks||0)),Math.max(0,Number(p.outboundClicks||0)))
    .run();

  await upsertSiteAndSession(env, { site, session, visitor, now, eventType, durationMs:Number(p.durationMs||0), maxScroll:Number(p.maxScroll||0) });
  return cors(json({ ok: true, id: eventId, siteId: site.siteId }));
}

async function upsertSiteAndSession(env, x) {
  await env.DB.prepare(`INSERT INTO sites(site_id,site_name,first_seen,last_seen,views,sessions) VALUES(?,?,?,?,?,?) ON CONFLICT(site_id) DO UPDATE SET site_name=excluded.site_name,last_seen=excluded.last_seen,views=views+excluded.views`)
    .bind(x.site.siteId,x.site.siteName,x.now,x.now,x.eventType === "pageview" ? 1 : 0,x.eventType === "pageview" ? 1 : 0).run();
  await env.DB.prepare(`INSERT INTO visitor_sessions(site_id,session_id,visitor_id,first_seen,last_seen,duration_ms,views,max_scroll) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(site_id,session_id) DO UPDATE SET last_seen=excluded.last_seen,duration_ms=max(duration_ms,excluded.duration_ms),views=views+excluded.views,max_scroll=max(max_scroll,excluded.max_scroll)`)
    .bind(x.site.siteId,x.session,x.visitor,x.now,x.now,x.durationMs,x.eventType === "pageview" ? 1 : 0,x.maxScroll).run();
}

async function listSites(env) {
  const { results } = await env.DB.prepare(`SELECT s.site_id AS siteId,s.site_name AS siteName,COALESCE((SELECT COUNT(*) FROM events e1 WHERE e1.site_id=s.site_id AND e1.event_type='pageview'),0) AS views,COALESCE((SELECT COUNT(DISTINCT e2.visitor_id) FROM events e2 WHERE e2.site_id=s.site_id),0) AS uniqueVisitors,COALESCE((SELECT COUNT(*) FROM visitor_sessions vs WHERE vs.site_id=s.site_id),0) AS sessions,s.last_seen AS lastSeen FROM sites s ORDER BY s.last_seen DESC`).all();
  return cors(json((results || []).map(x=>({...x,views:Number(x.views||0),uniqueVisitors:Number(x.uniqueVisitors||0),sessions:Number(x.sessions||0)}))));
}

async function overview(env, days) {
  const since = daysAgo(days);
  const q = await env.DB.prepare(`SELECT COUNT(*) AS totalViews,COUNT(DISTINCT visitor_id) AS uniqueVisitors,COUNT(DISTINCT session_id) AS sessions,COALESCE(AVG(duration_ms),0) AS avgDurationMs FROM events WHERE event_type='pageview' AND received_at>=?`).bind(since).first();
  return cors(json({ totalViews:Number(q?.totalViews||0),uniqueVisitors:Number(q?.uniqueVisitors||0),sessions:Number(q?.sessions||0),avgDurationMs:Number(q?.avgDurationMs||0),days }));
}

async function siteStats(env, siteId, days) {
  if (!safeSiteId(siteId)) return cors(json({error:"invalid_site_id"},400));
  const since = daysAgo(days);
  const site = await env.DB.prepare(`SELECT site_id AS siteId,site_name AS siteName FROM sites WHERE site_id=?`).bind(siteId).first();
  if (!site) return cors(json({siteId,siteName:siteId,views:0,uniqueVisitors:0,sessions:0,series:[],devices:{},topPages:[],recentVisits:[]}));
  const [totals,series,devices,pages,visits] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS views,COUNT(DISTINCT visitor_id) AS uniqueVisitors,COUNT(DISTINCT session_id) AS sessions FROM events WHERE site_id=? AND event_type='pageview' AND received_at>=?`).bind(siteId,since).first(),
    env.DB.prepare(`SELECT substr(received_at,1,10) AS day,COUNT(*) AS views FROM events WHERE site_id=? AND event_type='pageview' AND received_at>=? GROUP BY day ORDER BY day`).bind(siteId,since).all(),
    env.DB.prepare(`SELECT COALESCE(device,'Unknown') AS device,COUNT(*) AS n FROM events WHERE site_id=? AND event_type='pageview' AND received_at>=? GROUP BY device ORDER BY n DESC`).bind(siteId,since).all(),
    env.DB.prepare(`SELECT COALESCE(path,'/') AS path,COUNT(*) AS views FROM events WHERE site_id=? AND event_type='pageview' AND received_at>=? GROUP BY path ORDER BY views DESC LIMIT 12`).bind(siteId,since).all(),
    env.DB.prepare(`SELECT received_at AS ts,path,page_url AS pageUrl,city,country,device,browser,duration_ms AS durationMs,referrer_host AS referrerHost FROM events WHERE site_id=? AND event_type='pageview' ORDER BY received_at DESC LIMIT 120`).bind(siteId).all()
  ]);
  return cors(json({siteId,siteName:site.siteName,views:Number(totals?.views||0),uniqueVisitors:Number(totals?.uniqueVisitors||0),sessions:Number(totals?.sessions||0),series:series.results||[],devices:Object.fromEntries((devices.results||[]).map(x=>[x.device,Number(x.n)])),topPages:pages.results||[],recentVisits:visits.results||[]}));
}

async function flushToGithub(env) {
  if (String(env.ARCHIVE_ENABLED) !== "true" || !env.GITHUB_TOKEN) return;
  const limit = 1200;
  const { results } = await env.DB.prepare(`SELECT * FROM events WHERE exported=0 ORDER BY received_at LIMIT ?`).bind(limit).all();
  if (!results?.length) return;
  const grouped = groupBy(results, x => `${x.site_id}__${x.received_at.slice(0,10)}`);
  for (const [key, rows] of Object.entries(grouped)) {
    const [siteId, day] = key.split("__");
    const safe = safeSiteId(siteId) ? siteId : `site-${(await sha256(siteId)).slice(0,20)}`;
    const path = `data/sites/${safe}/events/${day}.json`;
    const current = await githubGet(env, path);
    const existing = (current?.content ? decodeBase64Json(current.content) : null) || { schemaVersion:1,siteId,day,events:[] };
    existing.events = Array.isArray(existing.events) ? existing.events : [];
    const mapped = rows.map(stripForArchive);
    existing.events.push(...mapped);
    existing.updatedAt = new Date().toISOString();
    await githubPut(env,path,existing,current?.sha);
    const ids = rows.map(r=>r.id);
    for (let i=0;i<ids.length;i+=100) await env.DB.prepare(`UPDATE events SET exported=1 WHERE id IN (${ids.slice(i,i+100).map(()=>"?").join(",")})`).bind(...ids.slice(i,i+100)).run();
    const metaPath = `data/sites/${safe}/meta.json`;
    const metaCurrent = await githubGet(env, metaPath);
    await githubPut(env, metaPath, {schemaVersion:1,siteId,name:rows[0].site_name,lastUpdated:new Date().toISOString()}, metaCurrent?.sha);
  }
}

function stripForArchive(r){return {id:r.id,receivedAt:r.received_at,type:r.event_type,siteId:r.site_id,siteName:r.site_name,sessionId:r.session_id,visitorId:r.visitor_id,pageUrl:r.page_url,path:r.path,title:r.title,referrer:r.referrer,referrerHost:r.referrer_host,language:r.language,timezone:r.timezone,geo:{country:r.country,region:r.region,city:r.city,continent:r.continent,colo:r.colo,asn:r.asn},network:{ipHash:r.ip_hash,ip:r.ip||undefined},client:{browser:r.browser,os:r.os,device:r.device,userAgent:r.user_agent,screen:{width:r.screen_width,height:r.screen_height},viewport:{width:r.viewport_width,height:r.viewport_height}},engagement:{durationMs:r.duration_ms,maxScroll:r.max_scroll,clicks:r.clicks,outboundClicks:r.outbound_clicks}};}

async function githubGet(env,path){const r=await fetch(`${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${encodeURIComponent(env.GITHUB_BRANCH||"main")}`,{headers:ghHeaders(env)});if(r.status===404)return null;if(!r.ok)throw Error(`GitHub GET ${r.status}`);return await r.json();}
async function githubPut(env,path,obj,sha){const payload={message:`analytics: archive ${path}`,content:base64(JSON.stringify(obj,null,2)),branch:env.GITHUB_BRANCH||"main",committer:{name:"GitHub Page Insights",email:"github-page-insights@users.noreply.github.com"}};if(sha)payload.sha=sha;const r=await fetch(`${GH_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`,{method:"PUT",headers:{...ghHeaders(env),"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!r.ok){const text=await r.text();throw Error(`GitHub PUT ${r.status}: ${text.slice(0,300)}`);}return r.json();}
function ghHeaders(env){return {Accept:"application/vnd.github+json",Authorization:`Bearer ${env.GITHUB_TOKEN}`,"X-GitHub-Api-Version":"2026-03-10","User-Agent":"github-page-insights-worker"};}
function normalizeSite(id,name){let siteId=sanitizeSiteId(id||"");if(!siteId)siteId=`site-${Date.now().toString(36)}`;return {siteId,siteName:sanitizeText(name,160)||siteId};}
function sanitizeSiteId(v){return String(v||"").trim().toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80)}
function safeSiteId(v){return /^[a-z0-9][a-z0-9._-]{0,79}$/.test(String(v||""))}
function sanitizeToken(v,max){const s=String(v||"").trim();return s&&s.length<=max?s.slice(0,max):""}
function sanitizeText(v,max){return String(v??"").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,max)}
function validUrl(v){try{const u=new URL(v);return /^https?:$/.test(u.protocol)?u.href:null}catch{return null}}
function hostOf(v){try{return new URL(v).hostname.slice(0,200)}catch{return null}}
function numberOrNull(v){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(100000,n)):null}
function parseUserAgent(ua){let browser="Other",os="Other",device="Desktop";if(/Edg\//.test(ua))browser="Edge";else if(/Chrome\//.test(ua))browser="Chrome";else if(/Firefox\//.test(ua))browser="Firefox";else if(/Safari\//.test(ua)&&!/Chrome\//.test(ua))browser="Safari";else if(/OPR\//.test(ua))browser="Opera";if(/Windows/i.test(ua))os="Windows";else if(/Android/i.test(ua))os="Android";else if(/iPhone|iPad|iPod/i.test(ua))os="iOS";else if(/Mac OS X/i.test(ua))os="macOS";else if(/Linux/i.test(ua))os="Linux";if(/Mobi|Android|iPhone|iPad|iPod/i.test(ua))device=/iPad|Tablet/i.test(ua)?"Tablet":"Mobile";return {browser,os,device}}
function daysAgo(days){const d=new Date(Date.now()-Math.max(1,Math.min(365,days))*86400000);return d.toISOString()}
function groupBy(rows,fn){return rows.reduce((a,r)=>(a[fn(r)]??=[]).push(r),a),a}
function base64(s){return btoa(unescape(encodeURIComponent(s)))}
function decodeBase64Json(s){try{return JSON.parse(decodeURIComponent(escape(atob(s.replace(/\n/g,"")))))}catch{return null}}
function cors(response){const h=new Headers(response.headers);h.set("Access-Control-Allow-Origin","*");h.set("Access-Control-Allow-Methods","GET,POST,OPTIONS");h.set("Access-Control-Allow-Headers","Content-Type");h.set("Cache-Control","no-store");return new Response(response.body,{status:response.status,headers:h})}
function json(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json; charset=utf-8"}})}
async function sha256(input){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(input||"")));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
