export const QUALITY_RUNTIME_OBSERVABILITY_SCHEMA_VERSION='iberfit.quality-runtime-observability.v1';

const DEFAULT_LIMIT=32;
const DIAGNOSTIC_CODE=/^M26_[A-Z0-9_:-]{2,120}$/u;

function finite(value){
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}

function rounded(value,digits=2){
  const number=finite(value);
  if(number===null)return null;
  const factor=10**Math.max(0,Math.min(4,Number(digits)||0));
  return Math.round(number*factor)/factor;
}

function safeStage(value){
  return String(value||'operation')
    .replace(/[^a-z0-9_-]+/giu,'-')
    .replace(/^-+|-+$/gu,'')
    .slice(0,60)||'operation';
}

function safeDiagnostic(detail={}){
  const code=String(detail?.code||'');
  const status=Number.isInteger(detail?.status)&&detail.status>=100&&detail.status<=599
    ?detail.status
    :null;
  return Object.freeze({
    stage:safeStage(detail?.stage),
    code:DIAGNOSTIC_CODE.test(code)?code:'M26_DIAGNOSTIC_INVALID',
    status,
  });
}

function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

export function createQualityRuntimeObservability({
  scope=globalThis,
  limit=DEFAULT_LIMIT,
  PerformanceObserverImpl=scope?.PerformanceObserver,
}={}){
  const cap=Math.max(1,Math.min(128,Number(limit)||DEFAULT_LIMIT));
  const diagnostics=[];
  const observers=[];
  let started=false;
  let lcpMs=null;
  let cls=0;
  let interactionLatencyMaxMs=null;

  function boundedDiagnostic(event){
    diagnostics.push(safeDiagnostic(event?.detail));
    if(diagnostics.length>cap)diagnostics.splice(0,diagnostics.length-cap);
  }

  function observe(type,callback,options={}){
    if(typeof PerformanceObserverImpl!=='function')return false;
    try{
      const observer=new PerformanceObserverImpl((list)=>callback(list?.getEntries?.()||[]));
      observer.observe({type,buffered:true,...options});
      observers.push(observer);
      return true;
    }catch{
      return false;
    }
  }

  function start(){
    if(started)return api;
    started=true;
    scope?.addEventListener?.('m26:diagnostic',boundedDiagnostic);

    observe('largest-contentful-paint',(entries)=>{
      for(const entry of entries){
        const value=finite(entry?.startTime);
        if(value!==null)lcpMs=rounded(value,2);
      }
    });

    observe('layout-shift',(entries)=>{
      for(const entry of entries){
        if(entry?.hadRecentInput===true)continue;
        const value=finite(entry?.value);
        if(value!==null&&value>=0)cls=rounded(cls+value,6);
      }
    });

    observe('event',(entries)=>{
      for(const entry of entries){
        if(!(Number(entry?.interactionId)>0))continue;
        const value=finite(entry?.duration);
        if(value===null||value<0)continue;
        interactionLatencyMaxMs=interactionLatencyMaxMs===null
          ?rounded(value,2)
          :Math.max(interactionLatencyMaxMs,rounded(value,2));
      }
    },{durationThreshold:40});

    return api;
  }

  function snapshot(){
    return deepFreeze({
      schemaVersion:QUALITY_RUNTIME_OBSERVABILITY_SCHEMA_VERSION,
      storage:'memory-only',
      transport:'none',
      identityIncluded:false,
      healthDataIncluded:false,
      fieldP75Claimed:false,
      inpClaimed:false,
      metrics:{
        lcpMs,
        cls,
        interactionLatencyMaxMs,
        interactionLatencyLabel:'candidate-not-inp',
      },
      diagnostics:[...diagnostics],
    });
  }

  function destroy(){
    if(started){
      scope?.removeEventListener?.('m26:diagnostic',boundedDiagnostic);
      started=false;
    }
    for(const observer of observers.splice(0)){
      try{observer?.disconnect?.();}catch{}
    }
  }

  const api=Object.freeze({start,snapshot,destroy});
  return api;
}

export function installQualityRuntimeObservability(options={}){
  return createQualityRuntimeObservability(options).start();
}
