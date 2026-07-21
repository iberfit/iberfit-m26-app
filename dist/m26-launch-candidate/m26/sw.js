const VERSION='m26-rc15';
const SHELL=`iberfit-${VERSION}-shell`;
const OFFLINE='/m26/offline.html';
const APP_SHELL=['/m26/index.html','/m26/app.js','/m26/manifest.webmanifest','/m26/offline.html','/m26/icons/icon-192.png','/m26/icons/icon-512.png','/m26/icons/icon-maskable-192.png','/m26/icons/icon-maskable-512.png','/src/m26/shell/shell.css','/public/isotipo-iberfit.png','/baseline_m25_2/exercise-catalog-m25.json'];
function protectedRequest(request,url){return request.method!=='GET'||url.origin!==self.location.origin||url.pathname.includes('/rest/v1/')||url.pathname.includes('/rpc/')||url.pathname.includes('/auth/v1/');}
self.addEventListener('install',(event)=>event.waitUntil(caches.open(SHELL).then((cache)=>cache.addAll(APP_SHELL))));
self.addEventListener('activate',(event)=>event.waitUntil(caches.keys().then((keys)=>Promise.all(keys.filter((key)=>key.startsWith('iberfit-m26-')&&key!==SHELL).map((key)=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',(event)=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',(event)=>{
  const request=event.request;const url=new URL(request.url);if(protectedRequest(request,url))return;
  event.respondWith(fetch(request).then((response)=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(SHELL).then((cache)=>cache.put(request,copy)));}
    return response;
  }).catch(async()=>{
    const cached=await caches.match(request);if(cached)return cached;
    if(request.mode==='navigate')return await caches.match('/m26/index.html')||await caches.match(OFFLINE);
    return await caches.match(OFFLINE);
  }));
});
