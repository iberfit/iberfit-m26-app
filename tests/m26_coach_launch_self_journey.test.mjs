import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveCoachSelfLaunchJourney,
  coachLaunchSelfCopy,
  coachLaunchSelfLanguages,
} from '../src/m26/experience/coach-launch-self.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';

function state(overrides={}){
  return {
    identity:{id:'coach-1',role:'coach',name:'Coach IBERFIT'},
    hydration:{serverTime:'2026-09-06T12:00:00.000Z'},
    collections:{
      clients:[],sessions:[],appointments:[],sessionExecutions:[],
      checkins:[],iriAssessments:[],wearableDailySummaries:[],
      ...overrides.collections,
    },
    pendingOperations:[],conflicts:[],rejectedOperations:[],
    ...overrides,
  };
}

test('Coach self-launch is role scoped and treats the current authenticated session as activation evidence',()=>{
  assert.equal(deriveCoachSelfLaunchJourney({
    state:state({identity:{id:'client-1',role:'client'}}),
    identity:{id:'client-1',role:'client'},
    now:new Date('2026-09-06T12:00:00Z'),
  }),null);

  const journey=deriveCoachSelfLaunchJourney({
    state:state(),
    identity:{id:'coach-1',role:'coach'},
    now:new Date('2026-09-06T12:00:00Z'),
  });
  assert.equal(journey.ready,false);
  assert.equal(journey.source,'authenticated-coach-bootstrap');
  assert.equal(journey.milestones.find((item)=>item.id==='invited').complete,true);
  assert.equal(journey.milestones.find((item)=>item.id==='activated').complete,true);
  assert.equal(journey.milestones.find((item)=>item.id==='profile').complete,false);
  assert.equal(journey.profileVerified,false);
  assert.equal(journey.accountStatusVerified,false);
  assert.equal(journey.nextCoachAction.area,'clientes');
});

test('Coach self-launch recognises authorised client, published planning and only confirmed completed execution',()=>{
  const completeState=state({
    collections:{
      clients:[{id:'client-1',name:'Ana'}],
      sessions:[{id:'session-1',clientId:'client-1',status:'publicado',publishedAt:'2026-09-04T10:00:00Z'}],
      appointments:[],
      sessionExecutions:[{id:'execution-1',clientId:'client-1',status:'completed',completedAt:'2026-09-05T10:00:00Z',syncStatus:'clean'}],
      checkins:[],iriAssessments:[],wearableDailySummaries:[],
    },
  });
  const journey=deriveCoachSelfLaunchJourney({
    state:completeState,
    identity:completeState.identity,
    now:new Date('2026-09-06T12:00:00Z'),
  });
  const milestones=new Map(journey.milestones.map((item)=>[item.id,item.complete]));
  assert.equal(milestones.get('client'),true);
  assert.equal(milestones.get('planning'),true);
  assert.equal(milestones.get('session'),true);
  assert.equal(milestones.get('profile'),false);
  assert.equal(journey.completedCount,5);
  assert.equal(journey.percent,83);
  assert.equal(journey.ready,false);
  assert.equal(journey.nextCoachAction,null);
  assert.equal(journey.completedSessionEvidence,true);

  const pendingState={
    ...completeState,
    pendingOperations:[{type:'EJECUCION_COMPLETAR',entityId:'execution-1'}],
  };
  const pending=deriveCoachSelfLaunchJourney({
    state:pendingState,
    identity:pendingState.identity,
    now:new Date('2026-09-06T12:00:00Z'),
  });
  assert.equal(pending.milestones.find((item)=>item.id==='session').complete,false);
  assert.equal(pending.completedSessionEvidence,false);
  assert.equal(pending.nextCoachAction.area,'agenda');
});

test('Coach self-launch never treats drafts as first published planning',()=>{
  const draftState=state({
    collections:{
      clients:[{id:'client-1',name:'Ana'}],
      sessions:[{id:'session-draft',clientId:'client-1',status:'borrador'}],
      appointments:[],sessionExecutions:[],checkins:[],iriAssessments:[],wearableDailySummaries:[],
    },
  });
  const journey=deriveCoachSelfLaunchJourney({
    state:draftState,
    identity:draftState.identity,
    now:new Date('2026-09-06T12:00:00Z'),
  });
  assert.equal(journey.milestones.find((item)=>item.id==='planning').complete,false);
  assert.equal(journey.publishedPlanningEvidenceCount,0);
  assert.equal(journey.nextCoachAction.area,'planificacion');
});

test('Coach self-launch copy is complete in Spanish, English, French and Portuguese',()=>{
  assert.deepEqual(coachLaunchSelfLanguages(),['es','en','fr','pt']);
  for(const language of coachLaunchSelfLanguages()){
    const copy=coachLaunchSelfCopy(language);
    assert.ok(copy.eyebrow);
    assert.ok(copy.title);
    assert.ok(copy.adminCopy);
    assert.equal(typeof copy.progress,'function');
    for(const id of ['invited','activated','profile','client','planning','session']){
      assert.ok(copy.milestones[id]?.label);
      assert.ok(copy.milestones[id]?.done);
      assert.ok(copy.milestones[id]?.pending);
    }
  }
});

test('Coach Hoy keeps the canonical Today surface and injects the self-launch panel without replacing it',()=>{
  const sourceState=state();
  const journey=deriveCoachSelfLaunchJourney({
    state:sourceState,
    identity:sourceState.identity,
    now:new Date('2026-09-06T12:00:00Z'),
  });
  const markup=renderRc39Route({
    kind:'hoy',role:'coach',clients:[],appointments:[],proposals:[],upcoming:[],
    operations:{pending:0,conflicts:0,rejected:0},
    coachCockpit:null,
    rc39:{coachLaunchJourney:journey},
  });
  assert.match(markup,/data-coach-launch-self=/u);
  assert.match(markup,/Tu recorrido como Coach/u);
  assert.match(markup,/Prioridades de hoy/u);
  assert.match(markup,/Control operativo/u);
  assert.match(markup,/Pendiente de verificación administrativa/u);
});
