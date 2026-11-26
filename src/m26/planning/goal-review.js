import {parseGoalEvidenceRef,readGoalMeasurement,GOAL_UNITS} from './goal-measurement.js';
import {buildGoalBaselineOptions,buildReassessmentReview,buildProfessionalReassessmentComparison} from '../workflows/report-reassessment-evidence.js';
import {reportCivilDate,isWithinCivilPeriod,parseCivilDate} from '../domain/civil-date.js';
import {stableEvidenceJson} from '../domain/evidence-signal.js';

// Optional manual goals are unchanged. Linked goals require the exact canonical
// baseline revision, measured value, unit, date and metric, not a text search.
export function validateGoalEvidenceAnchor(state,clientId,goal,{now=new Date()}={}){
 if(!goal?.evidenceRef)return true;
 const selected=buildGoalBaselineOptions(state,clientId,{now}).find(x=>x.ref===goal.evidenceRef);
 return Boolean(selected&&selected.metric===goal.metric&&selected.unit===goal.unit&&selected.value===goal.baseline&&selected.date===goal.baselineDate);
}
const own=(r,k)=>r&&Object.hasOwn(r,k);
const scopes=r=>[r,r?.body].filter(x=>x&&typeof x==='object'&&!Array.isArray(x));
function exact(record,...keys){const a=scopes(record).flatMap(r=>keys.filter(k=>own(r,k)).map(k=>r[k])).filter(v=>v!==null&&v!==undefined&&v!=='');return a.length&&a.every(v=>stableEvidenceJson(v)===stableEvidenceJson(a[0]))?a[0]:null;}
const statuses=new Set(['published','publicado','active','activo']);
// An observed threshold is not a declaration of achievement. If the latest
// follow-up lacks comparable data, do not replace it with an older favourable one.
function goalReviewContext(state,clientId,cycle,now){
 const goal=readGoalMeasurement(cycle,{clientId,now}),ref=parseGoalEvidenceRef(goal?.evidenceRef),today=reportCivilDate(now);
 if(!ref||!today||!clientId)return null;
 const id=exact(cycle,'id','entityId','entity_id'),status=exact(cycle,'status','estado'),sync=exact(cycle,'syncStatus','sync_status'),published=exact(cycle,'publishedAt','published_at');
 if(typeof id!=='string'||!id||!statuses.has(String(status).toLowerCase())||sync!=='clean'||!isWithinCivilPeriod(published,'1900-01-01',today,now))return null;
 if(scopes(cycle).some(r=>['serverConfirmed','server_confirmed','visibleToClient','visible_to_client'].some(k=>own(r,k)&&r[k]!==true)))return null;
 for(const list of [state?.pendingOperations,state?.conflicts,state?.rejectedOperations])if(Array.isArray(list)&&list.some(r=>[r?.entityId,r?.entity_id,r?.command?.entityId,r?.command?.entity_id,r?.operation?.entityId].includes(id)))return null;
 if(!validateGoalEvidenceAnchor(state,clientId,goal,{now}))return null;
 const start=exact(cycle,'startDate','start_date'),end=exact(cycle,'endDate','end_date'),publishedDay=reportCivilDate(published);
 if(!parseCivilDate(start)||!parseCivilDate(end)||!publishedDay)return null;
 return {goal,ref,start,end,publishedDay};
}
function compareGoalReview(context,review){
 if(!context)return null;const {goal,ref,start,end,publishedDay}=context;
 if(!review||review.baselineId!==ref.assessmentId||review.baselineRevision!==ref.revision||review.followupRevision===null||review.periodStart!==goal.baselineDate||review.periodEnd<=publishedDay||review.periodEnd<start||review.periodEnd>end)return null;
 const matches=review.comparisons.filter(x=>x.metricId===ref.metricId&&x.goalUnit===goal.unit&&x.previous===goal.baseline&&x.label===goal.metric);
 if(matches.length!==1||matches[0].value<0)return null;
 const x=matches[0],withinDeadline=review.periodEnd<=goal.deadline;
 const thresholdObserved=goal.direction==='increase'?x.value>=goal.target:x.value<=goal.target;
 return Object.freeze({metric:goal.metric,unit:goal.unit,baseline:goal.baseline,baselineDate:goal.baselineDate,target:goal.target,deadline:goal.deadline,value:x.value,date:review.periodEnd,delta:x.delta,deltaUnit:x.deltaUnit,withinDeadline,thresholdObserved,baselineId:review.baselineId,followupId:review.followupId,followupRevision:review.followupRevision});
}
export function buildGoalMeasurementReview(state,clientId,cycle,{now=new Date()}={}){
 const context=goalReviewContext(state,clientId,cycle,now);if(!context)return null;
 return compareGoalReview(context,buildReassessmentReview(state,clientId,{now}));
}
// Selected observation is explicitly professional-only; do not call it in
// Client projection or official issuance until the publication lifecycle exists.
export function buildProfessionalGoalMeasurementReview(state,clientId,cycle,observation,{now=new Date()}={}){
 const context=goalReviewContext(state,clientId,cycle,now);if(!context)return null;
 const review=compareGoalReview(context,buildProfessionalReassessmentComparison(state,clientId,context.goal.evidenceRef,observation,{now}));
 return review?Object.freeze({...review,comparisonScope:'selected-observation',reviewRequired:true}):null;
}
export function goalReviewText(review){
 if(!review||!Object.hasOwn(GOAL_UNITS,review.unit))return '';
 const status=!review.withinDeadline?'Medición posterior al plazo; no acredita cumplimiento en plazo.':review.thresholdObserved?'Umbral observado en una medición comparable.':'Umbral aún no observado en esta medición.';
 return (review.comparisonScope==='selected-observation'?'Medición seleccionada (no necesariamente la última). ':'')+review.metric+': '+review.baseline+' → '+review.value+' '+GOAL_UNITS[review.unit]+' ('+review.date+'); meta '+review.target+' '+GOAL_UNITS[review.unit]+'. '+status+' Logro pendiente de revisión profesional.';
}
