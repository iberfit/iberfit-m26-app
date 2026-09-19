import {registerM26ServiceWorker} from './pwa.js';

const DEFAULT_TIMEOUT_MS=12_000;
const NOTIFICATION_KEYS=new Set([
  'sessionReminders',
  'scheduleChanges',
  'planPublished',
  'coachMessages',
  'challenges',
  'milestones',
]);

function timeoutMs(runtime){return Math.max(1_000,Math.min(Number(runtime?.timeoutMs||DEFAULT_TIMEOUT_MS),30_000));}
function applicationName(value){
  const normalized=String(value||'').trim().toLowerCase();
  if(!['client','coach'].includes(normalized))throw new Error('M26_PUSH_APPLICATION_INVALID');
  return normalized;
}
function runtimeBase(runtime){
  const url=new URL(String(runtime?.url||''));
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('M26_PUSH_HTTPS_REQUIRED');
  return url.origin;
}
function authHeaders(runtime,token){
  if(!token)throw new Error('M26_AUTH_REQUIRED');
  const key=String(runtime?.publishableKey||runtime?.anonKey||'').trim();
  if(!key)throw new Error('M26_PUSH_PUBLIC_KEY_REQUIRED');
  return {
    apikey:key,
    authorization:`Bearer ${token}`,
    'content-type':'application/json',
    'x-client-info':`iberfit-m26-web-push/${runtime?.version||'26.0.0'}`,
  };
}
async function jsonRequest(fetchImpl,url,options,requestTimeout){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),requestTimeout);
  try{
    const response=await fetchImpl(url,{...options,signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
    const body=(response.headers?.get?.('content-type')||'').includes('json')
      ?await response.json().catch(()=>({}))
      :await response.text().catch(()=>'');
    if(!response.ok){
      const error=new Error(body?.code||body?.message||body?.error||`M26_HTTP_${response.status}`);
      error.status=response.status;
      error.body=body;
      throw error;
    }
    return Array.isArray(body)&&body.length===1?body[0]:body;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('M26_TIMEOUT');
    throw error;
  }finally{clearTimeout(timer);}
}
function base64UrlBytes(value){
  const source=String(value||'').trim().replace(/-/g,'+').replace(/_/g,'/');
  if(!source)throw new Error('M26_PUSH_VAPID_PUBLIC_KEY_INVALID');
  const padded=source.padEnd(source.length+((4-(source.length%4))%4),'=');
  let decoded='';
  try{decoded=globalThis.atob(padded);}catch{throw new Error('M26_PUSH_VAPID_PUBLIC_KEY_INVALID');}
  const bytes=new Uint8Array(decoded.length);
  for(let index=0;index<decoded.length;index+=1)bytes[index]=decoded.charCodeAt(index);
  if(bytes.length!==65||bytes[0]!==4)throw new Error('M26_PUSH_VAPID_PUBLIC_KEY_INVALID');
  return bytes;
}
function normalizedPreferencePatch(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('M26_PUSH_PREFERENCES_INVALID');
  const result={};
  for(const [key,item] of Object.entries(value)){
    if(!NOTIFICATION_KEYS.has(key)||typeof item!=='boolean')throw new Error('M26_PUSH_PREFERENCES_INVALID');
    result[key]=item;
  }
  return result;
}
function serializeSubscription(subscription){
  const raw=subscription?.toJSON?.()||subscription||{};
  const endpoint=String(raw.endpoint||subscription?.endpoint||'').trim();
  const keys=raw.keys&&typeof raw.keys==='object'?raw.keys:{};
  const p256dh=String(keys.p256dh||'').trim();
  const auth=String(keys.auth||'').trim();
  if(!endpoint||!p256dh||!auth)throw new Error('M26_PUSH_SUBSCRIPTION_INVALID');
  return Object.freeze({endpoint,expirationTime:raw.expirationTime??null,keys:Object.freeze({p256dh,auth})});
}

export function webPushCapability({navigatorLike=globalThis.navigator,NotificationLike=globalThis.Notification}={}){
  const serviceWorker=Boolean(navigatorLike&&'serviceWorker' in navigatorLike);
  const pushManager=Boolean(globalThis.PushManager||navigatorLike?.serviceWorker?.ready?.then);
  const notifications=Boolean(NotificationLike&&typeof NotificationLike.requestPermission==='function');
  const permission=notifications?String(NotificationLike.permission||'default'):'unsupported';
  return Object.freeze({supported:serviceWorker&&pushManager&&notifications,serviceWorker,pushManager,notifications,permission});
}

export function createWebPushClient({
  runtime,
  fetchImpl=globalThis.fetch,
  navigatorLike=globalThis.navigator,
  NotificationLike=globalThis.Notification,
}={}){
  if(typeof fetchImpl!=='function')throw new Error('M26_PUSH_FETCH_REQUIRED');
  const base=runtimeBase(runtime);
  const requestTimeout=timeoutMs(runtime);

  const rpc=(name,token,params={})=>jsonRequest(
    fetchImpl,
    `${base}/rest/v1/rpc/${name}`,
    {method:'POST',headers:authHeaders(runtime,token),body:JSON.stringify(params)},
    requestTimeout,
  );

  const edge=(token,body)=>jsonRequest(
    fetchImpl,
    `${base}/functions/v1/iberfit-web-push-v1`,
    {method:'POST',headers:authHeaders(runtime,token),body:JSON.stringify(body)},
    requestTimeout,
  );

  async function getRegistration(){
    const registered=await registerM26ServiceWorker();
    if(!registered?.supported||!registered.registration)throw new Error('M26_PUSH_SERVICE_WORKER_REQUIRED');
    return navigatorLike?.serviceWorker?.ready?await navigatorLike.serviceWorker.ready:registered.registration;
  }

  async function config(token,{application}={}){
    const app=applicationName(application);
    const result=await edge(token,{action:'config',application:app});
    if(result?.ok!==true)throw new Error('M26_PUSH_CONFIG_INVALID');
    return Object.freeze({configured:result.configured===true,publicKey:String(result.publicKey||''),application:app,privacyMode:String(result.privacyMode||'')});
  }

  async function preferences(token,{application}={}){
    const app=applicationName(application);
    const result=await rpc('iberfit_notification_preferences_v1',token,{p_application:app});
    if(result?.ok!==true)throw new Error('M26_PUSH_PREFERENCES_INVALID');
    return result;
  }

  async function updatePreferences(token,patch,{application}={}){
    const app=applicationName(application);
    const result=await rpc('iberfit_notification_preferences_update_v1',token,{p_application:app,p_preferences:normalizedPreferencePatch(patch)});
    if(result?.ok!==true)throw new Error('M26_PUSH_PREFERENCES_NOT_CONFIRMED');
    return result;
  }

  async function currentSubscription(){
    const capability=webPushCapability({navigatorLike,NotificationLike});
    if(!capability.supported)return null;
    const registration=await getRegistration();
    return registration.pushManager?.getSubscription?.()||null;
  }

  async function enable(token,{application}={}){
    const app=applicationName(application);
    const capability=webPushCapability({navigatorLike,NotificationLike});
    if(!capability.supported)return Object.freeze({ok:false,state:'unsupported'});

    let permission=String(NotificationLike.permission||'default');
    if(permission==='default')permission=String(await NotificationLike.requestPermission());
    if(permission!=='granted')return Object.freeze({ok:false,state:permission==='denied'?'denied':'dismissed'});

    const pushConfig=await config(token,{application:app});
    if(!pushConfig.configured||!pushConfig.publicKey)return Object.freeze({ok:false,state:'service-unavailable'});

    const registration=await getRegistration();
    let subscription=await registration.pushManager?.getSubscription?.();
    if(!subscription){
      subscription=await registration.pushManager?.subscribe?.({
        userVisibleOnly:true,
        applicationServerKey:base64UrlBytes(pushConfig.publicKey),
      });
    }
    if(!subscription)throw new Error('M26_PUSH_SUBSCRIPTION_REQUIRED');
    const serialized=serializeSubscription(subscription);
    const result=await rpc('iberfit_push_subscription_upsert_v1',token,{p_application:app,p_subscription:serialized});
    if(result?.ok!==true||String(result?.kind||'').toLowerCase()!=='ack')throw new Error('M26_PUSH_SUBSCRIPTION_NOT_CONFIRMED');
    return Object.freeze({ok:true,state:'enabled',subscription:serialized});
  }

  async function disable(token,{application}={}){
    const app=applicationName(application);
    const subscription=await currentSubscription();
    if(!subscription)return Object.freeze({ok:true,state:'disabled',kind:'duplicate'});
    const serialized=serializeSubscription(subscription);
    const result=await rpc('iberfit_push_subscription_delete_v1',token,{p_application:app,p_endpoint:serialized.endpoint});
    if(result?.ok!==true||!['ack','duplicate'].includes(String(result?.kind||'').toLowerCase()))throw new Error('M26_PUSH_UNSUBSCRIBE_NOT_CONFIRMED');
    await subscription.unsubscribe?.();
    return Object.freeze({ok:true,state:'disabled',kind:String(result.kind||'ack').toLowerCase()});
  }

  return Object.freeze({config,preferences,updatePreferences,currentSubscription,enable,disable});
}
