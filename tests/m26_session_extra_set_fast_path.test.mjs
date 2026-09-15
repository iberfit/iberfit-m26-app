import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  addExtraSetAndAdvance,
  beginRest,
  createExecution,
  currentStep,
  executionResultForStep,
  recordSet,
  startExecution,
} from '../src/m26/workflows/session-execution.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';
import {M26_ACTION_REGISTRY,assertActionAllowed} from '../src/m26/ui/interactive-audit.js';

const exercise={
  id:'exercise-extra-set',
  name_es:'Peso muerto de prueba',
  pattern:'hinge',
  cues:[],
};
const catalog={
  get(id){return id===exercise.id?exercise:null;},
  search(){return [];},
};

function makeSession({sets=1}={}){
  return {
    id:'session-extra-set',
    clientId:'client-extra-set',
    title:'Sesión extra set',
    durationMinutes:45,
    status:'published',
    blocks:[{
      type:'exercise',
      id:'block-extra-set',
      exerciseId:exercise.id,
      sets,
      reps:'8',
      restSeconds:75,
      tempo:'controlado',
      targetRpe:7,
      targetRir:3,
    }],
  };
}

function recordedLastSet({sets=1}={}){
  const session=makeSession({sets});
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-extra-set'});
  startExecution(execution,{actor:{role:'coach',userId:'coach-1'}});
  if(sets>1){
    for(let i=1;i<sets;i+=1){
      recordSet(execution,session,{reps:8,load:'40 kg',rpe:7,rir:3,actor:{role:'coach',userId:'coach-1'}});
      execution.setIndex+=1;
    }
  }
  recordSet(execution,session,{reps:8,load:'40 kg',rpe:8,rir:2,actor:{role:'coach',userId:'coach-1'}});
  beginRest(execution,75,{actor:{role:'coach',userId:'coach-1'}});
  return {session,execution};
}

test('Coach can add one extra set and advance to it atomically from the recorded last set',()=>{
  const {session,execution}=recordedLastSet();
  const beforeEvents=execution.events.length;
  addExtraSetAndAdvance(execution,session,{actor:{role:'coach',userId:'coach-1'}});

  assert.equal(execution.queue[0].sets,2);
  assert.equal(execution.index,0);
  assert.equal(execution.setIndex,1);
  assert.equal(execution.restUntil,null);
  const step=currentStep(execution,session);
  assert.equal(step.setNumber,2);
  assert.equal(step.totalSets,2);
  assert.equal(executionResultForStep(execution,step),null);
  assert.equal(execution.events.length,beforeEvents+3);
  assert.deepEqual(execution.events.slice(-3).map((event)=>event.type),[
    'SET_ADDED',
    'STEP_ADVANCED',
    'EXTRA_SET_STARTED',
  ]);
  assert.equal(execution.events.at(-1)?.actor?.role,'coach');
  assert.deepEqual(execution.events.at(-1)?.payload,{
    exerciseId:exercise.id,
    previousTotalSets:1,
    totalSets:2,
    setNumber:2,
  });
});

test('extra-set fast path is Coach-only and fails before mutating for Client',()=>{
  const {session,execution}=recordedLastSet();
  assert.throws(
    ()=>addExtraSetAndAdvance(execution,session,{actor:{role:'client',userId:'client-1'}}),
    /M26_EXECUTION_COACH_ACTION_REQUIRED/,
  );
  assert.equal(execution.queue[0].sets,1);
  assert.equal(execution.setIndex,0);
  assert.ok(execution.restUntil);
});

test('extra-set fast path requires the current last set to be recorded',()=>{
  const session=makeSession();
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-extra-unrecorded'});
  startExecution(execution,{actor:{role:'coach',userId:'coach-1'}});
  assert.throws(
    ()=>addExtraSetAndAdvance(execution,session,{actor:{role:'coach',userId:'coach-1'}}),
    /M26_EXECUTION_SET_NOT_RECORDED/,
  );
  assert.equal(execution.queue[0].sets,1);
  assert.equal(execution.setIndex,0);
});

test('extra-set fast path is only valid on the last planned set',()=>{
  const session=makeSession({sets:2});
  const execution=createExecution({session,clientId:session.clientId,executionId:'execution-extra-not-last'});
  startExecution(execution,{actor:{role:'coach',userId:'coach-1'}});
  recordSet(execution,session,{reps:8,rpe:7,actor:{role:'coach',userId:'coach-1'}});
  beginRest(execution,75,{actor:{role:'coach',userId:'coach-1'}});
  assert.throws(
    ()=>addExtraSetAndAdvance(execution,session,{actor:{role:'coach',userId:'coach-1'}}),
    /M26_EXECUTION_EXTRA_SET_LAST_SET_REQUIRED/,
  );
  assert.equal(execution.queue[0].sets,2);
  assert.equal(execution.setIndex,0);
});

test('Session Live shows one-tap extra set only to Coach on the recorded last set',()=>{
  const session=makeSession();
  const fresh=createExecution({session,clientId:session.clientId,executionId:'execution-extra-ui-fresh'});
  startExecution(fresh,{actor:{role:'coach',userId:'coach-1'}});
  const freshHtml=renderGuidedExecution({execution:fresh,session,catalog,role:'coach'});
  assert.doesNotMatch(freshHtml,/data-session-action="extra-set-now"/);

  const {execution}=recordedLastSet();
  const coachHtml=renderGuidedExecution({execution,session,catalog,role:'coach'});
  assert.match(coachHtml,/data-session-action="extra-set-now"/);
  assert.match(coachHtml,/>\+ 1 serie y seguir<\/button>/);
  assert.match(coachHtml,/aria-label="Añadir una serie extra y continuar directamente con ella"/);

  const clientHtml=renderGuidedExecution({execution,session,catalog,role:'client'});
  assert.doesNotMatch(clientHtml,/data-session-action="extra-set-now"/);

  const twoSetSession=makeSession({sets:2});
  const firstSetExecution=createExecution({session:twoSetSession,clientId:twoSetSession.clientId,executionId:'execution-extra-ui-not-last'});
  startExecution(firstSetExecution,{actor:{role:'coach',userId:'coach-1'}});
  recordSet(firstSetExecution,twoSetSession,{reps:8,rpe:7,actor:{role:'coach',userId:'coach-1'}});
  beginRest(firstSetExecution,75,{actor:{role:'coach',userId:'coach-1'}});
  const notLastHtml=renderGuidedExecution({execution:firstSetExecution,session:twoSetSession,catalog,role:'coach'});
  assert.doesNotMatch(notLastHtml,/data-session-action="extra-set-now"/);
});

test('controller routes one-tap extra set through normal progress persistence',()=>{
  const {session,execution}=recordedLastSet();
  const outcome=dispatchSessionAction({
    action:'extra-set-now',
    execution,
    session,
    catalog,
    actor:{role:'coach',userId:'coach-1'},
    commandBus:null,
  });
  assert.equal(outcome.kind,'execution');
  assert.equal(execution.queue[0].sets,2);
  assert.equal(currentStep(execution,session)?.setNumber,2);
  assert.equal(execution.events.at(-1)?.type,'EXTRA_SET_STARTED');
});

test('interactive audit keeps the fast path Coach-only',()=>{
  assert.deepEqual(M26_ACTION_REGISTRY['extra-set-now'],{roles:['coach'],domain:'execution'});
  assert.equal(assertActionAllowed('extra-set-now','coach'),true);
  assert.equal(assertActionAllowed('extra-set-now','client'),false);
  assert.equal(assertActionAllowed('extra-set-now','admin'),false);
});

test('extra-set fast path visible copy is translated in all supported languages',()=>{
  const cases=[
    ['+ 1 serie y seguir','+ 1 set and continue','+ 1 série et continuer','+ 1 série e continuar'],
    ['Añadir una serie extra y continuar directamente con ella','Add one extra set and continue directly with it','Ajouter une série supplémentaire et continuer directement avec elle','Adicionar uma série extra e continuar diretamente com ela'],
  ];
  for(const [es,en,fr,pt] of cases){
    assert.equal(iberfitSurfaceTranslate(es,{language:'en'}),en);
    assert.equal(iberfitSurfaceTranslate(es,{language:'fr'}),fr);
    assert.equal(iberfitSurfaceTranslate(es,{language:'pt'}),pt);
  }
});

test('extra-set fast action keeps explicit mobile touch geometry',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/premium-ux.css',import.meta.url),'utf8');
  assert.match(css,/\.m26-session-extra-set-action\{/);
  assert.match(css,/@media \(max-width:580px\)[\s\S]*\.m26-session-extra-set-action\{[\s\S]*grid-column:1 \/ -1/);
});
