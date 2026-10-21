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
