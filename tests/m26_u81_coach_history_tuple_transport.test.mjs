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
