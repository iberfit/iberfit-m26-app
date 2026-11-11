import {canonicalTrainingRecordsForClient} from './training-operational-truth.js';

const COMPLETE_STATUSES=new Set([
  'completed',
  'completado',
  'completada',
  'complete',
  'cerrada_confirmada',
]);

function arr(value){
  return Array.isArray(value)?value:[];
}

function first(record,...keys){
  for(const key of keys){
    const value=record?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
}

function unwrap(record){
  return record?.body&&
    typeof record.body==='object'&&
    !Array.isArray(record.body)
      ?{...record,...record.body}
      :record||{};
}

export function sessionExecutionId(record){
  const item=unwrap(record);
  return String(first(
    item,
    'id',
    'executionId',
    'execution_id',
  )||'').trim();
}

export function sessionExecutionClientId(record){
  const item=unwrap(record);
  return String(first(
    item,
    'clientId',
    'client_id',
    'clienteId',
    'cliente_id',
  )||'').trim();
}

export function sessionExecutionDate(record){
  const item=unwrap(record);
  return first(
    item,
    'completedAt',
    'completed_at',
    'remoteConfirmedAt',
    'remote_confirmed_at',
    'localClosedAt',
    'local_closed_at',
    'endedAt',
    'ended_at',
    'executedAt',
    'executed_at',
    'recordedAt',
    'recorded_at',
    'savedAt',
    'saved_at',
    'createdAt',
    'created_at',
  );
}

export function unconfirmedSessionExecutionIds(state){
  const ids=new Set();

  for(const key of [
    'pendingOperations',
    'conflicts',
    'rejectedOperations',
  ]){
    for(const operation of arr(state?.[key])){
      const item=unwrap(operation);
      const type=String(first(
        item,
        'type',
        'commandType',
        'command_type',
      )||'')
        .trim()
        .toUpperCase();

      if(type!=='EJECUCION_COMPLETAR')continue;

      const id=first(
        item,
        'entityId',
        'entity_id',
        'executionId',
        'execution_id',
      );

      if(id!==null&&id!==undefined&&String(id).trim()){
        ids.add(String(id).trim());
      }
    }
  }

  return ids;
}


/**
 * Un único identificador/revisión no puede acreditar dos resultados distintos.
 * Reconcilia antes de que Progreso, Coach o recomendaciones consuman series,
 * feedback o volúmenes. Las revisiones superiores sustituyen a las anteriores;
 * una contradicción a la revisión máxima se aísla, sin depender del orden.
 */
function executionRevision(record){
  const raw=first(unwrap(record),'revision','remoteRevision','remote_revision');
  const number=Number(raw);
  return (typeof raw==='number'||typeof raw==='string')&&Number.isSafeInteger(number)
    &&number>=0?number:0;
}
function stableEvidenceJson(value){
  if(Array.isArray(value))return '['+value.map(stableEvidenceJson).join(',')+']';
  if(value&&typeof value==='object'){
    return '{'+Object.keys(value).sort((left,right)=>left.localeCompare(right)).map(key=>
      JSON.stringify(key)+':'+stableEvidenceJson(value[key])).join(',')+'}';
  }
  return JSON.stringify(value??null);
}
export function sessionExecutionEvidenceSignature(record){
  const row=unwrap(record);
  const evidence={
    owner:sessionExecutionClientId(row),id:sessionExecutionId(row),
    appointment:first(row,'appointmentId','appointment_id'),
    session:first(row,'sessionId','session_id'),
    occurrence:first(row,'occurrenceId','occurrence_id'),
    status:first(row,'status','estado'),
    executionStatus:first(row,'executionStatus','execution_status'),
    syncStatus:first(row,'syncStatus','sync_status')||'clean',
    serverConfirmed:first(row,'serverConfirmed','server_confirmed'),
    remoteConfirmedAt:first(row,'remoteConfirmedAt','remote_confirmed_at'),
    completedAt:first(row,'completedAt','completed_at','endedAt','ended_at'),
    // All date fallbacks can affect report windows, so they cannot depend on
    // which same-revision response arrived first.
    effectiveDate:sessionExecutionDate(row),
    results:first(row,'results','setResults','set_results','progressSnapshot','progress_snapshot'),
    feedback:first(row,'feedback'),
    metrics:first(row,'metrics'),
    planSnapshot:first(row,'planSnapshot','plan_snapshot'),
  };
  return stableEvidenceJson(evidence);
}
export function reconcileSessionExecutionsForClient(state,clientId){
  const expected=String(clientId||'').trim();
  if(!expected)return Object.freeze({
    records:Object.freeze([]),conflicts:Object.freeze([]),withoutIdentity:0,
  });
  const selected=new Map();
  let withoutIdentity=0;
  for(const record of canonicalTrainingRecordsForClient(state,'executions',expected)){
    if(sessionExecutionClientId(record)!==expected)continue;
    const id=sessionExecutionId(record);
    if(!id){withoutIdentity++;continue;}
    const revision=executionRevision(record);
    const previous=selected.get(id);
    if(previous&&revision<previous.revision)continue;
    if(!previous||revision>previous.revision){
      selected.set(id,{record,revision,signature:null,conflict:false,records:[record]});
      continue;
    }
    const signature=sessionExecutionEvidenceSignature(record);
    const previousSignature=previous.signature??sessionExecutionEvidenceSignature(previous.record);
    previous.signature=previousSignature;
    if(signature!==previousSignature||previous.conflict){
      previous.conflict=true;
      previous.records.push(record);
    }
  }
  // Stable ID order also makes same-revision presentation deterministic.
  const values=[...selected].sort(([a],[b])=>a.localeCompare(b))
    .map(([,value])=>value);
  return Object.freeze({
    records:Object.freeze(values.filter(value=>!value.conflict).map(value=>value.record)),
    conflicts:Object.freeze(values.filter(value=>value.conflict)
      .map(value=>Object.freeze([...value.records]))),
    withoutIdentity,
  });
}

export function sessionExecutionIsConfirmed(
  record,
  blockedIds=new Set(),
){
  const item=unwrap(record);
  const sync=String(first(
    item,
    'syncStatus',
    'sync_status',
  )||'')
    .trim()
    .toLowerCase();

  const id=sessionExecutionId(item);
  const denied=first(item,'serverConfirmed','server_confirmed')===false;
  // A typed SQL "cerrada_confirmada" row has authority only with a
  // persisted remote ACK. Do not turn a local optimistic mirror into proof.
  const typed=String(first(item,'executionStatus','execution_status')||'')
    .trim().toLowerCase();
  const legacy=String(first(item,'status','estado')||'')
    .trim().toLowerCase();
  const contradictory=Boolean(typed&&legacy&&
    COMPLETE_STATUSES.has(typed)!==COMPLETE_STATUSES.has(legacy));
  const receipt=first(item,'remoteConfirmedAt','remote_confirmed_at');
  const needsReceipt=typed==='cerrada_confirmada';
  const validReceipt=typeof receipt==='string'&&receipt.trim().length>0
    &&Number.isFinite(Date.parse(receipt));
  return (
    (!sync||sync==='clean')&&
    (!id||!blockedIds.has(id))&&!denied&&!contradictory&&
    (!needsReceipt||validReceipt)
  );
}

export function sessionExecutionIsCompleted(
  record,
  {allowDatedFallback=true}={},
){
  const item=unwrap(record);
  const status=String(first(
    item,
    'status',
    'estado',
    'executionStatus',
    'execution_status',
  )||'')
    .trim()
    .toLowerCase();

  if(COMPLETE_STATUSES.has(status))return true;

  return Boolean(
    allowDatedFallback&&
    !status&&
    sessionExecutionDate(item)
  );
}

export function confirmedSessionExecutionsForClient(
  state,
  clientId,
  {
    requireCompleted=true,
    requireDate=false,
  }={},
){
  const expected=String(clientId||'').trim();
  if(!expected)return Object.freeze([]);

  const blocked=unconfirmedSessionExecutionIds(state);

  return Object.freeze(
    reconcileSessionExecutionsForClient(state,expected).records
      .filter(
        (record)=>
          sessionExecutionIsConfirmed(record,blocked),
      )
      .filter(
        (record)=>
          !requireCompleted||
          sessionExecutionIsCompleted(record),
      )
      .filter(
        (record)=>
          !requireDate||
          Boolean(sessionExecutionDate(record)),
      ),
  );
}

export const __sessionExecutionTruthTestables=Object.freeze({
  COMPLETE_STATUSES,
  unwrap,
  first,
});
