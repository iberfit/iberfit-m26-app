import {
  inspectWebPushState,
  requestWebPushPermission,
  subscribeWebPush,
  unsubscribeWebPush,
} from '../platform/pwa.js';

function requireDependency(value,code){if(!value)throw new Error(code);return value;}
function normalizedBackendState(value){
  const source=value&&typeof value==='object'?value:{};
  return Object.freeze({
    ok:source.ok===true,
    active:source.active===true,
    subscriptionCount:Math.max(0,Number(source.subscriptionCount||0)||0),
    updatedAt:source.updatedAt||null,
  });
}
function pushEndpoint(value){
  const endpoint=String(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,4097);
  if(endpoint.length<12||endpoint.length>4096||!/^https:\/\//iu.test(endpoint))throw new Error('M26_PUSH_ENDPOINT_INVALID');
  return endpoint;
}
function publicVapidKey(value){
  const key=String(value||'').trim();
  if(!key)return '';
  if(key.length<40||key.length>256||!/^[A-Za-z0-9_-]+$/u.test(key))throw new Error('M26_PUSH_VAPID_PUBLIC_KEY_INVALID');
  return key;
}

export function createWebPushCoordinator({
  transport,
  getToken,
  getRegistration=async()=>globalThis.navigator?.serviceWorker?.getRegistration?.('/'),
  vapidPublicKey='',
  getVapidPublicKey=null,
  isOnline=()=>globalThis.navigator?.onLine!==false,
  inspect=inspectWebPushState,
  requestPermission=requestWebPushPermission,
  subscribe=subscribeWebPush,
  unsubscribe=unsubscribeWebPush,
}={}){
  requireDependency(transport,'M26_PUSH_TRANSPORT_REQUIRED');
  requireDependency(getToken,'M26_PUSH_TOKEN_PROVIDER_REQUIRED');
  let cachedVapidPublicKey=publicVapidKey(vapidPublicKey);
  let vapidKeyInFlight=null;

  async function token(){
    const value=String(await getToken()||'').trim();
    if(!value)throw new Error('M26_AUTH_REQUIRED');
    return value;
  }
  async function registration(){
    const value=await getRegistration();
    if(!value?.pushManager)throw new Error('M26_PUSH_REGISTRATION_REQUIRED');
    return value;
  }
  async function currentEndpoint(){
    try{
      const sw=await getRegistration();
      const current=await sw?.pushManager?.getSubscription?.();
      return current?.endpoint?pushEndpoint(current.endpoint):null;
    }catch{return null;}
  }
  function requireOnline(){if(!isOnline())throw new Error('M26_PUSH_ONLINE_REQUIRED');}
  async function resolveVapidPublicKey({force=false,failClosed=false}={}){
    if(cachedVapidPublicKey&&!force)return cachedVapidPublicKey;
    if(typeof getVapidPublicKey!=='function'){
      if(failClosed&&!cachedVapidPublicKey)throw new Error('M26_PUSH_VAPID_PUBLIC_KEY_INVALID');
      return cachedVapidPublicKey;
    }
    if(!isOnline()){
      if(failClosed)throw new Error('M26_PUSH_ONLINE_REQUIRED');
      return cachedVapidPublicKey;
    }
    if(vapidKeyInFlight)return vapidKeyInFlight;
    vapidKeyInFlight=(async()=>{
      try{
        const remote=publicVapidKey(await getVapidPublicKey());
        if(!remote)throw new Error('M26_PUSH_VAPID_PUBLIC_KEY_INVALID');
        cachedVapidPublicKey=remote;
        return remote;
      }catch(error){
        if(failClosed)throw error;
        return cachedVapidPublicKey;
      }finally{vapidKeyInFlight=null;}
    })();
    return vapidKeyInFlight;
  }

  async function status(){
    const resolvedKey=await resolveVapidPublicKey();
    const local=await inspect({vapidPublicKey:resolvedKey});
    const endpoint=local.subscribed===true?await currentEndpoint():null;
    let backend=Object.freeze({ok:false,active:false,subscriptionCount:0,updatedAt:null});
    if(isOnline())backend=normalizedBackendState(await transport.webPushStatus(await token(),endpoint));
    const active=Boolean(local.active&&endpoint&&backend.active);
    let reason=active?null:local.reason;
    if(local.active&&!backend.active)reason='server-registration-required';
    if(!local.active&&backend.active)reason=local.reason||'browser-subscription-required';
    if(!isOnline()&&local.active)reason='server-status-unavailable';
    return Object.freeze({
      supported:local.supported===true,
      secure:local.secure===true,
      configured:local.configured===true,
      permission:local.permission||'unsupported',
      subscribed:local.subscribed===true,
      active,
      backendActive:backend.active,
      subscriptionCount:backend.subscriptionCount,
      reason,
      updatedAt:backend.updatedAt,
    });
  }

  async function enable(){
    requireOnline();
    const resolvedKey=await resolveVapidPublicKey({force:!cachedVapidPublicKey,failClosed:true});
    const before=await inspect({vapidPublicKey:resolvedKey});
    if(!before.supported)throw new Error('M26_PUSH_UNSUPPORTED');
    if(!before.configured)throw new Error('M26_PUSH_VAPID_PUBLIC_KEY_INVALID');
    if(before.permission==='denied')throw new Error('M26_PUSH_PERMISSION_DENIED');
    if(before.permission!=='granted'){
      const permission=await requestPermission();
      if(!permission?.ok)throw new Error(permission?.reason==='permission-denied'?'M26_PUSH_PERMISSION_DENIED':'M26_PUSH_PERMISSION_NOT_GRANTED');
    }
    const sw=await registration();
    const local=await subscribe({registration:sw,vapidPublicKey:resolvedKey});
    try{
      const backend=normalizedBackendState(await transport.webPushUpsert(await token(),local.serialized));
      if(!backend.active)throw new Error('M26_PUSH_UPSERT_NOT_CONFIRMED');
      return Object.freeze({ok:true,active:true,created:local.created===true,subscriptionCount:Math.max(1,backend.subscriptionCount||1),updatedAt:backend.updatedAt});
    }catch(error){
      if(local.created===true){
        try{await unsubscribe({registration:sw});}catch{}
      }
      throw error;
    }
  }

  async function disableCurrent(){
    requireOnline();
    const sw=await registration();
    const current=await sw.pushManager.getSubscription();
    if(!current)return Object.freeze({ok:true,active:false,changed:false});
    const endpoint=pushEndpoint(current.endpoint);
    await transport.webPushRevoke(await token(),endpoint);
    const local=await unsubscribe({registration:sw});
    return Object.freeze({ok:local.ok!==false,active:false,changed:local.changed===true});
  }

  async function disableAll(){
    requireOnline();
    const result=await transport.webPushRevoke(await token());
    let local=Object.freeze({ok:true,changed:false});
    try{
      const sw=await getRegistration();
      if(sw?.pushManager)local=await unsubscribe({registration:sw});
    }catch{}
    return Object.freeze({ok:result?.ok===true&&local.ok!==false,active:false,changed:Number(result?.deletedCount||0)>0||local.changed===true,deletedCount:Math.max(0,Number(result?.deletedCount||0)||0)});
  }

  return Object.freeze({status,enable,disableCurrent,disableAll});
}

export const __webPushCoordinatorInternals=Object.freeze({pushEndpoint,normalizedBackendState,publicVapidKey});
