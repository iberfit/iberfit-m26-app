import test from 'node:test';
import assert from 'node:assert/strict';
import {
 compactQaCanonicalExecutionSummaries,
 expandQaCanonicalExecutionSummaries,
 __qaCanonicalSummaryTransportInternals as internals,
} from '../src/m26/domain/qa-canonical-summary-transport.js';

const ID='11111111-1111-4111-8111-111111111111';
const ENTITY='22222222-2222-4222-8222-222222222222';
const ACTOR='33333333-3333-4333-8333-333333333333';
const snapshot=(role='coach')=>({
 environment:'QA',user:{role},
 canary:{active:true,scope:'allowlist'},
 data:{clients:[{id:ID}],m26Entities:[],domainEvents:[],sessionExecutions:[]},
});
function richRows(kind,size=1600){
 return Array.from({length:size},(_,i)=>kind==='domainEvents'?{
  id:String(i+1),client_id:ID,actor_user_id:ACTOR,
  operation_id:ENTITY,entity_id:ENTITY,
  command_type:i%2?'OCURRENCIA_COMPLETAR':'OCURRENCIA_GUARDAR_PROGRESO',
  entity_type:'session_execution',actor_role:'coach',phase:'confirmed',
  from_status:'en_curso',to_status:'completada',reason:null,
  details:{source:'test',annotation:'cierre íntegro'},
  created_at:'2026-11-05T10:00:00Z',
 }:{
  entityId:ENTITY,clientId:ID,entityType:'session_execution',
  status:'completada',revision:i,updatedAt:'2026-11-05T10:00:00Z',
  body:{id:ENTITY,clientId:ID,revision:i,actual:{description:'dato conservado'.repeat(24)}},
 });
}
test('U81: long QA Coach events compact losslessly, under same 20MB wire policy',()=>{
 const src=snapshot();src.data.domainEvents=richRows('domainEvents',2000);
 const original=JSON.parse(JSON.stringify(src));
 const compressed=compactQaCanonicalExecutionSummaries(src);
 const marker=internals.HISTORY_PACKS.domainEvents;
 assert.equal(compressed.data.domainEvents.length,1);
 assert.ok(Object.hasOwn(compressed.data.domainEvents[0],marker));
 assert.ok(JSON.stringify(compressed).length<JSON.stringify(src).length*0.7);
 assert.deepEqual(expandQaCanonicalExecutionSummaries(compressed),original);
 assert.deepEqual(src,original);
});
test('U81: large entity and event arrays both decode before summary lineage validation',()=>{
 const src=snapshot();
 src.data.domainEvents=richRows('domainEvents',1600);
 src.data.m26Entities=richRows('m26Entities',1000);
 const compact=compactQaCanonicalExecutionSummaries(src);
 assert.ok(Object.hasOwn(compact.data.m26Entities[0],internals.HISTORY_PACKS.m26Entities));
 assert.deepEqual(expandQaCanonicalExecutionSummaries(compact),src);
});
test('U81: Client, Admin, PROD and non-allowlisted context cannot decode Coach tuples',()=>{
 const src=snapshot();src.data.domainEvents=richRows('domainEvents');
 const compact=compactQaCanonicalExecutionSummaries(src);
 for(const mutations of [
  {user:{role:'client'}},
  {user:{role:'admin'}},
  {environment:'PRODUCTION'},
  {canary:{active:true,scope:'public'}},
 ]){
  const changed={...compact,...mutations};
  assert.throws(()=>expandQaCanonicalExecutionSummaries(changed),/U81_QA_HISTORY_TUPLE_INVALID/u);
 }
 assert.deepEqual(compactQaCanonicalExecutionSummaries({...src,user:{role:'client'}}).data.domainEvents,src.data.domainEvents);
});
test('U81: malicious shape, owner, column and dictionary mutations always fail closed',()=>{
 const src=snapshot();src.data.domainEvents=richRows('domainEvents');
 const compact=compactQaCanonicalExecutionSummaries(src);
 const marker=internals.HISTORY_PACKS.domainEvents;
 const tamper=change=>{
  const data=structuredClone(compact),packet=data.data.domainEvents[0][marker];change(packet,data);
  assert.throws(()=>expandQaCanonicalExecutionSummaries(data),/U81_QA_HISTORY_TUPLE_INVALID/u);
 };
 tamper(packet=>packet.columns.push('__proto__'));
 tamper(packet=>packet.columns[0]='client_id');
 tamper(packet=>packet.rows[0].pop());
 tamper((packet,data)=>{data.data.clients=[{id:ACTOR}];});
 tamper(packet=>{packet.dictionaries[0]=['a','a'];});
 tamper(packet=>packet.rows.push(...Array.from({length:internals.MAX_TUPLE_ROWS},()=>packet.rows[0])));
});
test('U81: no invented data, no hidden truncation and normal short snapshots unchanged',()=>{
 const src=snapshot();
 assert.deepEqual(compactQaCanonicalExecutionSummaries(src),src);
 const empty=expandQaCanonicalExecutionSummaries(src);
 assert.deepEqual(empty,src);
 assert.equal(empty.data.domainEvents.length,0);
});


test('U82 QA scoped Coach nested same-record aliases are lossless, revision-preserving and strictly opt-in',()=>{
 const sessionId='44444444-4444-4444-8444-444444444444';
 const repeated=Array.from({length:12},(_,i)=>({exerciseId:String(i),sets:Array.from({length:5},(_,j)=>({rep:j+4,loadKg:35,timeSec:60,feedback:'confirmed'}))}));
 const queue=structuredClone(repeated),results=structuredClone(repeated);
 const sourceSnapshot=structuredClone(repeated);
 const planSnapshot={queue:structuredClone(queue),blocks:structuredClone(sourceSnapshot),title:'QA scoped snapshot'};
 const progressSnapshot={planSnapshot:structuredClone(planSnapshot),queue:structuredClone(queue),results:structuredClone(results)};
 const exec={id:ENTITY,clientId:ID,sessionId,revision:4,queue,results,sourceSnapshot,planSnapshot,progressSnapshot};
 const plan={id:sessionId,clientId:ID,blocks:structuredClone(repeated),publishedSnapshot:structuredClone(repeated)};
 const src=snapshot();
 src.data.m26Entities=[
   {entityType:'session',entityId:sessionId,clientId:ID,revision:2,body:plan},
   {entityType:'session_execution',entityId:ENTITY,clientId:ID,revision:4,body:exec},
 ];
 src.data.sessionExecutions=[
   {id:ENTITY,client_id:ID,session_id:sessionId,revision:4,summary:structuredClone(exec)},
 ];
 const saved=compactQaCanonicalExecutionSummaries(src);
 assert.equal(saved.data.__iberfitQaHistoryNestedRefsV1,1);
 assert.ok(JSON.stringify(saved).length<JSON.stringify(src).length*0.62);
 assert.deepEqual(expandQaCanonicalExecutionSummaries(saved),src);
 assert.deepEqual(src.data.m26Entities[1].body.progressSnapshot,progressSnapshot);
 assert.equal(saved.data.sessionExecutions[0].summary.__iberfitQaCanonicalExecutionSummaryRefV1,ENTITY);
 const client={...saved,user:{role:'client'}};
 assert.throws(()=>expandQaCanonicalExecutionSummaries(client),/U82_QA_HISTORY_NESTED_INVALID/);
 const tamper=structuredClone(saved);
 tamper.data.m26Entities[1].body.planSnapshot.queue.__iberfitQaHistoryNestedRefV1='wrong';
 assert.throws(()=>expandQaCanonicalExecutionSummaries(tamper),/U82_QA_HISTORY_NESTED_INVALID/);
 const missing=structuredClone(saved);
 delete missing.data.m26Entities[1].body.queue;
 assert.throws(()=>expandQaCanonicalExecutionSummaries(missing),/U82_QA_HISTORY_NESTED_INVALID/);
});

test('U82 never aliases mismatched progress or plan content and does not alter normal Client/PROD transport',()=>{
 const original=snapshot();
 original.data.m26Entities=[{entityType:'session',entityId:ENTITY,clientId:ID,body:{
    blocks:[{reps:6,load:35}],publishedSnapshot:[{reps:5,load:35}],
 }}];
 const encoded=compactQaCanonicalExecutionSummaries(original);
 assert.deepEqual(encoded,original);
 const prod={...original,environment:'PRODUCTION'};
 const client={...original,user:{role:'client'}};
 assert.deepEqual(compactQaCanonicalExecutionSummaries(prod),prod);
 assert.deepEqual(compactQaCanonicalExecutionSummaries(client),client);
});
