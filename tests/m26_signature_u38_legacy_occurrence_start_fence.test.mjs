import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {legacyStartNeedsOccurrence} from '../src/m26/rc39/session-policy.js';
import {augmentRc39ViewModel} from '../src/m26/rc39/view-model.js';
import {renderRc39Route} from '../src/m26/rc39/route-render.js';

const CLIENT='10000000-0000-4000-8000-000000000101';
const OTHER='10000000-0000-4000-8000-000000000102';
const SESSION='10000000-0000-4000-8000-000000000103';
const source={id:SESSION,clientId:CLIENT,status:'disponible',title:'Fuerza recurrente',revision:2,
  deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
  visibleToClient:true,clientVisibilityLevel:'full',
  blocks:[{type:'exercise',exerciseId:'squat',sets:3}]};
const appointment=(id,day,status='confirmada',extra={})=>({
  id,sessionId:SESSION,clientId:CLIENT,status,startAt:day,
  endAt:new Date(Date.parse(day)+3600000).toISOString(),visibleToClient:true,...extra,
});
const a=appointment('first','2026-10-27T15:00:00Z');
const b=appointment('second','2026-11-03T15:00:00Z');

test('U38 detects independent appointments but not duplicated rows or other clients/sessions',()=>{
  const check=appointments=>legacyStartNeedsOccurrence({
    appointments,sessionId:SESSION,clientId:CLIENT,
  });
  assert.equal(check([a]),false);
  assert.equal(check([a,{...a}]),false);
  assert.equal(check([a,b]),true);
  assert.equal(check([a,appointment('private','2026-11-10T15:00:00Z','propuesta')]),false);
  assert.equal(check([a,appointment('cancel','2026-11-10T15:00:00Z','cancelada')]),false);
  assert.equal(check([a,appointment('foreign','2026-11-10T15:00:00Z','confirmada',{clientId:OTHER})]),false);
  assert.equal(check([a,appointment('other-session','2026-11-10T15:00:00Z','confirmada',{sessionId:OTHER})]),false);
  assert.equal(check([a,appointment('completed','2026-10-13T15:00:00Z','realizada')]),true);
  assert.equal(check([a,appointment('private-confirmed','2026-11-10T15:00:00Z','confirmada',{visibleToClient:false})]),true);
});

test('U38 a provisioned occurrence never falls through to the legacy executor',()=>{
  const args={appointments:[a],sessionId:SESSION,clientId:CLIENT};
  assert.equal(legacyStartNeedsOccurrence(args),false);
  assert.equal(legacyStartNeedsOccurrence({...args,occurrences:[{
    id:'one',sessionId:SESSION,clientId:CLIENT,status:'confirmada',
  }]}),true);
  assert.equal(legacyStartNeedsOccurrence({...args,occurrences:[{
    id:'one',sessionId:SESSION,clientId:CLIENT,status:'cancelada',
  }]}),true,'cancelled occurrence history also fences the legacy executor');
});

test('U38 Coach and Client renderers share the start fence when two real appointments exist',()=>{
  for(const role of ['client','coach']){
    const state={identity:{role,clientId:CLIENT},selectedClientId:role==='coach'?CLIENT:null,
      collections:{sessions:[source],appointments:[a,b]}};
    const vm=augmentRc39ViewModel({kind:'sesion',role,selectedClientId:CLIENT},
      {identity:{role,clientId:CLIENT}},state,new Date('2026-10-25T12:00:00Z'));
    assert.equal(vm.rc39.sessionProjections.length,1);
    assert.equal(vm.rc39.sessionProjections[0].recurringAwaitingActivation,true);
    assert.equal(vm.rc39.sessionProjections[0].canClientStart,false);
    const html=renderRc39Route({...vm,kind:'sesion',role,selectedClientId:CLIENT,serviceActive:true});
    assert.equal((html.match(/data-workflow-action="start-published-session"/g)||[]).length,0);
  }
});

test('U38 workflow entry checks current state before emitting m26:start-session',()=>{
  const src=readFileSync(new URL('../src/m26/app/workflow-controller.js',import.meta.url),'utf8');
  const fragment=src.slice(src.indexOf('async function startSession(button){'),
    src.indexOf('function generateIntelligence(){'));
  assert.match(fragment,/legacyStartNeedsOccurrence\(/u);
  assert.match(fragment,/M26_OCCURRENCE_EXECUTOR_REQUIRED/u);
  assert.ok(fragment.indexOf('legacyStartNeedsOccurrence(')<fragment.indexOf("emit(root,'m26:start-session'"));
  assert.match(fragment,/state\.collections\?\.appointments\|\|\[\]/u);
});

test('U38 UNIVERSAL direct workspace event enforces the same multi-date fence before creating an execution',()=>{
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.match(app,/normalizePublishedSessionForExecution,legacyStartNeedsOccurrence/u);
  const start=app.indexOf('async function onStartSession(event){');
  const end=app.indexOf('function surfaceRoleSwitchError(',start);
  assert.ok(start>=0&&end>start);
  const fragment=app.slice(start,end);
  const fence=fragment.indexOf('if(legacyStartNeedsOccurrence({');
  const creation=fragment.indexOf('execution:createExecution({');
  assert.ok(fence>=0&&creation>fence,'No new shared execution before dated-occurrence validation');
  assert.match(fragment,/appointments:entryState\.collections\?\.appointments\|\|\[\]/u);
  assert.match(fragment,/entryState\.collections\?\.trainingOccurrences/u);
  assert.match(fragment,/M26_OCCURRENCE_EXECUTOR_REQUIRED/u);
  assert.ok(fragment.indexOf('if(recovered){')<fence,'A proven recovery remains available');
  assert.ok(fragment.indexOf('if(String(currentCandidate?.status')<fence,'An authenticated active recovery remains available');
});
