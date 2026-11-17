import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readQaClientIdentity} from '../scripts/remote-gates/qa_client_identity_rpc.mjs';

const CLIENT_A='11111111-2222-4333-8444-555555555555';
const CLIENT_B='22222222-3333-4444-8555-666666666666';
const file=path=>readFileSync(path,'utf8');
const scripts=[
  'scripts/remote-gates/run_qa_real_write_gate.mjs',
  'scripts/remote-gates/run_qa_m42_avatar_private_gate.mjs',
];

test('identity-only QA projection verifies exact client role and UUID without loading historical bootstraps',async()=>{
  const calls=[];
  const a=await readQaClientIdentity({
    label:'QA_CLIENT_A',
    readRole:async()=>{calls.push('role');return 'cliente';},
    readClientId:async()=>{calls.push('id');return CLIENT_A;},
  });
  assert.equal(a.role,'cliente');
  assert.equal(a.clientId,CLIENT_A);
  assert.ok(Object.isFrozen(a));
  assert.deepEqual([...calls].sort(),['id','role']);
  const b=await readQaClientIdentity({
    readRole:async()=> 'client',
    readClientId:async()=> CLIENT_B,
  });
  assert.equal(b.clientId,CLIENT_B);
  assert.notEqual(a.clientId,b.clientId);
});

test('fail closed on any missing or forged actor identity, refusing caching and privilege escalation',async()=>{
  for(const pair of [
    {role:'coach',id:CLIENT_A},
    {role:'admin',id:CLIENT_A},
    {role:'anon',id:CLIENT_A},
    {role:'client',id:'not-a-uuid'},
    {role:'client',id:null},
    {role:null,id:CLIENT_A},
    {role:{role:'client'},id:CLIENT_A},
  ]){
    await assert.rejects(readQaClientIdentity({
      label:'QA_TEST',
      readRole:async()=>pair.role,
      readClientId:async()=>pair.id,
    }),/QA_TEST_CLIENT_CONTEXT_INVALID/u);
  }
  await assert.rejects(readQaClientIdentity({}),/QA_CLIENT_IDENTITY_RPC_READERS_REQUIRED/u);
  let reads=0;
  for(let i=0;i<3;i++){
    await readQaClientIdentity({
      readRole:async()=>{reads++;return 'client';},
      readClientId:async()=>{reads++;return CLIENT_A;},
    });
  }
  assert.equal(reads,6,'No cached or stale identity across checks');
  await assert.rejects(readQaClientIdentity({
    readRole:async()=>{throw Error('QA_ROLE_RPC_FORBIDDEN');},
    readClientId:async()=>CLIENT_A,
  }),/QA_ROLE_RPC_FORBIDDEN/u);
});

test('only identity-only synthetic gates drop full bootstraps; critical full bootstrap coverage stays elsewhere',()=>{
  for(const path of scripts){
    const s=file(path);
    assert.match(s,/import \{readQaClientIdentity\} from '\.\/qa_client_identity_rpc\.mjs'/u,path);
    assert.doesNotMatch(s,/['"]iberfit_bootstrap_v26['"]/u,path);
    assert.match(s,/'iberfit_current_role_v26'/u,path);
    assert.match(s,/'iberfit_client_id'/u,path);
    assert.match(s,/'iberfit_environment'/u,path);
    assert.match(s,/QA_NOT_PRODUCTION|PRODUCTION_FORBIDDEN|QA_WRITE_ENVIRONMENT_GUARD_FAILED/u,path);
    assert.match(s,/iberfit_can_manage_iri_private_v1/u,path);
  }
  assert.match(file('scripts/remote-gates/run_authenticated_readonly_gate.mjs'),/rpc\('iberfit_bootstrap_v26'/u);
  assert.match(file('scripts/remote-gates/run_qa_m43_coach_client_write_gate.mjs'),/rpc\('iberfit_bootstrap_v26'/u);
  const qa=file('.github/workflows/qa-real-write-cert.yml');
  assert.equal(qa.split("'scripts/remote-gates/qa_client_identity_rpc.mjs'").length-1,2);
  assert.equal(qa.split("'tests/m26_p0_free_qa_identity_projection_contract.test.mjs'").length-1,2);
  assert.match(qa,/run: node scripts\/remote-gates\/run_qa_real_write_gate\.mjs/u);
  assert.match(qa,/run: node scripts\/remote-gates\/run_qa_m42_avatar_private_gate\.mjs/u);
});
