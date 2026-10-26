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
    ['certified_native','certified_oauth'].includes(String(item.mode||''))&&
    item.policy?.productionAllowed===true
  );
  if(records>0)return Object.freeze({kind:'observed',cta:false,
    message:'Tu actividad confirmada ya está disponible en el seguimiento.'});
  if(certified.length)return Object.freeze({kind:'linked',cta:false,
    message:'Tu fuente está autorizada; las nuevas mediciones se mostrarán cuando se confirmen.'});
  if(connections.some(item=>BLOCKED_STATES.has(
    String(item.status||item.state||'').toLowerCase()
  )))return Object.freeze({kind:'blocked',cta:false,message:''});
  if(wearable.productionNativeReady!==true)return Object.freeze({
    kind:'unavailable',cta:false,message:'',
  });
  return Object.freeze({
    kind:'consent',cta:true,
    title:'Tu actividad, sin tener que registrarla dos veces',
    message:'Si ya usas un reloj o una app compatible con Health Connect, elige los datos que quieres compartir una sola vez. Después IBERFIT comprobará las nuevas mediciones al abrir la aplicación.',
    label:'Elegir qué compartir',
  });
}
