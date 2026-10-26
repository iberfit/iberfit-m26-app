// SIGNATURE U47 · date-scoped, server-snapshot-verified workout preparation.
// This is a private, opt-in contract bridge; NO UI mount or public RPC grant.
// A dated execution MUST NOT call the legacy canonical session dispatcher.
import {createExecution,startExecution} from './session-execution.js';
import {buildOccurrenceScopedCommand} from '../domain/occurrence-commands.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DATE=/^\d{4}-\d{2}-\d{2}$/u;
const fail=reason=>{throw new Error('U47_'+reason);};
function uuid(value){
  if(typeof value!=='string'||!UUID.test(value))fail('IDENTITY_INVALID');
  return value.toLowerCase();
}
function revision(value){
  if(!Number.isSafeInteger(value)||value<0)fail('REVISION_INVALID');
  return value;
}
function sameField(a,b){return String(a??'')===String(b??'');}
function validDate(value){
  if(typeof value!=='string'||!DATE.test(value))fail('DATE_INVALID');
  const [y,m,d]=value.split('-').map(Number),check=new Date(Date.UTC(y,m-1,d));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()+1!==m||check.getUTCDate()!==d)
    fail('DATE_INVALID');
  return value;
}
function verifyQueue(reference,prepared){
  if(!Array.isArray(reference)||reference.length<1||reference.length>500
    ||reference.length!==prepared.length)fail('QUEUE_DRIFT');
  const comparable=item=>({
    blockId:String(item?.blockId??''),
    exerciseId:String(item?.exerciseId??''),
    sets:item?.sets,
    groupType:item?.groupType??null,
    groupOrder:item?.groupOrder??null,
    groupSize:item?.groupSize??null,
  });
  for(let i=0;i<reference.length;i++){
    const server=comparable(reference[i]),local=comparable(prepared[i]);
    if(!server.blockId||!server.exerciseId||
      JSON.stringify(server)!==JSON.stringify(local))
      fail('QUEUE_DRIFT');
    if(!reference[i]?.prescription||typeof reference[i].prescription!=='object'
      ||Array.isArray(reference[i].prescription))
      fail('QUEUE_DRIFT');
  }
}
/**
 * The caller MUST supply the private U30 source snapshot fetched under actual
 * authenticated server authorization. U33 CALENDARIO intentionally does not
 * return this snapshot. No caller-provided exercise list is sent as authority.
 * Only a confirmed, not-yet-started occurrence may create a NEW local draft.
 */
export function createOccurrenceWorkoutDraft({
  occurrence,prescriptionSnapshot,executionId,
}={}){
  if(!occurrence||typeof occurrence!=='object'||Array.isArray(occurrence)
    ||!prescriptionSnapshot||typeof prescriptionSnapshot!=='object'
    ||Array.isArray(prescriptionSnapshot))fail('PRIVATE_SNAPSHOT_REQUIRED');
  const clientId=uuid(occurrence.clientId);
  const occurrenceId=uuid(occurrence.id);
  const sessionId=uuid(occurrence.sessionId);
  const id=uuid(executionId);
  const localDate=validDate(occurrence.localDate);
  const occurrenceRevision=revision(occurrence.revision);
  if(occurrence.status!=='confirmada'||occurrence.executionId!=null)
    fail('OCCURRENCE_NOT_STARTABLE');
  if(occurrence.timeZone!=='America/Santiago')
    fail('TIME_ZONE_MISMATCH');
  if(uuid(prescriptionSnapshot.clientId)!==clientId
    ||uuid(prescriptionSnapshot.sessionId)!==sessionId)
    fail('SNAPSHOT_OWNER_MISMATCH');
  if(!Array.isArray(prescriptionSnapshot.blocks)
    ||!Array.isArray(prescriptionSnapshot.queue))
    fail('PRIVATE_SNAPSHOT_REQUIRED');
  // Clone to avoid caller mutation of a plan while a workout is under way.
  const session={id:sessionId,clientId,
    blocks:structuredClone(prescriptionSnapshot.blocks)};
  const execution=createExecution({session,clientId,executionId:id});
  verifyQueue(prescriptionSnapshot.queue,execution.queue);
  return {
    kind:'iberfit.occurrence-workout-draft.v1',
    clientId,occurrenceId,sessionId,localDate,
    occurrenceRevision,executionRevision:null,
    phase:'ready',session,execution,
  };
}
function assertDraft(draft){
  if(draft?.kind!=='iberfit.occurrence-workout-draft.v1'
    ||!draft.execution||!draft.session
    ||uuid(draft.clientId)!==uuid(draft.execution.clientId)
    ||uuid(draft.sessionId)!==uuid(draft.execution.sessionId)
    ||uuid(draft.sessionId)!==uuid(draft.session.id)
    ||uuid(draft.clientId)!==uuid(draft.session.clientId))
    fail('DRAFT_IDENTITY_DRIFT');
  revision(draft.occurrenceRevision);
}
const writes=Object.freeze({
  start:'OCURRENCIA_INICIAR',
  progress:'OCURRENCIA_GUARDAR_PROGRESO',
  complete:'OCURRENCIA_COMPLETAR',
});
/**
 * Does not dispatch or persist data. U40/U42/U45 must durably journal any
 * returned command before transport. Distinct occurrence/execution CAS only.
 */
export function buildOccurrenceWorkoutCommand(draft,{action,operationId}={}){
  assertDraft(draft);
  const type=writes[action];
  if(!type)fail('ACTION_FORBIDDEN');
  const payload={
    type,operationId:uuid(operationId),
    clientId:draft.clientId,occurrenceId:uuid(draft.occurrenceId),
    baseRevision:draft.occurrenceRevision,
    executionId:uuid(draft.execution.id),
  };
  if(action==='start'){
    if(draft.phase!=='ready'||draft.execution.status!=='ready'
      ||draft.executionRevision!==null)fail('START_NOT_READY');
  }else{
    if(draft.phase!=='active'||!Number.isSafeInteger(draft.executionRevision)
      ||draft.executionRevision<1)fail('EXECUTION_NOT_ACKNOWLEDGED');
    payload.executionBaseRevision=draft.executionRevision;
    if(!draft.execution.results||typeof draft.execution.results!=='object'
      ||Array.isArray(draft.execution.results))fail('RESULTS_INVALID');
    payload.results=structuredClone(draft.execution.results);
    payload.skippedSets=structuredClone(draft.execution.skippedSets||{});
    if(action==='complete'){
      if(draft.execution.status!=='completed'||!draft.execution.feedback)
        fail('COMPLETION_NOT_READY');
      payload.feedback=structuredClone(draft.execution.feedback);
    }else if(!['active','awaiting_feedback'].includes(draft.execution.status)){
      fail('PROGRESS_NOT_READY');
    }
  }
  return buildOccurrenceScopedCommand(payload);
}
/**
 * Apply ONLY a U40-confirmed ACK for the exact date/execution/operation.
 * Never call this for a conflict, rejected command or uncertain network error.
 * A reloaded draft requires a fresh authenticated server snapshot, not an
 * optimistic reconstruction from a cached operation.
 */
export function applyOccurrenceWorkoutAck(draft,command,ack){
  assertDraft(draft);
  if(!ack||ack.kind!=='ack'||!command||
    uuid(command.clientId)!==draft.clientId
    ||uuid(command.entityId)!==draft.occurrenceId
    ||uuid(command.payload?.executionId)!==uuid(draft.execution.id)
    ||uuid(command.operationId)!==uuid(ack.operationId)
    ||uuid(ack.entityId)!==draft.occurrenceId
    ||uuid(ack.executionId)!==uuid(draft.execution.id))
    fail('ACK_IDENTITY_MISMATCH');
  const action=Object.keys(writes).find(k=>writes[k]===command.type);
  if(!action)fail('ACK_ACTION_INVALID');
  const status=action==='complete'?'completada':'en_curso';
  if(ack.status!==status||!Number.isSafeInteger(ack.remoteRevision)
    ||!Number.isSafeInteger(ack.executionRevision)
    ||ack.executionRevision<1||ack.remoteRevision<draft.occurrenceRevision)
    fail('ACK_REVISION_INVALID');
  if(action==='start'){
    if(draft.phase!=='ready'||draft.execution.status!=='ready'
      ||command.baseRevision!==draft.occurrenceRevision
      ||ack.remoteRevision<=draft.occurrenceRevision
      ||ack.executionRevision!==1)fail('ACK_START_INVALID');
    startExecution(draft.execution);
    draft.phase='active';
  }else{
    if(draft.phase!=='active'
      ||command.baseRevision!==draft.occurrenceRevision
      ||command.payload.executionBaseRevision!==draft.executionRevision
      ||ack.executionRevision<=draft.executionRevision
      ||(action==='progress'&&ack.remoteRevision!==draft.occurrenceRevision)
      ||(action==='complete'&&(draft.execution.status!=='completed'
        ||ack.remoteRevision<=draft.occurrenceRevision)))
      fail('ACK_CAS_INVALID');
    if(action==='complete')draft.phase='completed';
  }
  draft.occurrenceRevision=ack.remoteRevision;
  draft.executionRevision=ack.executionRevision;
  draft.execution.revision=ack.executionRevision;
  return draft;
}
