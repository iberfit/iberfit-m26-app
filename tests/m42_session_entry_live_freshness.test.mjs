import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCurrentSessionForEntry,resolveRecoveredSessionForEntry} from '../src/m26/workflows/session-entry-freshness.js';
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

const guided={...base,deliveryOwnership:'guided_in_app',deliveryModality:'guiada_en_app',clientVisibilityLevel:'full',visibleToClient:true};
const saved=(session=guided,clientId=owner)=>({session,execution:{id:'EX1',sessionId:session.id,clientId,status:'active'}});
test('M42 recovered execution opens only exact current session and unchanged revision',()=>{
 assert.strictEqual(resolveRecoveredSessionForEntry({state:state([guided]),snapshot:saved(),clientId:owner,requestedId:'SESSION-A'}),guided);
 assert.throws(()=>resolveRecoveredSessionForEntry({state:state([guided]),snapshot:saved(),clientId:owner,requestedId:'SESSION-B'}),/RECOVERY_OTHER_SESSION_ACTIVE/);
 assert.throws(()=>resolveRecoveredSessionForEntry({state:state([{...guided,revision:4}]),snapshot:saved(),clientId:owner}),/SESSION_UPDATED_REOPEN/);
});
test('M42 recovered execution never resurrects withdrawn or supervised sessions',()=>{
 assert.throws(()=>resolveRecoveredSessionForEntry({state:state([{...guided,status:'withdrawn'}]),snapshot:saved(),clientId:owner}),/SESSION_NO_LONGER_AVAILABLE/);
 assert.throws(()=>resolveRecoveredSessionForEntry({state:state([{...guided,deliveryOwnership:'coach_led',clientVisibilityLevel:'summary_only'}]),snapshot:saved(),clientId:owner}),/RECOVERY_NO_LONGER_EXECUTABLE/);
 assert.throws(()=>resolveRecoveredSessionForEntry({state:state([{...guided,visibleToClient:false}]),snapshot:saved(),clientId:owner}),/RECOVERY_NO_LONGER_EXECUTABLE/);
});
test('M42 recovered execution rejects cross-client, malformed or forged snapshots',()=>{
 assert.throws(()=>resolveRecoveredSessionForEntry({state:state([guided]),snapshot:saved(guided,'another'),clientId:owner}),/RECOVERY_SNAPSHOT_SCOPE_INVALID/);
 assert.throws(()=>resolveRecoveredSessionForEntry({state:state([guided]),snapshot:{session:guided,execution:{sessionId:'MISMATCH',clientId:owner}},clientId:owner}),/RECOVERY_SNAPSHOT_SCOPE_INVALID/);
 assert.throws(()=>resolveRecoveredSessionForEntry({state:state([]),snapshot:saved(),clientId:owner}),/SESSION_NO_LONGER_VISIBLE/);
});


test('M42 lets an existing execution recover when publication is en_curso, never start another',()=>{
 const inProgress={...guided,status:'en_curso'};
 assert.throws(()=>resolve([inProgress],guided),/SESSION_NO_LONGER_AVAILABLE/);
 const ongoing=saved({...guided},owner);
 assert.strictEqual(resolveRecoveredSessionForEntry({state:state([inProgress]),snapshot:ongoing,clientId:owner}),inProgress);
 for(const status of ['paused','awaiting_feedback']){
   assert.strictEqual(resolveRecoveredSessionForEntry({state:state([inProgress]),snapshot:{...ongoing,execution:{...ongoing.execution,status}},clientId:owner}),inProgress);
 }
 assert.throws(()=>resolveRecoveredSessionForEntry({state:state([inProgress]),snapshot:{...ongoing,execution:{...ongoing.execution,status:'ready'}},clientId:owner}),/SESSION_NO_LONGER_AVAILABLE/);
});

test('M42 recovery uses normalized effective permission, not inconsistent raw flags',()=>{
 const record={...guided,status:'disponible'};
 const scope=saved(guided);
 for(const denied of [
  {...record,deliveryModality:'presencial',deliveryOwnership:'guided_in_app'},
  {...record,deliveryOwnership:'coach_led',clientVisibilityLevel:'full'},
  {...record,clientVisibilityLevel:'hidden'},
  {...record,visibleToClient:'false'},
  {...record,deliveryOwnership:'unknown_mode'},
 ]){
   assert.throws(()=>resolveRecoveredSessionForEntry({state:state([denied]),snapshot:scope,clientId:owner}),/RECOVERY_NO_LONGER_EXECUTABLE/);
 }
 assert.throws(()=>resolveRecoveredSessionForEntry({state:state([record]),snapshot:scope,clientId:owner,role:'admin'}),/RECOVERY_ROLE_FORBIDDEN/);
});
