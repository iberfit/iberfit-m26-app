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


// U35 non-sensitive payload composition sample for QA diagnostics. Never retain
// an HTTP body, JWT, entity ID, name, email, notes or arbitrary JSON field.
// This is NOT a client-side performance optimization or a data-access shortcut.
export function summarizeQaBootstrapPayload(raw){
  if(typeof raw!=='string')return null;
  const responseBytes=Buffer.byteLength(raw,'utf8');
  const schema='iberfit.qa.bootstrap-payload-composition.v1';
  if(responseBytes>16_000_000)return Object.freeze({
    schema,responseBytes,overInspectionBudget:true,
  });
  let payload;
  try{payload=JSON.parse(raw);}
  catch{return Object.freeze({schema,responseBytes,invalidJson:true});}
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
     !payload.data||typeof payload.data!=='object'||Array.isArray(payload.data)){
    return Object.freeze({schema,responseBytes,invalidShape:true});
  }
  const data=payload.data;
  const permittedSections=[
    'm26Entities','sessionExecutions','domainEvents','checkins',
    'reports','sessions','trainingCycles','clients','userProfiles',
    'clientProfiles','planning','iriAssessments',
  ];
  const sections={};
  for(const key of permittedSections){
    const array=data[key];
    if(Array.isArray(array))sections[key]=Object.freeze({
      count:array.length,serializedBytes:Buffer.byteLength(JSON.stringify(array),'utf8'),
    });
  }
  // Count overlap only: never serialize or expose either canonical or legacy IDs.
  const canonical=Array.isArray(data.m26Entities)?data.m26Entities:[];
  const legacy=Array.isArray(data.sessionExecutions)?data.sessionExecutions:[];
  const legacyIds=new Set(legacy.map(e=>String(e?.id||'')).filter(Boolean));
  const types=Object.freeze({
    session:canonical.filter(e=>e?.entityType==='session').length,
    sessionExecution:canonical.filter(e=>e?.entityType==='session_execution').length,
    planning:canonical.filter(e=>e?.entityType==='planning').length,
    checkin:canonical.filter(e=>e?.entityType==='checkin').length,
    report:canonical.filter(e=>e?.entityType==='report').length,
  });
  const canonicalExecutionIds=canonical
    .filter(e=>e?.entityType==='session_execution')
    .map(e=>String(e?.entityId||'')).filter(Boolean);
  const revisions=payload.remoteRevisions;
  return Object.freeze({
    schema,responseBytes,overInspectionBudget:false,
    sections:Object.freeze(sections),canonicalEntityTypes:types,
    canonicalExecutionCount:canonicalExecutionIds.length,
    canonicalLegacyExecutionIdOverlap:canonicalExecutionIds.filter(id=>legacyIds.has(id)).length,
    remoteRevisionEntries:revisions&&typeof revisions==='object'&&!Array.isArray(revisions)
      ?Object.keys(revisions).length:0,
    remoteRevisionBytes:revisions&&typeof revisions==='object'&&!Array.isArray(revisions)
      ?Buffer.byteLength(JSON.stringify(revisions),'utf8'):0,
  });
}
