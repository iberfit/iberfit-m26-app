import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveCoachActionNavigation} from '../src/m26/shell/coach-action-center.js';

function state({role='coach',selectedClientId=null}={}){
  return {
    identity:{role},
    hydration:{status:'ready'},
    activeArea:'hoy',
    selectedClientId,
    collections:{clients:[{id:'C1'},{id:'C2'}]},
  };
}

test('Coach Action Center resolves client-scoped targets before mutation',()=>{
  const current=state();
  const plan=resolveCoachActionNavigation(current,{clientId:'C1',targetArea:'planificacion'});
  const agenda=resolveCoachActionNavigation(current,{clientId:'C2',targetArea:'agenda'});
  assert.deepEqual(plan,{clientId:'C1',area:'planificacion'});
  assert.deepEqual(agenda,{clientId:'C2',area:'agenda'});
  assert.equal(current.selectedClientId,null);
});

test('Coach Action Center remains fail-closed for role and client scope',()=>{
  assert.throws(
    ()=>resolveCoachActionNavigation(state({role:'client'}),{clientId:'C1',targetArea:'planificacion'}),
    /M26_COACH_ACTION_FORBIDDEN/u,
  );
  assert.throws(
    ()=>resolveCoachActionNavigation(state(),{clientId:'OTHER',targetArea:'agenda'}),
    /M26_CLIENT_NOT_VISIBLE/u,
  );
  assert.throws(
    ()=>resolveCoachActionNavigation(state(),{clientId:'C1',targetArea:'admin-inicio'}),
    /M26_ROUTE_FORBIDDEN/u,
  );
});

test('Live enhancer exposes semantic UI, accessibility and contextual targets',async()=>{
  const source=await readFile(new URL('../src/m26/shell/coach-action-center.js',import.meta.url),'utf8');
  assert.match(source,/data\.m26CoachActionCenter/u);
  assert.match(source,/aria-labelledby/u);
  assert.match(source,/data\.coachActionType/u);
  assert.match(source,/data\.m26CoachAction/u);
  assert.match(source,/data\.m26TargetArea/u);
  assert.match(source,/coach\.actionCenter\.whyLabel/u);
  assert.match(source,/coach\.actionCenter\.nextLabel/u);
  assert.match(source,/coach\.actionCenter\.ctaAria/u);
});

test('Shell intercepts Coach Action Center before generic client selection',async()=>{
  const source=await readFile(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
  const actionIndex=source.indexOf("event.target.closest?.('[data-m26-coach-action]')");
  const clientIndex=source.indexOf("event.target.closest?.('[data-m26-select-client]')");
  assert.ok(actionIndex>=0&&clientIndex>actionIndex);
  assert.match(source,/resolveCoachActionNavigation\(current/u);
  assert.match(source,/event\.stopPropagation/u);
  assert.match(source,/if\(!sameClient\)store\.selectClient\(decision\.clientId\)/u);
  assert.match(source,/if\(!sameArea\)store\.navigate\(decision\.area\)/u);
});
