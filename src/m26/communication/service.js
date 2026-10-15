import {createCommunicationCommand} from './command-catalog.js';
import {createWebPushCoordinator} from './web-push.js';
import {updateIberfitExperiencePreference} from '../ui/preferences.js';
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map((k)=>[k,canonical(value[k])]));return value;}
function fingerprint(command){return JSON.stringify(canonical({type:command.type,entityId:command.entityId,baseRevision:command.baseRevision,payload:command.payload}));}
const NOTIFICATION_PREFERENCE_KEYS=Object.freeze(['sessionReminders','scheduleChanges','planPublished','coachMessages','challenges','milestones']);
export function createCommunicationService({transport,getToken,getState,getRole,isOnline=()=>true,refreshState=async()=>{},webPushPublicKey=globalThis.__IBERFIT_M26_RUNTIME__?.webPushPublicKey||'',getPushRegistration}={}){
  const inFlight=new Map();
  const webPush=createWebPushCoordinator({
    transport,
    getToken,
    getIdentityScope:()=>{
      const id=String(getState()?.identity?.id||'').trim();
      const role=String(getRole()||'').toLowerCase();
      return id&&['coach','client'].includes(role)?`${role}:${id}`:'';
    },
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
    applyRemote(preferences){
      const scope=String(getState()?.identity?.id||'').trim();
      if(!scope)throw new Error('M26_NOTIFICATION_PREFERENCE_SCOPE_REQUIRED');
      if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))throw new Error('M26_NOTIFICATION_PREFERENCES_REQUIRED');
      for(const key of NOTIFICATION_PREFERENCE_KEYS){
        if(typeof preferences[key]!=='boolean')throw new Error('M26_NOTIFICATION_PREFERENCE_INVALID');
        updateIberfitExperiencePreference(scope,`notifications.${key}`,preferences[key]);
      }
      return true;
    },
  });
  return Object.freeze({
    async reload(){
      if(!isOnline())throw new Error('M26_COMMUNICATION_ONLINE_REQUIRED');
      await refreshState({reason:'communication-manual-retry'});
      return Object.freeze({ok:true});
    },
    async markNotificationsRead(notificationIds){
      if(!isOnline())throw new Error('M26_COMMUNICATION_ONLINE_REQUIRED');
      const role=String(getRole()||'').toLowerCase();
      const ids=Array.isArray(notificationIds)?notificationIds:[];
      // One bounded interaction, no implicit privileged bulk mutation.
      if(!ids.length||ids.length>20||ids.some((id)=>
        typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
      )||new Set(ids).size!==ids.length)throw new Error('M45_NOTIFICATION_BATCH_INVALID');
      if(!['client','coach'].includes(role))throw new Error('M26_COMMUNICATION_ROLE_FORBIDDEN');
      const state=getState();
      const identityScope=String(state?.identity?.id||'');
      const stillCurrent=()=>String(getRole()||'').toLowerCase()===role&&
        String(getState()?.identity?.id||'')===identityScope;
      const commands=ids.map((id)=>createCommunicationCommand({
        type:'NOTIFICATION_MARK_READ',entityId:id,payload:{notificationId:id},
      },state,role));
      const token=await getToken();
      if(!stillCurrent())throw new Error('M45_COMMUNICATION_ACTOR_CHANGED');
      // Each RPC enforces recipient scope. Bound concurrency to avoid a burst
      // of expensive authorization/bootstrap work for one grouped UI action.
      // Retain every independent ACK/rejection in original order.
      const results=new Array(commands.length);
      let cursor=0;
      await Promise.all(Array.from({length:Math.min(4,commands.length)},async()=>{
        while(cursor<commands.length){
          const index=cursor++;
          if(!stillCurrent()){
            results[index]={status:'rejected',reason:new Error('M45_COMMUNICATION_ACTOR_CHANGED')};
            continue;
          }
          try{
            const value=await transport.execute(token,commands[index],{application:role});
            results[index]={status:'fulfilled',value};
          }catch(reason){
            results[index]={status:'rejected',reason};
          }
        }
      }));
      const markedIds=ids.filter((_,index)=>results[index].status==='fulfilled');
      if(!markedIds.length)throw results.find((result)=>result.status==='rejected')?.reason
        ||new Error('M45_NOTIFICATION_BATCH_NOT_CONFIRMED');
      let syncPending=!stillCurrent();
      if(!syncPending){
        try{await refreshState({reason:'communication-notifications-ack',markedIds});}
        catch{syncPending=true;}
      }
      return Object.freeze({
        ok:markedIds.length===ids.length,
        markedCount:markedIds.length,
        requestedCount:ids.length,
        markedIds:Object.freeze(markedIds),
        syncPending,
      });
    },
    execute(input){
      if(!isOnline())return Promise.reject(new Error('M26_COMMUNICATION_ONLINE_REQUIRED'));
      const role=String(getRole()||'').toLowerCase();
      const state=getState();
      const identityScope=String(state?.identity?.id||'');
      const sameIdentity=()=>String(getRole()||'').toLowerCase()===role&&
        String(getState()?.identity?.id||'')===identityScope;
      const command=createCommunicationCommand(input,state,role);
      // Idempotency receipts belong to the authenticated actor, not only to
      // the caller-provided operation ID. Never share an old user's promise.
      const operationKey=`${role}:${identityScope}:${command.operationId}`;
      const signature=fingerprint(command);
      const current=inFlight.get(operationKey);
      if(current){
        if(current.signature!==signature)return Promise.reject(new Error('M26_COMMUNICATION_OPERATION_ID_COLLISION'));
        return current.promise;
      }
      const promise=(async()=>{
        const token=await getToken();
        if(!sameIdentity())throw new Error('M45_COMMUNICATION_ACTOR_CHANGED');
        const response=await transport.execute(token,command,{application:role});
        // A confirmed remote ACK is authoritative. A subsequent hydration failure
        // must never turn a successful send into an apparent failure and duplicate.
        let syncPending=!sameIdentity();
        if(!syncPending){
          try{await refreshState({reason:'communication-ack',response});}
          catch{syncPending=true;}
        }
        if(command.type==='MESSAGE_SEND'&&typeof transport.webPushDispatchKick==='function'){
          void transport.webPushDispatchKick(token,command.operationId).catch(()=>null);
        }
        return Object.freeze({ok:true,command,response,syncPending});
      })().finally(()=>inFlight.delete(operationKey));
      inFlight.set(operationKey,{signature,promise});
      return promise;
    },
    notificationPreferences,
    webPush,
  });
}
export const __communicationServiceInternals=Object.freeze({canonical,fingerprint,NOTIFICATION_PREFERENCE_KEYS});
