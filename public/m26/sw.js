const VERSION='m26-rc28';
const PREVIOUS_VERSION='m26-rc27'; // preserved for cache migration evidence
// Historical compatibility markers retained for regression evidence: m26-rc23, m26-rc19, m26-rc17.
const SHELL=`iberfit-${VERSION}-shell`;
const OFFLINE='/m26/offline.html';
const APP_SHELL=['/m26/index.html','/m26/app.js','/m26/manifest.webmanifest','/m26/offline.html','/m26/offline.css','/m26/offline.js','/m26/iri-report.html','/m26/iri-report.css','/src/m26/workflows/iri-report-page.js','/m26/icons/icon-192.png','/m26/icons/icon-512.png','/m26/icons/icon-maskable-192.png','/m26/icons/icon-maskable-512.png','/src/m26/shell/shell.css','/src/m26/communication/communication.css','/src/m26/admin/admin.css','/public/isotipo-iberfit.png','/baseline_m25_2/exercise-catalog-m25.json','/public/vendor/repdb/iberfit-canonical-media-map-v1.json','/src/m26/workflows/iri-external-report.css','/src/m26/ui/client-bottom-nav.css','/src/m26/rc39/rc39.css','/src/m26/rc42/rc42.css'];
const NEVER_CACHE_PREFIXES=['/auth/v1/','/api/','/rest/v1/','/rpc/','/functions/'];
const CACHEABLE_PREFIXES=['/m26/','/src/m26/','/baseline_m25_2/','/public/vendor/repdb/'];
const CACHE_FIRST_PATHS=new Set(['/m26/manifest.webmanifest','/public/isotipo-iberfit.png','/baseline_m25_2/exercise-catalog-m25.json','/public/vendor/repdb/iberfit-canonical-media-map-v1.json','/m26/icons/icon-192.png','/m26/icons/icon-512.png','/m26/icons/icon-maskable-192.png','/m26/icons/icon-maskable-512.png']);
function isRuntimeConfig(pathname){return pathname==='/m26/runtime-config.js'||pathname==='/m26/runtime-config.example.js';}
function isProtected(request,url){return request.method!=='GET'||url.origin!==self.location.origin||NEVER_CACHE_PREFIXES.some((prefix)=>url.pathname.startsWith(prefix))||isRuntimeConfig(url.pathname);}
function isCacheablePath(pathname){return CACHEABLE_PREFIXES.some((prefix)=>pathname.startsWith(prefix))||pathname==='/public/isotipo-iberfit.png';}
function shouldStore(response){return response?.ok&&response.type!=='opaqueredirect'&&!/no-store/i.test(response.headers?.get?.('cache-control')||'');}
async function installShell(){const cache=await caches.open(SHELL);for(const url of APP_SHELL){const response=await fetch(url,{cache:'reload',credentials:'same-origin'});if(!response.ok)throw new Error(`M26_SW_SHELL_MISSING:${url}`);await cache.put(url,response);}}
async function cacheFirst(request,event){const cache=await caches.open(SHELL);const cached=await cache.match(request);const update=fetch(request).then((response)=>{if(shouldStore(response))event.waitUntil(cache.put(request,response.clone()));return response;}).catch(()=>null);return cached||await update||Response.error();}
async function networkFirst(request,{fallback=null,event}={}){try{const response=await fetch(request);if(shouldStore(response)){const copy=response.clone();event?.waitUntil(caches.open(SHELL).then((cache)=>cache.put(request,copy)));}return response;}catch{const cached=await caches.match(request);if(cached)return cached;if(fallback){const offline=await caches.match(fallback);if(offline)return offline;}return Response.error();}}
self.addEventListener('install',(event)=>event.waitUntil(installShell()));
self.addEventListener('activate',(event)=>event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key.startsWith('iberfit-m26-')&&key!==SHELL).map((key)=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',(event)=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',(event)=>{
  const request=event.request;const url=new URL(request.url);if(isProtected(request,url)||!isCacheablePath(url.pathname))return;
  if(request.mode==='navigate'){
    if(!url.pathname.startsWith('/m26/'))return;
    event.respondWith(networkFirst(request,{fallback:'/m26/index.html',event}).then(async(response)=>response.ok?response:await caches.match(OFFLINE)||response));
    return;
  }
  if(CACHE_FIRST_PATHS.has(url.pathname)||/^\/public\/vendor\/repdb\/images\/flat\/[a-z0-9-]+-(?:main|start|peak)\.webp$/.test(url.pathname)){event.respondWith(cacheFirst(request,event));return;}
  event.respondWith(networkFirst(request,{event}));
});
