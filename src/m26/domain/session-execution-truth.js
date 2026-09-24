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

  return (
    (!sync||sync==='clean')&&
    (!id||!blockedIds.has(id))
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
    arr(state?.collections?.sessionExecutions)
      .filter(
        (record)=>
          sessionExecutionClientId(record)===expected,
      )
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
