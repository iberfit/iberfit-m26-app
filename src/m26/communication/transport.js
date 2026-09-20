const MISSING=/PGRST202|not find the function|M26_HTTP_404/i;
const DEFAULT_TIMEOUT_MS=12_000;
const NOTIFICATION_PREFERENCE_KEYS=Object.freeze([
  'sessionReminders',
  'scheduleChanges',
  'planPublished',
  'coachMessages',
  'challenges',
  'milestones',
]);

function requestTimeout(runtime){
  return Math.max(1_000,Math.min(Number(runtime?.timeoutMs||DEFAULT_TIMEOUT_MS),30_000));
}

function projectNotificationPreferences(value,{partial=false}={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('M26_NOTIFICATION_PREFERENCES_REQUIRED');
  const out={};
  for(const key of NOTIFICATION_PREFERENCE_KEYS){
    if(!(key in value)){
      if(partial)continue;
      out[key]=false;
      continue;
    }
    if(typeof value[key]!=='boolean')throw new Error('M26_NOTIFICATION_PREFERENCE_INVALID');
    out[key]=value[key];
  }
  if(partial&&!Object.keys(out).length)throw new Error('M26_NOTIFICATION_PREFERENCE_REQUIRED');
  return Object.freeze(out);
}

function publicVapidKey(value){
  const key=String(value||'').trim();
  if(key.length<40||key.length>256||!/^[A-Za-z0-9_-]+$/u.test(key))throw new Error('M26_PUSH_VAPID_PUBLIC_KEY_INVALID');
  return key;
}

export function createCommunicationTransport({runtime,fetchImpl=globalThis.fetch}={}){
  const url=new URL(String(runtime?.url||''));
  if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('M26_COMMUNICATION_HTTPS_REQUIRED');
  const key=String(runtime?.publishableKey||runtime?.anonKey||'');
  const timeoutMs=requestTimeout(runtime);

  async function request(path,token,params={}){
    if(!token)throw new Error('M26_AUTH_REQUIRED');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(`${url.origin}${path}`,{
        method:'POST',
        credentials:'omit',
        cache:'no-store',
        redirect:'error',
        referrerPolicy:'no-referrer',
        signal:controller.signal,
        headers:{
          apikey:key,
          authorization:`Bearer ${token}`,
          'content-type':'application/json',
          'x-client-info':`iberfit-m26-communication/${runtime?.version||'26.0.0'}`,
        },
        body:JSON.stringify(params),
      });
      const body=response.status===204
        ?null
        :(response.headers?.get?.('content-type')||'').includes('json')
          ?await response.json().catch(()=>({}))
          :await response.text().catch(()=>'');
      if(!response.ok){
        const error=new Error(body?.message||body?.error||body?.code||`M26_HTTP_${response.status}`);
        error.status=response.status;
        throw error;
      }
      return Array.isArray(body)&&body.length===1?body[0]:body;
    }catch(error){
      if(error?.name==='AbortError')throw new Error('M26_TIMEOUT');
      throw error;
    }finally{
      clearTimeout(timer);
    }
  }

  const rpc=(name,token,params={})=>request(`/rest/v1/rpc/${name}`,token,params);
  const edge=(name,token,params={})=>request(`/functions/v1/${name}`,token,params);

  return Object.freeze({
    bootstrapOptional:async(token,{application}={})=>{
      if(!['client','coach'].includes(application))return Object.freeze({available:false,reason:'unsupported',data:null});
      try{
        const data=await rpc('iberfit_communication_bootstrap_v14',token,{p_application:application});
        return Object.freeze({available:true,reason:null,data});
      }catch(error){
        if(error?.status===404||MISSING.test(String(error?.message||error)))return Object.freeze({available:false,reason:'missing',data:null});
        throw error;
      }
    },
    execute:async(token,command,{application}={})=>{
      const result=await rpc('iberfit_communication_execute_v14',token,{p_application:application,p_command:command});
      if(result?.ok!==true||!['ack','duplicate'].includes(String(result?.kind||'').toLowerCase()))throw new Error('M26_COMMUNICATION_MUTATION_NOT_CONFIRMED');
      return result;
    },
    notificationPreferencesStatus:async(token)=>{
      const result=await rpc('iberfit_notification_preferences_status_v1',token,{});
      if(result?.ok!==true)throw new Error('M26_NOTIFICATION_PREFERENCES_STATUS_NOT_CONFIRMED');
      return Object.freeze({
        ok:true,
        preferences:projectNotificationPreferences(result?.preferences||{}),
        updatedAt:result?.updatedAt||null,
      });
    },
    notificationPreferencesUpsert:async(token,preferences)=>{
      const projected=projectNotificationPreferences(preferences,{partial:true});
      const result=await rpc('iberfit_notification_preferences_upsert_v1',token,{p_preferences:projected});
      if(result?.ok!==true)throw new Error('M26_NOTIFICATION_PREFERENCES_UPSERT_NOT_CONFIRMED');
      return Object.freeze({
        ok:true,
        preferences:projectNotificationPreferences(result?.preferences||{}),
        updatedAt:result?.updatedAt||null,
      });
    },
    webPushPublicConfig:async(token)=>{
      const result=await edge('iberfit-web-push-sender-v1',token,{action:'config'});
      if(result?.ok!==true||result?.configured!==true)throw new Error('M26_PUSH_SERVICE_NOT_CONFIGURED');
      return Object.freeze({ok:true,configured:true,publicKey:publicVapidKey(result?.publicKey),version:result?.version||null});
    },
    webPushStatus:async(token,endpoint=null)=>{
      const normalizedEndpoint=endpoint==null?null:String(endpoint).trim();
      const result=await rpc('iberfit_web_push_status_v1',token,{p_endpoint:normalizedEndpoint||null});
      if(result?.ok!==true)throw new Error('M26_PUSH_STATUS_NOT_CONFIRMED');
      return Object.freeze({
        ok:true,
        active:result?.active===true,
        subscriptionCount:Number.isInteger(result?.subscriptionCount)?Math.max(0,result.subscriptionCount):0,
        updatedAt:result?.updatedAt||null,
      });
    },
    webPushUpsert:async(token,subscription)=>{
      if(!subscription||typeof subscription!=='object')throw new Error('M26_PUSH_SUBSCRIPTION_REQUIRED');
      const result=await rpc('iberfit_web_push_upsert_v1',token,{p_subscription:subscription});
      if(result?.ok!==true||result?.active!==true)throw new Error('M26_PUSH_UPSERT_NOT_CONFIRMED');
      return Object.freeze({ok:true,active:true,updatedAt:result?.updatedAt||null});
    },
    webPushRevoke:async(token,endpoint=null)=>{
      const result=await rpc('iberfit_web_push_revoke_v1',token,{p_endpoint:endpoint??null});
      if(result?.ok!==true)throw new Error('M26_PUSH_REVOKE_NOT_CONFIRMED');
      return Object.freeze({
        ok:true,
        active:result?.active===true,
        deletedCount:Number.isInteger(result?.deletedCount)?Math.max(0,result.deletedCount):0,
      });
    },
    webPushDispatchKick:async(token,operationId)=>{
      const normalizedOperationId=String(operationId||'').trim();
      if(!normalizedOperationId)throw new Error('M26_PUSH_DISPATCH_OPERATION_REQUIRED');
      const result=await edge('iberfit-web-push-sender-v1',token,{action:'dispatch',operationId:normalizedOperationId});
      if(result?.ok!==true)throw new Error('M26_PUSH_DISPATCH_NOT_CONFIRMED');
      return Object.freeze({
        ok:true,
        processed:Number.isInteger(result?.processed)?Math.max(0,result.processed):0,
        sent:Number.isInteger(result?.sent)?Math.max(0,result.sent):0,
        deferred:Number.isInteger(result?.deferred)?Math.max(0,result.deferred):0,
      });
    },
  });
}

export const __communicationTransportInternals=Object.freeze({
  NOTIFICATION_PREFERENCE_KEYS,
  projectNotificationPreferences,
  publicVapidKey,
});
