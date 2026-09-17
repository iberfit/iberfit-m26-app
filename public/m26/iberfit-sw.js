self.addEventListener('fetch',(event)=>{
  const request=event.request;
  const url=new URL(request.url);
  if(
    request.method!=='GET'||
    url.origin!==self.location.origin||
    !url.pathname.startsWith('/src/m26/')
  )return;
  event.stopImmediatePropagation();
  event.respondWith(networkFirst(request,{event}));
});

importScripts('/m26/sw.js');

async function rootNavigationResponse(request){
  const cache=await caches.open(SHELL);
  const pinnedShell=await cache.match('/m26/index.html');
  if(pinnedShell)return pinnedShell;
  try{
    const response=await fetchWithDeadline(
      request,
      {cache:'reload',credentials:'same-origin',redirect:'error'},
      NETWORK_TIMEOUT_MS,
    );
    if(response?.ok)return response;
  }catch{}
  return await cache.match('/m26/offline.html')||Response.error();
}

self.addEventListener('fetch',(event)=>{
  const request=event.request;
  const url=new URL(request.url);
  if(
    request.method!=='GET'||
    request.mode!=='navigate'||
    url.origin!==self.location.origin||
    url.pathname!=='/'
  )return;
  event.respondWith(rootNavigationResponse(request));
});
