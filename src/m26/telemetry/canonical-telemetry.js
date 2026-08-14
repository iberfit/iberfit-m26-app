import {createM26Id} from '../platform/id.js';
import {
  normalizeWearableProvider,
  wearableProviderDefinition,
} from '../wearables/contracts.js';

export const CANONICAL_TELEMETRY_SCHEMA_VERSION='iberfit.telemetry.v1';
export const CANONICAL_TELEMETRY_EVENT_TYPE='heart_rate_sample';

const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const QUALITY_GRADES=new Set(['alta','media','limitada']);
const QUALITY_CODES=new Set([
  'valid',
  'acquiring',
  'poor_contact',
  'stale',
  'out_of_range',
  'disconnected',
  'unsupported',
]);
const CONTACT_STATUSES=new Set([
  'detected',
  'not_detected',
  'unsupported',
  'unknown',
]);
const DEVICE_TYPES=new Set([
  'watch',
  'chest_strap',
  'arm_band',
  'sensor',
  'phone',
  'unknown',
]);

function cleanId(value){
  const text=String(value||'').trim();
  return SAFE_ID.test(text)?text:null;
}
function finite(value){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function iso(value){
  const date=value?new Date(value):null;
  return date&&!Number.isNaN(date.getTime())?date.toISOString():null;
}
function qualityGrade(value){
  const key=String(value||'').trim().toLowerCase();
  return QUALITY_GRADES.has(key)?key:'limitada';
}
function qualityCode(value){
  const key=String(value||'').trim().toLowerCase();
  return QUALITY_CODES.has(key)?key:null;
}
function contactStatus(value){
  const key=String(value||'').trim().toLowerCase();
  return CONTACT_STATUSES.has(key)?key:'unknown';
}
function deviceType(value){
  const key=String(value||'').trim().toLowerCase().replaceAll('-','_');
  return DEVICE_TYPES.has(key)?key:'unknown';
}
function cleanTransport(value){
  const text=String(value||'').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._:-]{0,79}$/.test(text)?text:null;
}
function rrIntervals(value){
  if(value===undefined||value===null)return {ok:true,value:[]};
  if(!Array.isArray(value))return {ok:false,reason:'rrIntervalsMs'};
  if(value.length>128)return {ok:false,reason:'rrIntervalsMs'};
  const output=[];
  for(const item of value){
    const number=finite(item);
    if(number===null||number<=0)return {ok:false,reason:'rrIntervalsMs'};
    output.push(number);
  }
  return {ok:true,value:output};
}
function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

export function telemetryContextFromExecution(execution={}){
  const item=execution?.queue?.[Number(execution?.index||0)]||null;
  const setIndex=Number(execution?.setIndex||0);
  const restUntil=execution?.restUntil?new Date(execution.restUntil).getTime():NaN;
  const phase=
    execution?.status==='paused'
      ?'paused'
      :Number.isFinite(restUntil)&&restUntil>Date.now()
        ?'rest'
        :execution?.status==='awaiting_feedback'
          ?'feedback'
          :execution?.status==='active'
            ?'work'
            :String(execution?.status||'unknown');

  return deepFreeze({
    phase,
    blockId:cleanId(item?.blockId),
    exerciseId:cleanId(item?.exerciseId),
    setNumber:item?Math.max(1,setIndex+1):null,
  });
}

export function createCanonicalHeartRateEvent(
  input={},
  {
    execution=null,
    clientId=null,
    sessionId=null,
    executionId=null,
    receivedAt=null,
    transport=null,
    timestampOrigin=null,
  }={}
){
  const resolvedClientId=
    cleanId(clientId)||cleanId(execution?.clientId);
  const resolvedSessionId=
    cleanId(sessionId)||cleanId(input?.sessionId)||cleanId(execution?.sessionId);
  const resolvedExecutionId=
    cleanId(executionId)||cleanId(input?.executionId)||cleanId(execution?.id);
  const provider=normalizeWearableProvider(
    input?.provider||input?.source
  );
  const heartRateBpm=finite(
    input?.heartRateBpm??input?.heartRate??input?.hrBpm??input?.bpm
  );
  const rr=rrIntervals(
    input?.rrIntervalsMs??input?.rrIntervals??input?.rr
  );
  const receivedAtIso=
    iso(receivedAt)||new Date().toISOString();
  const recordedAtIso=
    iso(input?.recordedAt||input?.timestamp)||receivedAtIso;

  const issues=[];
  if(!resolvedClientId)issues.push('clientId');
  if(!resolvedSessionId)issues.push('sessionId');
  if(!resolvedExecutionId)issues.push('executionId');
  if(!provider)issues.push('provider');
  if(heartRateBpm===null)issues.push('heartRateBpm');
  if(!rr.ok)issues.push(rr.reason);

  if(issues.length){
    return deepFreeze({
      ok:false,
      issues:[...new Set(issues)],
      value:null,
    });
  }

  const providerDefinition=wearableProviderDefinition(provider);
  const context=telemetryContextFromExecution(execution||{});
  const providerId=cleanId(input?.providerId);
  const resolvedTransport=
    cleanTransport(transport)||
    cleanTransport(input?.transport)||
    cleanTransport(providerDefinition?.channel)||
    null;
  const sourceDeviceType=deviceType(input?.deviceType);
  const explicitTimestampOrigin=String(
    timestampOrigin||input?.timestampOrigin||''
  ).trim().toLowerCase();

  const provenanceTimestampOrigin=
    ['sensor','receive_time','source_or_receive_unverified'].includes(
      explicitTimestampOrigin
    )
      ?explicitTimestampOrigin
      :input?.recordedAt||input?.timestamp
        ?'source_or_receive_unverified'
        :'receive_time';

  const event=deepFreeze({
    schemaVersion:CANONICAL_TELEMETRY_SCHEMA_VERSION,
    eventType:CANONICAL_TELEMETRY_EVENT_TYPE,
    eventId:cleanId(input?.eventId)||createM26Id(),
    clientId:resolvedClientId,
    sessionId:resolvedSessionId,
    executionId:resolvedExecutionId,
    recordedAt:recordedAtIso,
    receivedAt:receivedAtIso,
    context,
    source:{
      provider,
      providerId,
      platform:providerDefinition?.platform||null,
      transport:resolvedTransport,
      deviceType:sourceDeviceType,
    },
    quality:{
      grade:qualityGrade(input?.quality),
      code:qualityCode(input?.canonicalQuality),
      contactStatus:contactStatus(input?.contactStatus),
    },
    raw:{
      heartRateBpm,
      rrIntervalsMs:[...rr.value],
    },
    provenance:{
      origin:'live_sensor',
      capturedBy:'m26-web',
      timestampOrigin:provenanceTimestampOrigin,
      rawPreserved:true,
    },
  });

  return deepFreeze({
    ok:true,
    issues:[],
    value:event,
  });
}

export const __canonicalTelemetryInternals=deepFreeze({
  QUALITY_GRADES,
  QUALITY_CODES,
  CONTACT_STATUSES,
  DEVICE_TYPES,
  cleanId,
  finite,
  rrIntervals,
  deviceType,
});