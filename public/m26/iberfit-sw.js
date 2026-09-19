importScripts('/m26/sw.js');

const IBERFIT_ROOT_NAVIGATION_PATHS=new Set(['/']);
const IBERFIT_PUSH_NOTIFICATION=Object.freeze({
  title:'IBERFIT',
  body:'Tienes una actualización en IBERFIT.',
  icon:'/m26/icons/icon-192.png',
  badge:'/m26/icons/icon-192.png',
  tag:'iberfit-update',
  data:Object.freeze({url:'/'}),
});

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

self.addEventListener('push',(event)=>{
  event.waitUntil(self.registration.showNotification(
    IBERFIT_PUSH_NOTIFICATION.title,
    {
      body:IBERFIT_PUSH_NOTIFICATION.body,
      icon:IBERFIT_PUSH_NOTIFICATION.icon,
      badge:IBERFIT_PUSH_NOTIFICATION.badge,
      tag:IBERFIT_PUSH_NOTIFICATION.tag,
      data:IBERFIT_PUSH_NOTIFICATION.data,
      renotify:false,
    },
  ));
});

self.addEventListener('notificationclick',(event)=>{
  event.notification?.close?.();
  event.waitUntil((async()=>{
    const windowClients=await self.clients.matchAll({
      type:'window',
      includeUncontrolled:true,
    });
    const sameOrigin=windowClients.find((client)=>{
      try{return new URL(client.url).origin===self.location.origin;}catch{return false;}
    });
    if(sameOrigin?.focus)return await sameOrigin.focus();
    if(self.clients.openWindow)return await self.clients.openWindow('/');
    return null;
  })());
});
