import test from 'node:test';
import assert from 'node:assert/strict';
import {createExecution} from '../src/m26/workflows/session-execution.js';
import {createExecutionSnapshot,validateExecutionSnapshot,reconcileExecutionSnapshots,createExecutionRecoveryStore} from '../src/m26/workflows/session-recovery.js';
import {createMemoryKeyValueStore} from '../src/m26/platform/key-value-store.js';
const now=new Date('2026-11-25T12:00:00Z'),session={id:'s',clientId:'c',blocks:[{id:'b',type:'exercise',exerciseId:'squat',sets:2,reps:'10',restSeconds:60,targetRpe:7,targetRir:3}]};
const snapshot=(ownerId='owner',executionId='ex')=>createExecutionSnapshot({execution:createExecution({session,clientId:'c',executionId}),session,ownerId,savedAt:now});
test('GX30 invalid singleton never activates recovery',()=>{
 const valid=snapshot();assert.equal(reconcileExecutionSnapshots({local:valid}).kind,'local');assert.equal(reconcileExecutionSnapshots({remote:valid}).kind,'remote');
 for(const invalid of [{...valid,savedAt:null},{...valid,ownerId:''},{...valid,execution:{...valid.execution,status:'unknown'}},{...valid,session:{...valid.session,id:'wrong'}}]){
   assert.equal(validateExecutionSnapshot(invalid).ok,false);
   assert.equal(reconcileExecutionSnapshots({remote:invalid}).kind,'invalid');
 }
});
test('GX30 wrong key or owner never opens or erases another execution snapshot',async()=>{
 const storage=createMemoryKeyValueStore();const store=createExecutionRecoveryStore({storage,ownerId:'owner',now:()=>now});
 const foreign=snapshot('owner:other','ex'),miskey=snapshot('owner','actual');
 await storage.set('m26:execution:owner:other:ex',foreign);await storage.set('m26:execution:owner:wrong',miskey);
 assert.equal(await store.load('wrong'),null);assert.deepEqual(await store.list(),[]);assert.equal(await store.purgeExpired(),0);
 assert.deepEqual(await storage.get('m26:execution:owner:other:ex'),foreign);assert.deepEqual(await storage.get('m26:execution:owner:wrong'),miskey);
});
