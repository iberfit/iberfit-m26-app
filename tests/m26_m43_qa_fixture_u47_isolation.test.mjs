import test from 'node:test';
import assert from 'node:assert/strict';
import {selectM43QaFixtureForU47Isolation} from '../scripts/remote-gates/m43-qa-fixture-safety.mjs';
import {verifyWriterEvidence} from '../scripts/remote-gates/m43-writer-handoff.mjs';

const A='57f56a87-d04e-47d5-b1cc-8d4939d7c804';
const B='c0000000-0000-4000-8000-000000000998';
const SESSION='4d244c01-8966-40f1-8cc7-9e6ec46d1708';
const EXEC='16145839-2e7d-48e2-bf0c-e94325f5c54c';
const runId='40794059938';
function snapshot(clientId,entities=[]){
 return {user:{clientId},serverTime:'2026-10-29T00:26:00Z',
  data:{m26Entities:entities,clients:[{id:clientId,trainingServiceStatus:'active'}]}};
}
function fixture(){
 const primary=snapshot(A,[
  {entityType:'session',entityId:SESSION,clientId:A,status:'en_curso',
   body:{title:'QA U47 · Running 40738135729-1'}},
  {entityType:'session_execution',entityId:EXEC,clientId:A,status:'en_curso',
   body:{id:EXEC,clientId:A,sessionId:SESSION}},
 ]);
 return {primary,secondary:snapshot(B)};
}
test('M43 writer may select B only to preserve exact U47 active QA execution',()=>{
 const x=fixture();const selection=selectM43QaFixtureForU47Isolation(x.primary,x.secondary,{runId});
 assert.deepEqual(selection,{label:'B',reason:'EXACT_U47_LOCK_ISOLATION'});
});
test('M43 selection never escapes to B for another active lock, foreign ID or unsafe B fixture',()=>{
 const variants=[
  x=>{x.primary.data.m26Entities[0].body.title='Other live workout';},
  x=>{x.primary.data.m26Entities[1].entityId=SESSION;},
  x=>{x.primary.data.m26Entities[1].body.sessionId=EXEC;},
  x=>{x.primary.data.m26Entities.push({...x.primary.data.m26Entities[1],entityId:SESSION});},
  x=>{x.secondary.data.m26Entities.push({entityType:'session_execution',status:'en_curso'});},
  x=>{x.secondary.data.clients[0].trainingServiceStatus='paused';},
  x=>{x.secondary.user.clientId=A;},
 ];
 for(const mutate of variants){const x=fixture();mutate(x);
  assert.equal(selectM43QaFixtureForU47Isolation(x.primary,x.secondary,{runId}).label,'A');
 }
});
test('M43 successful writer B handoff must include exact isolation reason and source provenance',()=>{
 const proof={schema:'iberfit.m43.authenticated-real-qa.v1',passed:true,phase:'complete',
  project:'QA',synthetic:true,productionTouched:false,serviceRoleUsed:false,mockBackend:false,
  provenance:{runId,runAttempt:'1',sourceSha:'a'.repeat(40)},
  fixtureSelection:{label:'B',reason:'EXACT_U47_LOCK_ISOLATION'}};
 const context={runId,writerAttempt:'1',sourceSha:'a'.repeat(40)};
 assert.equal(verifyWriterEvidence(proof,context).fixtureLabel,'B');
 assert.throws(()=>verifyWriterEvidence({...proof,fixtureSelection:{label:'B',reason:'INVALID'}},context),
  /M43_WRITER_FIXTURE_SELECTION_INVALID/);
});
