// QA-only observation for the real WebAuthn Coach route gate.
// No request body, token, URL, response body, user identifiers or headers are retained.
const RPC_PATH='/rest/v1/rpc/iberfit_bootstrap_v26';

export function isQaBootstrapRequest(request,qaOrigin){
  try{
    if(request?.method?.().toUpperCase()!=='POST')return false;
    const url=new URL(request.url());
    const qa=new URL(qaOrigin);
    return qa.protocol==='https:'&&url.origin===qa.origin&&url.pathname===RPC_PATH;
  }catch{return false;}
}

export function sanitizeQaBootstrapResponse({status=0,timing=null,contentLength=null}={}){
  const numericStatus=Number(status);
  const httpStatus=Number.isInteger(numericStatus)&&numericStatus>=100&&numericStatus<=599?numericStatus:0;
  const duration=Number(timing?.responseEnd);
  const durationMs=timing&&Number.isFinite(duration)&&duration>=0?Math.round(duration):null;
  const rawBytes=String(contentLength??'');
  const numericBytes=/^\d{1,15}$/u.test(rawBytes)?Number(rawBytes):NaN;
  const contentLengthBytes=Number.isSafeInteger(numericBytes)?numericBytes:null;
  return Object.freeze({httpStatus,durationMs,contentLengthBytes});
}

export function summarizeQaBootstrapSamples(samples=[]){
  const cleaned=(Array.isArray(samples)?samples:[]).map(sample=>sanitizeQaBootstrapResponse({
    status:sample?.httpStatus,timing:sample?.durationMs===null?null:{responseEnd:sample?.durationMs},
    contentLength:sample?.contentLengthBytes,
  }));
  const failures=cleaned.filter(item=>item.httpStatus<200||item.httpStatus>=300);
  const durations=cleaned.map(item=>item.durationMs).filter(value=>value!==null);
  return Object.freeze({
    schema:'iberfit.qa.bootstrap-network-metrics.v1',
    requestCount:cleaned.length,
    failureCount:failures.length,
    maxDurationMs:durations.length?Math.max(...durations):null,
    // Bound the artifact, retaining aggregate truth even for unexpectedly large runs.
    samples:cleaned.slice(0,64),
    samplesTruncated:cleaned.length>64,
  });
}
