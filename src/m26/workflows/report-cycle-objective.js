// A published planning intention is not a measured outcome.
// Reuse the current-cycle selector and never publish a draft, private note,
// contradictory owner, unsynced record, or undated legacy objective.
import {selectCurrentTrainingCycle} from './planning-workflow.js';
import {readGoalMeasurement,goalMeasurementText} from '../planning/goal-measurement.js';
import {buildGoalMeasurementReview,goalReviewText} from '../planning/goal-review.js';
import {parseCivilDate,reportCivilDate,isWithinCivilPeriod} from '../domain/civil-date.js';
import {evidenceNumber,createEvidenceSignal} from '../domain/evidence-signal.js';
import {confirmedSessionExecutionsForClient,sessionExecutionId,sessionExecutionCompletionDate,sessionExecutionIsCompleted} from '../domain/session-execution-truth.js';
import {explicitExecutionCycle,hasExactExecutionIdentity} from './report-evidence-lineage.js';
const clean=(v,max)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max):'';
const publicStatus=new Set(['published','publicado','active','activo']);
export function buildReportCycleObjective(state,clientId,{start,end,now=new Date()}={}){
 const owner=String(clientId||'').trim();
 if(!owner||!parseCivilDate(start)||!parseCivilDate(end)||start>end||end!==reportCivilDate(now))return null;
 const record=selectCurrentTrainingCycle(state?.collections?.trainingCycles,{clientId:owner,now});
 if(!record)return null;
 const body=record.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};
 const values=(...keys)=>[record,body].flatMap(r=>keys.map(k=>r[k])).filter(v=>v!=null&&v!=='');
 const all=(...keys)=>values(...keys).map(v=>String(v).trim());
 const owners=all('clientId','client_id','clienteId','cliente_id');
 if(!owners.length||owners.some(v=>v!==owner)||values('serverConfirmed','server_confirmed').some(v=>v!==true))return null;
 const statuses=all('status','estado').map(v=>v.toLowerCase());
 if(!statuses.length||statuses.some(v=>!publicStatus.has(v)))return null;
 const sync=all('syncStatus','sync_status').map(v=>v.toLowerCase());
 if(!sync.length||sync.some(v=>v!=='clean')||record.serverConfirmed===false||body.serverConfirmed===false)return null;
 const publication=all('publishedAt','published_at');
 if(!publication.length||new Set(publication).size!==1||!isWithinCivilPeriod(publication[0],'0001-01-01',end,now))return null;
 const starts=all('startDate','start_date'),ends=all('endDate','end_date');
 if(new Set(starts).size!==1||new Set(ends).size!==1||!parseCivilDate(starts[0])||!parseCivilDate(ends[0])||starts[0]>end||ends[0]<end)return null;
 const goals=values('goal','objetivo').map(v=>clean(v,500));
 if(new Set(goals).size!==1||!goals[0])return null;
 const ids=all('id','entityId','entity_id');if(!ids.length||new Set(ids).size!==1)return null;
 // Pending/rejected/conflicting local commands cannot supply the goal.
 const id=ids[0];
 for(const list of [state?.pendingOperations,state?.conflicts,state?.rejectedOperations]){
  if(!Array.isArray(list))continue;
  if(list.some(r=>[r?.entityId,r?.entity_id,r?.command?.entityId,r?.command?.entity_id,r?.operation?.entityId].some(v=>String(v??'')===id)))return null;
 }
 const frequency=values('weeklyFrequency','weekly_frequency').map(v=>evidenceNumber(v,{min:1,max:14,integer:true}));
 const agreed=frequency.length&&frequency.every(v=>v!==null&&v===frequency[0])?frequency[0]:null;
 const publicationDay=reportCivilDate(publication[0]);
 const review=agreed===null?null:buildCycleFrequencyReview(state,owner,{cycleId:id,cycleStart:starts[0],publicationDay,frequency:agreed,start,end,now});
 const assessments=all('sourceAssessmentId','source_assessment_id');
 const sourceAssessmentId=assessments.length&&new Set(assessments).size===1?assessments[0]:null;
 const measuredReview=buildGoalMeasurementReview(state,owner,record,{now});
 const goalReview=measuredReview&&measuredReview.date>=start&&measuredReview.date<=end?measuredReview:null;
 return Object.freeze({id,sourceAssessmentId,goal:goals[0],cycleName:clean(body.name??record.name??body.nombre??record.nombre,120)||'Ciclo de entrenamiento',start:starts[0],end:ends[0],weeklyFrequency:agreed,frequencyReview:review,goalMeasurement:readGoalMeasurement(record,{clientId:owner,now}),goalReview});
}
const DAY_MS=86400000;
export function buildCycleFrequencyReview(state,clientId,{cycleId,cycleStart,publicationDay,frequency,start,end,now=new Date()}={}){
 const owner=String(clientId||'').trim();
 if(!owner||!cycleId||!parseCivilDate(cycleStart)||!parseCivilDate(publicationDay)||!parseCivilDate(start)||!parseCivilDate(end)||start>end||end!==reportCivilDate(now)||!Number.isSafeInteger(frequency)||frequency<1||frequency>14)return null;
 const ms=s=>Date.parse(s+'T00:00:00Z'),iso=t=>new Date(t).toISOString().slice(0,10);
 const first=ms(cycleStart),minimum=Math.max(ms(start),ms(publicationDay)+DAY_MS,first),last=ms(end);
 // Anchor to the cycle, ignore partially elapsed weeks and the publication day.
 // The target is the current published frequency, not an archived weekly revision.
 const weekStart=first+Math.ceil((minimum-first)/(7*DAY_MS))*7*DAY_MS;
 if(!Number.isFinite(weekStart)||weekStart+7*DAY_MS>last)return null;
 const buckets=[];
 for(let t=weekStart;t+7*DAY_MS<=last;t+=7*DAY_MS){
  // A maximum of 53 complete weeks per report avoids unbounded historical work.
  if(buckets.length>=53)return null;
  buckets.push({start:iso(t),end:iso(t+6*DAY_MS),count:0,ids:[],linkedIds:[]});
 }
 for(const record of confirmedSessionExecutionsForClient(state,owner,{requireCompleted:true,requireDate:false})){
  const actual=sessionExecutionCompletionDate(record),day=reportCivilDate(actual),id=sessionExecutionId(record);
  if(!id||!day||!hasExactExecutionIdentity(record,owner)||!sessionExecutionIsCompleted(record,{allowDatedFallback:false})||!isWithinCivilPeriod(actual,buckets[0].start,buckets.at(-1).end,now))continue;
  const index=Math.floor((ms(day)-weekStart)/(7*DAY_MS));
  if(index>=0&&index<buckets.length){const bucket=buckets[index];bucket.count++;bucket.ids.push(id);if(explicitExecutionCycle(record,owner)===cycleId)bucket.linkedIds.push(id);}
 }
 const weeks=buckets.map(w=>Object.freeze({start:w.start,end:w.end,count:w.count,linkedCount:w.linkedIds.length,target:frequency,criterionConfirmed:w.count>=frequency,linkedCriterionConfirmed:w.linkedIds.length>=frequency}));
 const met=weeks.filter(w=>w.criterionConfirmed).length,linkedMet=weeks.filter(w=>w.linkedCriterionConfirmed).length;
 // The criterion is only an observed lower bound. The available history does
 // not prove that unrecorded activity did not happen, or that a goal was met.
 const ids=[...new Set(buckets.flatMap(w=>w.ids))];
 const signal=ids.length?createEvidenceSignal({id:'cycle-frequency:'+cycleId,subjectId:owner,kind:'cycle-frequency',sourceType:'sessionExecutions',sourceIds:ids,periodStart:weeks[0].start,periodEnd:weeks.at(-1).end,value:met,unit:'semanas',method:'Recuento de semanas completas con frecuencia acreditada',provenance:'Planificación publicada y ejecuciones confirmadas',sampleSize:weeks.length,comparabilityKey:'7 días desde el inicio del ciclo; '+frequency+' sesiones',quality:'calculada',confidence:'limitada',interpretationBoundary:'Los registros no acreditan ausencia de actividad ni logro del objetivo deportivo; no se atribuyen todas las sesiones a este ciclo.',decisionUse:'Revisar con el entrenador la frecuencia acordada.',methodologyVersion:'iberfit-cycle-frequency-v1'},{now}):null;
 const linkedIds=[...new Set(buckets.flatMap(w=>w.linkedIds))];
 const linkedSignal=linkedIds.length?createEvidenceSignal({id:'cycle-frequency-linked:'+cycleId,subjectId:owner,kind:'cycle-frequency-linked',sourceType:'sessionExecutions',sourceIds:linkedIds,periodStart:weeks[0].start,periodEnd:weeks.at(-1).end,value:linkedMet,unit:'semanas',method:'Recuento de semanas completas con frecuencia acreditada en el ciclo',provenance:'Prescripción original vinculada explícitamente al ciclo y ejecución confirmada',sampleSize:weeks.length,comparabilityKey:'7 días desde el inicio del ciclo; '+frequency+' sesiones vinculadas',quality:'calculada',confidence:'limitada',interpretationBoundary:'Solo acredita el mínimo observado; ausencia de vínculo o registros no equivale a incumplimiento ni logro deportivo.',decisionUse:'Revisar cobertura y frecuencia del ciclo con el entrenador.',methodologyVersion:'iberfit-cycle-frequency-linked-v1'},{now}):null;
 return Object.freeze({cycleId,weeks:Object.freeze(weeks),met,linkedMet,total:weeks.length,signal,linkedSignal});
}
export function cycleGoalReviewEvidence(objective){
 const text=goalReviewText(objective?.goalReview);
 return text&&text.length<=500?Object.freeze({label:'Medición vinculada a la meta',text,source:'iriAssessments',quality:'registrada'}):null;
}
export function cycleMeasuredGoalEvidence(objective){
 const text=goalMeasurementText(objective?.goalMeasurement);
 return text&&text.length<=500?Object.freeze({label:'Meta medible del ciclo',text,source:'trainingCycles',quality:'planificación publicada'}):null;
}
export function cycleObjectiveEvidence(objective){
 if(!objective)return null;
 const review=objective.frequencyReview;
 const frequency=review?' Frecuencia vigente: '+review.met+'/'+review.total+' semanas completas entre registros disponibles; '+review.linkedMet+'/'+review.total+' con vínculo al ciclo. No acredita metas históricas ni incumplimientos.':'';
 const suffix=' · Ciclo: '+objective.start+' a '+objective.end+(objective.weeklyFrequency!==null?' · Frecuencia acordada: '+objective.weeklyFrequency+'/semana':'')+'. Intención de planificación; logro no evaluado.'+frequency;
 return Object.freeze({label:'Objetivo del ciclo vigente',text:objective.goal.slice(0,500-suffix.length)+suffix,source:'trainingCycles',quality:'planificación publicada'});
}
