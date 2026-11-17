// P0 Free: passive browser telemetry for QA, without new HTTP or sensitive data.
// Browser responseBodySize is NOT official, billable Supabase Egress.
const QA_ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const MAX_OBSERVED_RESPONSE_BYTES=100_000_000;
const CATEGORIES=Object.freeze([
  'bootstrap','wearables','exercise-catalog','other-rpc','auth','storage',
  'edge','realtime','other',
]);
export function classifyQaSupabaseRoute(path){
  if(path==='/rest/v1/rpc/iberfit_bootstrap_v26')return 'bootstrap';
  if(path==='/rest/v1/rpc/m26_wearable_bootstrap_v44')return 'wearables';
  if(path==='/rest/v1/rpc/iberfit_exercise_catalog_public_v1')return 'exercise-catalog';
  if(path.startsWith('/rest/v1/rpc/'))return 'other-rpc';
  if(path.startsWith('/auth/v1/'))return 'auth';
  if(path.startsWith('/storage/v1/'))return 'storage';
  if(path.startsWith('/functions/v1/'))return 'edge';
  if(path.startsWith('/realtime/v1/'))return 'realtime';
  return 'other';
}
export function createQaSupabaseWireMeter(page,{origin=QA_ORIGIN}={}){
  if(origin!==QA_ORIGIN||typeof page?.on!=='function'||
    typeof page?.off!=='function')throw Error('M43_QA_WIRE_METER_SCOPE_INVALID');
  const byCategory=Object.fromEntries(CATEGORIES.map(name=>[name,{requests:0,responseBodyBytes:0}]));
  const pending=new Set();
  let failures=0,stopped=false;
  const onRequestFinished=request=>{
    let url;
    try{url=new URL(request.url());}catch{return;}
    if(url.origin!==QA_ORIGIN)return;
    const category=classifyQaSupabaseRoute(url.pathname);
    // Only local Playwright counters: no request payload, response text,
    // URL/query, credential collection, or extra network request.
    const task=Promise.resolve().then(()=>request.sizes()).then(sizes=>{
      const bytes=sizes?.responseBodySize;
      if(!Number.isSafeInteger(bytes)||bytes<0||bytes>MAX_OBSERVED_RESPONSE_BYTES){
        failures+=1;return;
      }
      byCategory[category].requests+=1;
      byCategory[category].responseBodyBytes+=bytes;
    },()=>{failures+=1;});
    pending.add(task);
    task.finally(()=>pending.delete(task));
  };
  page.on('requestfinished',onRequestFinished);
  return Object.freeze({async stop(){
    if(!stopped){stopped=true;page.off('requestfinished',onRequestFinished);}
    await Promise.allSettled([...pending]);
    const categories=Object.fromEntries(Object.entries(byCategory)
      .filter(([,counts])=>counts.requests>0));
    const totals=Object.values(byCategory).reduce((sum,counts)=>({
      requests:sum.requests+counts.requests,
      responseBodyBytes:sum.responseBodyBytes+counts.responseBodyBytes,
    }),{requests:0,responseBodyBytes:0});
    return {schema:'iberfit.qa.supabase.browser-wire.v1',
      metric:'playwright.responseBodySize',billableEgressVerified:false,
      extraSupabaseRequests:0,invalidMeasurements:failures,
      ...totals,byCategory:categories};
  }});
}
