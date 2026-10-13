import test from 'node:test';
import assert from 'node:assert/strict';
import {clientHealthSummary,clientsOverview} from '../src/m26/modules/domain-selectors.js';
import {deriveClientExperience,experienceNextAction} from '../src/m26/experience/client-experience.js';
import {createSessionDraft,addCatalogExercise,addTrainingGroup,updateSessionBlock} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const NOW=new Date('2026-10-13T13:00:00.000Z');
const cid='m33-client';
const exercise={id:'squat',name_es:'Sentadilla',name:'Sentadilla',pattern:'squat',cues:[]};
const row={id:'row',name_es:'Remo',name:'Remo',pattern:'pull',cues:[]};
const catalog={
  get:id=>id==='squat'?exercise:id==='row'?row:null,
  has:id=>id==='squat'||id==='row',
  list:()=>[exercise,row],search:()=>[exercise,row],
};
const guided={
  id:'m33-guided',clientId:cid,status:'publicado',visibleToClient:true,
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  blocks:[{id:'b1',type:'exercise',exerciseId:'squat',name:'Sentadilla',sets:3,reps:'10'}],
};
const supervised={...guided,id:'m33-supervised',deliveryModality:'presencial',deliveryOwnership:'coach_led'};
function state({sessions=[guided],appointments=[],service='active'}={}){
  return {selectedClientId:cid,collections:{
    clients:[{id:cid,name:'Cliente M33',trainingServiceStatus:service}],
    clientProfiles:[{id:'profile-m33',clientId:cid,completeness:100}],
    trainingCycles:[{id:'cycle-m33',clientId:cid,status:'active',startDate:'2026-10-01',endDate:'2026-11-01'}],
    sessions,appointments,iriAssessments:[],reports:[],clientAccess:[],sessionExecutions:[],
  }};
}
test('M33: single-client and indexed portfolio agree that a real guided session requires no appointment',()=>{
  const s=state();
  const single=clientHealthSummary(s,cid,NOW);
  const portfolio=clientsOverview(s,NOW)[0];
  assert.equal(single.autonomousSessionReady,true);
  assert.equal(portfolio.autonomousSessionReady,true);
  for(const summary of [single,portfolio]){
    const e=deriveClientExperience(summary);
    assert.equal(e.stage,'active');
    assert.equal(e.readiness.autonomousSession,true);
    assert.equal(e.readiness.nextAppointment,false);
    assert.ok(!e.attention.includes('appointment'));
    assert.equal(e.process.percentage,100);
    const action=experienceNextAction(e,{role:'client'});
    assert.equal(action.key,'open_autonomous_workout');
    assert.equal(action.area,'sesion');
    assert.notEqual(experienceNextAction(e,{role:'admin'}).key,'schedule_appointment');
    assert.notEqual(experienceNextAction(e,{role:'coach'}).key,'schedule_appointment');
  }
});
test('M33: supervised-only training preserves appointment follow-up and never implies autonomous execution',()=>{
  const e=deriveClientExperience(clientHealthSummary(state({sessions:[supervised]}),cid,NOW));
  assert.equal(e.stage,'scheduling');
  assert.equal(e.readiness.autonomousSession,false);
  assert.ok(e.attention.includes('appointment'));
  assert.equal(experienceNextAction(e,{role:'coach'}).key,'schedule_appointment');
  assert.equal(experienceNextAction(e,{role:'admin'}).key,'schedule_appointment');
});
test('M33: an unpublished, hidden, empty or contradictory autonomous session cannot satisfy readiness',()=>{
  for(const session of [
    {...guided,status:'draft'},
    {...guided,visibleToClient:false},
    {...guided,blocks:[]},
    {...guided,deliveryModality:'presencial'},
    {...guided,deliveryOwnership:'coach_led'},
  ]){
    const s=state({sessions:[session]});
    assert.equal(clientHealthSummary(s,cid,NOW).autonomousSessionReady,false);
    assert.equal(clientsOverview(s,NOW)[0].autonomousSessionReady,false);
    assert.equal(deriveClientExperience(clientHealthSummary(s,cid,NOW)).stage,'scheduling');
  }
});
test('M33: paused training and Solo IRI cannot gain training readiness from a stale published workout',()=>{
  const paused=deriveClientExperience(clientHealthSummary(state({service:'paused'}),cid,NOW));
  assert.equal(paused.readiness.autonomousSession,false);
  const iri=deriveClientExperience(clientHealthSummary(state({service:'none'}),cid,NOW));
  assert.equal(iri.serviceKind,'none');
  assert.equal(iri.stage,'evaluation');
  assert.equal(experienceNextAction(iri,{role:'client'}).key,'review_iri');
});
test('M33: zero rest and zero RIR survive builder edits into the execution snapshot',()=>{
  const draft=createSessionDraft({clientId:cid});
  addCatalogExercise(draft,'squat',catalog,{sets:2,reps:'8',restSeconds:0,targetRpe:8,targetRir:0});
  assert.equal(draft.blocks[0].restSeconds,0);
  assert.equal(draft.blocks[0].targetRir,0);
  const execution=createExecution({session:draft,clientId:cid});
  assert.equal(execution.queue[0].prescription.restSeconds,0);
  assert.equal(execution.queue[0].prescription.targetRir,0);
  assert.equal(execution.planSnapshot.queue[0].prescription.targetRir,0);
});
test('M33: blank inputs do not silently prescribe RIR 0 or zero-second rest',()=>{
  const draft=createSessionDraft({clientId:cid});
  addCatalogExercise(draft,'squat',catalog,{sets:2,reps:'8',restSeconds:85,targetRpe:8,targetRir:2});
  const blockId=draft.blocks[0].id;
  for(const [field,value] of [['restSeconds',''],['targetRir',''],['targetRir','   '],['restSeconds',null]]){
    updateSessionBlock(draft,{blockId,field,value,catalog});
  }
  assert.equal(draft.blocks[0].restSeconds,85);
  assert.equal(draft.blocks[0].targetRir,2);
  updateSessionBlock(draft,{blockId,field:'restSeconds',value:'0',catalog});
  updateSessionBlock(draft,{blockId,field:'targetRir',value:'0',catalog});
  assert.equal(draft.blocks[0].restSeconds,0);
  assert.equal(draft.blocks[0].targetRir,0);
});
test('M33: grouped prescriptions respect real zero and prevent blank overwrite',()=>{
  const draft=createSessionDraft({clientId:cid});
  addTrainingGroup(draft,'biserie',['squat','row']);
  const blockId=draft.blocks[0].id;
  for(const exerciseId of ['squat','row']){
    updateSessionBlock(draft,{blockId,exerciseId,field:'targetRir',value:0,catalog});
    updateSessionBlock(draft,{blockId,exerciseId,field:'restSeconds',value:0,catalog});
    updateSessionBlock(draft,{blockId,exerciseId,field:'targetRir',value:'',catalog});
    updateSessionBlock(draft,{blockId,exerciseId,field:'restSeconds',value:'',catalog});
    assert.equal(draft.blocks[0].prescriptions[exerciseId].targetRir,0);
    assert.equal(draft.blocks[0].prescriptions[exerciseId].restSeconds,0);
  }
  const execution=createExecution({session:draft,clientId:cid});
  assert.equal(execution.queue.length,2);
  assert.ok(execution.queue.every(x=>x.prescription.targetRir===0&&x.prescription.restSeconds===0));
});
test('M33: Live Workout never calls a default an explicit goal when the prescription is absent',()=>{
  const draft=createSessionDraft({clientId:cid});
  addCatalogExercise(draft,'squat',catalog,{sets:2,reps:'8',targetRpe:8,targetRir:2,restSeconds:90});
  const execution=createExecution({session:draft,clientId:cid});
  startExecution(execution);
  delete execution.queue[0].prescription.targetRpe;
  delete execution.queue[0].prescription.targetRir;
  delete execution.queue[0].prescription.restSeconds;
  const html=renderGuidedExecution({execution,session:draft,catalog,role:'client'});
  assert.match(html,/placeholder="RPE real"/);
  assert.match(html,/placeholder="RIR real"/);
  assert.doesNotMatch(html,/placeholder="Objetivo 7"/);
  assert.doesNotMatch(html,/Descanso previsto<\/span>/);
  const coachHtml=renderGuidedExecution({execution,session:draft,catalog,role:'coach'});
  assert.match(coachHtml,/placeholder="RPE real"/);
  assert.doesNotMatch(coachHtml,/placeholder="Objetivo 7"/);
});
test('M33: explicit RIR 0 and rest 0 remain visible as intentional clinical prescription',()=>{
  const draft=createSessionDraft({clientId:cid});
  addCatalogExercise(draft,'squat',catalog,{sets:2,reps:'8',targetRpe:8,targetRir:0,restSeconds:0});
  const execution=createExecution({session:draft,clientId:cid});
  startExecution(execution);
  const html=renderGuidedExecution({execution,session:draft,catalog,role:'client'});
  assert.match(html,/placeholder="Objetivo 0"/);
  assert.match(html,/Descanso previsto<\/span>/);
  assert.match(html,/>0 s<\/strong>/);
});
