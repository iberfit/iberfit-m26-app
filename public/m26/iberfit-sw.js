importScripts('/m26/sw.js');

const IBERFIT_ROOT_NAVIGATION_PATHS=new Set(['/']);
const IBERFIT_PUSH_TITLE='Actualización IBERFIT';
const IBERFIT_PUSH_BODY='Abre IBERFIT para revisar el detalle de forma segura.';
const IBERFIT_PUSH_DEFAULT_PATH='/';

function isIberfitRootNavigation(request,url){
  return request.method==='GET'&&
    request.mode==='navigate'&&
    url.origin===self.location.origin&&
    IBERFIT_ROOT_NAVIGATION_PATHS.has(url.pathname);
}

function safePushPath(value){
  const candidate=String(value||'').trim();
  if(!candidate||!candidate.startsWith('/')||candidate.startsWith('//'))return IBERFIT_PUSH_DEFAULT_PATH;
  try{
    const url=new URL(candidate,self.location.origin);
    if(url.origin!==self.location.origin)return IBERFIT_PUSH_DEFAULT_PATH;
    return `${url.pathname}${url.search}${url.hash}`;
  }catch{
    return IBERFIT_PUSH_DEFAULT_PATH;
  }
}

function safePushTag(value){
  const tag=String(value||'')
    .replace(/[^a-zA-Z0-9._:-]/g,'')
    .slice(0,120);
  return tag?`iberfit:${tag}`:'iberfit:update';
}

function pushPayload(event){
  try{
    const value=event?.data?.json?.();
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }catch{
    return {};
  }
}

async function showIberfitPush(event){
  const payload=pushPayload(event);
  await self.registration.showNotification(IBERFIT_PUSH_TITLE,{
    body:IBERFIT_PUSH_BODY,
    icon:'/m26/icons/icon-192.png',
    badge:'/m26/icons/icon-192.png',
    tag:safePushTag(payload.notificationId||payload.id),
    renotify:false,
    data:{path:safePushPath(payload.path)},
  });
}

async function openIberfitPush(event){
  event.notification?.close?.();
  const path=safePushPath(event.notification?.data?.path);
  const targetUrl=new URL(path,self.location.origin).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  for(const client of windows){
    try{
      const current=new URL(client.url);
      if(current.origin!==self.location.origin)continue;
      if('navigate' in client&&client.url!==targetUrl)await client.navigate(targetUrl);
      if('focus' in client)return await client.focus();
    }catch{}
  }
  return await self.clients.openWindow?.(targetUrl);
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

self.addEventListener('push',(event)=>{
  event.waitUntil(showIberfitPush(event));
});

self.addEventListener('notificationclick',(event)=>{
  event.waitUntil(openIberfitPush(event));
});

self.addEventListener('fetch',(event)=>{
  const request=event.request;
  const url=new URL(request.url);
  if(!isIberfitRootNavigation(request,url))return;
  event.respondWith(rootNavigationResponse(request));
});
