const MAX_ENDPOINT_LENGTH=4096;
const MAX_KEY_LENGTH=2048;

function hasFunction(value,key){
  return Boolean(value&&typeof value[key]==='function');
}

function normalizeBase64Url(value){
  const raw=String(value||'').trim();
  if(!raw||raw.length>MAX_KEY_LENGTH)return null;
  if(!/^[A-Za-z0-9_-]+={0,2}$/.test(raw))return null;
  return raw.replace(/=+$/,'');
}

export function urlBase64ToUint8Array(value){
  const normalized=normalizeBase64Url(value);
  if(!normalized)throw new Error('M26_PUSH_PUBLIC_KEY_INVALID');

  const padded=`${normalized}${'='.repeat((4-normalized.length%4)%4)}`;
  const base64=padded.replace(/-/g,'+').replace(/_/g,'/');

  let binary='';
  if(typeof globalThis.atob==='function'){
    binary=globalThis.atob(base64);
  }else if(typeof Buffer!=='undefined'){
    binary=Buffer.from(base64,'base64').toString('binary');
  }else{
    throw new Error('M26_PUSH_BASE64_UNAVAILABLE');
  }

  return Uint8Array.from(binary,(character)=>character.charCodeAt(0));
}

export function webPushCapability({
  navigatorObject=globalThis.navigator,
  notificationApi=globalThis.Notification,
  pushManagerApi=globalThis.PushManager,
  secureContext=globalThis.isSecureContext,
}={}){
  const serviceWorkerSupported=Boolean(navigatorObject?.serviceWorker);
  const pushSupported=Boolean(pushManagerApi);
  const notificationsSupported=Boolean(notificationApi);
  const secure=secureContext===true;
  const permission=notificationsSupported
    ?String(notificationApi.permission||'default')
    :'unsupported';

  return Object.freeze({
    supported:secure&&serviceWorkerSupported&&pushSupported&&notificationsSupported,
    secureContext:secure,
    serviceWorkerSupported,
    pushSupported,
    notificationsSupported,
    permission,
    denied:permission==='denied',
    granted:permission==='granted',
  });
}

function validateEndpoint(endpoint){
  const raw=String(endpoint||'').trim();
  if(!raw||raw.length>MAX_ENDPOINT_LENGTH)throw new Error('M26_PUSH_ENDPOINT_INVALID');

  let url;
  try{url=new URL(raw);}catch{throw new Error('M26_PUSH_ENDPOINT_INVALID');}
  if(url.protocol!=='https:')throw new Error('M26_PUSH_ENDPOINT_INSECURE');
  return url.toString();
}

function keyFromSubscription(subscription,name){
  const json=typeof subscription?.toJSON==='function'
    ?subscription.toJSON()
    :null;
  const fromJson=normalizeBase64Url(json?.keys?.[name]);
  if(fromJson)return fromJson;

  const buffer=subscription?.getKey?.(name);
  if(!buffer)return null;
  const bytes=new Uint8Array(buffer);
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  if(typeof globalThis.btoa!=='function')throw new Error('M26_PUSH_BASE64_UNAVAILABLE');
  return globalThis.btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export function serializeIberfitPushSubscription(subscription){
  if(!subscription)throw new Error('M26_PUSH_SUBSCRIPTION_REQUIRED');

  const endpoint=validateEndpoint(subscription.endpoint);
  const p256dh=keyFromSubscription(subscription,'p256dh');
  const auth=keyFromSubscription(subscription,'auth');
  if(!p256dh||!auth)throw new Error('M26_PUSH_KEYS_REQUIRED');

  return Object.freeze({
    endpoint,
    expirationTime:Number.isFinite(subscription.expirationTime)
      ?Number(subscription.expirationTime)
      :null,
    keys:Object.freeze({p256dh,auth}),
  });
}

export async function getIberfitPushSubscription(registration){
  if(!registration?.pushManager||!hasFunction(registration.pushManager,'getSubscription')){
    return null;
  }
  return await registration.pushManager.getSubscription();
}

export async function subscribeIberfitWebPush({
  registration,
  applicationServerKey,
  notificationApi=globalThis.Notification,
}={}){
  if(!registration?.pushManager||!hasFunction(registration.pushManager,'subscribe')){
    throw new Error('M26_PUSH_MANAGER_UNAVAILABLE');
  }
  if(!notificationApi||typeof notificationApi.requestPermission!=='function'){
    throw new Error('M26_NOTIFICATIONS_UNAVAILABLE');
  }

  let permission=String(notificationApi.permission||'default');
  if(permission==='denied')throw new Error('M26_PUSH_PERMISSION_DENIED');
  if(permission!=='granted'){
    permission=String(await notificationApi.requestPermission());
  }
  if(permission!=='granted')throw new Error('M26_PUSH_PERMISSION_NOT_GRANTED');

  const key=urlBase64ToUint8Array(applicationServerKey);
  const existing=await getIberfitPushSubscription(registration);
  if(existing)return serializeIberfitPushSubscription(existing);

  const subscription=await registration.pushManager.subscribe({
    userVisibleOnly:true,
    applicationServerKey:key,
  });

  return serializeIberfitPushSubscription(subscription);
}

export async function unsubscribeIberfitWebPush(registration){
  const subscription=await getIberfitPushSubscription(registration);
  if(!subscription)return Object.freeze({unsubscribed:true,hadSubscription:false});

  const serialized=serializeIberfitPushSubscription(subscription);
  const unsubscribed=await subscription.unsubscribe();
  return Object.freeze({
    unsubscribed:unsubscribed===true,
    hadSubscription:true,
    endpoint:serialized.endpoint,
  });
}
