// IBERFIT U60 · fail-closed, opt-in, identity-verified private dated read.
// Never substitute the U33 calendar: it intentionally omits prescriptions.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DATE=/^\d{4}-\d{2}-\d{2}$/u;
const ROLE=new Set(['client','cliente','coach']);
const OCCURRENCE_KEYS=new Set(['id','clientId','sessionId','appointmentId','localDate','localTime','timeZone','startsAt','endsAt','durationMinutes','status','revision','executionId']);
const SNAPSHOT_KEYS=new Set(['clientId','sessionId','cycleId','title','queue','blocks']);
const EXECUTION_KEYS=new Set(['id','clientId','sessionId','occurrenceId','status','revision','startedAt','completedAt','sourceSnapshot','queue','results','skippedSets','events','feedback']);
const TOP_KEYS=new Set(['kind','occurrence','prescriptionSnapshot','executionBody']);
const fail=reason=>{throw new Error('U60_PRIVATE_'+reason);};
const uuid=value=>{
  const id=String(value||'').trim().toLowerCase();
  if(!UUID.test(id))fail('IDENTITY_INVALID');
  return id;
};
const obj=value=>value&&typeof value==='object'&&!Array.isArray(value);
const only=(value,keys)=>Object.keys(value).every(k=>keys.has(k));
const actorFrom=value=>{
  if(!obj(value)||!ROLE.has(String(value.role||'').toLowerCase())
    ||typeof value.accessToken!=='string'||!value.accessToken)
    fail('AUTH_REQUIRED');
  const actor={userId:uuid(value.userId),role:String(value.role).toLowerCase(),
    clientId:value.clientId?uuid(value.clientId):null,accessToken:value.accessToken};
  if(actor.role!=='coach'&&!actor.clientId)fail('CLIENT_SCOPE_MISSING');
  return actor;
};
const sameActor=(before,after)=>
  before.userId===after.userId&&before.role===after.role&&
  before.clientId===after.clientId;
function verifyResponse(raw,clientId,occurrenceId){
  if(!obj(raw)||!only(raw,TOP_KEYS)||raw.kind!=='private-occurrence'
    ||!obj(raw.occurrence)||!only(raw.occurrence,OCCURRENCE_KEYS)
    ||!obj(raw.prescriptionSnapshot)
    ||!only(raw.prescriptionSnapshot,SNAPSHOT_KEYS))
    fail('RESPONSE_INVALID');
  const o=raw.occurrence,p=raw.prescriptionSnapshot;
  if(uuid(o.id)!==occurrenceId||uuid(o.clientId)!==clientId
    ||uuid(p.clientId)!==clientId||uuid(p.sessionId)!==uuid(o.sessionId)
    ||o.timeZone!=='America/Santiago'||!DATE.test(o.localDate)
    ||!Number.isFinite(Date.parse(o.localDate+'T12:00:00Z'))
    ||new Date(o.localDate+'T12:00:00Z').toISOString().slice(0,10)!==o.localDate
    ||!Number.isSafeInteger(o.revision)||o.revision<0
    ||!['planificada','confirmada','en_curso','completada','cancelada'].includes(o.status)
    ||!Array.isArray(p.queue)||!p.queue.length||!Array.isArray(p.blocks)||!p.blocks.length)
    fail('SCOPE_OR_SOURCE_DRIFT');
  if(o.executionId==null){
    if(raw.executionBody!=null||['en_curso','completada'].includes(o.status))
      fail('EXECUTION_DRIFT');
  }else{
    const b=raw.executionBody;
    if(!obj(b)||!only(b,EXECUTION_KEYS)||!obj(b.sourceSnapshot)
      ||!only(b.sourceSnapshot,SNAPSHOT_KEYS)
      ||JSON.stringify(b.queue)!==JSON.stringify(p.queue)
      ||uuid(b.id)!==uuid(o.executionId)
      ||uuid(b.clientId)!==clientId||uuid(b.sessionId)!==uuid(o.sessionId)
      ||uuid(b.occurrenceId)!==occurrenceId
      ||!['en_curso','completada'].includes(o.status)
      ||b.status!==o.status||!Number.isSafeInteger(b.revision)||b.revision<1
      ||!obj(b.sourceSnapshot)
      ||JSON.stringify(b.sourceSnapshot.queue)!==JSON.stringify(p.queue)
      ||JSON.stringify(b.sourceSnapshot.blocks)!==JSON.stringify(p.blocks))
      fail('EXECUTION_DRIFT');
  }
  return Object.freeze({
    occurrence:structuredClone(o),prescriptionSnapshot:structuredClone(p),
    executionBody:raw.executionBody==null?null:structuredClone(raw.executionBody),
  });
}
export function createOccurrencePrivateReader({
  enabled=false,transport,getAuthContext,
}={}){
  if(enabled!==true){
    return Object.freeze({
      enabled:false,read:async()=>fail('NOT_ENABLED'),
    });
  }
  if(typeof transport?.occurrencePrivateRead!=='function'
    ||typeof getAuthContext!=='function')
    fail('DEPENDENCIES_REQUIRED');
  async function read({clientId,occurrenceId}={}){
    const owner=uuid(clientId),id=uuid(occurrenceId);
    const before=actorFrom(await getAuthContext());
    if(before.role!=='coach'&&before.clientId!==owner)
      fail('CLIENT_SCOPE_FORBIDDEN');
    const result=await transport.occurrencePrivateRead(before.accessToken,{
      clientId:owner,occurrenceId:id,
    });
    const after=actorFrom(await getAuthContext());
    if(!sameActor(before,after))fail('AUTH_CONTEXT_CHANGED');
    const verified=verifyResponse(result,owner,id);
    if(before.role!=='coach'&&verified.occurrence.status==='planificada')
      fail('CLIENT_UNPUBLISHED_FORBIDDEN');
    return verified;
  }
  return Object.freeze({enabled:true,read});
}
