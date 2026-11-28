import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGoalBaselineOptions,buildProfessionalBaselineOptions,buildProfessionalReassessmentComparison,buildReassessmentReview} from '../src/m26/workflows/report-reassessment-evidence.js';
import {validateGoalMeasurement,goalMeasurementFormFields,goalMeasurementFromForm} from '../src/m26/planning/goal-measurement.js';
import {validateGoalEvidenceAnchor,buildGoalMeasurementReview,buildProfessionalGoalMeasurementReview,goalReviewText} from '../src/m26/planning/goal-review.js';
import {buildReportCycleObjective,cycleGoalReviewEvidence} from '../src/m26/workflows/report-cycle-objective.js';
const now=new Date('2026-11-26T15:00:00Z');
const assessment=(id,date,kind,reps,extra={})=>({id,clientId:'c1',revision:1,status:'confirmed',syncStatus:'clean',assessmentType:kind,assessmentDate:date,protocolRecords:[{testId:'chair-stand-30s',side:'not-applicable',variant:'standard-arms-crossed',protocolVersion:'1',configuration:'silla 45 cm',date,valid:true,executionValid:true,trackingComparable:true,adaptationReason:'',stopReason:'',result:{chairHeightCm:45,repetitions:reps,valid:true}}],...extra});
const a=assessment('a','2026-10-01','initial',12),b=assessment('b','2026-11-25','evolution-followup',15);
const state=(records=[a,b])=>({collections:{iriAssessments:records},pendingOperations:[],conflicts:[],rejectedOperations:[]});
const goal={schemaVersion:1,metric:'Levantarse de la silla en 30 s',unit:'reps',direction:'increase',baseline:12,baselineDate:'2026-10-01',target:15,deadline:'2026-11-30',protocol:'Misma silla y técnica',evidenceRef:'a|1|chair-stand-30s:not-applicable:repetitions'};
const cycle={id:'cycle',clientId:'c1',status:'publicado',syncStatus:'clean',publishedAt:'2026-11-01T12:00:00Z',startDate:'2026-11-01',endDate:'2026-11-30',goalMeasurement:goal};
test('GX meta: selección explícita del diagnóstico inicial con unidad y revisión',()=>{
 const options=buildGoalBaselineOptions(state(),'c1',{now});assert.equal(options.length,1);assert.equal(options[0].ref,goal.evidenceRef);assert.equal(options[0].value,12);assert.equal(options[0].unit,'reps');assert.equal(validateGoalEvidenceAnchor(state(),'c1',goal,{now}),true);
 assert.equal(validateGoalEvidenceAnchor(state(),'c1',{...goal,baseline:13},{now}),false);assert.equal(validateGoalEvidenceAnchor(state(),'c1',{...goal,metric:'Otro ejercicio'},{now}),false);
 assert.equal(buildGoalBaselineOptions(state([{...a,revision:undefined},b]),'c1',{now}).length,0);
 assert.equal(validateGoalEvidenceAnchor(state([{...a,revision:2},b]),'c1',goal,{now}),false);
});
test('GX meta: vínculo opcional y formato de referencia estricto',()=>{
 assert.deepEqual(goalMeasurementFromForm(goalMeasurementFormFields({goalMeasurement:goal}),{...cycle,now}),goal);
 for(const evidenceRef of ['a|01|chair-stand-30s:not-applicable:repetitions','a|1|arbitrary','a|1|<script>','a|1|chair-stand-30s:not-applicable:repetitions|extra',null])assert.equal(validateGoalMeasurement({...goal,evidenceRef},{...cycle,now}).ok,false);
 const manual={...goal};delete manual.evidenceRef;assert.equal(validateGoalEvidenceAnchor(state(),'c1',manual,{now}),true);assert.equal(buildGoalMeasurementReview(state(),'c1',{...cycle,goalMeasurement:manual},{now}),null);
});
test('GX meta: umbral observado no equivale a logro',()=>{
 const r=buildGoalMeasurementReview(state(),'c1',cycle,{now});assert.equal(r.value,15);assert.equal(r.delta,3);assert.equal(r.thresholdObserved,true);assert.equal(r.withinDeadline,true);assert.match(goalReviewText(r),/Logro pendiente de revisión profesional/);
 const late=buildGoalMeasurementReview(state(),'c1',{...cycle,goalMeasurement:{...goal,deadline:'2026-11-24'}},{now});assert.equal(late.withinDeadline,false);assert.match(goalReviewText(late),/no acredita cumplimiento en plazo/);
 const unmet=buildGoalMeasurementReview(state(),'c1',{...cycle,goalMeasurement:{...goal,target:16}},{now});assert.equal(unmet.thresholdObserved,false);
});
test('GX meta: no atribuye resultados a otra persona, ciclo no publicado o revisión diferente',()=>{
 for(const c of [{...cycle,client_id:'c2'},{...cycle,status:'borrador'},{...cycle,syncStatus:'pending'},{...cycle,visibleToClient:false},{...cycle,publishedAt:'2026-11-25T08:00:00Z'},{...cycle,goalMeasurement:{...goal,baseline:13}},{...cycle,goalMeasurement:{...goal,evidenceRef:goal.evidenceRef.replace('|1|','|2|')}}])assert.equal(buildGoalMeasurementReview(state(),'c1',c,{now}),null);
 assert.equal(buildGoalMeasurementReview({...state(),pendingOperations:[{entityId:'cycle'}]},'c1',cycle,{now}),null);
});
test('GX meta: no rescata una medición anterior favorable si la última no es comparable',()=>{
 const bad=assessment('c','2026-11-26','evolution-followup',18);bad.protocolRecords[0].configuration='silla 50 cm';bad.protocolRecords[0].result.chairHeightCm=50;
 assert.equal(buildGoalMeasurementReview(state([a,b,bad]),'c1',cycle,{now}),null);
 assert.equal(buildGoalMeasurementReview(state([a,b,{...b,id:'c'}]),'c1',cycle,{now}),null);
 assert.equal(buildGoalMeasurementReview(state([a,{...b,clientId:'c2'}]),'c1',cycle,{now}),null);
 assert.equal(buildGoalMeasurementReview(state([a,{...b,revision:undefined}]),'c1',cycle,{now}),null);
 assert.equal(buildGoalMeasurementReview(state([{...a,server_confirmed:false},b]),'c1',cycle,{now}),null);
 assert.equal(buildGoalMeasurementReview(state([a,{...b,server_confirmed:false}]),'c1',cycle,{now}),null);
 assert.equal(buildReassessmentReview(state(),'c1',{now}).comparisons[0].metricId,'chair-stand-30s:not-applicable:repetitions');
});
test('GX meta: el informe no incorpora la medición fuera de su periodo',()=>{
 const published={...cycle,name:'Fuerza',goal:'Mejorar capacidad funcional',weeklyFrequency:2};
 const s=state();s.collections.trainingCycles=[published];
 const inside=buildReportCycleObjective(s,'c1',{start:'2026-11-24',end:'2026-11-26',now});
 assert.equal(inside.goalReview.value,15);assert.equal(cycleGoalReviewEvidence(inside).source,'iriAssessments');
 const outside=buildReportCycleObjective(s,'c1',{start:'2026-11-26',end:'2026-11-26',now});
 assert.equal(outside.goalReview,null);assert.equal(cycleGoalReviewEvidence(outside),null);
});

const professionalClient='00000000-0000-4000-8000-000000000001',professionalId='00000000-0000-4000-8000-000000000003';
const professionalBaseline={...a,clientId:professionalClient,protocolRecords:a.protocolRecords.map(p=>({...p,protocolVersion:'iri-protocols-2026.10-v3'}))};
const professionalState=state([professionalBaseline]);const professionalCycle={...cycle,clientId:professionalClient};
const professionalObservation={id:professionalId,clientId:professionalClient,measuredAt:'2026-11-25T12:00:00Z',value:15,unit:'reps',revision:1,rectification:null,protocol:{schemaVersion:1,testId:'chair-stand-30s',field:'repetitions',side:'not-applicable',variant:'standard-arms-crossed',protocolVersion:'iri-protocols-2026.10-v3',configuration:'silla 45 cm',adaptationReason:'',setup:{chairHeightCm:45}}};
test('GX meta profesional: compara con el IRI inicial sin insertar reevaluación en IRI',()=>{
 const r=buildProfessionalGoalMeasurementReview(professionalState,professionalClient,professionalCycle,professionalObservation,{now});assert.equal(r.value,15);assert.equal(r.delta,3);assert.equal(r.thresholdObserved,true);assert.equal(r.comparisonScope,'selected-observation');assert.match(goalReviewText(r),/no necesariamente la última/);assert.match(goalReviewText(r),/Logro pendiente/);assert.equal(buildGoalMeasurementReview(professionalState,professionalClient,professionalCycle,{now}),null);
});
test('GX meta profesional: excluye anulaciones, cambios de protocolo, fecha, propietario y revisión',()=>{
 for(const observation of [{...professionalObservation,rectification:{id:'00000000-0000-4000-8000-000000000004',targetId:professionalId,reason:'measurement_error',voidedAt:'2026-11-26T12:00:00Z'}},{...professionalObservation,clientId:'00000000-0000-4000-8000-000000000002'},{...professionalObservation,protocol:{...professionalObservation.protocol,setup:{chairHeightCm:50}}},{...professionalObservation,protocol:{...professionalObservation.protocol,configuration:'otra silla'}},{...professionalObservation,measuredAt:'2026-11-01T12:00:00Z'},{...professionalObservation,revision:2}])assert.equal(buildProfessionalGoalMeasurementReview(professionalState,professionalClient,professionalCycle,observation,{now}),null);
 assert.equal(buildProfessionalGoalMeasurementReview(state([{...professionalBaseline,revision:2}]),professionalClient,professionalCycle,professionalObservation,{now}),null);
 assert.equal(buildProfessionalGoalMeasurementReview(professionalState,professionalClient,{...professionalCycle,status:'borrador'},professionalObservation,{now}),null);
});

const mobilityProtocol={schemaVersion:1,testId:'back-saver',field:'bestCm',side:'left',variant:'box-standard',protocolVersion:'iri-protocols-2026.10-v3',configuration:'cajón 30 cm · cero en planta del pie',adaptationReason:'',setup:{trialCount:3}};
const mobilityRef='a|1|back-saver:left:bestCm';
const mobilityBaseline={...professionalBaseline,protocolRecords:[{...professionalBaseline.protocolRecords[0],testId:mobilityProtocol.testId,side:mobilityProtocol.side,variant:mobilityProtocol.variant,configuration:mobilityProtocol.configuration,result:{bestCm:-8,trials:[-10,-8,-9],valid:true}}]};
const mobilityObservation={...professionalObservation,protocol:mobilityProtocol,unit:'cm',value:-3};
test('GX reevaluación: movilidad con signo conserva medida real sin cambiar metas v1',()=>{
 const s=state([mobilityBaseline]);
 assert.equal(buildGoalBaselineOptions(s,professionalClient,{now}).length,0);
 const options=buildProfessionalBaselineOptions(s,professionalClient,{now});
 assert.equal(options.length,1);assert.equal(options[0].ref,mobilityRef);assert.equal(options[0].value,-8);
 const r=buildProfessionalReassessmentComparison(s,professionalClient,mobilityRef,mobilityObservation,{now});
 assert.equal(r.comparisons[0].previous,-8);assert.equal(r.comparisons[0].value,-3);assert.equal(r.comparisons[0].delta,5);
 assert.equal(r.reviewRequired,true);assert.equal(r.comparisonScope,'selected-observation');
 const crossing=buildProfessionalReassessmentComparison(s,professionalClient,mobilityRef,{...mobilityObservation,value:0},{now});
 assert.equal(crossing.comparisons[0].delta,8);
 const signedGoal={...goal,metric:options[0].metric,unit:'cm',baseline:-8,target:0,evidenceRef:mobilityRef};
 assert.equal(validateGoalMeasurement(signedGoal,{...cycle,now}).ok,false);
});
test('GX reevaluación: valores con signo mantienen restricciones de identidad, revisión, lado y protocolo',()=>{
 const s=state([mobilityBaseline]);
 for(const o of [{...mobilityObservation,clientId:'00000000-0000-4000-8000-000000000002'},
  {...mobilityObservation,protocol:{...mobilityProtocol,side:'right'}},
  {...mobilityObservation,protocol:{...mobilityProtocol,setup:{trialCount:2}}},
  {...mobilityObservation,measuredAt:'2026-10-01T14:00:00Z'},
  {...mobilityObservation,value:-101},
  {...mobilityObservation,rectification:{id:'00000000-0000-4000-8000-000000000004',targetId:professionalId,reason:'measurement_error',voidedAt:'2026-11-26T12:00:00Z'}}])
   assert.equal(buildProfessionalReassessmentComparison(s,professionalClient,mobilityRef,o,{now}),null);
 assert.equal(buildProfessionalReassessmentComparison(state([{...mobilityBaseline,revision:2}]),professionalClient,mobilityRef,mobilityObservation,{now}),null);
 assert.equal(buildProfessionalReassessmentComparison({...s,pendingOperations:[{entityId:'a'}]},professionalClient,mobilityRef,mobilityObservation,{now}),null);
});
