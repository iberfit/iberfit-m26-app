const DEFAULT_PUSH_STATE=Object.freeze({
  supported:false,
  secure:false,
  configured:false,
  permission:'unsupported',
  subscribed:false,
  active:false,
  reason:'unsupported',
});

function text(value,max=2048){
  return String(value??'')
    .replace(/[\u0000-\u001f\u007f]/g,' ')
    .trim()
    .slice(0,max);
}

function secureContext(target=globalThis){
  if(target?.isSecureContext===true)return true;
  const protocol=String(target?.location?.protocol||'');
  const hostname=String(target?.location?.hostname||'');
  return protocol==='https:'||['localhost','127.0.0.1'].includes(hostname);
}

function permissionValue(notificationLike=globalThis.Notification){
  const value=String(notificationLike?.permission||'default').toLowerCase();
  return ['default','granted','denied'].includes(value)?value:'default';
}

function featureSupport({target=globalThis,navigatorLike=globalThis.navigator}={}){
  return Boolean(
    secureContext(target)&&
    navigatorLike&&
    'serviceWorker' in navigatorLike&&
    target?.PushManager&&
    target?.Notification
  );
}

function normalizePublicKey(value){
  const source=text(value,512)
    .replace(/\s+/g,'')
    .replace(/-/g,'+')
    .replace(/_/g,'/');
  if(!source)return null;
  const padded=source.padEnd(Math.ceil(source.length/4)*4,'=');
  try{
    const binary=globalThis.atob?.(padded);
    if(typeof binary!=='string'||binary.length!==65)return null;
    return Uint8Array.from(binary,(character)=>character.charCodeAt(0));
  }catch{
    return null;
  }
}

function serializedKey(subscription,name){
  const key=subscription?.getKey?.(name);
  if(!key)return null;
  const bytes=new Uint8Array(key);
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return globalThis.btoa?.(binary)||null;
}

export function serializePushSubscription(subscription){
  if(!subscription?.endpoint)return null;
  const endpoint=text(subscription.endpoint,4096);
  if(!/^https:\/\//i.test(endpoint))throw new Error('M26_PUSH_ENDPOINT_INVALID');
  const p256dh=serializedKey(subscription,'p256dh');
  const auth=serializedKey(subscription,'auth');
  if(!p256dh||!auth)throw new Error('M26_PUSH_KEYS_INVALID');
  return Object.freeze({
    endpoint,
    expirationTime:Number.isFinite(Number(subscription.expirationTime))
      ?Number(subscription.expirationTime)
      :null,
    keys:Object.freeze({p256dh,auth}),
  });
}

export async function inspectWebPushState({
  target=globalThis,
  navigatorLike=globalThis.navigator,
  vapidPublicKey='',
}={}){
  const secure=secureContext(target);
  const supported=featureSupport({target,navigatorLike});
  const configured=Boolean(normalizePublicKey(vapidPublicKey));
  if(!supported){
    return Object.freeze({...DEFAULT_PUSH_STATE,secure,configured,reason:secure?'unsupported':'insecure-context'});
  }
  const permission=permissionValue(target.Notification);
  const registration=await navigatorLike.serviceWorker.getRegistration?.('/').catch?.(()=>null)??null;
  const subscription=registration?.pushManager
    ?await registration.pushManager.getSubscription().catch(()=>null)
    :null;
  const subscribed=Boolean(subscription);
  const active=configured&&permission==='granted'&&subscribed;
  const reason=active
    ?null
    :!configured
      ?'not-configured'
      :permission==='denied'
        ?'permission-denied'
        :permission!=='granted'
          ?'permission-required'
          :!registration
            ?'service-worker-unavailable'
            :'not-subscribed';
  return Object.freeze({supported:true,secure,configured,permission,subscribed,active,reason});
}

export async function requestWebPushPermission({target=globalThis}={}){
  if(!featureSupport({target,navigatorLike:target?.navigator})){
    return Object.freeze({ok:false,permission:'unsupported',reason:'unsupported'});
  }
  const current=permissionValue(target.Notification);
  if(current==='granted')return Object.freeze({ok:true,permission:'granted',reason:null});
  if(current==='denied')return Object.freeze({ok:false,permission:'denied',reason:'permission-denied'});
  const permission=permissionValue({permission:await target.Notification.requestPermission()});
  return Object.freeze({
    ok:permission==='granted',
    permission,
    reason:permission==='granted'?null:permission==='denied'?'permission-denied':'permission-dismissed',
  });
}

export async function subscribeWebPush({
  registration,
  vapidPublicKey,
}={}){
  if(!registration?.pushManager)throw new Error('M26_PUSH_REGISTRATION_REQUIRED');
  if(permissionValue(globalThis.Notification)!=='granted')throw new Error('M26_PUSH_PERMISSION_REQUIRED');
  const applicationServerKey=normalizePublicKey(vapidPublicKey);
  if(!applicationServerKey)throw new Error('M26_PUSH_VAPID_PUBLIC_KEY_INVALID');
  const existing=await registration.pushManager.getSubscription();
  const subscription=existing||await registration.pushManager.subscribe({
    userVisibleOnly:true,
    applicationServerKey,
  });
  return Object.freeze({
    subscription,
    serialized:serializePushSubscription(subscription),
    created:!existing,
  });
}

export async function unsubscribeWebPush({registration}={}){
  if(!registration?.pushManager)return Object.freeze({ok:true,changed:false});
  const subscription=await registration.pushManager.getSubscription().catch(()=>null);
  if(!subscription)return Object.freeze({ok:true,changed:false});
  const ok=await subscription.unsubscribe().catch(()=>false);
  return Object.freeze({ok:Boolean(ok),changed:Boolean(ok)});
}

export const __webPushInternals=Object.freeze({
  secureContext,
  permissionValue,
  featureSupport,
  normalizePublicKey,
});
