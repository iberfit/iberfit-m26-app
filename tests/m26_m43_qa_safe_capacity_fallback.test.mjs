
import test from 'node:test';
import assert from 'node:assert/strict';
import {selectM43QaFixtureForSafeCapacity,M43_SYNTHETIC_SESSION_LIMIT} from '../scripts/remote-gates/m43-qa-fixture-safety.mjs';
import {verifyWriterEvidence} from '../scripts/remote-gates/m43-writer-handoff.mjs';
const A='57f56a87-d04e-47d5-b1cc-8d4939d7c804',B='c0000000-0000-4000-8000-000000000998';
const RUN='43547010445',SHA='a'.repeat(40);
const entity=(id,i)=>({entityType:'session',clientId:id,status:'completada',
  body:{title:'IBERFIT QA M43 · historical-other-'+i}});
function snapshot(id,n=0){
 return {environment:'QA',user:{role:'cliente',clientId:id},
  data:{clients:[{id,trainingServiceStatus:'active'}],
    m26Entities:Array.from({length:n},(_,i)=>entity(id,i))}};
}
const pick=(a,b)=>selectM43QaFixtureForSafeCapacity(a,b,{runId:RUN});
test('M43 shifts only to independently eligible QA B when three new fixtures cannot fit on A',()=>{
 const a=snapshot(A,148),b=snapshot(B,18),result=pick(a,b);
 assert.equal(M43_SYNTHETIC_SESSION_LIMIT,150);
 assert.deepEqual(result,{label:'B',reason:'QA_PRIMARY_BUDGET_SAFE_FALLBACK'});
 assert.equal(pick(snapshot(A,147),b).label,'A');
 assert.equal(pick(snapshot(A,150),b).label,'B');
 assert.equal(a.data.m26Entities.length,148,'original history unchanged');
 assert.equal(b.data.m26Entities.length,18,'secondary history unchanged');
});
test('M43 never substitutes an unsafe or untrusted B for capacity, even when A is full',()=>{
 const mutators=[
  b=>{b.environment='PRODUCTION';},
  b=>{b.environment=null;},
  b=>{b.user.role='coach';},
  b=>{b.user.clientId=A;},
  b=>{b.data.clients[0].trainingServiceStatus='paused';},
  b=>{b.data.m26Entities=null;},
  b=>{b.data.m26Entities.push({entityType:'session',clientId:A,body:{title:'foreign'}});},
  b=>{b.data.m26Entities.push({entityType:'session_execution',clientId:B,status:'pausada'});},
  b=>{b.data.m26Entities.push({entityType:'session_execution',clientId:B,status:'en_curso'});},
  b=>{b.data.m26Entities.push({entityType:'session',clientId:B,status:'en_curso'});},
  b=>{b.data.m26Entities=Array.from({length:148},(_,i)=>entity(B,i));},
 ];
 for(const change of mutators){
   const a=snapshot(A,150),b=snapshot(B,18);change(b);
   assert.equal(pick(a,b).label,'A','Unsafe B never selected');
 }
 assert.equal(pick({...snapshot(A,150),environment:'PRODUCTION'},snapshot(B,18)).label,'A');
 assert.equal(pick({...snapshot(A,150),data:{}},snapshot(B,18)).label,'A');
});
test('M43 B writer handoff requires exact budget attestations and same-run evidence',()=>{
 const ctx={runId:RUN,writerAttempt:'1',sourceSha:SHA};
 const proof={schema:'iberfit.m43.authenticated-real-qa.v1',
   passed:true,phase:'complete',project:'QA',synthetic:true,productionTouched:false,
   serviceRoleUsed:false,mockBackend:false,
   provenance:{runId:RUN,runAttempt:'1',sourceSha:SHA},
   fixtureSelection:{label:'B',reason:'QA_PRIMARY_BUDGET_SAFE_FALLBACK'},
   primaryFixtureBudget:{count:148,limit:150,exhausted:false},
   fixtureBudget:{count:18,total:18,retained:0,limit:150,exhausted:false}};
 assert.equal(verifyWriterEvidence(proof,ctx).fixtureLabel,'B');
 for(const bad of [
  {...proof,primaryFixtureBudget:null},
  {...proof,primaryFixtureBudget:{count:147,limit:150}},
  {...proof,fixtureBudget:{count:148,limit:150}},
  {...proof,fixtureSelection:{label:'B',reason:'UNKNOWN'}},
  {...proof,provenance:{...proof.provenance,runId:'123'}},
 ]){
  assert.throws(()=>verifyWriterEvidence(bad,ctx),/M43_WRITER_(?:CAPACITY_FALLBACK_UNVERIFIED|FIXTURE_SELECTION_INVALID|HANDOFF_UNVERIFIED)/);
 }
});
