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
    {count:0,total:0,retained:0,limit:M43_SYNTHETIC_SESSION_LIMIT,exhausted:false,reason:'OK'});
  const below=assessM43SyntheticFixtureBudget({data:{m26Entities:[
    ...rows(M43_SYNTHETIC_SESSION_LIMIT-1),
    {entityType:'session',body:{title:'Real customer session'}},
    {entityType:'planning',body:{title:'IBERFIT QA M43 · not a session'}},
  ]}});
  assert.equal(below.exhausted,false);
  assert.equal(below.count,M43_SYNTHETIC_SESSION_LIMIT-1);
  assert.equal(below.retained,0);
  assert.equal(below.total,M43_SYNTHETIC_SESSION_LIMIT-1);
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
    executionId:idE,sessionId:idS,clientId:idA,revision:2,priorRunId:'1234'});
  assert.equal(assess({...snapshot,data:{m26Entities:[]}}).kind,'none');
  const modified=(s={},e={},extra=[])=>({
    ...snapshot,data:{m26Entities:[{...session,...s},{...execution,...e},...extra]},
  });
  assert.equal(assess(modified({body:{title:'Entrenamiento real'}})).reason,'UNMARKED_SESSION');
  assert.equal(assess(modified({status:'completada'})).reason,'SESSION_NOT_IN_PROGRESS');
  assert.equal(assess(modified({}, {status:'en_curso'})).reason,'STALE_SYNTHETIC_IN_PROGRESS');
  assert.equal(assess(modified({}, {status:'en_curso',updatedAt:'2026-10-21T14:31:00Z'})).reason,'RUN_NOT_STALE');
  assert.equal(assess(modified({}, {revision:3})).reason,'REVISION_INVALID');
  assert.equal(assess(modified({}, {clientId:'another-client'})).reason,'SESSION_NOT_IN_PROGRESS');
  assert.equal(assess(modified({}, {},[execution])).reason,'AMBIGUOUS_ACTIVE_EXECUTIONS');
  assert.equal(assess(snapshot,{runId:'1234'}).reason,'RUN_NOT_PRIOR');
  assert.equal(assess({...snapshot,serverTime:'2026-10-21T14:03:00Z'}).reason,'RUN_NOT_STALE');
  assert.equal(assess({...snapshot,user:{clientId:'unrelated'}}).reason,'CLIENT_OR_ENTITY_SCOPE');
  assert.equal(assess({...snapshot,data:{}}).reason,'BOOTSTRAP_MISSING');
});

test('only a truly completed exact prior GitHub M43 workflow authorizes synthetic recovery',async()=>{
  const {attestCompletedM43Run}=await import('../scripts/remote-gates/m43-qa-fixture-safety.mjs');
  const base={repo:'iberfit/iberfit-m26-app',token:'unit-test-placeholder'};
  const response=(body,ok=true)=>({ok,json:async()=>body});
  const record={id:1234,name:'IBERFIT QA Real Write Certification',
    status:'completed',conclusion:'failure',
    repository:{full_name:'iberfit/iberfit-m26-app'}};
  const valid=()=>attestCompletedM43Run('1234',{...base,fetchImpl:async()=>response(record)});
  assert.equal(await valid(),true);
  for(const mutated of [
    {...record,status:'in_progress'},
    {...record,status:'queued'},
    {...record,id:1235},
    {...record,name:'Other'},
    {...record,repository:{full_name:'other/repo'}},
    {...record,conclusion:null},
  ])assert.equal(await attestCompletedM43Run('1234',{...base,fetchImpl:async()=>response(mutated)}),false);
  assert.equal(await attestCompletedM43Run('1234',{...base,fetchImpl:async()=>response(record,false)}),false);
  assert.equal(await attestCompletedM43Run('1234',{...base,fetchImpl:async()=>{throw Error('offline');}}),false);
  assert.equal(await attestCompletedM43Run('1234',{...base,token:''}),false);
  assert.equal(await attestCompletedM43Run('1234',{...base,repo:'other/repo'}),false);
});

test('QA historical retention fingerprint preserves rows, rejects stale CAS and blocks unmarked live records',async()=>{
  const {createHash}=await import('node:crypto');
  const {retainedM43HistoricalFingerprint}=await import('../scripts/remote-gates/m43-qa-fixture-safety.mjs');
  const entity={entityType:'session',entityId:'20000000-0000-4000-8000-000000000111',
    clientId:'30000000-0000-4000-8000-000000000222',
    status:'completada',revision:5,
    body:{title:'IBERFIT QA M43 · multideporte · run-39591090576-a1',
      clientId:'30000000-0000-4000-8000-000000000222',revision:5}};
  const key=[entity.clientId,entity.entityId,entity.status,entity.revision,entity.body.title].join(':');
  const digest=createHash('sha256').update(key,'utf8').digest('hex');
  const retained=new Set([digest]);
  assert.equal(retainedM43HistoricalFingerprint(entity,retained),true);
  for(const change of [
    {...entity,status:'en_curso'}, {...entity,revision:6},
    {...entity,clientId:'33333333-3333-4333-8333-333333333333'},
    {...entity,body:{...entity.body,revision:6}},
    {...entity,body:{...entity.body,title:'Real business session'}},
    {...entity,entityType:'session_execution'},
  ])assert.equal(retainedM43HistoricalFingerprint(change,retained),false);
  assert.equal(retainedM43HistoricalFingerprint(entity,new Set()),false);
  // Old static-title M43 QA sessions are retained ONLY by exact, frozen
  // canonical fingerprint after SQL verified complete execution/no appointment.
  const legacy={...entity,body:{...entity.body,title:'IBERFIT QA M43 · multideporte'}};
  const legacyKey=[legacy.clientId,legacy.entityId,legacy.status,legacy.revision,legacy.body.title].join(':');
  const legacyDigest=createHash('sha256').update(legacyKey,'utf8').digest('hex');
  assert.equal(retainedM43HistoricalFingerprint(legacy,new Set([legacyDigest])),true);
  assert.equal(retainedM43HistoricalFingerprint(legacy,new Set()),false);
  assert.equal(retainedM43HistoricalFingerprint({...legacy,revision:6},new Set([legacyDigest])),false);
  assert.equal(retainedM43HistoricalFingerprint({...legacy,status:'disponible'},new Set([legacyDigest])),false);
  assert.equal(retainedM43HistoricalFingerprint({...legacy,body:{...legacy.body,clientId:'foreign'}},new Set([legacyDigest])),false);
  const writer=readFileSync(new URL('../scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs',import.meta.url),'utf8');
  assert.match(writer,/fixtureBudget=\{count:budget.count,total:budget.total,retained:budget.retained/u);
  assert.match(writer,/budget.count<=budget.limit-2/u);
  assert.doesNotMatch(writer,/delete\s+from\s+.*domain_entities_v26/iu);
});


test('M43 completed run-tagged interactive QA history is archived only by immutable fingerprint',async()=>{
  const {createHash}=await import('node:crypto');
  const {retainedM43HistoricalFingerprint,assessM43SyntheticFixtureBudget}=await import('../scripts/remote-gates/m43-qa-fixture-safety.mjs');
  const id='20000000-0000-4000-8000-000000000111',owner='30000000-0000-4000-8000-000000000222';
  const record={entityType:'session',entityId:id,clientId:owner,status:'completada',revision:4,
    body:{title:'IBERFIT QA M43 · sesión interactiva · run-41160220476-a1',clientId:owner,revision:4}};
  const digest=createHash('sha256').update([owner,id,record.status,4,record.body.title].join(':')).digest('hex');
  const only=new Set([digest]);
  assert.equal(retainedM43HistoricalFingerprint(record,only),true);
  assert.equal(retainedM43HistoricalFingerprint({...record,status:'en_curso'},only),false);
  assert.equal(retainedM43HistoricalFingerprint({...record,status:'cancelada'},only),false);
  assert.equal(retainedM43HistoricalFingerprint({...record,revision:5},only),false);
  assert.equal(retainedM43HistoricalFingerprint({...record,clientId:'foreign'},only),false);
  assert.equal(retainedM43HistoricalFingerprint({...record,body:{...record.body,revision:5}},only),false);
  assert.equal(retainedM43HistoricalFingerprint({...record,body:{...record.body,title:'IBERFIT QA M43 · sesión interactiva'}},only),false);
  assert.equal(retainedM43HistoricalFingerprint(record,new Set()),false);
  // Verify the actual persisted ledger represents historical terminal entries;
  // its fixed fingerprints never match an unmarked or changed live session.
  const ledger=JSON.parse(readFileSync(new URL('../scripts/remote-gates/m43-qa-retained-history-v1.json',import.meta.url),'utf8'));
  assert.equal(ledger.sha256EntityScopeRevisionAndTitle.length,412);
  assert.equal(new Set(ledger.sha256EntityScopeRevisionAndTitle).size,412);
  assert.equal(ledger.mode,'logical_retention_only_no_database_mutation');
  const snapshot={data:{m26Entities:[record,{...record,status:'en_curso'}]}};
  assert.equal(assessM43SyntheticFixtureBudget(snapshot).total,2);
});
