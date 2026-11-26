// Local, private projection for an already-authorized selected client.
// Not a publication payload, not a new persistence path, not a server authorization check.
import {confirmedSessionExecutionsForClient,sessionExecutionId,sessionExecutionClientId,sessionExecutionCompletionDate,sessionExecutionIsCompleted} from '../domain/session-execution-truth.js';
import {reportCivilDate,isWithinCivilPeriod,parseDateValue} from '../domain/civil-date.js';
import {observedSet,evidenceNumber,observedLoadKg} from '../domain/evidence-signal.js';
import {normalizeExerciseLoad} from '../engagement/exercise-performance-engine.js';
const LIMIT=360;
const clean=(v,max=100)=>String(v??'').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max);
const first=(o,...keys)=>{for(const key of keys){const v=o?.[key];if(v!==undefined&&v!==null&&v!=='')return v;}return null;};
const body=r=>r?.body&&typeof r.body==='object'&&!Array.isArray(r.body)?{...r,...r.body}:r;
const rows=r=>{for(const x of [r?.results,r?.setResults,r?.set_results,r?.progressSnapshot?.results,r?.progress_snapshot?.results,r?.feedback?.sets]){
  const a=Array.isArray(x)?x:x&&typeof x==='object'?Object.values(x):[];
  if(a.length)return a.filter(o=>o&&typeof o==='object'&&!Array.isArray(o));
}return [];};
const n=(v,min,max,integer=false)=>evidenceNumber(typeof v==='string'?v.replace(',','.'):v,{min,max,integer});
export function buildPrivateReportDetail(state,clientId,report,{now=new Date()}={}){
  const role=String(state?.identity?.role||'').toLowerCase(),owner=String(clientId||'');
  if(!['coach','admin'].includes(role)||!owner||String(state?.selectedClientId||'')!==owner)throw Error('M44_PRIVATE_DETAIL_SCOPE');
  if(!report?.ready||!['post-session','weekly','monthly','quarterly','year-in-iberfit'].includes(report.id)||!report.periodStart||!report.periodEnd||report.periodStart>report.periodEnd)throw Error('M44_PRIVATE_DETAIL_REPORT');
  const executions=confirmedSessionExecutionsForClient(state,owner,{requireCompleted:true,requireDate:true})
    .filter(r=>sessionExecutionIsCompleted(r,{allowDatedFallback:false})&&sessionExecutionClientId(r)===owner&&isWithinCivilPeriod(sessionExecutionCompletionDate(r),report.periodStart,report.periodEnd,now)
      &&(report.id!=='post-session'||sessionExecutionId(r)===report.sourceId))
    .sort((a,b)=>parseDateValue(sessionExecutionCompletionDate(b)).getTime()-parseDateValue(sessionExecutionCompletionDate(a)).getTime()||String(sessionExecutionId(a)).localeCompare(String(sessionExecutionId(b))));
  const details=[],coverage={load:0,reps:0,seconds:0,rpe:0,rir:0,distance:0};
  let observedRows=0,omittedRows=0,emptySessions=0;
  const uniqueExercises=new Set();
  for(const execution of executions){
    const r=body(execution),date=reportCivilDate(sessionExecutionCompletionDate(execution));
    // No free-text notes, health records, IDs of other people or prescriptions.
    // A contradictory nested owner or explicit unobserved row cannot contribute.
    if(sessionExecutionClientId(r)!==owner){emptySessions++;continue;}
    let count=0;
    for(const [index,set] of rows(r).entries()){
      if(!observedSet(set)){omittedRows++;continue;}
      const id=clean(first(set,'exerciseId','exercise_id','ejercicioId','ejercicio_id'));
      if(!id)continue;
      const kg=observedLoadKg(set);
      const load=normalizeExerciseLoad(set);
      const loadText=kg!==null?String(kg)+' kg':load.comparableKey==='lb'&&Number.isFinite(load.value)?String(load.value)+' lb':null;
      const values={
        load:loadText,reps:n(first(set,'reps','actualReps','actual_reps','repetitions'),0,10000,true),
        seconds:n(first(set,'seconds','durationSeconds','duration_seconds'),0,86400),
        rpe:n(first(set,'rpe','actualRpe','actual_rpe'),1,10),rir:n(first(set,'rir','actualRir','actual_rir'),0,10),
        distance:null,
      };
      const km=n(first(set,'distanceKm','distance_km'),0,1000),m=n(first(set,'distanceM','distance_m'),0,100000);
      if(km!==null&&m!==null){if(Math.abs(km*1000-m)<.01)values.distance=String(m)+' m';}
      else if(km!==null)values.distance=String(km)+' km';else if(m!==null)values.distance=String(m)+' m';
      if(Object.values(values).every(v=>v===null))continue;
      const label=clean(first(set,'exerciseName','exercise_name','name','nombre')||id,65);
      const setNumber=n(first(set,'setNumber','set_number','serie','series'),1,10000,true);
      observedRows++;count++;uniqueExercises.add(id);
      for(const k of Object.keys(coverage))if(values[k]!==null)coverage[k]++;
      if(details.length<LIMIT)details.push(Object.freeze({date,session:clean(first(r,'title','sessionTitle','name')||'Entrenamiento',55),exercise:label,set:setNumber,...values}));
    }
    if(!count)emptySessions++;
  }
  return Object.freeze({role,periodStart:report.periodStart,periodEnd:report.periodEnd,sessions:executions.length,exercises:uniqueExercises.size,observedRows,omittedRows,emptySessions,coverage:Object.freeze(coverage),details:Object.freeze(details),limited:observedRows>details.length});
}
