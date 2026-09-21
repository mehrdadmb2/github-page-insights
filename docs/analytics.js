/* Universal Event Insights Browser SDK v8 */
(function(){
  "use strict";
  const C=window.PAGE_INSIGHTS_CONFIG||{};
  const worker=String(C.workerUrl||"").replace(/\/+$/,"");
  const meta=n=>document.querySelector('meta[name="'+n+'"]')?.content||"";
  const platformId=(C.platformId||meta("page-insights-platform-id")||meta("page-insights-site-id")||meta("uei-platform-id")||location.hostname||"web").trim();
  const platformName=(C.platformName||meta("page-insights-platform-name")||meta("page-insights-site-name")||meta("uei-platform-name")||platformId).trim();
  const platformType=(C.platformType||meta("page-insights-platform-type")||meta("uei-platform-type")||"web").trim();
  const environment=(C.environment||meta("page-insights-environment")||"production").trim();
  const appVersion=C.appVersion||meta("page-insights-app-version")||null;
  const platformIp=C.platformIp||meta("page-insights-platform-ip")||null;
  if(!worker||!platformId)return;

  const key="uei_v8_"+platformId;
  function load(storeName,keyName,fallback){try{const store=storeName==="session"?sessionStorage:localStorage;return store.getItem(key+"_"+keyName)||fallback()}catch{return fallback()}}
  const visitorId=load("local","visitor",()=>crypto.randomUUID());
  const sessionId=load("session","session",()=>crypto.randomUUID());
  try{localStorage.setItem(key+"_visitor",visitorId)}catch{}
  try{sessionStorage.setItem(key+"_session",sessionId)}catch{}

  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  let pageStart=Date.now(),durationMs=0,maxScroll=0,clicks=0,outboundClicks=0,lastScrollSent=0,pageLeft=false;
  const screenInfo={width:window.screen?.width||null,height:window.screen?.height||null,devicePixelRatio:window.devicePixelRatio||1,colorDepth:window.screen?.colorDepth||24};
  const viewport=()=>({width:window.innerWidth||null,height:window.innerHeight||null});
  const conn=()=>({type:connection?.effectiveType||connection?.type||null,downlink:connection?.downlink??null,rtt:connection?.rtt??null,saveData:Boolean(connection?.saveData)});
  const page=()=>({url:location.href,path:location.pathname,queryString:location.search.slice(1),title:document.title,referrer:document.referrer||null});
  const identity=()=>({visitorId,sessionId,userId:C.userId||null,anonymousId:C.anonymousId||null});

  function baseBody(eventType,data,metadata){
    durationMs=Math.max(0,Date.now()-pageStart);
    return {platformId,platformName,platformType,environment,appVersion,platformIp,source:"browser",sdkName:"universal-event-insights-browser",sdkVersion:"8.0.0",eventType,eventId:crypto.randomUUID(),timestamp:new Date().toISOString(),identity:identity(),page:page(),screen:screenInfo,viewport:viewport(),connection:conn(),durationMs,maxScroll,clicks,outboundClicks,data:data||{},metadata:metadata||{}};
  }
  function send(eventType,data,metadata,beacon){
    const body=baseBody(eventType,data,metadata),url=worker+"/v1/events";
    if(beacon){try{const blob=new Blob([JSON.stringify(body)],{type:"application/json"});if(navigator.sendBeacon?.(url,blob))return true}catch{}}
    fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),keepalive:true,cache:"no-store"}).catch(()=>{});
    return true;
  }
  function updateScroll(){
    const d=document.documentElement,b=document.body||{},top=window.scrollY||d.scrollTop||0,total=Math.max(d.scrollHeight,b.scrollHeight||0)-window.innerHeight;
    maxScroll=total>0?Math.min(100,Math.round(top/total*100)):100;
    if(maxScroll-lastScrollSent>=5){lastScrollSent=maxScroll;send("scroll",{depth:maxScroll},{})}
  }

  addEventListener("scroll",updateScroll,{passive:true});
  addEventListener("click",e=>{
    clicks++;
    const a=e.target?.closest?.("a");
    const target={tag:e.target?.tagName||null,id:e.target?.id||null,className:typeof e.target?.className==="string"?e.target.className.slice(0,256):null};
    send("click",{target},{},false);
    if(a&&a.href&&a.origin!==location.origin){outboundClicks++;send("outbound_click",{href:a.href,text:(a.textContent||"").trim().slice(0,256)},{},false)}
  },{passive:true});
  document.addEventListener("visibilitychange",()=>send("visibility",{state:document.visibilityState},{}));
  addEventListener("pagehide",()=>{if(!pageLeft){pageLeft=true;send("pageleave",{}, {reason:"pagehide"}, true)}});
  addEventListener("beforeunload",()=>{if(!pageLeft){pageLeft=true;send("pageleave",{}, {reason:"beforeunload"}, true)}});
  if(connection?.addEventListener)connection.addEventListener("change",()=>send("custom",{connectionChanged:true,connection:conn()},{}));
  updateScroll();
  send("pageview");
  setInterval(()=>{if(!pageLeft)send("heartbeat",{}, {})},Math.max(15000,Number(C.heartbeatMs||30000)));
})();
