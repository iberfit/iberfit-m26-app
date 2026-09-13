import {finiteOptionalNumber} from '../domain/optional-number.js';

export const QUALITY_RUNTIME_OBSERVABILITY_SCHEMA_VERSION='iberfit.quality-runtime-observability.v1';

const DEFAULT_LIMIT=32;
const DIAGNOSTIC_CODE=/^M26_[A-Z0-9_:-]{2,120}$/u;

function finite(value){
  return finiteOptionalNumber(value);
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
  let fcpMs=null;
  let lcpMs=null;
  let cls=0;
  let interactionLatencyMaxMs=null;
  let longFrameCount=0;
  let longFrameMaxMs=null;
  let longFrameEntryType=null;
  let runtimeErrorCount=0;
  let resourceErrorCount=0;
  let unhandledRejectionCount=0;
  let securityPolicyViolationCount=0;

  function pushDiagnostic(detail){
    diagnostics.push(safeDiagnostic(detail));
    if(diagnostics.length>cap)diagnostics.splice(0,diagnostics.length-cap);
  }

  function boundedDiagnostic(event){
    pushDiagnostic(event?.detail);
  }

  function captureRuntimeError(event){
    const resourceFailure=Boolean(
      event?.target
      &&event.target!==scope
      &&event?.error==null
    );
    if(resourceFailure){
      resourceErrorCount+=1;
      pushDiagnostic({
        stage:'runtime',
        code:'M26_RUNTIME_RESOURCE_ERROR',
      });
      return;
    }
    runtimeErrorCount+=1;
    pushDiagnostic({
      stage:'runtime',
      code:'M26_RUNTIME_ERROR',
    });
  }

  function captureUnhandledRejection(){
    unhandledRejectionCount+=1;
    pushDiagnostic({
      stage:'runtime',
      code:'M26_UNHANDLED_REJECTION',
    });
  }

  function captureSecurityPolicyViolation(){
    securityPolicyViolationCount+=1;
    pushDiagnostic({
      stage:'security',
      code:'M26_SECURITY_POLICY_VIOLATION',
    });
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

  function recordLongFrames(entries,type){
    for(const entry of entries){
      const value=finite(entry?.duration);
      if(value===null||value<0)continue;
      longFrameCount+=1;
      longFrameEntryType=type;
      const duration=rounded(value,2);
      longFrameMaxMs=longFrameMaxMs===null
        ?duration
        :Math.max(longFrameMaxMs,duration);
    }
  }

  function start(){
    if(started)return api;
    started=true;
    scope?.addEventListener?.('m26:diagnostic',boundedDiagnostic);
    scope?.addEventListener?.('error',captureRuntimeError);
    scope?.addEventListener?.('unhandledrejection',captureUnhandledRejection);
    scope?.addEventListener?.(
      'securitypolicyviolation',
      captureSecurityPolicyViolation
    );

    observe('paint',(entries)=>{
      for(const entry of entries){
        if(entry?.name!=='first-contentful-paint')continue;
        const value=finite(entry?.startTime);
        if(value!==null)fcpMs=rounded(value,2);
      }
    });

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
        const interactionId=finite(entry?.interactionId);
        if(interactionId===null||interactionId<=0)continue;
        const value=finite(entry?.duration);
        if(value===null||value<0)continue;
        interactionLatencyMaxMs=interactionLatencyMaxMs===null
          ?rounded(value,2)
          :Math.max(interactionLatencyMaxMs,rounded(value,2));
      }
    },{durationThreshold:40});

    const loafObserved=observe(
      'long-animation-frame',
      (entries)=>recordLongFrames(entries,'long-animation-frame')
    );
    if(!loafObserved){
      observe(
        'longtask',
        (entries)=>recordLongFrames(entries,'longtask')
      );
    }

    return api;
  }

  function snapshot(){
    return deepFreeze({
      schemaVersion:QUALITY_RUNTIME_OBSERVABILITY_SCHEMA_VERSION,
      storage:'memory-only',
      transport:'none',
      measurement:'field-local-session',
      aggregation:'none',
      identityIncluded:false,
      healthDataIncluded:false,
      runtimeErrorDetailsIncluded:false,
      urlIncluded:false,
      stackIncluded:false,
      fieldP75Claimed:false,
      inpClaimed:false,
      metrics:{
        fcpMs,
        lcpMs,
        cls,
        interactionLatencyMaxMs,
        interactionLatencyLabel:'candidate-not-inp',
        longFrameCount,
        longFrameMaxMs,
        longFrameEntryType,
        runtimeErrorCount,
        resourceErrorCount,
        unhandledRejectionCount,
        securityPolicyViolationCount,
      },
      diagnostics:[...diagnostics],
    });
  }

  function destroy(){
    if(started){
      scope?.removeEventListener?.('m26:diagnostic',boundedDiagnostic);
      scope?.removeEventListener?.('error',captureRuntimeError);
      scope?.removeEventListener?.(
        'unhandledrejection',
        captureUnhandledRejection
      );
      scope?.removeEventListener?.(
        'securitypolicyviolation',
        captureSecurityPolicyViolation
      );
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
