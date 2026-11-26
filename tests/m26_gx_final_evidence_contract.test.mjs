import test from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceSignal,observedLoadKg} from '../src/m26/domain/evidence-signal.js';
import {createExecution,startExecution,recordSet,correctSet,advanceExecution,updateActiveSetDraft,getActiveSetDraft} from '../src/m26/workflows/session-execution.js';
import {projectCollectionsForRole,assertClientProjectionSafe} from '../src/m26/security/role-projection.js';
import {buildReassessmentReview,reassessmentReviewEvidence} from '../src/m26/workflows/report-reassessment-evidence.js';
import {protocolSetupIdentity,protocolComparabilityWarnings} from '../src/m26/workflows/iri-protocol-catalog.js';
import {buildCycleFrequencyReview} from '../src/m26/workflows/report-cycle-objective.js';
import {readOriginalExecutionPrescription,reconcileSessionExecutionsForClient} from '../src/m26/domain/session-execution-truth.js';
import {buildReportEvidenceLineage,explicitExecutionCycle} from '../src/m26/workflows/report-evidence-lineage.js';
import {buildPeriodSportProjection,periodSportEvidence,buildPostSessionSportEvidence} from '../src/m26/workflows/report-sport-evidence.js';
const now=new Date('2026-11-26T15:00:00Z');
const signal={id:'x',subjectId:'c1',kind:'strength',sourceType:'sessionExecutions',sourceIds:['a'],periodStart:'2026-11-20',periodEnd:'2026-11-25',value:0,unit:'kg',method:'Registro directo',provenance:'Ejecución confirmada',sampleSize:1,comparabilityKey:'protocolo-1',quality:'medida',confidence:'limitada',interpretationBoundary:'No acredita mejora',decisionUse:'Revisar',methodologyVersion:'v1'};
test('La evidencia conserva cero medido, límites, identidad y muestra; rechaza ausencias y contradicciones',()=>{
 const e=createEvidenceSignal(signal,{now});assert.equal(e.value,0);assert.ok(Object.isFrozen(e));assert.ok(Object.isFrozen(e.sourceIds));
 for(const changes of [{value:null},{value:false},{sourceIds:[]},{sourceIds:['a','a']},{sampleSize:0},{subjectId:''},{unit:''},{periodStart:'2026-11-31'},{periodEnd:'2026-11-27'},{measuredAt:'2026-11-26T16:00:00Z'},{confidence:'inventada'},{interpretationBoundary:''}])assert.equal(createEvidenceSignal({...signal,...changes},{now}),null);
});
function assessment(id,date,kind,reps,extra={}){return {id,clientId:'c1',revision:1,status:'confirmed',syncStatus:'clean',assessmentType:kind,assessmentDate:date,protocolRecords:[{testId:'chair-stand-30s',side:'not-applicable',variant:'standard-arms-crossed',protocolVersion:'1',configuration:'silla 45 cm',date,valid:true,executionValid:true,trackingComparable:true,adaptationReason:'',stopReason:'',result:{chairHeightCm:45,repetitions:reps,valid:true}}],...extra};}
const initial=assessment('a','2026-10-01','initial',12),follow=assessment('b','2026-11-25','evolution-followup',15);
const iriState=records=>({collections:{iriAssessments:records},pendingOperations:[],conflicts:[],rejectedOperations:[]});
test('Reevaluación: compara solo el primer diagnóstico confirmado y seguimiento explícito compatible',()=>{
 const r=buildReassessmentReview(iriState([initial,follow]),'c1',{now});assert.equal(r.comparableCount,1);assert.equal(r.comparisons[0].delta,3);assert.deepEqual(r.comparisons[0].signal.sourceIds,['a','b']);assert.match(reassessmentReviewEvidence(r)[0].text,/Revisión profesional/);
 for(const other of [{...follow,assessmentType:'initial'},{...follow,clientId:'c2'},{...follow,status:'draft'},{...follow,syncStatus:'pending'},{...follow,assessmentDate:'2026-12-01'},{...follow,body:{clientId:'c2'}}])assert.equal(buildReassessmentReview(iriState([initial,other]),'c1',{now}),null);
 for(const p of [{configuration:'silla 50 cm'},{protocolVersion:'2'},{trackingComparable:false},{stopReason:'dolor'},{result:{chairHeightCm:50,repetitions:15,valid:true}},{result:{chairHeightCm:45,repetitions:null,valid:true}}]){const x={...follow,protocolRecords:[{...follow.protocolRecords[0],...p}]};assert.equal(buildReassessmentReview(iriState([initial,x]),'c1',{now}).comparableCount,0);}
 assert.equal(buildReassessmentReview(iriState([initial,follow,{...follow,revision:2,status:'draft'}]),'c1',{now}),null);
 assert.equal(buildReassessmentReview(iriState([initial,follow,{...follow,protocolRecords:[]}]),'c1',{now}),null);
 assert.equal(buildReassessmentReview({...iriState([initial,follow]),pendingOperations:[{command:{entityId:'b'}}]},'c1',{now}),null);
});
const execution=(id,date,extra={})=>({id,clientId:'c1',sessionId:'s1',status:'completed',syncStatus:'clean',completedAt:date+'T15:00:00Z',results:[],...extra});
test('Frecuencia: solo semanas completas posteriores a la publicación, datos confirmados y sin declarar incumplimiento',()=>{
 const state={collections:{sessionExecutions:[execution('a','2026-11-09'),execution('b','2026-11-12'),execution('c','2026-11-16'),execution('d','2026-11-19',{syncStatus:'pending'}),execution('e','2026-11-20',{clientId:'c2'}),execution('f','2026-11-25')]}};
 const r=buildCycleFrequencyReview(state,'c1',{cycleId:'cycle',cycleStart:'2026-11-02',publicationDay:'2026-11-01',frequency:2,start:'2026-11-09',end:'2026-11-26',now});
 assert.deepEqual(r.weeks.map(w=>[w.start,w.count,w.criterionConfirmed]),[['2026-11-09',2,true],['2026-11-16',1,false]]);assert.equal(r.met,1);assert.equal(r.total,2);
});
test('Relaciones de evidencia: no inventa vínculos al ciclo ni duplica prescripciones de una ejecución',()=>{
 const plan={sessionId:'s1',blocks:[{exerciseId:'sq',type:'exercise'}]};const a=execution('a','2026-11-20',{planSnapshot:plan,appointmentId:'appointment'}),b=execution('b','2026-11-21',{planSnapshot:{...plan,cycleId:'cycle'},occurrenceId:'occurrence'}),c=execution('c','2026-11-22',{planSnapshot:{...plan,sessionId:'other'}});
 const graph=buildReportEvidenceLineage({clientId:'c1',baseline:initial,objective:{id:'cycle',sourceAssessmentId:'a'},executions:[a,a,b,c,execution('foreign','2026-11-22',{clientId:'c2'}),execution('pending','2026-11-22',{syncStatus:'pending'})],periodStart:'2026-11-19',periodEnd:'2026-11-26',now});
 assert.equal(graph.coverage.executions,3);assert.equal(graph.coverage.originalPrescriptions,2);assert.equal(graph.coverage.cycleLinks,1);assert.equal(graph.coverage.appointmentReferences,1);assert.equal(graph.coverage.occurrenceReferences,1);assert.equal(graph.coverage.baselineCycleLinked,true);
 assert.ok(graph.links.every(l=>graph.nodes.some(n=>n.key===l.from)&&graph.nodes.some(n=>n.key===l.to)));
});
test('Ciclismo: usa potencia, cadencia, frecuencia cardíaca y distancia medidas; nunca las metas',()=>{
 const rows=['2026-11-19','2026-11-21','2026-11-24'].map((date,i)=>execution('bike'+i,date,{sessionId:'bike',planSnapshot:{sessionId:'bike',blocks:[{type:'exercise',exerciseId:'bike',name:'Ciclismo',sets:1,restSeconds:0,plannedDistanceKm:'20',plannedPowerWatts:'250'}]},results:[{exerciseId:'bike',setNumber:1,distanceKm:10,seconds:1800-i*60,powerWatts:150+i*10,cadenceRpm:80,avgHeartRateBpm:130}]}));
 const p=buildPeriodSportProjection(rows,{clientId:'c1'});assert.equal(p.summary[0].sport,'cycling');assert.equal(p.summary[0].metres,30000);assert.equal(p.comparisons.length,1);assert.equal(p.measurements.find(x=>x.field==='powerWatts').max,170);
 const e=periodSportEvidence(rows,{clientId:'c1'})[0];assert.match(e.label,/Ciclismo/);assert.match(e.text,/Velocidad global/);assert.doesNotMatch(e.text,/250 W/);
 const post=buildPostSessionSportEvidence(rows[0],{clientId:'c1'});assert.ok(post.some(x=>x.text==='150 W'));assert.ok(!post.some(x=>x.text==='250 W'));
});


test('Reevaluación corporal: compara mediciones directas, nunca derivaciones ni equipos distintos',()=>{
 const record=(id,date,kind,extra={},resultExtra={})=>{
  const bodyComposition={method:'Bioimpedancia',device:'Equipo A',measurementConditions:'Ayuno y postura documentados',weightKg:80,bodyFatPercent:25,leanMassKg:60,muscleMassKg:30,waistCm:85,...extra};
  const {weightKg,bodyFatPercent,leanMassKg,muscleMassKg,waistCm}=bodyComposition;
  return assessment(id,date,kind,0,{bodyComposition,protocolRecords:[{...initial.protocolRecords[0],testId:'body-composition',variant:'bioimpedance',configuration:'Equipo A · protocolo de medida',date,result:{weightKg,bodyFatPercent,leanMassKg,muscleMassKg,waistCm,...resultExtra}}]});
 };
 const a=record('a','2026-10-01','initial'),b=record('b','2026-11-25','evolution-followup',{weightKg:78,bodyFatPercent:24,leanMassKg:59.28,waistCm:82});
 const review=x=>buildReassessmentReview(iriState([a,x]),'c1',{now});
 const r=review(b);assert.equal(r.comparableCount,5);assert.equal(r.comparisons.find(x=>x.label==='Peso corporal').delta,-2);const fat=r.comparisons.find(x=>x.label==='Grasa corporal');assert.equal(fat.delta,-1);assert.equal(fat.deltaUnit,'p. p.');assert.equal(fat.signal.unit,'p. p.');
 for(const changes of [{device:'Equipo B'},{method:'Otro método'},{measurementConditions:''},{device:'Sin registrar'},{skipped:true}])assert.equal(review({...b,bodyComposition:{...b.bodyComposition,...changes}}).comparableCount,0);
 const contradictory=review({...b,bodyComposition:{...b.bodyComposition,fatMassKg:40}});assert.deepEqual(contradictory.comparisons.map(x=>x.label),['Peso corporal','Perímetro de cintura']);
 const derived=review({...b,bodyComposition:{...b.bodyComposition,leanMassKg:null}});assert.ok(!derived.comparisons.some(x=>x.label==='Masa libre de grasa'));
 const altered=review({...b,protocolRecords:[{...b.protocolRecords[0],result:{...b.protocolRecords[0].result,weightKg:100}}]});assert.ok(!altered.comparisons.some(x=>x.label==='Peso corporal'));
});
test('1MSTS: el resultado histórico no forma parte de la configuración del protocolo',()=>{
 const p=(date,reps,height=45)=>({...initial.protocolRecords[0],testId:'one-minute-sit-to-stand',variant:'1msts-standard',configuration:'silla '+height+' cm · duración 60 s · repeticiones '+reps,date,result:{chairHeightCm:height,durationSeconds:60,repetitions:reps,valid:true}});
 const a=p('2026-10-01',20),b=p('2026-11-25',25);assert.equal(protocolSetupIdentity(a),protocolSetupIdentity(b));assert.deepEqual(protocolComparabilityWarnings([a],[b]),[]);
 const review=q=>buildReassessmentReview(iriState([{...initial,protocolRecords:[a]},{...follow,protocolRecords:[q]}]),'c1',{now});
 assert.equal(review(b).comparisons[0].delta,5);assert.equal(review({...b,configuration:'silla 45 cm · duración 60 s'}).comparableCount,1);assert.equal(review(p('2026-11-25',25,50)).comparableCount,0);assert.equal(review({...b,configuration:b.configuration+' · apoyo distinto'}).comparableCount,0);assert.equal(review({...b,result:{...b.result,chairHeightCm:null}}).comparableCount,0);
});

test('Las cargas contradictorias entre alias nunca se convierten en evidencia de kilos',()=>{
 for(const row of [{loadKg:40,load_kg:90},{loadKg:40,weightKg:'inválido'},{load:'40 kg',weight:'80 kg'},{loadKg:40,loadUnit:'kg',weight_unit:'lb'},{loadKg:40,loadUnit:'kg',weight_unit:'otra'},{loadKg:40,loadLb:0},{loadKg:40,load:'40 lb'}])assert.equal(observedLoadKg(row),null);
 assert.equal(observedLoadKg({loadKg:0,weightKg:'0',load:'0 kg',loadUnit:'kg',weight_unit:'kilogramos'}),0);
 assert.equal(observedLoadKg({loadKg:40,load:'40,00 kg',weight:'40 kg'}),40);
 assert.equal(observedLoadKg({load:40,loadUnit:'kg'}),40);
 assert.equal(observedLoadKg({load:40}),null);
});

test('El cumplimiento de frecuencia del ciclo requiere un vínculo explícito en la prescripción original',()=>{
 const plan={sessionId:'s1',cycleId:'cycle',blocks:[{exerciseId:'sq',type:'exercise'}]};
 const a=execution('a','2026-11-09',{planSnapshot:plan}),b=execution('b','2026-11-10',{planSnapshot:plan}),c=execution('c','2026-11-16'),d=execution('d','2026-11-17',{planSnapshot:{...plan,cycleId:'other'}}),e=execution('e','2026-11-18',{planSnapshot:plan,cycleId:'other'});
 for(const r of [c,d,e])assert.notEqual(explicitExecutionCycle(r,'c1'),'cycle');
 assert.equal(explicitExecutionCycle(a,'c1'),'cycle');
 assert.equal(explicitExecutionCycle({...a,body:{clientId:'c2'}},'c1'),null);
 assert.equal(explicitExecutionCycle({...a,planSnapshot:{...plan,cycle_id:'other'}},'c1'),null);
 assert.equal(explicitExecutionCycle({...a,planSnapshot:{...plan,sessionId:'other'}},'c1'),null);
 const state={collections:{sessionExecutions:[a,b,c,d,e]}};
 const r=buildCycleFrequencyReview(state,'c1',{cycleId:'cycle',cycleStart:'2026-11-02',publicationDay:'2026-11-01',frequency:2,start:'2026-11-09',end:'2026-11-26',now});
 assert.deepEqual(r.weeks.map(w=>[w.count,w.linkedCount,w.linkedCriterionConfirmed]),[[2,2,true],[3,0,false]]);assert.equal(r.met,2);assert.equal(r.linkedMet,1);assert.deepEqual(r.linkedSignal.sourceIds,['a','b']);
});
test('La trazabilidad no elige arbitrariamente una ejecución contradictoria a igual revisión',()=>{
 const plan={sessionId:'s1',cycleId:'cycle',blocks:[{exerciseId:'sq',type:'exercise'}]};
 const a=execution('a','2026-11-20',{revision:1,planSnapshot:plan}),b={...a,planSnapshot:{...plan,cycleId:'other'}};
 const build=executions=>buildReportEvidenceLineage({clientId:'c1',objective:{id:'cycle'},executions,periodStart:'2026-11-19',periodEnd:'2026-11-26',now});
 for(const rows of [[a,b],[b,a]]){const g=build(rows);assert.equal(g.coverage.executions,0);assert.equal(g.coverage.conflictingExecutions,1);assert.equal(g.coverage.cycleLinks,0);}
 assert.equal(build([a,a]).coverage.cycleLinks,1);
 assert.equal(build([a,{...b,revision:2}]).coverage.cycleLinks,0);
});

test('Las copias de la misma revisión no pueden ocultar referencias incompatibles de ciclo ni identidad',()=>{
 const plan={sessionId:'s1',cycleId:'cycle',blocks:[{exerciseId:'sq',type:'exercise'}]};
 const a=execution('a','2026-11-09',{revision:1,planSnapshot:plan,cycleId:'cycle'}),b={...a,cycle_id:'other'};
 const make=rows=>buildCycleFrequencyReview({collections:{sessionExecutions:rows}},'c1',{cycleId:'cycle',cycleStart:'2026-11-02',publicationDay:'2026-11-01',frequency:1,start:'2026-11-09',end:'2026-11-26',now});
 for(const rows of [[a,b],[b,a]]){const r=make(rows);assert.equal(r.met,0);assert.equal(r.linkedMet,0);assert.equal(r.linkedSignal,null);}
 assert.equal(make([a,{...a,body:{clientId:'c1',cycle_id:'cycle',plan_snapshot:plan}}]).linkedMet,1);
 assert.equal(make([{...a,body:{client_id:'other'}}]).met,0);
 assert.equal(make([{...a,execution_id:'other'}]).met,0);
});

test('El contexto realmente registrado permanece separado de la prescripción y de la siguiente serie',()=>{
 const session={id:'s-context',clientId:'c1',cycleId:'cycle-a',blocks:[{id:'b',type:'exercise',exerciseId:'squat',name:'Sentadilla',measurementProfile:'strength',sets:2,reps:'8',variantId:'prescrita',equipmentId:'prescrito'}]};
 const e=createExecution({session,clientId:'c1',executionId:'e-context'});assert.equal(e.planSnapshot.cycleId,'cycle-a');
 assert.equal(createExecution({session:{...session,cycle_id:'cycle-b'},clientId:'c1'}).planSnapshot.cycleId,undefined);
 assert.equal(createExecution({session:{...session,cycleId:undefined},clientId:'c1'}).planSnapshot.cycleId,undefined);
 startExecution(e);const context={variantId:'Agarre neutro',equipmentId:'Mancuernas',loadBasis:'per-hand',side:'bilateral'};
 updateActiveSetDraft(e,session,{...context,reps:8,rpe:7});assert.equal(getActiveSetDraft(e,session).values.variantId,context.variantId);
 recordSet(e,session,{...context,reps:8,load:'20 kg',rpe:7});let row=Object.values(e.results)[0];assert.equal(row.variantId,context.variantId);assert.equal(row.loadBasis,'per-hand');
 correctSet(e,session,{...context,loadBasis:'assistance',reps:8,load:'20 kg',rpe:7});row=Object.values(e.results)[0];assert.equal(row.loadBasis,'assistance');
 advanceExecution(e);recordSet(e,session,{reps:8,load:'20 kg',rpe:8});const second=Object.values(e.results).find(r=>r.setNumber===2);assert.equal(second.variantId,undefined);assert.equal(second.loadBasis,undefined);
});
test('La proyección del cliente conserva contexto observado permitido y no objetos ni notas privadas',()=>{
 const user={id:'user-c1',role:'client',clientId:'c1'},own={id:'e1',clientId:'c1',status:'completed',results:[{exerciseId:'squat',setNumber:1,reps:8,loadBasis:'per-hand',side:'bilateral',variantId:'Agarre neutro',equipmentId:'Mancuernas',notes:'PRIVADO'},{exerciseId:'squat',setNumber:2,skipped:true,serverConfirmed:false,loadBasis:'inválida',variantId:{secret:'PRIVADO'},equipmentId:'<script>'}]};
 const p=projectCollectionsForRole({sessionExecutions:[own,{...own,id:'foreign',clientId:'c2'}]},user);assertClientProjectionSafe(p,user);assert.equal(p.sessionExecutions.length,1);const [a,b]=p.sessionExecutions[0].results;assert.equal(a.loadBasis,'per-hand');assert.equal(a.variantId,'Agarre neutro');assert.equal(b.skipped,true);assert.equal(b.serverConfirmed,false);assert.equal(b.variantId,undefined);assert.equal(b.equipmentId,undefined);assert.equal(b.loadBasis,undefined);assert.doesNotMatch(JSON.stringify(p),/PRIVADO/);
});

test('La unidad de carga es explícita y no transforma libras, valores ambiguos ni ausencia en kilogramos',()=>{
 const session={id:'s-units',clientId:'c1',blocks:[{id:'b',type:'exercise',exerciseId:'squat',name:'Sentadilla',measurementProfile:'strength',sets:1,reps:'8'}]};
 const result=(load,loadUnit)=>{const e=createExecution({session,clientId:'c1'});startExecution(e);recordSet(e,session,{reps:8,rpe:7,load,loadUnit});return Object.values(e.results)[0];};
 assert.equal(observedLoadKg(result('20','kg')),20);
 assert.equal(observedLoadKg(result('20','lb')),null);
 assert.equal(observedLoadKg(result('20 lb','kg')),null);
 assert.equal(observedLoadKg(result('20',undefined)),null);
 assert.equal(observedLoadKg(result('0','kg')),0);
 assert.equal(result('','kg').loadUnit,undefined);
 const user={id:'u',role:'client',clientId:'c1'},p=projectCollectionsForRole({sessionExecutions:[{id:'e',clientId:'c1',status:'completed',results:[result('20','kg'),result('20','lb')]}]},user);
 assert.equal(p.sessionExecutions[0].results[0].loadUnit,'kg');assert.equal(observedLoadKg(p.sessionExecutions[0].results[0]),20);assert.equal(observedLoadKg(p.sessionExecutions[0].results[1]),null);
});

function datedSourceExecution(extra={}){
 const block={type:'exercise',id:'run-block',exerciseId:'run',name:'Carrera suave',sets:1,restSeconds:0,plannedDistanceKm:'5'};
 return {id:'dated-a',clientId:'c1',sessionId:'run-session',occurrenceId:'occurrence-a',sourceRevision:3,revision:4,status:'completed',syncStatus:'clean',completedAt:'2026-11-24T15:00:00Z',sourceSnapshot:{clientId:'c1',sessionId:'run-session',cycleId:'cycle',blocks:[block],queue:[{blockId:'run-block',exerciseId:'run',sets:1,prescription:{measurementProfile:'running'}}]},results:[{exerciseId:'run',setNumber:1,distanceKm:5,seconds:1800}],...extra};
}
test('GX fuente fechada: utiliza la prescripción histórica y no el plan vigente',()=>{
 const e=datedSourceExecution();assert.equal(readOriginalExecutionPrescription(e).kind,'dated');assert.equal(explicitExecutionCycle(e,'c1'),'cycle');
 assert.equal(buildPeriodSportProjection([e],{clientId:'c1'}).summary[0].metres,5000);
 assert.ok(buildPostSessionSportEvidence(e,{clientId:'c1'}).some(x=>x.text.includes('5 km')));
 const graph=buildReportEvidenceLineage({clientId:'c1',objective:{id:'cycle'},executions:[e],periodStart:'2026-11-19',periodEnd:'2026-11-26',now});
 assert.equal(graph.coverage.originalPrescriptions,1);assert.equal(graph.coverage.cycleLinks,1);
});
test('GX fuente fechada: no rescata fuentes contradictorias ni resultados antiguos',()=>{
 const e=datedSourceExecution();for(const bad of [{...e,sourceRevision:null},{...e,occurrenceId:null},{...e,source_snapshot:{...e.sourceSnapshot,cycleId:'other'}},{...e,body:{sourceSnapshot:{...e.sourceSnapshot,clientId:'other'}}},{...e,planSnapshot:{sessionId:'run-session',blocks:e.sourceSnapshot.blocks}},{...e,sourceSnapshot:{...e.sourceSnapshot,sessionId:'other'}},{...e,sourceSnapshot:{...e.sourceSnapshot,queue:[]}},{...e,cycleId:'other'}]){
  assert.equal(readOriginalExecutionPrescription(bad).kind,'invalid');assert.equal(explicitExecutionCycle(bad,'c1'),null);
  assert.equal(buildPeriodSportProjection([bad],{clientId:'c1'}).summary.length,0);
  assert.equal(buildPostSessionSportEvidence({...bad,sport:'running',distanceKm:99,durationSeconds:10},{clientId:'c1'}).length,0);
 }
});
test('GX fuente fechada: revisiones idénticas incompatibles se aíslan',()=>{
 const e=datedSourceExecution(),other={...e,sourceSnapshot:{...e.sourceSnapshot,cycleId:'other'}};
 for(const rows of [[e,other],[other,e]]){const r=reconcileSessionExecutionsForClient({collections:{sessionExecutions:rows}},'c1');assert.equal(r.records.length,0);assert.equal(r.conflicts.length,1);}
 assert.equal(readOriginalExecutionPrescription({sessionId:'s',planSnapshot:{sessionId:'s',blocks:[{type:'exercise'}]}}).kind,'legacy');
 assert.equal(readOriginalExecutionPrescription({sessionId:'s'}).kind,'absent');
});

test('GX fuente fechada: la cola original debe corresponder a bloques, ejercicio, orden y series',()=>{
 const e=datedSourceExecution(),snapshot=e.sourceSnapshot;
 for(const queue of [[{...snapshot.queue[0],sets:2}],[{...snapshot.queue[0],exerciseId:'other'}],[{...snapshot.queue[0],blockId:'other'}],[{...snapshot.queue[0],prescription:null}],[...snapshot.queue,...snapshot.queue]]){
  assert.equal(readOriginalExecutionPrescription({...e,sourceSnapshot:{...snapshot,queue}}).kind,'invalid');
 }
 const block={id:'g',type:'biserie',rounds:2,exerciseIds:['a','b'],prescriptions:{a:{},b:{}}};
 const queue=block.exerciseIds.map((exerciseId,groupOrder)=>({blockId:'g',exerciseId,sets:2,groupType:'biserie',groupOrder,groupSize:2,prescription:{}}));
 const grouped={...e,sourceSnapshot:{...snapshot,blocks:[block],queue}};
 assert.equal(readOriginalExecutionPrescription(grouped).kind,'dated');
 assert.equal(readOriginalExecutionPrescription({...grouped,sourceSnapshot:{...grouped.sourceSnapshot,queue:queue.slice().reverse()}}).kind,'invalid');
});
