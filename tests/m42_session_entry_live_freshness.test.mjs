import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCurrentSessionForEntry} from '../src/m26/workflows/session-entry-freshness.js';
const owner='11111111-1111-4111-8111-111111111111';
const base={id:'SESSION-A',clientId:owner,status:'disponible',revision:3,body:{blocks:[{id:'B1'}]}};
const state=items=>({collections:{sessions:items}});
const resolve=(items,requested=base,clientId=owner)=>resolveCurrentSessionForEntry({state:state(items),requested,clientId});
test('M42 obtains latest authorized published record after async recovery',()=>{
 assert.strictEqual(resolve([base]),base);
 const published={...base,status:'publicado'};
 assert.strictEqual(resolve([published]),published);
});
test('M42 delayed click cannot open session removed or withdrawn during recovery',()=>{
 assert.throws(()=>resolve([]),/M42_SESSION_NO_LONGER_VISIBLE/);
 assert.throws(()=>resolve([{...base,status:'retirado'}]),/M42_SESSION_NO_LONGER_AVAILABLE/);
 assert.throws(()=>resolve([{...base,status:'en_curso'}]),/M42_SESSION_NO_LONGER_AVAILABLE/);
});
test('M42 refuses stale revision and cross-client reassignment after click',()=>{
 assert.throws(()=>resolve([{...base,revision:4}]),/M42_SESSION_UPDATED_REOPEN/);
 assert.throws(()=>resolve([{...base,clientId:'other-client'}]),/M26_SESSION_CLIENT_MISMATCH/);
 assert.throws(()=>resolve([base],{...base,clientId:'other-client'}),/M26_SESSION_CLIENT_MISMATCH/);
});
test('M42 refuses duplicate or malformed session resolution',()=>{
 assert.throws(()=>resolve([base,base]),/M42_SESSION_NO_LONGER_VISIBLE/);
 assert.throws(()=>resolve([base],{...base,id:''}),/M42_SESSION_ENTRY_TARGET_INVALID/);
});
