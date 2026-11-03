// QA-only, read-only measurement of PostgREST Coach bootstrap latency.
// Never serialize URLs, auth headers, JWTs, client IDs, request bodies or response data.
const QA_ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const CORE='/rest/v1/rpc/iberfit_bootstrap_v26_core_u37_qa';
const HISTORY='/rest/v1/rpc/iberfit_privileged_history_page_u38_qa';
const SECTIONS=new Set(['m26Entities','domainEvents','sessionExecutions']);
const MAX_REQUESTS=512;
function quantile(values,fraction){
  if(values.length===0)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(sorted.length*fraction)-1)];
}
export function createQaCoachHistoryLatencyProbe({now=()=>performance.now()}={}){
  if(typeof now!=='function')throw new Error('QA_HISTORY_CLOCK_REQUIRED');
  const pending=new Map(),rows=new Map();
  let phase='first',started=0,overflow=0,peakInFlight=0;
  function classify(request){
    try{
      const url=new URL(request.url());
      if(url.origin!==QA_ORIGIN||request.method()!=='POST')return null;
      const endpoint=url.pathname===CORE?'core':url.pathname===HISTORY?'history':null;
      if(!endpoint)return null;
      let section='core';
      if(endpoint==='history'){
        let candidate=null;
        try{candidate=request.postDataJSON()?.p_section;}catch{}
        section=SECTIONS.has(candidate)?candidate:'unknown';
      }
      return {phase,endpoint,section};
    }catch{return null;}
  }
  function row(meta){
    const key=meta.phase+':'+meta.endpoint+':'+meta.section;
    let result=rows.get(key);
    if(!result){
      result={...meta,requests:0,completed:0,httpFailures:0,networkFailures:0,
        firstStart:null,lastEnd:null,durations:[]};
      rows.set(key,result);
    }
    return result;
  }
  function start(request){
    if(started>=MAX_REQUESTS){overflow=Math.min(MAX_REQUESTS,overflow+1);return;}
    const meta=classify(request);
    if(!meta||pending.has(request))return;
    const at=Math.max(0,Number(now())||0);
    const bucket=row(meta);
    bucket.requests++;
    if(bucket.firstStart===null)bucket.firstStart=at;
    pending.set(request,{bucket,at});
    started++;
    peakInFlight=Math.max(peakInFlight,pending.size);
  }
  function close(request,status){
    const item=pending.get(request);
    if(!item)return;
    pending.delete(request);
    const end=Math.max(item.at,Number(now())||item.at);
    const duration=Math.min(60000,Math.round(end-item.at));
    const bucket=item.bucket;
    bucket.completed++;
    bucket.lastEnd=Math.max(bucket.lastEnd??0,end);
    bucket.durations.push(duration);
    if(status===0)bucket.networkFailures++;
    else if(!Number.isInteger(status)||status<200||status>=400)bucket.httpFailures++;
  }
  function snapshot(){
    const result=[...rows.values()].map(b=>({
      phase:b.phase,endpoint:b.endpoint,section:b.section,
      requests:b.requests,completed:b.completed,inFlight:b.requests-b.completed,
      httpFailures:b.httpFailures,networkFailures:b.networkFailures,
      minMs:b.durations.length?Math.min(...b.durations):null,
      p50Ms:quantile(b.durations,.5),p95Ms:quantile(b.durations,.95),
      maxMs:b.durations.length?Math.max(...b.durations):null,
      sumMs:b.durations.reduce((a,v)=>a+v,0),
      wallMs:b.lastEnd===null?null:Math.max(0,Math.round(b.lastEnd-b.firstStart)),
    })).sort((a,b)=>a.phase.localeCompare(b.phase)||a.endpoint.localeCompare(b.endpoint)||a.section.localeCompare(b.section));
    return Object.freeze({schema:'iberfit.qa-coach-history-latency.v1',maxConcurrent:peakInFlight,
      observed:started,overflow,rows:result});
  }
  return Object.freeze({
    start,
    finish:(request,status)=>close(request,status),
    fail:(request)=>close(request,0),
    setPhase:(value)=>{
      if(value!=='first'&&value!=='second')throw new Error('QA_HISTORY_PHASE_INVALID');
      phase=value;
    },
    snapshot,
  });
}
