import {normalizeWearableProvider,wearableProviderDefinition} from './contracts.js';
import {createNativeTelemetryBridge} from './native-transport.js';
import {createCanonicalHeartRateEvent} from '../telemetry/canonical-telemetry.js';
import {
  appendCanonicalTelemetryEvent,
  createBoundedTelemetryTimeline,
  markTelemetryTimelineRejected,
  telemetryTimelineSummary,
} from '../telemetry/bounded-timeline.js';

export const LIVE_TELEMETRY_PROVIDERS=Object.freeze([
  'apple_health',
  'wear_os_health_services',
  'ble_direct',
]);

const HR_MIN=25;
const HR_MAX=240;
const RR_MIN=250;
const RR_MAX=2500;
const MAX_RR_PER_SAMPLE=24;

function finite(value){
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function iso(value){
  const date=value?new Date(value):new Date();
  return Number.isNaN(date.getTime())?new Date().toISOString():date.toISOString();
}
function quality(value){
  const key=String(value||'').trim().toLowerCase();
  return ['alta','media','limitada'].includes(key)?key:'limitada';
}
function safeProvider(value){
  const provider=normalizeWearableProvider(value);
  return LIVE_TELEMETRY_PROVIDERS.includes(provider)?provider:null;
}
function safeHeartRate(value){
  const number=finite(value);
  return number!==null&&number>=HR_MIN&&number<=HR_MAX?Math.round(number):null;
}
function safeRrIntervals(values){
  return Object.freeze((Array.isArray(values)?values:[])
    .map(finite)
    .filter((value)=>value!==null&&value>=RR_MIN&&value<=RR_MAX)
    .slice(-MAX_RR_PER_SAMPLE)
    .map((value)=>Math.round(value*10)/10));
}

export function createLiveTelemetryState(){
  return {
    status:'idle',
    provider:null,
    providerLabel:null,
    heartRateBpm:null,
    averageHeartRateBpm:null,
    minHeartRateBpm:null,
    maxHeartRateBpm:null,
    sampleCount:0,
    heartRateSum:0,
    latestAt:null,
    quality:'limitada',
    rrIntervalsMs:[],
    rrIntervalAvailable:false,
    rrSampleCount:0,
    timeline:createBoundedTelemetryTimeline(),
    errorCode:null,
  };
}

export function normalizeLiveTelemetrySample(input={}){
  const provider=safeProvider(input.provider||input.source);
  const heartRateBpm=safeHeartRate(
    input.heartRateBpm??input.heartRate??input.hrBpm??input.bpm
  );
  const rrIntervalsMs=safeRrIntervals(
    input.rrIntervalsMs??input.rrIntervals??input.rr
  );
  if(!provider||heartRateBpm===null){
    return Object.freeze({ok:false,reason:'M26_LIVE_TELEMETRY_SAMPLE_INVALID'});
  }
  return Object.freeze({
    ok:true,
    value:Object.freeze({
      provider,
      heartRateBpm,
      rrIntervalsMs,
      quality:quality(input.quality),
      recordedAt:iso(input.recordedAt||input.timestamp),
    }),
  });
}

function sampleCorrelationMatchesExecution(execution,input={}){
  const sampleExecutionId=String(input?.executionId||'').trim();
  const sampleSessionId=String(input?.sessionId||'').trim();
  if(sampleExecutionId&&sampleExecutionId!==String(execution?.id||''))return false;
  if(sampleSessionId&&sampleSessionId!==String(execution?.sessionId||''))return false;
  return true;
}

function applyLegacyLiveTelemetrySample(execution,input={}){
  const normalized=normalizeLiveTelemetrySample(input);
  if(!normalized.ok)return false;
  const sample=normalized.value;
  const state=execution.liveTelemetry||createLiveTelemetryState();
  const sampleCount=Number(state.sampleCount||0)+1;
  const heartRateSum=Number(state.heartRateSum||0)+sample.heartRateBpm;
  const rrCount=Number(state.rrSampleCount||0)+sample.rrIntervalsMs.length;
  Object.assign(state,{
    status:'connected',
    provider:sample.provider,
    providerLabel:wearableProviderDefinition(sample.provider)?.label||sample.provider,
    heartRateBpm:sample.heartRateBpm,
    averageHeartRateBpm:Math.round((heartRateSum/sampleCount)*10)/10,
    minHeartRateBpm:state.minHeartRateBpm===null||state.minHeartRateBpm===undefined
      ?sample.heartRateBpm
      :Math.min(state.minHeartRateBpm,sample.heartRateBpm),
    maxHeartRateBpm:state.maxHeartRateBpm===null||state.maxHeartRateBpm===undefined
      ?sample.heartRateBpm
      :Math.max(state.maxHeartRateBpm,sample.heartRateBpm),
    sampleCount,
    heartRateSum,
    latestAt:sample.recordedAt,
    quality:sample.quality,
    rrIntervalsMs:[...sample.rrIntervalsMs],
    rrIntervalAvailable:sample.rrIntervalsMs.length>0,
    rrSampleCount:rrCount,
    errorCode:null,
  });
  execution.liveTelemetry=state;
  return true;
}

export function ingestLiveTelemetrySample(
  execution,
  input={},
  {
    receivedAt=null,
    transport=null,
    timestampOrigin=null,
  }={}
){
  if(!execution)throw new Error('M26_LIVE_TELEMETRY_EXECUTION_REQUIRED');
  const state=execution.liveTelemetry||createLiveTelemetryState();
  state.timeline=state.timeline||createBoundedTelemetryTimeline();
  execution.liveTelemetry=state;

  if(!sampleCorrelationMatchesExecution(execution,input)){
    markTelemetryTimelineRejected(state.timeline);
    return Object.freeze({
      canonicalAccepted:false,
      canonicalEvent:null,
      legacyApplied:false,
      reason:'M26_LIVE_TELEMETRY_CORRELATION_MISMATCH',
    });
  }

  const canonical=createCanonicalHeartRateEvent(
    input,
    {
      execution,
      receivedAt,
      transport,
      timestampOrigin,
    }
  );

  let canonicalAccepted=false;
  let canonicalReason=null;

  if(canonical.ok){
    const appended=appendCanonicalTelemetryEvent(
      state.timeline,
      canonical.value
    );
    canonicalAccepted=appended.accepted===true;
    canonicalReason=appended.reason||null;
  }else{
    markTelemetryTimelineRejected(state.timeline);
    canonicalReason='M26_LIVE_TELEMETRY_CANONICAL_INVALID';
  }

  const legacyApplied=applyLegacyLiveTelemetrySample(execution,input);

  return Object.freeze({
    canonicalAccepted,
    canonicalEvent:canonicalAccepted?canonical.value:null,
    legacyApplied,
    reason:canonicalAccepted?null:canonicalReason,
  });
}

export function applyLiveTelemetrySample(execution,input={},options={}){
  ingestLiveTelemetrySample(execution,input,options);
  return execution;
}

export function liveTelemetrySummary(execution){
  const state=execution?.liveTelemetry;
  if(!state||!Number(state.sampleCount||0)){
    return Object.freeze({
      available:false,
      provider:state?.provider||null,
      sampleCount:0,
      heartRateBpm:null,
      averageHeartRateBpm:null,
      minHeartRateBpm:null,
      maxHeartRateBpm:null,
      rrIntervalAvailable:false,
      rrSampleCount:0,
      timeline:telemetryTimelineSummary(state?.timeline),
    });
  }
  return Object.freeze({
    available:true,
    provider:state.provider,
    providerLabel:state.providerLabel,
    sampleCount:state.sampleCount,
    heartRateBpm:state.heartRateBpm,
    averageHeartRateBpm:state.averageHeartRateBpm,
    minHeartRateBpm:state.minHeartRateBpm,
    maxHeartRateBpm:state.maxHeartRateBpm,
    latestAt:state.latestAt,
    quality:state.quality,
    rrIntervalAvailable:state.rrIntervalAvailable===true,
    rrSampleCount:Number(state.rrSampleCount||0),
    timeline:telemetryTimelineSummary(state.timeline),
  });
}

function bridgeFor(scope){
  const bridge=scope?.IBERFIT_LIVE_TELEMETRY_BRIDGE;
  if(bridge&&typeof bridge==='object')return bridge;
  return createNativeTelemetryBridge({scope});
}

export function createLiveTelemetryController({
  scope=globalThis,
  onUpdate=()=>{},
  onDiagnostic=()=>{},
  telemetryOutbox=null,
}={}){
  if(
    telemetryOutbox!==null&&
    typeof telemetryOutbox?.stage!=='function'
  ){
    throw new Error('M26_TELEMETRY_OUTBOX_INVALID');
  }
  let unsubscribe=null;
  let activeExecution=null;
  let activeTransport=null;
  let outboxStageChain=Promise.resolve();

  function setState(execution,patch){
    if(!execution)return;
    execution.liveTelemetry=execution.liveTelemetry||createLiveTelemetryState();
    Object.assign(execution.liveTelemetry,patch);
    try{onUpdate(execution.liveTelemetry,execution);}catch{}
  }
  function diagnostic(code,error){
    try{onDiagnostic(code,error);}catch{}
  }
  function stageCanonicalEvent(event){
    if(!event||!telemetryOutbox)return;
    outboxStageChain=outboxStageChain
      .then(()=>telemetryOutbox.stage(event))
      .catch((error)=>{
        diagnostic('M26_TELEMETRY_OUTBOX_STAGE_FAILED',error);
      });
  }
  async function start(execution){
    if(!execution?.id||!execution?.clientId)return false;
    const bridge=bridgeFor(scope);
    activeExecution=execution;
    if(typeof bridge?.start!=='function'||typeof bridge?.subscribe!=='function'){
      setState(execution,{status:'unavailable',errorCode:'M26_LIVE_TELEMETRY_BRIDGE_UNAVAILABLE'});
      return false;
    }
    try{
      const startResult=await bridge.start({
        executionId:execution.id,
        clientId:execution.clientId,
        metrics:['heartRateBpm','rrIntervalsMs'],
      });
      const declaredProvider=startResult?.provider||bridge.provider||null;
      const provider=safeProvider(declaredProvider);
      activeTransport=startResult?.transport||bridge.transport||null;
      if(declaredProvider&&!provider)throw new Error('M26_LIVE_TELEMETRY_PROVIDER_UNSUPPORTED');
      setState(execution,{
        status:'connecting',
        provider:provider||null,
        providerLabel:provider?wearableProviderDefinition(provider)?.label||provider:'Dispositivo nativo',
        errorCode:null,
      });
      const subscription=bridge.subscribe((sample)=>{
        const enriched={
          ...sample,
          provider:sample?.provider||provider,
        };
        const ingested=ingestLiveTelemetrySample(
          execution,
          enriched,
          {
            transport:activeTransport,
          }
        );
        if(ingested.canonicalAccepted){
          stageCanonicalEvent(ingested.canonicalEvent);
        }else{
          diagnostic(
            ingested.reason||'M26_LIVE_TELEMETRY_CANONICAL_REJECTED',
            null
          );
        }
        try{onUpdate(execution.liveTelemetry,execution);}catch{}
      });
      unsubscribe=typeof subscription==='function'
        ?subscription
        :typeof subscription?.unsubscribe==='function'
          ?()=>subscription.unsubscribe()
          :null;
      setState(execution,{status:'connected'});
      return true;
    }catch(error){
      setState(execution,{status:'error',errorCode:String(error?.message||'M26_LIVE_TELEMETRY_START_FAILED').slice(0,120)});
      diagnostic('M26_LIVE_TELEMETRY_START_FAILED',error);
      return false;
    }
  }
  async function pause(execution=activeExecution){
    if(!execution)return false;
    try{await bridgeFor(scope)?.pause?.({executionId:execution.id});}catch(error){diagnostic('M26_LIVE_TELEMETRY_PAUSE_FAILED',error);}
    setState(execution,{status:execution.liveTelemetry?.status==='unavailable'?'unavailable':'paused'});
    return true;
  }
  async function resume(execution=activeExecution){
    if(!execution)return false;
    try{await bridgeFor(scope)?.resume?.({executionId:execution.id});}catch(error){diagnostic('M26_LIVE_TELEMETRY_RESUME_FAILED',error);}
    setState(execution,{status:execution.liveTelemetry?.status==='unavailable'?'unavailable':'connected'});
    return true;
  }
  async function stop(execution=activeExecution,{reason='session-ended'}={}){
    if(!execution)return false;
    try{unsubscribe?.();}catch{}
    unsubscribe=null;
    await outboxStageChain;
    try{await bridgeFor(scope)?.stop?.({executionId:execution.id,reason});}catch(error){diagnostic('M26_LIVE_TELEMETRY_STOP_FAILED',error);}
    if(execution.liveTelemetry&&execution.liveTelemetry.status!=='unavailable'){
      setState(execution,{status:'stopped'});
    }
    if(activeExecution===execution){
      activeExecution=null;
      activeTransport=null;
    }
    return true;
  }
  return Object.freeze({
    start,pause,resume,stop,
    awaitTelemetryStaging:()=>outboxStageChain,
    supported:()=>Boolean(
      typeof bridgeFor(scope)?.start==='function'
      &&typeof bridgeFor(scope)?.subscribe==='function'
    ),
  });
}
