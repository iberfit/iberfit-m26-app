importScripts('/m26/sw.js');

const IBERFIT_ROOT_NAVIGATION_PATHS=new Set(['/']);

function isIberfitRootNavigation(request,url){
  return request.method==='GET'&&
    request.mode==='navigate'&&
    url.origin===self.location.origin&&
    IBERFIT_ROOT_NAVIGATION_PATHS.has(url.pathname);
}

async function rootNavigationResponse(request){
  try{
    const response=await fetch(request,{
      credentials:'same-origin',
      redirect:'error',
    });
    if(response?.ok)return response;
  }catch{}

  return await caches.match('/m26/index.html')||
    await caches.match('/m26/offline.html')||
    Response.error();
}

self.addEventListener('fetch',(event)=>{
  const request=event.request;
  const url=new URL(request.url);
  if(!isIberfitRootNavigation(request,url))return;
  event.respondWith(rootNavigationResponse(request));
});
