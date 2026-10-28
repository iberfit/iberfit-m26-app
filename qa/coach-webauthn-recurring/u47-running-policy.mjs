/**
 * SIGNATURE U47 — one-shot real running workout on synthetic QA Client A only.
 * This file is a network permission boundary, NOT a mock/command generator.
 * The server still authorizes every request against role, RLS, service, status,
 * revision, execution lock and ownership. PROD and ordinary CI remain read-only.
 */
const QA_ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const TITLE=/^QA U47 · Running [0-9]{1,20}-1$/u;
const LIMITS=new Map([
  ['SESION_PUBLICAR',1],['SESION_INICIAR',1],
  ['EJECUCION_GUARDAR_PROGRESO',3],['EJECUCION_COMPLETAR',1],
]);
const isUuid=v=>UUID.test(String(v||''));

export function newU47Scope({stage,clientId,title}={}){
  if(!['publish','execute'].includes(stage)||!isUuid(clientId)||!TITLE.test(String(title||'')))
    throw new Error('U47_SCOPE_UNVERIFIED');
  return {enabled:false,stage,clientId,title,sessionId:null,executionId:null,
    serverPublicationConfirmed:false,historyClean:false,setConfirmed:false,finished:false,
    draftId:null,draftWrites:0,uniqueByOperation:new Map(),typeCounts:new Map()};
}

export function u47WriteAuthorized(request,scope){
  if(process.env.M26_QA_U47_RUNNING!=='true'||!scope?.enabled||
     !['publish','execute'].includes(scope.stage)||!isUuid(scope.clientId)||
     !TITLE.test(scope.title)||request?.method?.().toUpperCase()!=='POST')
    return false;
  let url,body,headers;
  try{url=new URL(request.url());body=request.postDataJSON();headers=request.headers();}catch{return false;}
  const bearer=String(headers.authorization||headers.Authorization||'');
  if(url.origin!==QA_ORIGIN||url.search||url.hash||
     !/^Bearer [A-Za-z0-9_.~-]+$/u.test(bearer)||
     /service[_-]?role|supabase_secret/iu.test(bearer))return false;
  const rpc=url.pathname.replace('/rest/v1/rpc/','');
  if(scope.stage==='publish'&&rpc==='m26_draft_upsert_v431'){
    const p=body?.p_payload,record=p?.draft;
    if(p?.clientId!==scope.clientId||p?.scope!=='session-builder'||
       record?.clientId!==scope.clientId||record?.title!==scope.title||
       !isUuid(record?.id)||scope.draftWrites>=2||
       (scope.draftId&&scope.draftId!==record.id))return false;
    scope.draftId=record.id;
    scope.draftWrites++;
    return true;
  }
  if(scope.stage==='publish'&&rpc==='m26_draft_delete_v431'){
    // No blanket deletion of this synthetic user's other drafts.
    if(!scope.draftId||!scope.serverPublicationConfirmed||
       scope.draftId!==scope.sessionId||body?.p_client_id!==scope.clientId||
       body?.p_scope!=='session-builder')return false;
    return true;
  }
  if(!['iberfit_command_preflight_v26','iberfit_execute_command_v26'].includes(rpc))
    return false;
  const cmd=body?.p_command,type=String(cmd?.type||''),isExecute=rpc==='iberfit_execute_command_v26';
  if(!LIMITS.has(type)||cmd?.clientId!==scope.clientId||!isUuid(cmd?.operationId)||
     !Number.isSafeInteger(Number(cmd?.baseRevision))||Number(cmd.baseRevision)<0)
    return false;
  if(scope.stage==='publish'){
    if(type!=='SESION_PUBLICAR'||cmd.entityType!=='session'||!isUuid(cmd.entityId)||
       (scope.sessionId&&scope.sessionId!==cmd.entityId)||
       cmd.previewAccepted!==true||Number(cmd.baseRevision)!==0)return false;
    const p=cmd.payload?.patch,b=p?.blocks?.[0];
    if(p?.id!==cmd.entityId||p?.clientId!==scope.clientId||p?.title!==scope.title||
       p.visibleToClient!==true||p.deliveryModality!=='guiada_en_app'||
       p.deliveryOwnership!=='guided_in_app'||p.clientVisibilityLevel!=='full'||
       !Array.isArray(p.blocks)||p.blocks.length!==1||
       !isUuid(b?.id)||!String(b?.exerciseId||'').trim()||
       Number(b.sets)!==1||Number(b.plannedDistanceKm)!==6.5||
       Number(b.plannedDurationMinutes)!==35.75||String(b.plannedPace)!=='05:30')
      return false;
  }else{
    if(!scope.serverPublicationConfirmed||!scope.historyClean||!isUuid(scope.sessionId)||
       (scope.finished&&!scope.uniqueByOperation.has(cmd.operationId)))return false;
    if(type==='SESION_PUBLICAR')return false;
    if(type==='SESION_INICIAR'){
      if(cmd.entityType!=='session'||cmd.entityId!==scope.sessionId||
         !isUuid(cmd.payload?.executionId)||
         Object.hasOwn(cmd.payload,'appointmentId')||
         (scope.executionId&&scope.executionId!==cmd.payload.executionId))
        return false;
    }else{
      if(cmd.entityType!=='session_execution'||!isUuid(scope.executionId)||
         cmd.entityId!==scope.executionId)return false;
      const snap=type==='EJECUCION_GUARDAR_PROGRESO'
        ?cmd.payload?.progressSnapshot:cmd.payload?.patch;
      if(snap?.sessionId!==scope.sessionId||snap?.clientId!==scope.clientId)
        return false;
      if(type==='EJECUCION_COMPLETAR'&&
         (!scope.setConfirmed||snap.status!=='completed'||Number(snap.feedback?.sessionRpe)!==7))
        return false;
    }
  }
  const fingerprint=JSON.stringify(cmd),past=scope.uniqueByOperation.get(cmd.operationId);
  if(past){
    if(past.type!==type||past.fingerprint!==fingerprint||
       (isExecute?past.executeCount:past.preflightCount)>=2)return false;
    if(isExecute)past.executeCount++;
    else past.preflightCount++;
    return true;
  }
  const count=scope.typeCounts.get(type)||0;
  if(count>=LIMITS.get(type))return false;
  scope.typeCounts.set(type,count+1);
  scope.uniqueByOperation.set(cmd.operationId,{
    type,fingerprint,executeCount:isExecute?1:0,preflightCount:isExecute?0:1,
  });
  if(type==='SESION_PUBLICAR')scope.sessionId=cmd.entityId;
  if(type==='SESION_INICIAR')scope.executionId=cmd.payload.executionId;
  if(type==='EJECUCION_COMPLETAR')scope.finished=true;
  return true;
}
