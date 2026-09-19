import {createCommunicationCommand} from './command-catalog.js';
import {
  inspectWebPushState,
  registerM26ServiceWorker,
  requestWebPushPermission,
  serializePushSubscription,
  subscribeWebPush,
  unsubscribeWebPush,
} from '../platform/pwa.js';

function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map((k)=>[k,canonical(value[k])]));return value;}
function fingerprint(command){return JSON.stringify(canonical({type:command.type,entityId:command.entityId,baseRevision:command.baseRevision,payload:command.payload}));}

const DEFAULT_PUSH_API=Object.freeze({
  inspectWebPushState,
  registerM26ServiceWorker,
  requestWebPushPermission,
  serializePushSubscription,
  subscribeWebPush,
  unsubscribeWebPush,
});

function pushPublicKey(){
  return String(globalThis.__IBERFIT_M26_RUNTIME__?.webPushPublicKey||'').trim();
}

export function createCommunicationService({
  transport,
  getToken,
  getState,
  getRole,
  isOnline=()=>true,
  refreshState=async()=>{},
  pushApi=DEFAULT_PUSH_API,
  target=globalThis,
  navigatorLike=globalThis.navigator,
  getVapidPublicKey=pushPublicKey,
}={}){
  const inFlight=new Map();
  let pushMutation=null;

  async function pushRegistration({create=false}={}){
    let registration=null;
    try{registration=await navigatorLike?.serviceWorker?.getRegistration?.('/');}catch{}
    if(!registration&&create){
      const registered=await pushApi.registerM26ServiceWorker();
      registration=registered?.registration||null;
    }
    return registration;
  }

  async function localPushSubscription(registration){
    if(!registration?.pushManager)return null;
    try{return await registration.pushManager.getSubscription();}catch{return null;}
  }

  async function webPushState(){
    const vapidPublicKey=String(getVapidPublicKey?.()||'').trim();
    const browser=await pushApi.inspectWebPushState({target,navigatorLike,vapidPublicKey});
    const base={
      supported:browser.supported===true,
      configured:browser.configured===true,
      permission:String(browser.permission||'unsupported'),
      localSubscribed:browser.subscribed===true,
      active:false,
      deviceActive:false,
      accountActive:false,
      subscriptionCount:0,
      online:isOnline()!==false,
      reason:browser.reason||null,
      recoveryRequired:false,
    };
    if(!base.supported||!base.configured)return Object.freeze(base);
    if(!base.online)return Object.freeze({...base,reason:'offline'});

    const token=await getToken();
    const account=await transport.webPushStatus(token);
    const registration=await pushRegistration();
    const subscription=await localPushSubscription(registration);
    if(!subscription){
      return Object.freeze({
        ...base,
        accountActive:account.active===true,
        subscriptionCount:account.subscriptionCount||0,
        reason:browser.permission==='denied'?'permission-denied':browser.permission==='granted'?'not-subscribed':'permission-required',
      });
    }

    const serialized=pushApi.serializePushSubscription(subscription);
    const device=await transport.webPushDeviceStatus(token,serialized.endpoint);
    const active=
      browser.permission==='granted'&&
      device.deviceActive===true;
    return Object.freeze({
      ...base,
      localSubscribed:true,
      deviceActive:device.deviceActive===true,
      accountActive:device.subscriptionCount>0,
      subscriptionCount:device.subscriptionCount,
      active,
      reason:active?null:'server-reconciliation-required',
      recoveryRequired:browser.permission==='granted'&&device.deviceActive!==true,
    });
  }

  async function activateWebPush(){
    if(pushMutation)return pushMutation;
    pushMutation=(async()=>{
      if(!isOnline())throw new Error('M26_COMMUNICATION_ONLINE_REQUIRED');
      const vapidPublicKey=String(getVapidPublicKey?.()||'').trim();
      const before=await pushApi.inspectWebPushState({target,navigatorLike,vapidPublicKey});
      if(!before.supported)throw new Error('M26_PUSH_UNSUPPORTED');
      if(!before.configured)throw new Error('M26_PUSH_NOT_CONFIGURED');

      const permission=await pushApi.requestWebPushPermission({target});
      if(permission?.ok!==true)throw new Error(
        permission?.reason==='permission-denied'
          ?'M26_PUSH_PERMISSION_DENIED'
          :'M26_PUSH_PERMISSION_NOT_GRANTED'
      );

      const registration=await pushRegistration({create:true});
      if(!registration?.pushManager)throw new Error('M26_PUSH_REGISTRATION_REQUIRED');
      const result=await pushApi.subscribeWebPush({
        registration,
        vapidPublicKey,
        notificationLike:target?.Notification,
      });
      try{
        await transport.webPushUpsert(await getToken(),result.serialized);
      }catch(error){
        if(result.created===true){
          try{await pushApi.unsubscribeWebPush({registration});}catch{}
        }
        throw error;
      }
      return webPushState();
    })().finally(()=>{pushMutation=null;});
    return pushMutation;
  }

  async function deactivateWebPush(){
    if(pushMutation)return pushMutation;
    pushMutation=(async()=>{
      if(!isOnline())throw new Error('M26_COMMUNICATION_ONLINE_REQUIRED');
      const registration=await pushRegistration();
      const subscription=await localPushSubscription(registration);
      if(!subscription)return webPushState();
      const serialized=pushApi.serializePushSubscription(subscription);
      await transport.webPushRevoke(await getToken(),serialized.endpoint);
      const local=await pushApi.unsubscribeWebPush({registration});
      if(local?.ok!==true)throw new Error('M26_PUSH_LOCAL_UNSUBSCRIBE_FAILED');
      return webPushState();
    })().finally(()=>{pushMutation=null;});
    return pushMutation;
  }

  return Object.freeze({
    execute(input){
      if(!isOnline())return Promise.reject(new Error('M26_COMMUNICATION_ONLINE_REQUIRED'));
      const role=String(getRole()||'').toLowerCase();
      const command=createCommunicationCommand(input,getState(),role);
      const signature=fingerprint(command);
      const current=inFlight.get(command.operationId);
      if(current){
        if(current.signature!==signature)return Promise.reject(new Error('M26_COMMUNICATION_OPERATION_ID_COLLISION'));
        return current.promise;
      }
      const promise=(async()=>{
        const response=await transport.execute(await getToken(),command,{application:role});
        await refreshState({reason:'communication-ack',response});
        return Object.freeze({ok:true,command,response});
      })().finally(()=>inFlight.delete(command.operationId));
      inFlight.set(command.operationId,{signature,promise});
      return promise;
    },
    webPushState,
    activateWebPush,
    deactivateWebPush,
  });
}

export const __communicationServiceInternals=Object.freeze({canonical,fingerprint});
