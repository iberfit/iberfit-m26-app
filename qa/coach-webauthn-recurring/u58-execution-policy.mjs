/**
 * SIGNATURE U58 — permission boundary for a one-time Client QA browser test.
 *
 * Pure policy only. It never dispatches writes. The browser harness must
 * independently authenticate Client A, confirm the exact pre-existing U56
 * session and certify that no execution exists before enabling this gate.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const QA_ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const TITLE='QA U56 · Coach UI 39887295351-1';
const WRITES=new Map([
  ['SESION_INICIAR',1],
  ['EJECUCION_PAUSAR',2],
  ['EJECUCION_REANUDAR',2],
  ['EJECUCION_GUARDAR_PROGRESO',16],
  ['EJECUCION_COMPLETAR',1],
]);

function safeUuid(value){return UUID.test(String(value||''));}
export function createU58ExecutionScope({
  clientId,sessionId,sessionTitle,confirmedNoPriorExecution,
}={}){
  if(!safeUuid(clientId)||!safeUuid(sessionId)||sessionTitle!==TITLE||
    confirmedNoPriorExecution!==true)
    throw new Error('U58_FIXTURE_UNVERIFIED');
  return {
    enabled:false,clientId,sessionId,sessionTitle,
    confirmedNoPriorExecution:true,executionId:null,
    reviewedFourSets:false,finished:false,
    uniqueByOperation:new Map(),typeCounts:new Map(),
  };
}

/** True is permission to send one exactly-scoped browser request, never ACK. */
export function permittedU58ExecutionWrite(request,scope){
  if(process.env.M26_QA_U58_EXECUTE!=='true'||!scope?.enabled||
    scope.confirmedNoPriorExecution!==true||scope.sessionTitle!==TITLE||
    !safeUuid(scope.clientId)||!safeUuid(scope.sessionId)||
    request?.method?.().toUpperCase()!=='POST')return false;
  let url,payload,headers;
  try{
    url=new URL(request.url());
    payload=request.postDataJSON();
    headers=request.headers();
  }catch{return false;}
  if(url.origin!==QA_ORIGIN||url.hash||url.search||
    !['/rest/v1/rpc/iberfit_command_preflight_v26',
      '/rest/v1/rpc/iberfit_execute_command_v26'].includes(url.pathname))return false;
  const bearer=String(headers.authorization||headers.Authorization||'');
  if(!/^Bearer [A-Za-z0-9_.~-]+$/u.test(bearer)||
    /service[_-]?role|supabase_secret/iu.test(bearer))return false;

  const cmd=payload?.p_command,type=String(cmd?.type||'');
  if(!WRITES.has(type)||cmd?.clientId!==scope.clientId||
    !safeUuid(cmd.operationId)||!Number.isSafeInteger(Number(cmd.baseRevision))||
    Number(cmd.baseRevision)<0)return false;
  let executionId=scope.executionId;
  if(type==='SESION_INICIAR'){
    if(scope.finished||cmd.entityType!=='session'||cmd.entityId!==scope.sessionId||
      !safeUuid(cmd.payload?.executionId))return false;
    const requested=cmd.payload.executionId;
    if(executionId&&executionId!==requested)return false;
    executionId=requested;
  }else{
    if(!safeUuid(executionId)||cmd.entityType!=='session_execution'||
      cmd.entityId!==executionId||scope.finished)return false;
    if(type==='EJECUCION_COMPLETAR'&&scope.reviewedFourSets!==true)return false;
  }
  const isExecute=url.pathname.endsWith('/iberfit_execute_command_v26');
  const fingerprint=JSON.stringify(cmd);
  const previous=scope.uniqueByOperation.get(cmd.operationId);
  if(previous){
    // Safe idempotent request retry: same operation, type, body and entity.
    if(previous.fingerprint!==fingerprint||previous.type!==type||
      (isExecute?previous.executeCount:previous.preflightCount)>=2)return false;
    if(isExecute)previous.executeCount+=1;
    else previous.preflightCount+=1;
    return true;
  }
  // Never allow a different start or completion operation, including after
  // a timeout with uncertain remote outcome.
  const existing=scope.typeCounts.get(type)||0;
  if(existing>=WRITES.get(type))return false;
  scope.executionId=executionId;
  scope.typeCounts.set(type,existing+1);
  scope.uniqueByOperation.set(cmd.operationId,{
    type,fingerprint,executeCount:isExecute?1:0,preflightCount:isExecute?0:1,
  });
  if(type==='EJECUCION_COMPLETAR')scope.finished=true;
  return true;
}

export const U58_EXISTING_QA_SESSION_TITLE=TITLE;
