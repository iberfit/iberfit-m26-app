import {createCommunicationCommand} from './command-catalog.js';
import {createWebPushCoordinator} from './web-push.js';
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map((k)=>[k,canonical(value[k])]));return value;}
function fingerprint(command){return JSON.stringify(canonical({type:command.type,entityId:command.entityId,baseRevision:command.baseRevision,payload:command.payload}));}
export function createCommunicationService({transport,getToken,getState,getRole,isOnline=()=>true,refreshState=async()=>{},webPushPublicKey=globalThis.__IBERFIT_M26_RUNTIME__?.webPushPublicKey||'',getPushRegistration}={}){
  const inFlight=new Map();
  const webPush=createWebPushCoordinator({
    transport,
    getToken,
    getRegistration:getPushRegistration,
    vapidPublicKey:webPushPublicKey,
    getVapidPublicKey:async()=>{
      const config=await transport.webPushPublicConfig(await getToken());
      return config.publicKey;
    },
    isOnline,
  });
  const notificationPreferences=Object.freeze({
    async status(){
      if(!isOnline())throw new Error('M26_NOTIFICATION_PREFERENCES_ONLINE_REQUIRED');
      return transport.notificationPreferencesStatus(await getToken());
    },
    async update(preferences){
      if(!isOnline())throw new Error('M26_NOTIFICATION_PREFERENCES_ONLINE_REQUIRED');
      return transport.notificationPreferencesUpsert(await getToken(),preferences);
    },
  });
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
        const token=await getToken();
        const response=await transport.execute(token,command,{application:role});
        await refreshState({reason:'communication-ack',response});
        if(command.type==='MESSAGE_SEND'&&typeof transport.webPushDispatchKick==='function'){
          void transport.webPushDispatchKick(token,command.operationId).catch(()=>null);
        }
        return Object.freeze({ok:true,command,response});
      })().finally(()=>inFlight.delete(command.operationId));
      inFlight.set(command.operationId,{signature,promise});
      return promise;
    },
    notificationPreferences,
    webPush,
  });
}
export const __communicationServiceInternals=Object.freeze({canonical,fingerprint});
