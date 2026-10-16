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
  getIdentityScope=null,
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
  function actorScope(){
    if(typeof getIdentityScope!=='function')return null;
    const scope=String(getIdentityScope()||'').trim();
    if(!scope)throw new Error('M45_PUSH_ACTOR_REQUIRED');
    return scope;
  }
  function requireSameActor(expected){
    if(expected!==null&&actorScope()!==expected)throw new Error('M45_PUSH_ACTOR_CHANGED');
  }

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
    // A status read must not cross an authenticated account boundary while
    // waiting on the browser, a refreshed JWT or the remote backend.
    const expectedActor=actorScope();
    const resolvedKey=await resolveVapidPublicKey();
    requireSameActor(expectedActor);
    const local=await inspect({vapidPublicKey:resolvedKey});
    requireSameActor(expectedActor);
    const endpoint=local.subscribed===true?await currentEndpoint():null;
    requireSameActor(expectedActor);
    let backend=Object.freeze({ok:false,active:false,subscriptionCount:0,updatedAt:null});
    if(isOnline()){
      const bearer=await token();
      requireSameActor(expectedActor);
      backend=normalizedBackendState(await transport.webPushStatus(bearer,endpoint));
      requireSameActor(expectedActor);
    }
    const active=Boolean(local.active&&endpoint&&backend.active);
    let reason=active?null:local.reason;
    if(local.active&&!backend.active)reason='server-registration-required';
    if(!local.active&&backend.active)reason=local.reason||'browser-subscription-required';
    if(!isOnline()&&local.active)reason='server-status-unavailable';
    requireSameActor(expectedActor);
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
    const expectedActor=actorScope();
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
    let authToken=null;
    let upsertAttempted=false;
    try{
      requireSameActor(expectedActor);
      authToken=await token();
      requireSameActor(expectedActor);
      upsertAttempted=true;
      const backend=normalizedBackendState(await transport.webPushUpsert(authToken,local.serialized));
      if(!backend.active)throw new Error('M26_PUSH_UPSERT_NOT_CONFIRMED');
      requireSameActor(expectedActor);
      return Object.freeze({ok:true,active:true,created:local.created===true,subscriptionCount:Math.max(1,backend.subscriptionCount||1),updatedAt:backend.updatedAt});
    }catch(error){
      // The account may switch *during* the remote upsert. The old bearer
      // token can still be valid, so compensate with recipient-scoped revoke
      // before abandoning this old session's device registration.
      if(upsertAttempted&&authToken&&expectedActor!==null){
        let changed=false;
        try{changed=actorScope()!==expectedActor;}catch{changed=true;}
        if(changed){
          try{await transport.webPushRevoke(authToken,pushEndpoint(local.serialized?.endpoint));}catch{}
        }
      }
      if(local.created===true){
        try{
          const createdEndpoint=pushEndpoint(local.serialized?.endpoint);
          const active=await sw?.pushManager?.getSubscription?.();
          // Never remove a replacement subscription established for the new
          // authenticated user on the same shared browser.
          if(active?.endpoint===createdEndpoint){
            await unsubscribe({registration:sw,subscription:active});
          }
        }catch{}
      }
      throw error;
    }
  }

  async function disableCurrent(){
    requireOnline();
    const expectedActor=actorScope();
    const sw=await registration();
    const current=await sw.pushManager.getSubscription();
    requireSameActor(expectedActor);
    if(!current)return Object.freeze({ok:true,active:false,changed:false});
    const endpoint=pushEndpoint(current.endpoint);
    requireSameActor(expectedActor);
    const authToken=await token();
    requireSameActor(expectedActor);
    const revokeResult=await transport.webPushRevoke(authToken,endpoint);
    requireSameActor(expectedActor);
    if(revokeResult?.ok!==true)throw new Error('M26_PUSH_REVOKE_NOT_CONFIRMED');
    // Revoke is scoped to auth.uid() on the server. A zero-row result means
    // this browser's endpoint was not owned by the authenticated actor:
    // never unsubscribe a different account's PushSubscription.
    if(!Number.isSafeInteger(revokeResult.deletedCount)||revokeResult.deletedCount<1)
      throw new Error('M45_PUSH_OWNERSHIP_NOT_CONFIRMED');
    // Another tab can replace or remove the browser subscription while the
    // server revokes the original. Do not remove the replacement or claim that
    // the entire device was disabled: tell the UI to recheck actual state.
    const currentAfterRevoke=await sw.pushManager.getSubscription();
    requireSameActor(expectedActor);
    if(currentAfterRevoke?.endpoint!==endpoint)
      throw new Error('M45_PUSH_SUBSCRIPTION_CHANGED');
    const local=await unsubscribe({registration:sw,subscription:currentAfterRevoke});
    requireSameActor(expectedActor);
    if(local?.ok===false)throw new Error('M26_PUSH_UNSUBSCRIBE_NOT_CONFIRMED');
    return Object.freeze({ok:true,active:false,changed:local.changed===true});
  }

  async function disableAll(){
    requireOnline();
    const expectedActor=actorScope();
    // Capture the browser subscription before any remote mutation. A shared
    // browser may still be subscribed to a different authenticated user.
    let sw=null;
    let original=null;
    try{
      sw=await getRegistration();
      original=await sw?.pushManager?.getSubscription?.()||null;
    }catch{}
    requireSameActor(expectedActor);
    const endpoint=original?.endpoint?pushEndpoint(original.endpoint):null;
    const authToken=await token();
    requireSameActor(expectedActor);
    let ownedByActor=false;
    if(endpoint){
      // The owner-scoped RPC checks user_id = auth.uid() for this endpoint.
      // Never unsubscribe another account's browser subscription.
      const remote=normalizedBackendState(await transport.webPushStatus(authToken,endpoint));
      requireSameActor(expectedActor);
      if(!remote.ok)throw new Error('M26_PUSH_STATUS_NOT_CONFIRMED');
      ownedByActor=remote.active;
    }
    const result=await transport.webPushRevoke(authToken);
    requireSameActor(expectedActor);
    if(result?.ok!==true)throw new Error('M26_PUSH_REVOKE_NOT_CONFIRMED');
    let local=Object.freeze({ok:true,changed:false});
    if(ownedByActor&&original&&sw?.pushManager){
      const current=await sw.pushManager.getSubscription();
      requireSameActor(expectedActor);
      if(current?.endpoint!==endpoint)throw new Error('M45_PUSH_SUBSCRIPTION_CHANGED');
      // Always target the captured PushSubscription: a second browser read
      // inside unsubscribe() could otherwise remove a replacement endpoint.
      local=await unsubscribe({registration:sw,subscription:current});
      requireSameActor(expectedActor);
      if(local?.ok===false)throw new Error('M26_PUSH_UNSUBSCRIBE_NOT_CONFIRMED');
    }
    return Object.freeze({
      ok:result?.ok===true,
      active:false,
      changed:Number(result?.deletedCount||0)>0||local.changed===true,
      deletedCount:Math.max(0,Number(result?.deletedCount||0)||0),
    });
  }

  return Object.freeze({status,enable,disableCurrent,disableAll});
}

export const __webPushCoordinatorInternals=Object.freeze({pushEndpoint,normalizedBackendState,publicVapidKey});
