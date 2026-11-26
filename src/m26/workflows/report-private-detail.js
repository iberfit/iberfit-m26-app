// Local, private projection for an already-authorized selected client.
// Not a publication payload, not a new persistence path, not a server authorization check.
import {confirmedSessionExecutionsForClient,sessionExecutionId,sessionExecutionClientId,sessionExecutionCompletionDate,sessionExecutionIsCompleted} from '../domain/session-execution-truth.js';
import {reportCivilDate,isWithinCivilPeriod,parseDateValue} from '../domain/civil-date.js';
import {observedSet,evidenceNumber,observedLoadKg} from '../domain/evidence-signal.js';
import {normalizeExerciseLoad} from '../engagement/exercise-performance-engine.js';
import {buildPeriodSportProjection} from './report-sport-evidence.js';
import {buildReportCycleObjective} from './report-cycle-objective.js';
const LIMIT=360,ANALYSIS_LIMIT=48;
const clean=(v,max=100)=>String(v??'').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max);
const first=(o,...keys)=>{for(const key of keys){const v=o?.[key];if(v!==undefined&&v!==null&&v!=='')return v;}return null;};
const body=r=>r?.body&&typeof r.body==='object'&&!Array.isArray(r.body)?{...r,...r.body}:r;
const rows=r=>{for(const x of [r?.results,r?.setResults,r?.set_results,r?.progressSnapshot?.results,r?.progress_snapshot?.results,r?.feedback?.sets]){
  const a=Array.isArray(x)?x:x&&typeof x==='object'?Object.values(x):[];
  if(a.length)return a.filter(o=>o&&typeof o==='object'&&!Array.isArray(o));
}return [];};
const n=(v,min,max,integer=false)=>evidenceNumber(typeof v==='string'?v.replace(',','.'):v,{min,max,integer});
// Explicit protocol identity is required for a load comparison. A missing
// variant, implement, load basis or laterality is not evidence of equivalence.
function protocol(row){
 const fields=[['variantId','variant_id','exerciseVariantId','exercise_variant_id'],['equipmentId','equipment_id','equipment'],['loadBasis','load_basis','loadMode','load_mode'],['side','lado','laterality']];
 const v=fields.map(keys=>{const vals=keys.map(k=>row[k]).filter(x=>x!=null&&x!=='');return vals.length&&vals.every(x=>typeof x==='string'&&x.trim()===String(vals[0]).trim())?vals[0]:null;});
 if(v.some(x=>typeof x!=='string'||!x.trim()||x.trim().length>100))return null;
 return v.map(x=>x.trim());
}
const rounded=x=>Math.round(x*100)/100;
function summarizeExerciseGroups(groups,comparisonGroups){
 const exercises=[...groups.values()].map(g=>({exercise:g.exercise,exposures:g.sessions.size,rows:g.rows,loadRows:g.loadRows,rpeRows:g.rpeRows,rirRows:g.rirRows,first:g.first,last:g.last})).sort((a,b)=>b.exposures-a.exposures||a.exercise.localeCompare(b.exercise));
 const eligible=[];
 for(const g of comparisonGroups.values()){
   // Within one date multiple series are summarized as highest observed kg at
   // the exact same repetitions and explicit protocol, not estimated 1RM.
   const p=[...g.days.values()].sort((a,b)=>a.date.localeCompare(b.date));
   if(p.length<2)continue;
   const a=p[0],b=p.at(-1);
   let runningMax=p[0].kg;const milestones=[];
   for(const point of p.slice(1)){if(point.kg>runningMax){milestones.push({date:point.date,kg:point.kg,previousKg:runningMax});runningMax=point.kg;}}
   eligible.push({milestoneCount:milestones.length,milestones:milestones.slice(-5),exercise:g.exercise,protocol:g.protocol,reps:g.reps,dates:p.length,first:a,last:b,change:rounded(b.kg-a.kg),percent:a.kg>0?rounded((b.kg-a.kg)/a.kg*100):null,bestKg:Math.max(...p.map(x=>x.kg)),points:p.length<=10?p:Array.from({length:10},(_,i)=>p[Math.round(i*(p.length-1)/9)])});
 }
 eligible.sort((a,b)=>b.dates-a.dates||a.exercise.localeCompare(b.exercise)||a.reps-b.reps||JSON.stringify(a.protocol).localeCompare(JSON.stringify(b.protocol)));
 return {exerciseSummary:exercises.slice(0,ANALYSIS_LIMIT),exerciseSummaryTotal:exercises.length,loadComparisons:eligible.slice(0,ANALYSIS_LIMIT),loadComparisonTotal:eligible.length};
}
function summarizeEffortGroups(groups){
 const all=[];
 for(const g of groups.values()){
  const p=[...g.days].sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>({date,value:rounded(v.sum/v.count),count:v.count}));
  if(p.length<3)continue;
  const points=p.length<=10?p:Array.from({length:10},(_,i)=>p[Math.round(i*(p.length-1)/9)]);
  all.push({exercise:g.exercise,protocol:g.protocol,reps:g.reps,kg:g.kg,metric:g.metric,days:p.length,series:p.reduce((n,x)=>n+x.count,0),points});
 }
 all.sort((a,b)=>b.days-a.days||a.exercise.localeCompare(b.exercise)||a.kg-b.kg||a.reps-b.reps||a.metric.localeCompare(b.metric));
 return {effortComparisons:all.slice(0,ANALYSIS_LIMIT),effortComparisonTotal:all.length};
}
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
  const uniqueExercises=new Set(),exerciseGroups=new Map(),comparisonGroups=new Map(),effortGroups=new Map();
  for(const execution of executions){
    const r=body(execution),date=reportCivilDate(sessionExecutionCompletionDate(execution));
    // No free-text notes, health records, IDs of other people or prescriptions.
    // A contradictory nested owner or explicit unobserved row cannot contribute.
    if(sessionExecutionClientId(r)!==owner){emptySessions++;continue;}
    let count=0;
    const observed=rows(r),coordinates=new Map();
    for(const set of observed){const id=first(set,'exerciseId','exercise_id','ejercicioId','ejercicio_id'),number=n(first(set,'setNumber','set_number','serie','series'),1,10000,true);if(id&&number!==null){const key=JSON.stringify([id,number]);coordinates.set(key,(coordinates.get(key)||0)+1);}}
    for(const set of observed){
      if(!observedSet(set)){omittedRows++;continue;}
      const rawId=first(set,'exerciseId','exercise_id','ejercicioId','ejercicio_id');
      if(typeof rawId!=='string'||!rawId.trim()||rawId.length>160)continue;
      const id=rawId.trim();
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
      let group=exerciseGroups.get(id);
      if(!group){group={exercise:label,sessions:new Set(),rows:0,loadRows:0,rpeRows:0,rirRows:0,first:date,last:date};exerciseGroups.set(id,group);}
      group.sessions.add(sessionExecutionId(execution));group.rows++;
      if(values.load!==null)group.loadRows++;if(values.rpe!==null)group.rpeRows++;if(values.rir!==null)group.rirRows++;
      if(date<group.first)group.first=date;if(date>group.last)group.last=date;
      const context=protocol(set);
      if(context&&kg!==null&&values.reps!==null&&values.reps>0){
        if(setNumber!==null&&coordinates.get(JSON.stringify([rawId,setNumber]))===1){
          for(const metric of ['rpe','rir']){
            const value=values[metric];if(value===null)continue;
            const ek=JSON.stringify([id,context,values.reps,kg,metric]);
            let g=effortGroups.get(ek);if(!g){g={exercise:label,protocol:context,reps:values.reps,kg,metric,days:new Map()};effortGroups.set(ek,g);}
            const day=g.days.get(date)||{sum:0,count:0};day.sum+=value;day.count++;g.days.set(date,day);
          }
        }
        const key=JSON.stringify([id,context,values.reps]);
        let comp=comparisonGroups.get(key);
        if(!comp){comp={exercise:label,protocol:context,reps:values.reps,days:new Map()};comparisonGroups.set(key,comp);}
        const current=comp.days.get(date);
        const point={date,kg,rpe:values.rpe,rir:values.rir};
        // Equal highest loads with conflicting effort readings do not choose
        // a favourable value; retain the load and mark the effort ambiguous.
        if(!current||kg>current.kg)comp.days.set(date,point);
        else if(kg===current.kg)comp.days.set(date,{date,kg,rpe:current.rpe===point.rpe?point.rpe:null,rir:current.rir===point.rir?point.rir:null});
      }
      for(const k of Object.keys(coverage))if(values[k]!==null)coverage[k]++;
      if(details.length<LIMIT)details.push(Object.freeze({date,session:clean(first(r,'title','sessionTitle','name')||'Entrenamiento',55),exercise:label,set:setNumber,...values}));
    }
    if(!count)emptySessions++;
  }
  const sport=buildPeriodSportProjection(executions,{clientId:owner});
  return Object.freeze({...summarizeExerciseGroups(exerciseGroups,comparisonGroups),...summarizeEffortGroups(effortGroups),sportSummary:sport.summary,sportComparisons:sport.comparisons.slice(0,ANALYSIS_LIMIT),sportComparisonTotal:sport.comparisons.length,role,objective:buildReportCycleObjective(state,owner,{start:report.periodStart,end:report.periodEnd,now}),periodStart:report.periodStart,periodEnd:report.periodEnd,sessions:executions.length,exercises:uniqueExercises.size,observedRows,omittedRows,emptySessions,coverage:Object.freeze(coverage),details:Object.freeze(details),limited:observedRows>details.length});
}
