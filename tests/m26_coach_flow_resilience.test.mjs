import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanonicalStore} from '../src/m26/canonical-store.js';
import {createProductionState} from '../src/m26/production-state.js';
import {resolveM26Route} from '../src/m26/shell/route-guard.js';

function authenticatedCoachState(){
  const base=createProductionState();
  return createProductionState({
    hydration:{status:'ready',error:null,confirmedAt:'2026-09-02T00:00:00.000Z',serverTime:null},
    identity:{id:'USR-COACH-1',name:'Coach QA',role:'coach',authorizedRoles:['admin','coach']},
    activeArea:'hoy',
    collections:{...base.collections,clients:[{id:'CLI-1',name:'Cliente QA'}]},
    selectedClientId:'CLI-1',
  });
}

test('Coach stays usable while authenticated data is revalidating',()=>{
  const store=createCanonicalStore(authenticatedCoachState());

  store.setHydration('loading');
  const refreshing=store.getState();

  assert.equal(refreshing.hydration.status,'ready');
  assert.equal(refreshing.hydration.refreshing,true);
  assert.equal(refreshing.hydration.error,null);
  assert.equal(resolveM26Route(refreshing).area,'hoy');
  assert.notEqual(resolveM26Route(refreshing).area,'acceso');
});

test('Coach keeps the last authorized snapshot after a transient refresh failure',()=>{
  const store=createCanonicalStore(authenticatedCoachState());

  store.setHydration('loading');
  store.setHydration('error',new Error('M26_TIMEOUT'));
  const recovered=store.getState();

  assert.equal(recovered.hydration.status,'ready');
  assert.equal(recovered.hydration.refreshing,false);
  assert.equal(recovered.hydration.error,'M26_TIMEOUT');
  assert.equal(recovered.identity.role,'coach');
  assert.equal(resolveM26Route(recovered).area,'hoy');
});

test('authorization loss remains fail-closed',()=>{
  const store=createCanonicalStore(authenticatedCoachState());
  const error=Object.assign(new Error('M26_HTTP_401'),{status:401});

  store.setHydration('error',error);
  const rejected=store.getState();

  assert.equal(rejected.hydration.status,'error');
  assert.equal(rejected.hydration.refreshing,false);
  assert.equal(resolveM26Route(rejected).area,'acceso');
  assert.equal(resolveM26Route(rejected).allowed,false);
});
