// Local, private projection for an already-authorized selected client.
// Not a publication payload, not a new persistence path, not a server authorization check.
import {confirmedSessionExecutionsForClient,sessionExecutionId,sessionExecutionClientId,sessionExecutionCompletionDate,sessionExecutionIsCompleted,readOriginalExecutionPrescription} from '../domain/session-execution-truth.js';
import {reportCivilDate,isWithinCivilPeriod,parseDateValue} from '../domain/civil-date.js';
import {observedSet,evidenceNumber,observedLoadKg} from '../domain/evidence-signal.js';
import {normalizeExerciseLoad} from '../engagement/exercise-performance-engine.js';
import {exerciseMeasurementProfile} from '../exercises/measurement-profiles.js';
import {buildPeriodSportProjection} from './report-sport-evidence.js';
import {buildReportCycleObjective} from './report-cycle-objective.js';
import {buildReportEvidenceLineage} from './report-evidence-lineage.js';
import {selectInitialIriBaseline} from './iri-2-longitudinal.js';
const LIMIT=360,ANALYSIS_LIMIT=48;
const clean=(v,max=100)=>String(v??'').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max);
const first=(o,...keys)=>{for(const key of keys){const v=o?.[key];if(v!==undefined&&v!==null&&v!=='')return v;}return null;};
const body=r=>r?.body&&typeof r.body==='object'&&!Array.isArray(r.body)?{...r,...r.body}:r;
const rows=r=>{for(const x of [r?.results,r?.setResults,r?.set_results,r?.progressSnapshot?.results,r?.progress_snapshot?.results,r?.feedback?.sets]){
  const a=Array.isArray(x)?x:x&&typeof x==='object'?Object.values(x):[];
  if(a.length)return a.filter(o=>o&&typeof o==='object'&&!Array.isArray(o));
}return [];};
const n=(v,min,max,integer=false)=>evidenceNumber(typeof v==='string'?v.replace(',','.'):v,{min,max,integer});
const present=(row,keys)=>keys.map(k=>row?.[k]).filter(v=>v!=null&&v!=='');
const exerciseKeys=['exerciseId','exercise_id','ejercicioId','ejercicio_id'];
const seriesKeys=['setNumber','set_number','serie','series'];
function consistentNumber(row,keys,min,max,integer=false){
 const values=present(row,keys).map(v=>n(v,min,max,integer));
 return values.length&&values[0]!==null&&values.every(v=>v===values[0])?values[0]:null;
}
function seriesCoordinate(row){
 const rawIds=present(row,exerciseKeys),rawNumbers=present(row,seriesKeys);
 const ids=[...new Set(rawIds.filter(v=>typeof v==='string'&&v.trim()===v&&v.length<=160))];
 const numbers=[...new Set(rawNumbers.map(v=>n(v,1,10000,true)).filter(v=>v!==null))];
 const id=ids.length===1&&rawIds.every(v=>v===ids[0])?ids[0]:null;
 const number=consistentNumber(row,seriesKeys,1,10000,true);
 // A contradictory row also invalidates each plausible numbered coordinate.
 const keys=ids.flatMap(i=>numbers.map(j=>JSON.stringify([i,j])));
 return {id,number,valid:Boolean(id)&&(!rawNumbers.length||number!==null),key:id&&number!==null?JSON.stringify([id,number]):null,keys};
}
function indexedCoordinates(rows){
 const counts=new Map();
 for(const row of rows)for(const key of seriesCoordinate(row).keys)counts.set(key,(counts.get(key)||0)+1);
 return counts;
}
function consistentExecutionOwner(record,owner){
 const values=[record,record?.body].flatMap(row=>present(row,['clientId','client_id','clienteId','cliente_id']));
 return values.length>0&&values.every(v=>typeof v==='string'&&v===owner);
}
// Explicit protocol identity is required for a load comparison. A missing
// variant, implement, load basis or laterality is not evidence of equivalence.
function protocol(row){
 const fields=[['variantId','variant_id','exerciseVariantId','exercise_variant_id'],['equipmentId','equipment_id','equipment'],['loadBasis','load_basis','loadMode','load_mode'],['side','lado','laterality']];
 const v=fields.map(keys=>{const vals=keys.map(k=>row[k]).filter(x=>x!=null&&x!=='');return vals.length&&vals.every(x=>typeof x==='string'&&x.trim()===String(vals[0]).trim())?vals[0]:null;});
 if(v.some(x=>typeof x!=='string'||!x.trim()||x.trim().length>100))return null;
 return v.map(x=>x.trim());
}
function externalResistanceContext(row,context){
 if(!context)return false;
 const norm=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase().replace(/[ _-]+/gu,'-');
 const basis=norm(context[2]);
 if(!['total','external','external-load','carga-externa','per-dumbbell','por-mancuerna','per-hand','por-mano','per-side','por-lado','per-implement','por-implemento'].includes(basis))return false;
 const directions=[row.loadDirection,row.load_direction].filter(v=>v!=null&&v!=='');
 if(directions.some(v=>v!=='higher-is-better'))return false;
 const descriptors=[...context,row.exerciseId,row.exercise_id,row.exerciseName,row.exercise_name,row.name,row.nombre].map(norm).join(' ');
 return !/assist|asist|contrapeso|counterweight|unload|descarga|ayuda/u.test(descriptors);
}
const rounded=x=>Math.round(x*100)/100;
// Only the confirmed, owner-scoped records available in this read model.
// An observed maximum is never an all-time record without complete provenance.
function originalStrengthContext(record,id,setNumber){
 const snapshot=readOriginalExecutionPrescription(record).snapshot;
 if(!snapshot)return null;
 const matches=snapshot.blocks.filter(b=>String(b?.exerciseId??'')===id||(Array.isArray(b?.exerciseIds)&&b.exerciseIds.some(x=>String(x)===id)));
 if(matches.length!==1)return null;
 const b=matches[0];
 if(b.type!=='exercise')return null;
 const descriptor=[b.name,b.name_es,b.exerciseName,b.variantId,b.equipmentId,b.loadBasis,id].map(v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').toLowerCase()).join(' ');
 if(/assist|asist|contrapeso|counterweight|unload|descarga|ayuda/u.test(descriptor)||[b.loadDirection,b.load_direction].some(v=>v!=null&&v!==''&&v!=='higher-is-better'))return null;
 const sets=n(b.sets,1,100,true),rest=n(b.restSeconds,0,3600),target=clean(b.reps,40),name=clean(b.name??b.exerciseName??b.name_es,65);
 if(sets===null||rest===null||setNumber>sets||!target||!name||exerciseMeasurementProfile({id,name_es:name,measurementProfile:b.measurementProfile}).kind!=='strength')return null;
 return {name,key:JSON.stringify([sets,rest,target,clean(b.tempo,40),clean(b.plannedLoad,80),clean(b.variantId,100),clean(b.equipmentId,100),clean(b.loadBasis,100),clean(b.side,100),setNumber])};
}
export function buildStrengthHistoryIndex(state,clientId,{now=new Date()}={}){
 const owner=String(clientId||'').trim(),end=reportCivilDate(now),groups=new Map();
 if(!owner||!end)return [];
 for(const record of confirmedSessionExecutionsForClient(state,owner,{requireCompleted:true,requireDate:true})){
  const instant=sessionExecutionCompletionDate(record),date=reportCivilDate(instant),r=body(record);
  if(!sessionExecutionIsCompleted(record,{allowDatedFallback:false})||!consistentExecutionOwner(record,owner)||sessionExecutionClientId(r)!==owner||!isWithinCivilPeriod(instant,'0001-01-01',end,now))continue;
  const observed=rows(r),counts=indexedCoordinates(observed);
  for(const row of observed){
   const coordinate=seriesCoordinate(row);
   if(!observedSet(row)||!coordinate.valid||!coordinate.key||counts.get(coordinate.key)!==1)continue;
   const id=coordinate.id,setNumber=coordinate.number,reps=consistentNumber(row,['reps','actualReps','actual_reps','repetitions'],1,10000,true),kg=observedLoadKg(row);
   if(typeof id!=='string'||!id.trim()||id.length>160||setNumber===null||reps===null||kg===null)continue;
   const observedProtocol=protocol(row);
   const partial=['variantId','variant_id','exerciseVariantId','exercise_variant_id','equipmentId','equipment_id','equipment','loadBasis','load_basis','loadMode','load_mode','side','lado','laterality'].some(k=>row[k]!=null&&row[k]!=='');
   const prescribed=observedProtocol||partial?null:originalStrengthContext(record,id,setNumber);
   if(!observedProtocol&&!prescribed)continue;
   if(observedProtocol&&!externalResistanceContext(row,observedProtocol))continue;
   const basis=observedProtocol?'observed':'prescribed';
   const name=clean(first(row,'exerciseName','exercise_name','name','nombre')??prescribed?.name??'Ejercicio registrado',65);
   const key=JSON.stringify([id,basis,observedProtocol??prescribed.key,setNumber,reps]);
   let g=groups.get(key);if(!g){g={exercise:name,basis,setNumber,reps,protocol:observedProtocol,days:new Map()};groups.set(key,g);}
   g.days.set(date,Math.max(g.days.get(date)??-Infinity,kg));
  }
 }
 return [...groups.values()].map(g=>({...g,days:[...g.days].sort(([a],[b])=>a.localeCompare(b)).map(([date,kg])=>({date,kg}))}));
}
export function summarizeStrengthHistory(index,start,end){
 const comparisons=[],records=[];
 if(typeof start!=='string'||typeof end!=='string'||start>end)return {comparisons,records};
 for(const g of index??[]){
  const prior=g.days.filter(p=>p.date<start),current=g.days.filter(p=>p.date>=start&&p.date<=end);
  const meta={exercise:g.exercise,basis:g.basis,setNumber:g.setNumber,reps:g.reps};
  if(current.length>=2)comparisons.push({...meta,dates:current.length,first:current[0],last:current.at(-1)});
  if(g.basis!=='observed'||prior.length<2)continue;
  let max=prior.reduce((v,p)=>Math.max(v,p.kg),-Infinity),record=null;
  const previous=max;
  for(const p of current)if(p.kg>max){max=p.kg;record=p;}
  if(record)records.push({...meta,date:record.date,kg:record.kg,previousKg:previous,priorDays:prior.length});
 }
 comparisons.sort((a,b)=>b.dates-a.dates||a.exercise.localeCompare(b.exercise)||a.setNumber-b.setNumber||a.reps-b.reps);
 records.sort((a,b)=>b.date.localeCompare(a.date)||a.exercise.localeCompare(b.exercise)||a.setNumber-b.setNumber||a.reps-b.reps);
 return {comparisons,records};
}
export function strengthPeriodEvidence(index,start,end){
 const {comparisons,records}=summarizeStrengthHistory(index,start,end),c=comparisons[0],r=records[0];
 if(!c&&!r)return null;
 const parts=[];
 if(c)parts.push(c.exercise+' · serie '+c.setNumber+' · '+c.reps+' rep.: '+c.first.kg+' kg ('+c.first.date+') a '+c.last.kg+' kg ('+c.last.date+'), '+c.dates+' días; '+(c.basis==='observed'?'contexto registrado equivalente.':'misma prescripción original, contexto real no verificado.'));
 if(r)parts.push(r.exercise+' · '+r.reps+' rep., serie '+r.setNumber+': '+r.kg+' kg el '+r.date+' superan '+r.previousKg+' kg en '+r.priorDays+' días previos comparables del historial disponible. No acredita récord absoluto.');
 const text=parts.join(' ');
 return Object.freeze({label:'Fuerza · comparación registrada',text:text.length<=500?text:parts[0],source:'sessionExecutions',quality:'registrada'});
}
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
  all.push({exercise:g.exercise,protocol:g.protocol,reps:g.reps,kg:g.kg,setNumber:g.setNumber,metric:g.metric,days:p.length,series:p.reduce((n,x)=>n+x.count,0),points});
 }
 all.sort((a,b)=>b.days-a.days||a.exercise.localeCompare(b.exercise)||a.kg-b.kg||a.reps-b.reps||a.metric.localeCompare(b.metric));
 return {effortComparisons:all.slice(0,ANALYSIS_LIMIT),effortComparisonTotal:all.length};
}
export function buildPrivateReportDetail(state,clientId,report,{now=new Date()}={}){
  const role=String(state?.identity?.role||'').toLowerCase(),owner=String(clientId||'');
  if(!['coach','admin'].includes(role)||!owner||String(state?.selectedClientId||'')!==owner)throw Error('M44_PRIVATE_DETAIL_SCOPE');
  if(!report?.ready||!['post-session','weekly','monthly','quarterly','year-in-iberfit'].includes(report.id)||!report.periodStart||!report.periodEnd||report.periodStart>report.periodEnd)throw Error('M44_PRIVATE_DETAIL_REPORT');
  const executions=confirmedSessionExecutionsForClient(state,owner,{requireCompleted:true,requireDate:true})
    .filter(r=>sessionExecutionIsCompleted(r,{allowDatedFallback:false})&&consistentExecutionOwner(r,owner)&&sessionExecutionClientId(r)===owner&&isWithinCivilPeriod(sessionExecutionCompletionDate(r),report.periodStart,report.periodEnd,now)
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
    const observed=rows(r),coordinates=indexedCoordinates(observed);
    for(const set of observed){
      const coordinate=seriesCoordinate(set);
      if(!observedSet(set)||!coordinate.valid||(coordinate.key&&coordinates.get(coordinate.key)!==1)){omittedRows++;continue;}
      const id=coordinate.id,setNumber=coordinate.number;
      const kg=observedLoadKg(set);
      const load=normalizeExerciseLoad(set);
      const loadText=kg!==null?String(kg)+' kg':load.comparableKey==='lb'&&Number.isFinite(load.value)?String(load.value)+' lb':null;
      const values={
        load:loadText,reps:consistentNumber(set,['reps','actualReps','actual_reps','repetitions'],0,10000,true),
        seconds:consistentNumber(set,['seconds','durationSeconds','duration_seconds'],0,86400),
        rpe:consistentNumber(set,['rpe','actualRpe','actual_rpe'],1,10),rir:consistentNumber(set,['rir','actualRir','actual_rir'],0,10),
        distance:null,
      };
      const kmKeys=['distanceKm','distance_km'],mKeys=['distanceM','distance_m'];
      const km=consistentNumber(set,kmKeys,0,1000),m=consistentNumber(set,mKeys,0,100000);
      if((present(set,kmKeys).length&&km===null)||(present(set,mKeys).length&&m===null))values.distance=null;
      else if(km!==null&&m!==null){if(Math.abs(km*1000-m)<.01)values.distance=String(m)+' m';}
      else if(km!==null)values.distance=String(km)+' km';else if(m!==null)values.distance=String(m)+' m';
      if(Object.values(values).every(v=>v===null))continue;
      const label=clean(first(set,'exerciseName','exercise_name','name','nombre')||id,65);
      observedRows++;count++;uniqueExercises.add(id);
      let group=exerciseGroups.get(id);
      if(!group){group={exercise:label,sessions:new Set(),rows:0,loadRows:0,rpeRows:0,rirRows:0,first:date,last:date};exerciseGroups.set(id,group);}
      group.sessions.add(sessionExecutionId(execution));group.rows++;
      if(values.load!==null)group.loadRows++;if(values.rpe!==null)group.rpeRows++;if(values.rir!==null)group.rirRows++;
      if(date<group.first)group.first=date;if(date>group.last)group.last=date;
      const context=protocol(set);
      if(context&&kg!==null&&values.reps!==null&&values.reps>0){
        if(setNumber!==null&&externalResistanceContext(set,context)){
          for(const metric of ['rpe','rir']){
            const value=values[metric];if(value===null)continue;
            const ek=JSON.stringify([id,context,values.reps,kg,setNumber,metric]);
            let g=effortGroups.get(ek);if(!g){g={exercise:label,protocol:context,reps:values.reps,kg,setNumber,metric,days:new Map()};effortGroups.set(ek,g);}
            const day=g.days.get(date)||{sum:0,count:0};day.sum+=value;day.count++;g.days.set(date,day);
          }
        }
        if(setNumber!==null&&externalResistanceContext(set,context)){
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
      }
      for(const k of Object.keys(coverage))if(values[k]!==null)coverage[k]++;
      if(details.length<LIMIT)details.push(Object.freeze({date,session:clean(first(r,'title','sessionTitle','name')||'Entrenamiento',55),exercise:label,set:setNumber,...values}));
    }
    if(!count)emptySessions++;
  }
  const sport=buildPeriodSportProjection(executions,{clientId:owner});
  const objective=buildReportCycleObjective(state,owner,{start:report.periodStart,end:report.periodEnd,now});
  const baseline=selectInitialIriBaseline(state?.collections?.iriAssessments,owner,{now});
  const lineage=buildReportEvidenceLineage({clientId:owner,baseline,objective,executions,periodStart:report.periodStart,periodEnd:report.periodEnd,now});
  const historical=report.id==='post-session'?{comparisons:[],records:[]}:summarizeStrengthHistory(buildStrengthHistoryIndex(state,owner,{now}),report.periodStart,report.periodEnd);
  return Object.freeze({...summarizeExerciseGroups(exerciseGroups,comparisonGroups),...summarizeEffortGroups(effortGroups),sportSummary:sport.summary,sportMeasurements:sport.measurements,sportComparisons:sport.comparisons.slice(0,ANALYSIS_LIMIT),sportComparisonTotal:sport.comparisons.length,prescribedStrengthComparisons:historical.comparisons.filter(c=>c.basis==='prescribed').slice(0,ANALYSIS_LIMIT),historicalStrengthRecords:historical.records.slice(0,ANALYSIS_LIMIT),historicalStrengthRecordTotal:historical.records.length,role,objective,lineage,periodStart:report.periodStart,periodEnd:report.periodEnd,sessions:executions.length,exercises:uniqueExercises.size,observedRows,omittedRows,emptySessions,coverage:Object.freeze(coverage),details:Object.freeze(details),limited:observedRows>details.length});
}
