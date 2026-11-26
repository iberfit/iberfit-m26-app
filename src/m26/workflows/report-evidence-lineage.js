import {sessionExecutionId,sessionExecutionClientId,sessionExecutionCompletionDate,sessionExecutionIsCompleted,sessionExecutionIsConfirmed,reconcileSessionExecutionsForClient,readOriginalExecutionPrescription} from '../domain/session-execution-truth.js';
import {reportCivilDate,parseCivilDate,isWithinCivilPeriod} from '../domain/civil-date.js';
import {stableEvidenceJson} from '../domain/evidence-signal.js';
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(x)?x:null;
const records=x=>[x,x?.body].filter(r=>r&&typeof r==='object'&&!Array.isArray(r));
function exact(record,...keys){const values=records(record).flatMap(r=>keys.map(k=>r[k])).filter(v=>v!=null&&v!=='');return values.length&&values.every(v=>stableEvidenceJson(v)===stableEvidenceJson(values[0]))?values[0]:null;}
export function hasExactExecutionIdentity(record,clientId){
 const owner=safe(clientId),id=safe(exact(record,'id','executionId','execution_id'));
 return Boolean(owner&&id&&safe(exact(record,'clientId','client_id','clienteId','cliente_id'))===owner);
}
// No attribution from temporal overlap or the currently selected plan.
export function explicitExecutionCycle(record,clientId){
 if(!hasExactExecutionIdentity(record,clientId))return null;
 const sessionId=safe(exact(record,'sessionId','session_id')),snapshot=readOriginalExecutionPrescription(record).snapshot;
 if(!sessionId||!snapshot||safe(exact(snapshot,'sessionId','session_id'))!==sessionId||!Array.isArray(snapshot.blocks)||!snapshot.blocks.length)return null;
 const cycle=safe(exact(snapshot,'cycleId','cycle_id','trainingCycleId','training_cycle_id'));
 if(!cycle)return null;
 const declared=records(record).flatMap(r=>['cycleId','cycle_id','trainingCycleId','training_cycle_id'].map(k=>r[k])).filter(v=>v!=null&&v!=='');
 if(declared.some(v=>safe(v)!==cycle))return null;
 return cycle;
}
export function buildReportEvidenceLineage({clientId,baseline,objective,executions,periodStart,periodEnd,now=new Date()}={}){
 const owner=safe(clientId),nodes=new Map(),links=new Map();
 if(!owner||!parseCivilDate(periodStart)||!parseCivilDate(periodEnd)||periodStart>periodEnd||periodEnd>reportCivilDate(now))return null;
 const node=(type,id,extra={})=>{const key=type+':'+id;if(!nodes.has(key))nodes.set(key,Object.freeze({key,type,id,...extra}));return key;};
 const link=(from,to,kind)=>{const key=JSON.stringify([from,to,kind]);if(from&&to&&!links.has(key))links.set(key,Object.freeze({from,to,kind}));};
 const baseId=safe(exact(baseline,'id','entityId','entity_id')),baseOwner=safe(exact(baseline,'clientId','client_id'));
 const baseDay=reportCivilDate(exact(baseline,'assessmentDate','assessment_date','evaluatedAt','evaluated_at'));
 const baseKey=baseId&&baseOwner===owner&&baseDay&&baseDay<=periodEnd?node('baseline',baseId,{date:baseDay}):null;
 const cycleId=safe(objective?.id),cycleKey=cycleId?node('cycle',cycleId):null;
 if(baseKey&&cycleKey&&objective.sourceAssessmentId===baseId)link(baseKey,cycleKey,'explicit-assessment');
 const period=node('period',periodStart+':'+periodEnd);
 const seen=new Set();let snapshotCount=0,cycleCount=0,appointmentCount=0,occurrenceCount=0;
 const eligible=(Array.isArray(executions)?executions:[]).filter(r=>hasExactExecutionIdentity(r,owner));
 const reconciled=reconcileSessionExecutionsForClient({collections:{sessionExecutions:eligible}},owner);
 for(const record of reconciled.records){
  const id=safe(sessionExecutionId(record)),date=sessionExecutionCompletionDate(record);
  if(!id||seen.has(id)||sessionExecutionClientId(record)!==owner||safe(exact(record,'clientId','client_id','clienteId','cliente_id'))!==owner||!sessionExecutionIsCompleted(record,{allowDatedFallback:false})||!sessionExecutionIsConfirmed(record)||!isWithinCivilPeriod(date,periodStart,periodEnd,now))continue;
  seen.add(id);const e=node('execution',id,{date:reportCivilDate(date)});link(e,period,'observed-in-period');
  const sessionId=safe(exact(record,'sessionId','session_id')),snapshot=readOriginalExecutionPrescription(record).snapshot;
  if(sessionId&&snapshot&&safe(exact(snapshot,'sessionId','session_id'))===sessionId&&Array.isArray(snapshot.blocks)&&snapshot.blocks.length){
   // Snapshot identity is execution-specific; two versions of a prescription
   // are not merged into one supposedly immutable original prescription.
   const s=node('prescription',id,{sessionId});link(s,e,'original-prescription');snapshotCount++;
   const recordedCycle=explicitExecutionCycle(record,owner);
   if(cycleKey&&recordedCycle===cycleId){link(cycleKey,s,'explicit-cycle');cycleCount++;}
  }
  const appointment=safe(exact(record,'appointmentId','appointment_id')),occurrence=safe(exact(record,'occurrenceId','occurrence_id'));
  if(appointment){link(node('appointment-reference',appointment),e,'recorded-reference');appointmentCount++;}
  if(occurrence){link(node('occurrence-reference',occurrence),e,'recorded-reference');occurrenceCount++;}
 }
 return Object.freeze({nodes:Object.freeze([...nodes.values()]),links:Object.freeze([...links.values()]),coverage:Object.freeze({executions:seen.size,originalPrescriptions:snapshotCount,cycleLinks:cycleCount,appointmentReferences:appointmentCount,occurrenceReferences:occurrenceCount,baselineAvailable:Boolean(baseKey),cycleAvailable:Boolean(cycleKey),baselineCycleLinked:Boolean(baseKey&&cycleKey&&objective.sourceAssessmentId===baseId),conflictingExecutions:reconciled.conflicts.length}),limitations:'Relaciones explícitas del historial disponible. Las referencias de cita u ocurrencia no acreditan su estado actual; no se atribuye causalidad ni se completa una relación ausente.'});
}

