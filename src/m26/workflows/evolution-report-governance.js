// Reuses IBERFIT's IRI document governance transport model, but its
// report IDs, request idempotency and client permissions remain independent.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DEST='/functions/v1/iberfit-evolution-report-emission-v1';
function clean(v,n=4000){return String(v??'').replace(/[\u0000-\u001f\u007f]/gu,' ').trim().slice(0,n);}
function requireUuid(v,code){const id=clean(v,80);if(!UUID.test(id))throw Error(code);return id;}
function config(runtime){
 if(runtime?.enabled!==true)throw Error('M44_REPORT_GOVERNANCE_BACKEND_DISABLED');
 const expected=runtime.qaOnly===true
 ?{ref:'gjztkdwfmunnzhtvxrsu',url:'https://gjztkdwfmunnzhtvxrsu.supabase.co'}
 :{ref:'pjhmrhejsoofmouedavw',url:'https://pjhmrhejsoofmouedavw.supabase.co'};
 let origin;try{origin=new URL(String(runtime.url||'')).origin;}catch{throw Error('M44_REPORT_GOVERNANCE_ORIGIN_INVALID');}
 if(runtime.projectRef!==expected.ref||origin!==expected.url)
  throw Error('M44_REPORT_GOVERNANCE_PROJECT_MISMATCH');
 const key=clean(runtime.publishableKey,10000);
 if(!key)throw Error('M44_REPORT_GOVERNANCE_KEY_REQUIRED');
 return {origin,publishableKey:key};
}
const SHA=/^[0-9a-f]{64}$/u;
export function createEvolutionReportGovernanceService({runtime,fetchImpl=globalThis.fetch,
 uuidFactory=()=>globalThis.crypto?.randomUUID?.(),storage=globalThis.sessionStorage}={}){
 const settings=config(runtime);
 if(typeof fetchImpl!=='function')throw Error('M44_REPORT_GOVERNANCE_TRANSPORT_UNAVAILABLE');
 const pending=new Map();
 function pendingRequest(reportId){
  const key='iberfit:m44:report-issue:'+reportId;
  const cached=clean(pending.get(key),80);
  if(UUID.test(cached))return {key,id:cached};
  let saved='';
  try{saved=clean(storage?.getItem?.(key),80);}catch{}
  if(UUID.test(saved)){pending.set(key,saved);return {key,id:saved};}
  const id=requireUuid(uuidFactory?.(),'M44_PDF_ISSUE_ID_GENERATION_FAILED');
  pending.set(key,id);
  try{storage?.setItem?.(key,id);}catch{}
  return {key,id};
 }
 function clearPending(key,id){
  if(pending.get(key)===id)pending.delete(key);
  try{if(clean(storage?.getItem?.(key),80)===id)storage.removeItem(key);}catch{}
 }
 async function request(token,payload,{timeout=30000}={}){
  const jwt=clean(token,20000);
  if(!jwt)throw Error('M44_PDF_AUTH_REQUIRED');
  const controller=new AbortController();
  const timer=globalThis.setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await fetchImpl(settings.origin+DEST,{
    method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
    referrerPolicy:'no-referrer',signal:controller.signal,
    headers:{authorization:'Bearer '+jwt,apikey:settings.publishableKey,
     'content-type':'application/json','x-client-info':'iberfit-m44-web/1'},
    body:JSON.stringify(payload),
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||data?.ok!==true){
    const e=Error(clean(data?.code||data?.message,'400')||'M44_PDF_SERVER_REJECTED');
    e.status=response.status;
    throw e;
   }
   return data;
  }catch(error){
   if(error?.name==='AbortError')throw Error('M44_PDF_REQUEST_TIMEOUT');
   throw error;
  }finally{globalThis.clearTimeout(timer);}
 }
 const opening=(value)=>{
  const hash=clean(value.artifactSha256,64);
  if(value.delivery!=='authenticated-pdf'||!SHA.test(hash))
   throw Error('M44_PDF_AUTHENTICATED_DELIVERY_REQUIRED');
  return Object.freeze({
   issuanceId:requireUuid(value.issuanceId,'M44_PDF_ISSUANCE_INVALID_RESPONSE'),
   version:Number(value.version||0),sha256:hash,delivery:'authenticated-pdf',
  });
 };
 async function issue(token,{reportId}={}){
  const id=requireUuid(reportId,'M44_PDF_REPORT_ID_INVALID');
  const row=pendingRequest(id);
  const response=await request(token,{action:'issue',reportId:id,issueRequestId:row.id},{timeout:180000});
  const opened=opening(response);
  clearPending(row.key,row.id);
  return opened;
 }
 async function latest(token,{reportId}={}){
  const id=requireUuid(reportId,'M44_PDF_REPORT_ID_INVALID');
  return opening(await request(token,{action:'latest',reportId:id}));
 }
 async function history(token,{reportId}={}){
  const id=requireUuid(reportId,'M44_PDF_REPORT_ID_INVALID');
  const result=await request(token,{action:'history',reportId:id});
  if(result.reportId!==id||!Array.isArray(result.items))
   throw Error('M44_PDF_HISTORY_RESPONSE_INVALID');
  const items=result.items.flatMap(item=>{
   const issuanceId=clean(item?.issuanceId,80);
   if(!UUID.test(issuanceId))return [];
   return [Object.freeze({
    issuanceId,version:Number(item.version||0),issuedAt:clean(item.issuedAt,60),
    withdrawn:item.withdrawn===true,withdrawnAt:clean(item.withdrawnAt,60),
    withdrawnReason:clean(item.withdrawnReason,500),
    artifactSha256:clean(item.artifactSha256,64),
   })];
  });
  return Object.freeze({reportId:id,manager:result.manager===true,
    items:Object.freeze(items)});
 }
 async function open(token,{issuanceId}={}){
  const id=requireUuid(issuanceId,'M44_PDF_ISSUANCE_INVALID');
  return opening(await request(token,{action:'open',issuanceId:id}));
 }
 async function download(token,{issuanceId,sha256}={}){
  const id=requireUuid(issuanceId,'M44_PDF_ISSUANCE_INVALID');
  const expected=clean(sha256,64);
  if(!SHA.test(expected))throw Error('M44_PDF_EXPECTED_SHA256_REQUIRED');
  const jwt=clean(token,20000);
  if(!jwt)throw Error('M44_PDF_AUTH_REQUIRED');
  const controller=new AbortController();
  const timer=globalThis.setTimeout(()=>controller.abort(),60000);
  try{
   const response=await fetchImpl(settings.origin+DEST,{
    method:'POST',credentials:'omit',cache:'no-store',redirect:'error',
    referrerPolicy:'no-referrer',signal:controller.signal,
    headers:{authorization:'Bearer '+jwt,apikey:settings.publishableKey,
     'content-type':'application/json','x-client-info':'iberfit-m44-web/1'},
    body:JSON.stringify({action:'download',issuanceId:id}),
   });
   if(!response.ok){
    const body=await response.json().catch(()=>({}));
    const err=Error(clean(body.code||body.message,400)||'M44_PDF_DOWNLOAD_DENIED');
    err.status=response.status;
    throw err;
   }
   if(!String(response.headers?.get?.('content-type')||'').startsWith('application/pdf'))
    throw Error('M44_PDF_DOWNLOAD_MIME_INVALID');
   const buffer=await response.arrayBuffer();
   if(buffer.byteLength<1024||buffer.byteLength>20*1024*1024)
    throw Error('M44_PDF_DOWNLOAD_SIZE_INVALID');
   const api=globalThis.crypto?.subtle;
   if(!api)throw Error('M44_PDF_DOWNLOAD_CRYPTO_UNAVAILABLE');
   const hash=Array.from(new Uint8Array(await api.digest('SHA-256',buffer)))
    .map(v=>v.toString(16).padStart(2,'0')).join('');
   if(hash!==expected)throw Error('M44_PDF_DOWNLOAD_INTEGRITY_INVALID');
   return new Blob([buffer],{type:'application/pdf'});
  }catch(error){
   if(error?.name==='AbortError')throw Error('M44_PDF_REQUEST_TIMEOUT');
   throw error;
  }finally{globalThis.clearTimeout(timer);}
 }
 async function withdraw(token,{issuanceId,reason}={}){
  const id=requireUuid(issuanceId,'M44_PDF_ISSUANCE_INVALID');
  const why=clean(reason,500);
  if(why.length<3)throw Error('M44_PDF_WITHDRAW_REASON_REQUIRED');
  const response=await request(token,{action:'withdraw',issuanceId:id,reason:why});
  return Object.freeze({issuanceId:id,withdrawn:response.kind==='withdrawn'||response.kind==='already-withdrawn'});
 }
 return Object.freeze({issue,latest,history,open,download,withdraw});
}
