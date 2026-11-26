import test from 'node:test';
import assert from 'node:assert/strict';
import {GOAL_FORM_FIELDS,validateGoalMeasurement,goalMeasurementFormFields,goalMeasurementFromForm,readGoalMeasurement,sameGoalMeasurement,goalMeasurementText} from '../src/m26/planning/goal-measurement.js';
import {validateCycleDraft,buildCycleCommand} from '../src/m26/workflows/planning-workflow.js';
import {projectCollectionsForRole} from '../src/m26/security/role-projection.js';
const now=new Date('2026-11-26T15:00:00Z');
const dates={startDate:'2026-11-01',endDate:'2026-12-31',now};
const goal={schemaVersion:1,metric:'Sentadilla con barra',unit:'kg',direction:'increase',baseline:40,baselineDate:'2026-11-01',target:50,deadline:'2026-12-31',protocol:'8 repeticiones, barra y técnica iguales'};
const cycle={id:'cycle',clientId:'c1',name:'Fuerza',goal:'Ganar fuerza',startDate:dates.startDate,endDate:dates.endDate,status:'publicado',goalMeasurement:goal};
test('GX meta: preserva línea base, protocolo, unidad y cero explícito',()=>{
 const g={...goal,baseline:0};const r=validateGoalMeasurement(g,dates);assert.equal(r.ok,true);assert.equal(r.value.baseline,0);
 assert.deepEqual(goalMeasurementFromForm(goalMeasurementFormFields({goalMeasurement:g}),dates),g);
 assert.equal(goalMeasurementFromForm(goalMeasurementFormFields({}),dates),null);
 assert.equal(goalMeasurementFromForm({},dates),undefined);
 assert.equal(GOAL_FORM_FIELDS.length,9);
});
test('GX meta: rechaza definición incompleta, fecha imposible, unidad o dirección inválidas',()=>{
 for(const bad of [{...goal,protocol:''},{...goal,unit:'__proto__'},{...goal,baselineDate:'2026-12-01'},{...goal,deadline:'2026-12-32'},{...goal,deadline:'2027-01-01'},{...goal,target:39},{...goal,baseline:false},{...goal,unit:'percent',target:101},{...goal,unit:'reps',baseline:2.5},{...goal,privateNotes:'secreto'}])assert.equal(validateGoalMeasurement(bad,dates).ok,false);
 assert.throws(()=>goalMeasurementFromForm({goalMetric:'Sentadilla'},dates),/M26_GOAL_MEASUREMENT_INVALID/);
});
test('GX meta: comando de ciclo normaliza datos y conserva compatibilidad histórica',()=>{
 const draft={...cycle,goalMeasurement:{...goal,baseline:'40',target:'50'}};
 assert.equal(validateCycleDraft(draft).ok,true);assert.deepEqual(buildCycleCommand(draft).payload.draft.goalMeasurement,goal);
 assert.equal(validateCycleDraft({...draft,goalMeasurement:{...goal,target:10}}).ok,false);
 const legacy={...cycle};delete legacy.goalMeasurement;assert.equal(validateCycleDraft(legacy).ok,true);assert.equal(Object.hasOwn(buildCycleCommand(legacy).payload.draft,'goalMeasurement'),false);
 assert.equal(buildCycleCommand({...draft,goalMeasurement:null}).payload.draft.goalMeasurement,null);
});
test('GX meta: lectura solo exacta, sin notas privadas o contradicciones de propietario y fecha',()=>{
 assert.deepEqual(readGoalMeasurement(cycle,{clientId:'c1',now}),goal);
 assert.equal(readGoalMeasurement({...cycle,body:{goalMeasurement:{...goal,target:60}}},{clientId:'c1',now}),null);
 assert.equal(readGoalMeasurement({...cycle,client_id:'c2'},{clientId:'c1',now}),null);
 assert.equal(readGoalMeasurement({...cycle,end_date:'2027-01-01'},{clientId:'c1',now}),null);
 assert.equal(readGoalMeasurement({...cycle,goalMeasurement:{...goal,privateNotes:'privado'}},{clientId:'c1',now}),null);
 assert.equal(sameGoalMeasurement(cycle,{goalMeasurement:{...goal,target:60}}),false);
 assert.equal(sameGoalMeasurement(cycle,{goalMeasurement:goal}),true);
 assert.equal(sameGoalMeasurement(cycle,{goalMeasurement:null}),false);
 assert.match(goalMeasurementText(goal),/Línea base declarada; logro pendiente de revisión profesional/);
});
test('GX meta: cliente solo ve definición publicada y autorizada',()=>{
 const identity={role:'client',clientId:'c1',id:'u1'};
 const projected=projectCollectionsForRole({trainingCycles:[cycle,{...cycle,id:'draft',status:'borrador'},{...cycle,id:'other',clientId:'c2'},{...cycle,id:'bad',goalMeasurement:{...goal,privateNotes:'privado'}}]},identity).trainingCycles;
 assert.equal(projected.length,2);assert.deepEqual(projected[0].goalMeasurement,goal);assert.equal(Object.hasOwn(projected[1],'goalMeasurement'),false);
});
test('GX meta: referencia interna de evidencia nunca se proyecta al cliente',()=>{
 const linked={...goal,evidenceRef:'a|1|chair-stand-30s:not-applicable:repetitions'};
 const identity={role:'client',clientId:'c1',id:'u1'};
 const projected=projectCollectionsForRole({trainingCycles:[{...cycle,goalMeasurement:linked}]},identity).trainingCycles;
 assert.equal(projected.length,1);assert.deepEqual(projected[0].goalMeasurement,goal);
 assert.equal(Object.hasOwn(projected[0].goalMeasurement,'evidenceRef'),false);
});
