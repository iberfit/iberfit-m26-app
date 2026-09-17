const IBERFIT_MUTABLE_RUNTIME_CACHE='iberfit-m26-runtime-network-v1';
const IBERFIT_MUTABLE_M26_ASSET=/\.(?:js|css|html)$/iu;

function isIberfitMutableRuntimeRequest(request,url){
  return request.method==='GET'&&
    url.origin===self.location.origin&&
    (
      url.pathname.startsWith('/src/m26/')||
      (url.pathname.startsWith('/m26/')&&IBERFIT_MUTABLE_M26_ASSET.test(url.pathname))
    );
}

function shouldStoreMutableRuntime(response){
  return response?.ok&&
    response.type!=='opaqueredirect'&&
    !/no-store/i.test(response.headers?.get?.('cache-control')||'');
}

async function mutableRuntimeNetworkFirst(request){
  const cache=await caches.open(IBERFIT_MUTABLE_RUNTIME_CACHE);
  try{
    const response=await fetch(request,{
      cache:'reload',
      credentials:'same-origin',
      redirect:'error',
    });
    if(shouldStoreMutableRuntime(response)){
      await cache.put(request,response.clone());
    }
    return response;
  }catch{
    return await cache.match(request)||
      await caches.match(request)||
      Response.error();
  }
}

// Register the freshness handler before the legacy worker. This is intentional:
// the first matching listener owns mutable runtime requests and prevents the
// release-pinned cache in /m26/sw.js from serving stale application code.
self.addEventListener('fetch',(event)=>{
  const request=event.request;
  const url=new URL(request.url);
  if(!isIberfitMutableRuntimeRequest(request,url))return;
  event.stopImmediatePropagation();
  event.respondWith(mutableRuntimeNetworkFirst(request));
});

importScripts('/m26/sw.js');

const IBERFIT_ROOT_NAVIGATION_PATHS=new Set(['/']);

function isIberfitRootNavigation(request,url){
  return request.method==='GET'&&
    request.mode==='navigate'&&
    url.origin===self.location.origin&&
    IBERFIT_ROOT_NAVIGATION_PATHS.has(url.pathname);
}

async function rootNavigationResponse(request){
  const cache=await caches.open(SHELL);
  const pinnedShell=await cache.match('/m26/index.html');
  if(pinnedShell)return pinnedShell;

  try{
    const response=await fetchWithDeadline(
      request,
      {
        cache:'reload',
        credentials:'same-origin',
        redirect:'error',
      },
      NETWORK_TIMEOUT_MS,
    );
    if(response?.ok)return response;
  }catch{}

  return await cache.match('/m26/offline.html')||
    Response.error();
}

self.addEventListener('fetch',(event)=>{
  const request=event.request;
  const url=new URL(request.url);
  if(!isIberfitRootNavigation(request,url))return;
  event.respondWith(rootNavigationResponse(request));
});
