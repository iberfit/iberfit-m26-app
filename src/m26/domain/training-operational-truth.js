export const TRAINING_OPERATIONAL_TRUTH_VERSION='iberfit.training-operational-truth.v1';

export const TRAINING_OPERATIONAL_COLLECTIONS=Object.freeze({
  cycles:'trainingCycles',
  sessions:'sessions',
  executions:'sessionExecutions',
});

export const TRAINING_OPERATIONAL_DATABASE=Object.freeze({
  cycles:'training_cycles',
  sessions:'sessions',
  executions:'session_executions',
  eventJournal:'domain_events_v26',
  commandJournal:'command_events_v26',
  receipts:'command_receipts_v26',
  executionLocks:'active_execution_locks_v26',
  drafts:'m26_session_drafts_v431',
});

export const TRAINING_LEGACY_COMPATIBILITY=Object.freeze({
  plans:'m26_training_plans_v43',
  sessions:'m26_training_sessions_v43',
  sessionEvents:'session_events',
  writeRpc:'m26_save_training_session_v43',
});

function arr(value){
  return Array.isArray(value)?value:[];
}

function first(record,...keys){
  const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?record.body
    :null;
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
}

export function canonicalTrainingCollection(state,kind){
  const key=TRAINING_OPERATIONAL_COLLECTIONS[kind];
  if(!key)throw new Error('M26_TRAINING_COLLECTION_KIND_INVALID');
  return arr(state?.collections?.[key]);
}

export function canonicalTrainingRecordsForClient(state,kind,clientId){
  const expected=String(clientId||'').trim();
  if(!expected)return Object.freeze([]);
  return Object.freeze(
    canonicalTrainingCollection(state,kind)
      .filter((record)=>String(first(
        record,
        'clientId',
        'client_id',
        'clienteId',
        'cliente_id',
      )||'').trim()===expected),
  );
}

export function isLegacyTrainingPersistenceName(value){
  const name=String(value||'').trim();
  return Object.values(TRAINING_LEGACY_COMPATIBILITY).includes(name);
}
