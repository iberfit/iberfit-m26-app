import {canonicalTrainingRecordsForClient} from './training-operational-truth.js';
import {stableEvidenceJson,observedSet,evidenceNumber} from './evidence-signal.js';

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

// Strict reporting chronology: never substitute creation, schedule or save timestamps.
export function sessionExecutionCompletionDate(record){
  const item=unwrap(record);
  const summary=item?.summary&&typeof item.summary==='object'?item.summary:{};
  return first(item,'completedAt','completed_at')
    ||first(summary,'completedAt','completed_at')
    ||first(item,'localClosedAt','local_closed_at','endedAt','ended_at','executedAt','executed_at');
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
// Resolve the immutable prescription recorded at execution time, not today's plan.
// A supplied but invalid snapshot is different from an absent legacy snapshot.
export function readOriginalExecutionPrescription(record){
 const invalid=()=>Object.freeze({kind:'invalid',snapshot:null});
 const absent=()=>Object.freeze({kind:'absent',snapshot:null});
 const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const values=(r,keys)=>[r,r?.body].filter(obj).flatMap(x=>keys.map(k=>x[k])).filter(v=>v!==undefined&&v!==null&&v!=='');
 const exact=vs=>{
   if(!vs.length)return null;
   const firstValue=vs[0];let signature;
   return vs.every(v=>v===firstValue||(signature??=stableEvidenceJson(firstValue))===stableEvidenceJson(v))?firstValue:null;
 };
 const safe=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(v)?v:null;
 const owners=values(record,['clientId','client_id','clienteId','cliente_id']);
 const sessions=values(record,['sessionId','session_id']);
 const plans=values(record,['planSnapshot','plan_snapshot']);
 const sources=values(record,['sourceSnapshot','source_snapshot']);
 const revisions=values(record,['sourceRevision','source_revision']);
 if(!plans.length&&!sources.length)return revisions.length?invalid():absent();
 const session=safe(exact(sessions)),owner=safe(exact(owners));
 if(!session||(owners.length&&!owner))return invalid();
 const all=[...plans,...sources],snapshot=exact(all);
 if(!obj(snapshot)||safe(exact(values(snapshot,['sessionId','session_id'])))!==session||!Array.isArray(snapshot.blocks)||!snapshot.blocks.length||snapshot.blocks.some(b=>!obj(b)))return invalid();
 const snapshotOwners=values(snapshot,['clientId','client_id','clienteId','cliente_id']);
 if(snapshotOwners.length&&(!owner||safe(exact(snapshotOwners))!==owner))return invalid();
 const cycle=values(snapshot,['cycleId','cycle_id','trainingCycleId','training_cycle_id']);
 const declaredCycle=values(record,['cycleId','cycle_id','trainingCycleId','training_cycle_id']);
 if(cycle.length&&(!safe(exact(cycle))||declaredCycle.some(v=>v!==cycle[0])))return invalid();
 if(sources.length){
   const occurrence=safe(exact(values(record,['occurrenceId','occurrence_id'])));
   const revision=exact(revisions);
   if(!owner||!snapshotOwners.length||!occurrence||!Number.isSafeInteger(revision)||revision<0||!Array.isArray(snapshot.queue)||!snapshot.queue.length||snapshot.queue.some(q=>!obj(q)))return invalid();
   // Match U32's bounded queue identity, order, rounds and set counts. Do
   // not use the live queue (which can contain later substitutions) as proof.
   if(snapshot.blocks.length>300||snapshot.queue.length>500)return invalid();
   const expected=[],blockIds=new Set();
   for(const b of snapshot.blocks){
     const blockId=safe(b.id);if(!blockId||blockIds.has(blockId))return invalid();blockIds.add(blockId);
     const individual=b.type==='exercise';
     if(!individual&&!['biserie','triserie','circuito','amrap','tabata'].includes(b.type))return invalid();
     const ids=individual?[b.exerciseId]:b.exerciseIds;
     const raw=individual?(b.sets??1):(b.rounds??1);
     if((typeof raw!=='number'&&typeof raw!=='string')||!/^\d{1,3}$/u.test(String(raw)))return invalid();
     const sets=Number(raw);
     if(!Number.isInteger(sets)||sets<1||sets>100||!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(v=>!safe(v))||new Set(ids).size!==ids.length)return invalid();
     for(const [order,exerciseId] of ids.entries())expected.push({blockId,exerciseId,sets,groupType:individual?null:b.type,groupOrder:individual?null:order,groupSize:individual?null:ids.length});
     if(expected.length>500)return invalid();
   }
   if(expected.length!==snapshot.queue.length)return invalid();
   for(let i=0;i<expected.length;i++){
     const q=snapshot.queue[i],x=expected[i];
     if(!obj(q.prescription)||Object.keys(x).some(k=>(q[k]??null)!==x[k]))return invalid();
   }
   const embeddedRevision=values(snapshot,['sessionRevision','session_revision','sourceRevision','source_revision']);
   if(embeddedRevision.some(v=>v!==revision))return invalid();
 }else if(revisions.length)return invalid();
 return Object.freeze({kind:sources.length?'dated':'legacy',snapshot});
}
// Match observed coordinates to the immutable prescription. Never infer a
// substitution or completion from equal counts, a live queue or a mutable plan.
export function originalSeriesCoverage(record,snapshot){
 const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const rows=v=>Array.isArray(v)?v.map(x=>[null,x]):obj(v)?Object.entries(v):[];
 const val=(r,keys)=>keys.map(k=>r?.[k]).filter(v=>v!=null&&v!=='');
 const exact=(xs)=>xs.length&&xs.every(v=>v===xs[0])?xs[0]:null;
 const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(v)?v:null;
 const count=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=1&&v<=100?v:typeof v==='string'&&/^[1-9]\d{0,2}$/u.test(v)&&Number(v)<=100?Number(v):null;
 const shape=snapshot?.blocks;if(!Array.isArray(shape)||!shape.length||shape.length>300)return null;
 const expected=new Map(),byExercise=new Map(),byStorage=new Map(),byLegacyStorage=new Map(),blockIds=new Set();let blockIndex=0;
 for(const b of shape){
  if(!obj(b))return null;
  const ids=val(b,['id','blockId','block_id']);const blockId=id(exact(ids));
  if(ids.length&&!blockId||blockId&&blockIds.has(blockId))return null;if(blockId)blockIds.add(blockId);
  const direct=val(b,['exerciseId','exercise_id']),individual=b.type==='exercise'||(!b.type&&direct.length);
  const exercises=individual?[exact(direct)]:b.exerciseIds;
  const sets=count((individual?b.sets:b.rounds)??1);
  if(!sets||!Array.isArray(exercises)||!exercises.length||exercises.length>50||exercises.some(v=>!id(v))||new Set(exercises).size!==exercises.length)return null;
  for(const exerciseId of exercises){for(let setNumber=1;setNumber<=sets;setNumber++){
   const key=JSON.stringify([blockIndex,exerciseId,setNumber]);const legacy=JSON.stringify([exerciseId,setNumber]);
   const point={key,blockId,exerciseId,setNumber};expected.set(key,point);
   if(!byExercise.has(legacy))byExercise.set(legacy,[]);byExercise.get(legacy).push(point);
   const oldKey=exerciseId+':'+setNumber;if(!byLegacyStorage.has(oldKey))byLegacyStorage.set(oldKey,[]);byLegacyStorage.get(oldKey).push(point);
   if(blockId){const storage=blockId+':'+exerciseId+':'+setNumber;if(!byStorage.has(storage))byStorage.set(storage,[]);byStorage.get(storage).push(point);}
   if(expected.size>50000)return null;
  }}blockIndex++;
 }
 // If wrapper/body aliases conflict, no coordinates from that collection
 // are eligible. Legacy arrays and scoped storage objects share one reader.
 const aliases=(keys)=>[record,record?.body].filter(obj).flatMap(r=>val(r,keys));
 const store=keys=>{const values=aliases(keys);if(!values.length)return {entries:[],conflict:false};const sig=stableEvidenceJson(values[0]);return values.every(v=>(obj(v)||Array.isArray(v))&&stableEvidenceJson(v)===sig)?{entries:rows(values[0]),conflict:false}:{entries:[],conflict:true};};
 const result=store(['results','setResults','set_results']),skips=store(['skippedSets','skipped_sets']);
 if(result.conflict||skips.conflict)return Object.freeze({plannedSets:expected.size,matchedRecordedSets:0,matchedSkippedSets:0,unlinkedRecordedSets:0,unlinkedSkippedSets:0,unresolvedPlannedSets:expected.size,excludedRows:result.entries.length+skips.entries.length,conflictingCoordinates:0,completeEvidence:false,collectionConflict:true});
 const measured=(r,keys,min,max,integer=false)=>{const v=val(r,keys).map(x=>evidenceNumber(typeof x==='string'?x.replace(',','.'):x,{min,max,integer}));return v.length>0&&v.every(x=>x!==null&&x===v[0]);};
 const hasWork=r=>measured(r,['reps','actualReps','actual_reps','repeticiones'],0,10000)||measured(r,['seconds','durationSeconds','duration_seconds'],0,86400)||measured(r,['durationMinutes','duration_minutes'],0,1440)||measured(r,['distanceKm','distance_km'],0.000001,1000)||measured(r,['distanceM','distance_m','distanceMeters'],0.000001,100000)||measured(r,['intervalsCompleted','intervals_completed'],1,1000,true);
 const claims=new Map();let excludedRows=0,unlinkedRecordedSets=0,unlinkedSkippedSets=0;
 const unlinked=new Map();
 const collect=(storage,row,kind)=>{
  if(!obj(row)){excludedRows++;return;}
  const exerciseIds=val(row,['exerciseId','exercise_id']),blocks=val(row,['blockId','block_id']),numbers=val(row,['setNumber','set_number']).map(count);
  const exercise=id(exact(exerciseIds)),block=id(exact(blocks)),number=exact(numbers);
  const candidates=new Set();
  // Conflicting claims poison all plausible original coordinates rather than
  // letting a valid-looking duplicate certify one of them.
  for(const x of exerciseIds.filter(id))for(const n of numbers.filter(v=>v!==null))for(const p of byExercise.get(JSON.stringify([x,n]))||[])if(!blocks.length||blocks.includes(p.blockId)||!blocks.every(id))candidates.add(p);
  const scoped=storage===null?[]:byStorage.get(storage)||[];
  const legacyPoints=storage===null?[]:byLegacyStorage.get(storage)||[];
  for(const p of scoped)candidates.add(p);
  // A recognized legacy key may corroborate, but never override row identity.
  if(!scoped.length)for(const p of legacyPoints)if(!block||p.blockId===block||p.exerciseId!==exercise||p.setNumber!==number)candidates.add(p);
  const possible=exercise&&number?byExercise.get(JSON.stringify([exercise,number]))||[]:[];
  const matching=possible.filter(p=>(!blocks.length||block===p.blockId)&&(!scoped.length||scoped.includes(p)));
  const legacyStorage=legacyPoints.length>0;
  // Unscoped legacy storage keys cannot settle repeated exercise ownership
  // when the live queue may have changed. Explicit scoped keys can.
  const valid=Boolean(exercise&&number&&(!blocks.length||block)&&(!scoped.length||scoped.length===1&&scoped.every(p=>p.exerciseId===exercise&&p.setNumber===number&&(!block||p.blockId===block)))&&(!legacyPoints.length||legacyPoints.every(p=>p.exerciseId===exercise&&p.setNumber===number))&&(kind==='skip'||observedSet(row)&&hasWork(row)));
  if(!valid||matching.length>1||candidates.size>1&&matching.length!==1){excludedRows++;for(const p of candidates){const c=claims.get(p.key)||[];c.push('invalid');claims.set(p.key,c);}return;}
  if(matching.length===1){const p=matching[0],c=claims.get(p.key)||[];c.push(kind);claims.set(p.key,c);return;}
  // An extra or replacement remains an observed but unlinked row. Do not
  // call it an added set unless an explicit event establishes that fact.
  if(scoped.length||legacyStorage&&blocks.length){excludedRows++;return;}
  const key=JSON.stringify([block,exercise,number]);const c=unlinked.get(key)||[];c.push(kind);unlinked.set(key,c);
 };
 if(result.entries.length+skips.entries.length>100000)return null;
 for(const [key,row] of result.entries)collect(key,row,'result');for(const [key,row] of skips.entries)collect(key,row,'skip');
 let matchedRecordedSets=0,matchedSkippedSets=0,conflictingCoordinates=0;
 for(const c of claims.values()){if(c.length!==1||c[0]==='invalid'){conflictingCoordinates++;excludedRows+=c.filter(x=>x!=='invalid').length;continue;}if(c[0]==='result')matchedRecordedSets++;else matchedSkippedSets++;}
 for(const c of unlinked.values()){if(c.length!==1){conflictingCoordinates++;excludedRows+=c.length;continue;}if(c[0]==='result')unlinkedRecordedSets++;else unlinkedSkippedSets++;}
 const unresolvedPlannedSets=expected.size-matchedRecordedSets-matchedSkippedSets;
 const completeEvidence=!result.conflict&&!skips.conflict&&excludedRows===0&&conflictingCoordinates===0;
 return Object.freeze({plannedSets:expected.size,matchedRecordedSets,matchedSkippedSets,unlinkedRecordedSets,unlinkedSkippedSets,unresolvedPlannedSets,excludedRows,conflictingCoordinates,completeEvidence,collectionConflict:result.conflict||skips.conflict});
}
export function sessionExecutionEvidenceSignature(record){
  const row=unwrap(record);
  const aliasEvidence=(...keys)=>[...new Set([record,record?.body].filter(r=>r&&typeof r==='object'&&!Array.isArray(r)).flatMap(r=>keys.map(key=>r[key])).filter(v=>v!==undefined&&v!==null&&v!=='').map(stableEvidenceJson))].sort((a,b)=>a<b?-1:a>b?1:0);
  const evidence={
    owner:sessionExecutionClientId(row),id:sessionExecutionId(row),
    ownerAliases:aliasEvidence('clientId','client_id','clienteId','cliente_id'),
    executionAliases:aliasEvidence('id','executionId','execution_id'),
    sessionAliases:aliasEvidence('sessionId','session_id'),
    cycleAliases:aliasEvidence('cycleId','cycle_id','trainingCycleId','training_cycle_id'),
    snapshotAliases:aliasEvidence('planSnapshot','plan_snapshot'),
    datedSnapshotAliases:aliasEvidence('sourceSnapshot','source_snapshot'),
    sourceRevisionAliases:aliasEvidence('sourceRevision','source_revision'),
    occurrenceAliases:aliasEvidence('occurrenceId','occurrence_id'),
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
    actualCompletionDate:sessionExecutionCompletionDate(row),
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
