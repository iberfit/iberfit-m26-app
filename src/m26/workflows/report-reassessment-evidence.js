import {selectInitialIriBaseline,isInitialIriAssessment,EVOLUTION_FOLLOWUP_KIND} from './iri-2-longitudinal.js';
import {protocolComparabilityWarnings,protocolSetupIdentity} from './iri-protocol-catalog.js';
import {bodyMeasurements} from './iri-report-measurements.js';
import {reportCivilDate,isWithinCivilPeriod} from '../domain/civil-date.js';
import {evidenceNumber,stableEvidenceJson,createEvidenceSignal} from '../domain/evidence-signal.js';
import {readProfessionalFollowupHistoryItem,validateProfessionalFollowupProtocol} from '../domain/professional-followup.js';
const safe=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u.test(x)?x:null;
const scopes=r=>[r,r?.body].filter(x=>x&&typeof x==='object'&&!Array.isArray(x));
function values(r,keys){return scopes(r).flatMap(o=>keys.map(k=>o[k])).filter(v=>v!==null&&v!==undefined&&v!=='');}
function one(r,keys){const a=values(r,keys);return a.length&&a.every(x=>stableEvidenceJson(x)===stableEvidenceJson(a[0]))?a[0]:null;}
const idOf=r=>safe(one(r,['id','entityId','entity_id']));
const ownerOf=r=>safe(one(r,['clientId','client_id']));
const dateOf=r=>one(r,['assessmentDate','assessment_date','evaluatedAt','evaluated_at']);
const status=r=>String(one(r,['status','estado'])??'').toLowerCase();
const sync=r=>one(r,['syncStatus','sync_status']);
const statuses=new Set(['confirmed','confirmada','confirmado','completed','completada','completado','approved','aprobada','aprobado']);
const followup=new Set([EVOLUTION_FOLLOWUP_KIND,'followup','follow-up','seguimiento','reevaluacion','reassessment']);
function explicitFollowup(r){const kinds=values(r,['assessmentType','assessment_type','assessmentKind','assessment_kind','kind','phase','type']).map(v=>String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/gu,''));return kinds.length>0&&kinds.some(v=>followup.has(v))&&kinds.every(v=>followup.has(v));}
function blockedIds(state){const out=new Set();for(const list of [state?.pendingOperations,state?.conflicts,state?.rejectedOperations])for(const x of Array.isArray(list)?list:[])for(const id of [x?.entityId,x?.entity_id,x?.command?.entityId,x?.operation?.entityId])if(safe(id))out.add(id);return out;}
function confirmed(r,owner,now,blocked){const date=dateOf(r),id=idOf(r),end=reportCivilDate(now);return id&&ownerOf(r)===owner&&!blocked.has(id)&&statuses.has(status(r))&&sync(r)==='clean'&&scopes(r).every(x=>['serverConfirmed','server_confirmed'].every(k=>!Object.hasOwn(x,k)||x[k]===true))&&date&&isWithinCivilPeriod(date,'1900-01-01',end,now);}
function canonical(records,owner){const map=new Map();for(const record of Array.isArray(records)?records:[]){if(ownerOf(record)!==owner)continue;const id=idOf(record);if(!id)continue;const raw=values(record,['revision']),rev=one(record,['revision']),n=evidenceNumber(rev,{min:0,integer:true});const old=map.get(id);if(raw.length&&n===null){map.set(id,{invalid:true,revision:Infinity});continue;}const revision=n??0,sig=stableEvidenceJson(record);if(!old||revision>old.revision)map.set(id,{record,revision,sig,invalid:false});else if(revision===old.revision&&old.sig!==sig)old.invalid=true;}
 return [...map.values()].filter(x=>!x.invalid).map(x=>x.record);}
// Only numeric outcomes with a known unit. Never compare test configuration as
// if it were a measured result. No overall score, clinical meaning or auto-plan.
const metrics=Object.freeze({
 'body-composition':[['weightKg','Peso corporal','kg',20,350],['bodyFatPercent','Grasa corporal','%',1,80],['leanMassKg','Masa libre de grasa','kg',1,250],['muscleMassKg','Masa muscular','kg',1,250],['waistCm','Perímetro de cintura','cm',30,250]],
 'weight-bearing-lunge':[['bestCm','Movilidad de tobillo','cm',-100,100]],
 'back-saver':[['bestCm','Cadena posterior','cm',-100,100]],
 'chair-stand-30s':[['repetitions','Levantarse de la silla en 30 s','rep',0,500]],
 'push-test':[['repetitions','Empuje','rep',0,500]],
 'trx-row':[['repetitions','Remo en suspensión','rep',0,500]],
 'core-plank':[['frontPlankSeconds','Plancha frontal','s',0,3600]],
 'bodyweight-squat-60s':[['repetitions','Sentadillas en 60 s','rep',0,500]],
 'posterior-chain-endurance':[['seconds','Resistencia de cadena posterior','s',0,3600]],
 'one-minute-sit-to-stand':[['repetitions','Levantarse de la silla en 1 min','rep',0,500],['oneMinuteHr','Frecuencia cardíaca al minuto de recuperación','lpm',1,300]],
 'ymca-three-minute-step':[['oneMinuteHr','Frecuencia cardíaca al minuto de recuperación','lpm',1,300]],
 'treadmill-three-minute-field':[['oneMinuteHr','Frecuencia cardíaca al minuto de recuperación','lpm',1,300]],
 'legacy-iberfit-three-minute-step-adapted':[['oneMinuteHr','Frecuencia cardíaca al minuto de recuperación','lpm',1,300]],
});
function protocolRows(record){const arr=one(record,['protocolRecords','protocol_records']);const map=new Map();if(!Array.isArray(arr))return map;const day=reportCivilDate(dateOf(record));for(const p of arr){if(!p||!Object.hasOwn(metrics,p.testId)||!['left','right','bilateral','not-applicable'].includes(p.side))continue;const key=p.testId+':'+p.side;if(map.has(key)){map.set(key,null);continue;}const ok=p.valid===true&&p.executionValid===true&&p.trackingComparable===true&&p.date===day&&typeof p.variant==='string'&&p.variant.trim()&&typeof p.configuration==='string'&&p.configuration.trim()&&!/sin registrar|no confirmado|—|\bnull\b/u.test(p.configuration)&&typeof p.protocolVersion==='string'&&p.protocolVersion.trim()&&!p.stopReason&&p.result&&typeof p.result==='object'&&!Array.isArray(p.result)&&p.result.valid!==false;map.set(key,ok?p:null);}return map;}
function compatible(a,b){return a&&b&&a.testId===b.testId&&a.side===b.side&&a.variant===b.variant&&a.protocolVersion===b.protocolVersion&&protocolSetupIdentity(a)===protocolSetupIdentity(b)&&String(a.adaptationReason??'')===String(b.adaptationReason??'')&&!protocolComparabilityWarnings([a],[b]).length;}
function bodyContext(record){
 const body=one(record,['bodyComposition','body_composition']);
 if(!body||typeof body!=='object'||Array.isArray(body)||body.skipped===true)return null;
 const fields=[body.method,body.device,body.measurementConditions];
 if(fields.some(v=>typeof v!=='string'||!v.trim()||/^(?:sin registrar|sin especificar|desconocid[oa]|no (?:registrad[oa]|confirmad[oa]|disponible)|—|-)$/iu.test(v.trim())))return null;
 return {body,key:stableEvidenceJson(fields.map(v=>v.trim())),view:bodyMeasurements(body)};
}
function bodyMeasurement(ctx,field,protocolValue,min,max){
 if(!ctx)return null;
 const value=evidenceNumber(ctx.body[field],{min,max});
 if(value===null||value!==protocolValue)return null;
 // No computed or discordant compartments are treated as direct measurements.
 if(['bodyFatPercent','leanMassKg','muscleMassKg'].includes(field)){
   if(ctx.view.fatConflict||ctx.view.leanConflict||ctx.view.rawLeanInconsistent)return null;
   if(field==='leanMassKg'&&ctx.view.leanMassDerived)return null;
 }
 return value;
}
function protocolOutcome(p,field,min,max,ctx){
 if(!p)return null;
 const value=evidenceNumber(p.result[field],{min,max});
 if(value===null)return null;
 if(p.testId==='one-minute-sit-to-stand'&&(!Number.isFinite(p.result.chairHeightCm)||p.result.chairHeightCm<=0||p.result.durationSeconds!==60))return null;
 return p.testId==='body-composition'?bodyMeasurement(ctx,field,value,min,max):value;
}
const revisionOf=r=>evidenceNumber(one(r,['revision']),{min:0,integer:true});
const goalUnit=unit=>({'rep':'reps','lpm':'bpm','%':'percent'})[unit]??unit;
const metricLabel=(label,side)=>label+(side==='left'?' · izquierda':side==='right'?' · derecha':'');
const metricId=(p,field)=>p.testId+':'+p.side+':'+field;
// Only the real initial confirmed diagnosis may supply these optional anchors.
// The selector never passes notes, full protocol records or clinical scores.
export function buildGoalBaselineOptions(state,clientId,{now=new Date()}={}){
 const owner=safe(clientId);if(!owner||!reportCivilDate(now))return [];
 const records=canonical(state?.collections?.iriAssessments,owner),baseline=selectInitialIriBaseline(records,owner,{now});
 if(!baseline||!isInitialIriAssessment(baseline)||!confirmed(baseline,owner,now,blockedIds(state)))return [];
 const id=idOf(baseline),rev=revisionOf(baseline),date=reportCivilDate(dateOf(baseline));if(rev===null)return [];
 const context=bodyContext(baseline),result=[];
 for(const p of protocolRows(baseline).values()){
  if(!p)continue;
  for(const [field,label,unit,min,max] of metrics[p.testId]){
   const value=protocolOutcome(p,field,min,max,context),metric=metricLabel(label,p.side);
   if(value===null||value<0||metric.length>80)continue;
   result.push(Object.freeze({ref:id+'|'+rev+'|'+metricId(p,field),metric,unit:goalUnit(unit),value,date}));
  }
 }
 return Object.freeze(result.sort((a,b)=>a.metric.localeCompare(b.metric,'es')||a.ref.localeCompare(b.ref)));
}
// Map ONLY explicit initial protocol setup, never copy the current measurement
// into the baseline. Missing historical setup remains non-comparable.
function professionalBaselineSetup(p,field,ctx){
 const r=p.result;
 const select=keys=>Object.fromEntries(keys.map(k=>[k,r[k]]));
 switch(p.testId){
 case 'chair-stand-30s':return select(['chairHeightCm']);
 case 'one-minute-sit-to-stand':return select(['chairHeightCm','durationSeconds']);
 case 'bodyweight-squat-60s':return select(['depthCriterion','stance','durationSeconds']);
 case 'push-test':return select(['variant','supportHeightCm','durationSeconds']);
 case 'trx-row':return select(['handleHeightCm','heelDistanceCm','bodyAngleDeg','position','durationSeconds']);
 case 'weight-bearing-lunge':case 'back-saver':return Array.isArray(r.trials)&&r.trials.length&&r.trials.every(Number.isFinite)&&Math.max(...r.trials)===r.bestCm?{trialCount:r.trials.length}:null;
 case 'core-plank':return select(['quality']);
 case 'posterior-chain-endurance':return select(['protocol','equipmentCompatible']);
 case 'body-composition':return ctx?{method:ctx.body.method,device:ctx.body.device,measurementConditions:ctx.body.measurementConditions,directlyRecorded:true}:null;
 default:return null;
 }
}
// This result is a private, selected-observation comparison, NOT a latest
// measurement assertion or approval. The caller must fetch authenticated
// history on demand; a cached/stale snapshot is not publication authority.
export function buildProfessionalReassessmentComparison(state,clientId,evidenceRef,observation,{now=new Date()}={}){
 let o;try{o=readProfessionalFollowupHistoryItem(observation,{now});}catch{return null;}
 if(o.rectification||o.clientId!==clientId)return null;
 const option=buildGoalBaselineOptions(state,clientId,{now}).find(x=>x.ref===evidenceRef);if(!option)return null;
 const baseline=selectInitialIriBaseline(canonical(state?.collections?.iriAssessments,clientId),clientId,{now});if(!baseline)return null;
 const metric=o.protocol.testId+':'+o.protocol.side+':'+o.protocol.field;
 if(evidenceRef!==idOf(baseline)+'|'+revisionOf(baseline)+'|'+metric||o.unit!==option.unit)return null;
 const currentDay=reportCivilDate(o.measuredAt);if(!currentDay||currentDay<=option.date)return null;
 const p=protocolRows(baseline).get(o.protocol.testId+':'+o.protocol.side);if(!p)return null;
 const setup=professionalBaselineSetup(p,o.protocol.field,bodyContext(baseline));if(!setup)return null;
 const baselineProtocol={schemaVersion:1,testId:p.testId,field:o.protocol.field,side:p.side,variant:p.variant,protocolVersion:p.protocolVersion,configuration:protocolSetupIdentity(p),adaptationReason:p.adaptationReason??'',setup};
 if(!validateProfessionalFollowupProtocol(baselineProtocol,option.value,option.unit)||stableEvidenceJson(baselineProtocol)!==stableEvidenceJson(o.protocol))return null;
 return Object.freeze({baselineId:idOf(baseline),baselineRevision:revisionOf(baseline),followupId:o.id,followupRevision:o.revision,periodStart:option.date,periodEnd:currentDay,comparisons:Object.freeze([Object.freeze({metricId:metric,label:option.metric,goalUnit:option.unit,previous:option.value,value:o.value,delta:Math.round((o.value-option.value)*100)/100,deltaUnit:o.unit==='percent'?'p. p.':o.unit})]),comparisonScope:'selected-observation',reviewRequired:true});
}
export function buildReassessmentReview(state,clientId,{now=new Date()}={}){
 const owner=safe(clientId),blocked=blockedIds(state);if(!owner||!reportCivilDate(now))return null;
 const records=canonical(state?.collections?.iriAssessments,owner);
 const baseline=selectInitialIriBaseline(records,owner,{now});if(!baseline||!isInitialIriAssessment(baseline)||!confirmed(baseline,owner,now,blocked))return null;
 const baseDay=reportCivilDate(dateOf(baseline)),baseId=idOf(baseline),before=protocolRows(baseline);
 const candidates=records.filter(r=>idOf(r)!==baseId&&explicitFollowup(r)&&confirmed(r,owner,now,blocked)&&reportCivilDate(dateOf(r))>baseDay).sort((a,b)=>reportCivilDate(dateOf(b)).localeCompare(reportCivilDate(dateOf(a)))||idOf(a).localeCompare(idOf(b)));
 const current=candidates[0];if(!current)return null;
 const currentDay=reportCivilDate(dateOf(current)),currentId=idOf(current);
 // Do not silently choose between different same-day reassessments.
 if(candidates[1]&&reportCivilDate(dateOf(candidates[1]))===currentDay)return null;
 const after=protocolRows(current),comparisons=[],baseBody=bodyContext(baseline),currentBody=bodyContext(current);
 for(const [key,b] of after){const a=before.get(key);if(!compatible(a,b))continue;
  for(const [field,label,unit,min,max] of metrics[b.testId]){
   if(b.testId==='body-composition'&&(!baseBody||!currentBody||baseBody.key!==currentBody.key))continue;
   const previous=protocolOutcome(a,field,min,max,baseBody),value=protocolOutcome(b,field,min,max,currentBody);
   if(previous===null||value===null)continue;
   const delta=Math.round((value-previous)*100)/100,deltaUnit=unit==='%'?'p. p.':unit,side=b.side==='left'?' · izquierda':b.side==='right'?' · derecha':'';
   const signal=createEvidenceSignal({id:'reassessment:'+b.testId+':'+b.side+':'+field,subjectId:owner,kind:'reassessment',sourceType:'iriAssessments',sourceIds:[baseId,currentId],periodStart:baseDay,periodEnd:currentDay,measuredAt:currentDay,value:delta,unit:deltaUnit,method:'Diferencia entre dos mediciones del mismo protocolo',provenance:'Evaluaciones confirmadas con configuración documentada',sampleSize:2,comparabilityKey:JSON.stringify([b.testId,b.side,b.variant,b.protocolVersion,protocolSetupIdentity(b),b.adaptationReason??'']),quality:'calculada',confidence:'limitada',interpretationBoundary:'Dos mediciones comparables; no establecen causalidad, diagnóstico ni mejora clínica.',decisionUse:'Revisión por el entrenador antes de ajustar la planificación.',methodologyVersion:'iberfit-reassessment-review-v1'},{now});
   if(signal)comparisons.push(Object.freeze({label:label+side,metricId:metricId(b,field),goalUnit:goalUnit(unit),previous,value,delta,unit,deltaUnit,signal}));
  }
 }
 return Object.freeze({baselineId:baseId,baselineRevision:revisionOf(baseline),followupId:currentId,followupRevision:revisionOf(current),periodStart:baseDay,periodEnd:currentDay,comparisons:Object.freeze(comparisons),comparableCount:comparisons.length});
}
export function reassessmentReviewEvidence(review){if(!review)return [];return review.comparisons.map(x=>Object.freeze({label:x.label,text:review.periodStart+': '+x.previous+' '+x.unit+'; '+review.periodEnd+': '+x.value+' '+x.unit+'. Diferencia: '+(x.delta>0?'+':'')+x.delta+' '+x.deltaUnit+'. Revisión profesional, sin diagnóstico ni logro automático.',source:'iriAssessments',quality:'registrada'}));}

