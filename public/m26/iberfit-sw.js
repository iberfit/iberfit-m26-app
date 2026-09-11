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
