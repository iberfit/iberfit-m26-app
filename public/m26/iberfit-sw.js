importScripts('/m26/sw.js');

const IBERFIT_ROOT_NAVIGATION_PATHS=new Set(['/']);
const IBERFIT_PUSH_TITLE='IBERFIT';
const IBERFIT_PUSH_BODY='Tienes una actualización en IBERFIT.';
const IBERFIT_PUSH_URL='/';
const IBERFIT_PUSH_ICON='/m26/icons/icon-192.png';
const IBERFIT_PUSH_BADGE='/m26/icons/icon-maskable-192.png';

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

function safePushTag(event){
  try{
    const payload=event?.data?.json?.();
    const raw=String(payload?.tag||'iberfit-update').trim().toLowerCase();
    if(/^[a-z0-9_-]{1,48}$/u.test(raw))return raw;
  }catch{}
  return 'iberfit-update';
}

self.addEventListener('push',(event)=>{
  event.waitUntil(
    self.registration.showNotification(IBERFIT_PUSH_TITLE,{
      body:IBERFIT_PUSH_BODY,
      icon:IBERFIT_PUSH_ICON,
      badge:IBERFIT_PUSH_BADGE,
      tag:safePushTag(event),
      renotify:false,
      requireInteraction:false,
      data:{url:IBERFIT_PUSH_URL},
    }),
  );
});

self.addEventListener('notificationclick',(event)=>{
  event.notification?.close?.();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const sameOrigin=windows.find((client)=>{
      try{return new URL(client.url).origin===self.location.origin;}catch{return false;}
    });
    if(sameOrigin?.focus){
      await sameOrigin.focus();
      return;
    }
    await self.clients.openWindow?.(IBERFIT_PUSH_URL);
  })());
});

self.addEventListener('fetch',(event)=>{
  const request=event.request;
  const url=new URL(request.url);
  if(!isIberfitRootNavigation(request,url))return;
  event.respondWith(rootNavigationResponse(request));
});
