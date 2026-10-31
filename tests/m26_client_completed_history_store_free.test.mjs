import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanonicalStore} from '../src/m26/canonical-store.js';
import {createProductionState} from '../src/m26/production-state.js';
const id='00000000-0000-4000-8000-000000000001',owner='00000000-0000-4000-8000-000000000002';
test('store refuses historical data from stale auth/hydration',()=>{
 const base=createProductionState({identity:{id:owner,clientId:id,role:'client'},
  hydration:{status:'ready',confirmedAt:'2026-10-31T03:00:00Z'},
  collections:{clients:[{id}],sessions:[],sessionExecutions:[],trainingCycles:[],m26Entities:[]}});
 const store=createCanonicalStore(base);
 assert.throws(()=>store.incorporateClientCompletedHistory({
  ownerId:'foreign',clientId:id,confirmedAt:'2026-10-31T03:00:00Z',sections:{session:[]}}),
 /HYDRATION_OR_OWNER_CHANGED/);
 assert.equal(store.getState().collections.sessions.length,0);
});
