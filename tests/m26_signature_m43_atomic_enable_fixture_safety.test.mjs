import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  verifyM43AtomicGuidedEnablement,assessM43SyntheticFixtureBudget,M43_SYNTHETIC_SESSION_LIMIT,
} from '../scripts/remote-gates/m43-qa-fixture-safety.mjs';

const sessionId='20000000-0000-4000-8000-000000000111';
const clientId='30000000-0000-4000-8000-000000000222';
const canonical={entityType:'session',entityId:sessionId,clientId,status:'disponible',revision:2};
const publishedResult={kind:'ack',remoteRevision:2,duplicate:false};

test('M43 verifies the single atomic published-to-enabled ACK',()=>{
  assert.deepEqual(verifyM43AtomicGuidedEnablement({
    canonical,publishedResult,sessionId,clientId,
  }),{ok:true,reason:'OK',revision:2});
});

test('M43 rejects publication without atomic enablement, and never repairs it in the acceptance test',()=>{
  for(const status of ['publicada','borrador','en_curso','cancelada']){
    const result=verifyM43AtomicGuidedEnablement({
      canonical:{...canonical,status},publishedResult,sessionId,clientId,
    });
    assert.equal(result.ok,false);
    assert.equal(result.reason,'PUBLISHED_NOT_ENABLED');
  }
  const gate=readFileSync(new URL('../scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs',import.meta.url),'utf8');
  assert.match(gate,/verifyM43AtomicGuidedEnablement\(/u);
  assert.doesNotMatch(gate,/type:\s*'SESION_HABILITAR'/u,'No fallback command may mask missing automatic enablement');
  assert.match(gate,/check\(enablement\.ok/u);
});

test('M43 rejects wrong scope, bogus ACK and stale CAS revision',()=>{
  const valid={canonical,publishedResult,sessionId,clientId};
  for(const input of [
    {...valid,canonical:null},
    {...valid,canonical:{...canonical,clientId:'foreign'}},
    {...valid,canonical:{...canonical,entityId:'other'}},
    {...valid,canonical:{...canonical,revision:1}},
    {...valid,canonical:{...canonical,revision:3}},
    {...valid,publishedResult:{...publishedResult,kind:'rejected'}},
    {...valid,publishedResult:{...publishedResult,duplicate:true}},
    {...valid,publishedResult:{...publishedResult,remoteRevision:0}},
  ])assert.equal(verifyM43AtomicGuidedEnablement(input).ok,false);
});

test('M43 existing fixture growth has a bounded fail-closed QA ceiling, no deletion',()=>{
  const rows=n=>Array.from({length:n},(_,index)=>({
    entityType:'session',body:{title:'IBERFIT QA M43 · '+index},
  }));
  assert.deepEqual(assessM43SyntheticFixtureBudget({data:{m26Entities:[]}}),
    {count:0,limit:M43_SYNTHETIC_SESSION_LIMIT,exhausted:false,reason:'OK'});
  const below=assessM43SyntheticFixtureBudget({data:{m26Entities:[
    ...rows(M43_SYNTHETIC_SESSION_LIMIT-1),
    {entityType:'session',body:{title:'Real customer session'}},
    {entityType:'planning',body:{title:'IBERFIT QA M43 · not a session'}},
  ]}});
  assert.equal(below.exhausted,false);
  assert.equal(below.count,M43_SYNTHETIC_SESSION_LIMIT-1);
  assert.equal(assessM43SyntheticFixtureBudget({data:{m26Entities:rows(M43_SYNTHETIC_SESSION_LIMIT)}}).exhausted,true);
  assert.equal(assessM43SyntheticFixtureBudget({data:{}}).exhausted,true);
  const gate=readFileSync(new URL('../scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs',import.meta.url),'utf8');
  assert.match(gate,/check\(!budget\.exhausted,'SYNTHETIC_FIXTURE_BUDGET_EXHAUSTED'\)/u);
});

test('M43 synthetic paused recovery is strictly scoped, old, role-owned and audit-preserving',async()=>{
  const {assessM43StalePausedRecovery}=await import('../scripts/remote-gates/m43-qa-fixture-safety.mjs');
  const idA='11111111-1111-4111-8111-111111111111';
  const idS='22222222-2222-4222-8222-222222222222';
  const idE='33333333-3333-4333-8333-333333333333';
  const session={entityType:'session',entityId:idS,clientId:idA,status:'en_curso',
    body:{title:'IBERFIT QA M43 · sesión interactiva · run-1234-a1'}};
  const execution={entityType:'session_execution',entityId:idE,clientId:idA,
    status:'pausada',revision:2,updatedAt:'2026-10-21T14:00:00Z',
    body:{id:idE,sessionId:idS,clientId:idA,revision:2}};
  const snapshot={user:{clientId:idA},serverTime:'2026-10-21T14:35:00Z',
    data:{m26Entities:[session,execution]}};
  const assess=(data,opts={})=>assessM43StalePausedRecovery(data,{runId:'1235',...opts});
  assert.deepEqual(assess(snapshot),{kind:'recover',reason:'STALE_SYNTHETIC_PAUSED',
    executionId:idE,sessionId:idS,clientId:idA,revision:2});
  assert.equal(assess({...snapshot,data:{m26Entities:[]}}).kind,'none');
  const modified=(s={},e={},extra=[])=>({
    ...snapshot,data:{m26Entities:[{...session,...s},{...execution,...e},...extra]},
  });
  assert.equal(assess(modified({body:{title:'Entrenamiento real'}})).reason,'UNMARKED_SESSION');
  assert.equal(assess(modified({status:'completada'})).reason,'SESSION_NOT_IN_PROGRESS');
  assert.equal(assess(modified({}, {status:'en_curso'})).reason,'EXECUTION_NOT_PAUSED');
  assert.equal(assess(modified({}, {revision:3})).reason,'REVISION_INVALID');
  assert.equal(assess(modified({}, {clientId:'another-client'})).reason,'SESSION_NOT_IN_PROGRESS');
  assert.equal(assess(modified({}, {},[execution])).reason,'AMBIGUOUS_ACTIVE_EXECUTIONS');
  assert.equal(assess(snapshot,{runId:'1234'}).reason,'RUN_NOT_PRIOR');
  assert.equal(assess({...snapshot,serverTime:'2026-10-21T14:05:00Z'}).reason,'RUN_NOT_STALE');
  assert.equal(assess({...snapshot,user:{clientId:'unrelated'}}).reason,'CLIENT_OR_ENTITY_SCOPE');
  assert.equal(assess({...snapshot,data:{}}).reason,'BOOTSTRAP_MISSING');
});
