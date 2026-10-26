// SIGNATURE B20 · Privacy-first, one-action wearable activation.
 // This module never requests operating-system permissions, tracks the device,
 // infers physical wearable ownership or changes a medical/training record.
const ACTIVE_STATES=new Set(['conectado','connected']);
const BLOCKED_STATES=new Set(['revocado','revoked','pausado','paused']);
export function clientWearableActivation(view){
  const wearable=view&&typeof view==='object'?view:{};
  const records=Number(wearable.summary?.daysWithData||0);
  const connections=Array.isArray(wearable.connections)?wearable.connections:[];
  const certified=connections.filter(item=>
    ACTIVE_STATES.has(String(item.status||item.state||'').toLowerCase())&&
    ((String(item.mode||'')==='certified_native'&&
      String(item.provider||'')==='health_connect'&&wearable.productionNativeReady===true)
     ||(String(item.mode||'')==='certified_oauth'&&item.policy?.productionAllowed===true))
  );
  if(records>0)return Object.freeze({kind:'observed',cta:false});
  if(certified.length)return Object.freeze({kind:'linked',cta:false});
  if(connections.some(item=>BLOCKED_STATES.has(
    String(item.status||item.state||'').toLowerCase()
  )))return Object.freeze({kind:'blocked',cta:false});
  if(wearable.productionNativeReady!==true)return Object.freeze({
    kind:'unavailable',cta:false,
  });
  return Object.freeze({kind:'consent',cta:true});
}
