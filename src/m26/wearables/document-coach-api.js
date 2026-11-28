// Explicit requests and transitions bound to the confirmed report/session.
// No local grant or automatic replay; the server rechecks current consent.
export function createDocumentCoachApi({transport,getScope,getToken,ensureAssurance,createOperationId=()=>globalThis.crypto.randomUUID()}={}){
 const available=()=>transport?.connected360DocumentCandidateAvailable?.()===true;
 let accepted=null;
 function fence(signal){
  const scope=getScope?.();
  const check=()=>{
   const current=getScope?.();
   if(!available()||signal?.aborted||!scope?.lease||!scope.actorId||!scope.clientId||!scope.reportId
   ||!Number.isSafeInteger(scope.reportRevision)||scope.reportRevision<1||scope.role!=='coach'
   ||!['lease','actorId','clientId','reportId','reportRevision','role','status','requestId'].every(k=>current?.[k]===scope[k]))throw Error('GX_DOCUMENT_COACH_SCOPE_CHANGED');
  };
  check();return {scope,check};
 }
 return Object.freeze({available,request:async({provider,confirmed=false,signal}={})=>{
  if(confirmed!==true||!['apple_health','health_connect'].includes(provider))throw Error('GX_DOCUMENT_REQUEST_NOT_CONFIRMED');
  const {scope,check}=fence(signal);if(scope.status==='aprobado')throw Error('GX_DOCUMENT_REQUEST_NOT_CONFIRMED');
  accepted=null;const token=await getToken();check();await ensureAssurance(token,scope.actorId);check();
  const result=await transport.connected360DocumentCandidateRequest(token,{reportId:scope.reportId,clientId:scope.clientId,reportRevision:scope.reportRevision,provider},{signal});check();
  if(result.decision==='accepted')accepted={scope,requestId:result.requestId};return result;
 },transition:async({action,confirmed=false,signal}={})=>{
  const {scope,check}=fence(signal);
  const requestId=action==='approve'&&scope.status!=='aprobado'&&accepted&&['lease','actorId','clientId','reportId','reportRevision'].every(k=>accepted.scope[k]===scope[k])?accepted.requestId:action==='publish'&&scope.status==='aprobado'?scope.requestId:null;
  if(confirmed!==true||!requestId)throw Error('GX_DOCUMENT_TRANSITION_NOT_CONFIRMED');
  const operationId=createOperationId();const token=await getToken();check();await ensureAssurance(token,scope.actorId);check();
  // Clear historical acceptance before the write. Even on ambiguous failure,
  // the next explicit action must first reload the report or request receipt.
  accepted=null;
  const result=await transport.connected360DocumentCandidateTransition(token,{reportId:scope.reportId,requestId,operationId,reportRevision:scope.reportRevision,action,previewConfirmed:action==='publish'},{signal});check();return result;
 }});
}
