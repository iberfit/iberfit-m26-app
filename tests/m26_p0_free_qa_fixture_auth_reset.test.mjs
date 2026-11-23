import test from 'node:test';
import assert from 'node:assert/strict';
import {FIXTURES,QA_ORIGIN,validateQaFixtureReset,qaResetQuiet,qaFixtureGlobalReset} from '../scripts/ops/qa_fixture_auth_free_reset.mjs';

const fixture=Object.fromEntries(FIXTURES.flatMap(f=>[[f.envEmail,f.email],[f.passEnvName,'fixture-not-a-secret']]));
const env={GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'iberfit/iberfit-m26-app',
  GITHUB_REF:'refs/heads/canary/rc74-4',GITHUB_SHA:'f'.repeat(40),
  GITHUB_RUN_ID:'123456789012',GITHUB_TOKEN:'github-test-'+'x'.repeat(30),
  QA_FIXTURE_RESET_AUTHORIZED:'true',M26_QA_ONLY:'true',
  M26_PROJECT_REF:'gjztkdwfmunnzhtvxrsu',M26_SUPABASE_URL:QA_ORIGIN,
  M26_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+'a'.repeat(30),...fixture};
const token='eyJ'+'a'.repeat(54)+'.'+'b'.repeat(54)+'.'+'c'.repeat(54);
const uid=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
const respond=(data,status=200)=>({ok:status>=200&&status<300,status,
  json:async()=>data});
function fake({busy=0,broken=-1}={}){
  const calls=[];
  let logins=0;
  const fetchImpl=async(url,req)=>{
    calls.push({url,method:req.method,scope:new URL(url).searchParams.get('scope')});
    if(url.includes('/git/ref/heads/'))return respond({object:{sha:env.GITHUB_SHA}});
    if(url.includes('/actions/runs'))return respond({total_count:busy,workflow_runs:Array.from({length:busy},()=>({id:4321}))});
    if(url.includes('/auth/v1/token')){
      const body=JSON.parse(req.body||'{}');
      const index=FIXTURES.findIndex(f=>f.email===body.email);
      if(index<0)throw Error('wrong fixture');
      logins++;
      if(broken===index)return respond({error:'invalid'},400);
      return respond({user:{email:body.email,id:uid[index]},access_token:token});
    }
    if(url.includes('/auth/v1/logout')){
      assert.equal(req.method,'POST');
      assert.ok(req.headers.authorization.startsWith('Bearer eyJ'));
      return respond(null,204);
    }
    throw Error('unexpected network target');
  };
  return {calls,fetchImpl,get logins(){return logins}};
}
test('QA reset refuses production, alternate fixtures, wrong branch, missing authorization and secret API keys before network',()=>{
  assert.equal(validateQaFixtureReset(env),true);
  for(const patch of [
    {M26_SUPABASE_URL:'https://pjhmrhejsoofmouedavw.supabase.co'},
    {M26_SUPABASE_URL:QA_ORIGIN+'.evil.invalid'},
    {M26_PROJECT_REF:'pjhmrhejsoofmouedavw'},
    {M26_QA_ONLY:'false'},{GITHUB_REF:'refs/heads/main'},
    {QA_FIXTURE_RESET_AUTHORIZED:'false'},{GITHUB_ACTIONS:'false'},
    {M26_SUPABASE_PUBLISHABLE_KEY:'sb_secret_secret'},
    {M26_QA_CLIENT_A_EMAIL:'user@example.com'},
  ]) assert.throws(()=>validateQaFixtureReset({...env,...patch}),/QA_FIXTURE_RESET_(SCOPE|IDENTITY)_DENIED/u);
});
test('QA reset emits no login when other GitHub Actions are active',async()=>{
  const f=fake({busy:1});
  assert.deepEqual(await qaResetQuiet({env,fetchImpl:f.fetchImpl}),
    {ready:false,reason:'other-github-runs',activeRuns:5});
  assert.deepEqual(await qaFixtureGlobalReset({env,fetchImpl:f.fetchImpl}),
    {status:'skipped',reason:'other-github-runs',busyRuns:5});
  assert.equal(f.logins,0);
  assert.equal(f.calls.filter(x=>x.url.includes('/auth/')).length,0);
});
test('QA reset authenticates ALL three exact fixtures before first global logout and rechecks credentials after',async()=>{
  const f=fake();
  const result=await qaFixtureGlobalReset({env,fetchImpl:f.fetchImpl});
  assert.deepEqual(result,{status:'completed',globalLogoutAccounts:3,
    freshLoginsVerified:3,qaOnly:true,productionTouched:false});
  const auth=f.calls.filter(x=>x.url.includes('/auth/'));
  const firstGlobal=auth.findIndex(x=>x.scope==='global');
  assert.equal(firstGlobal,3);
  assert.equal(auth.filter(x=>x.scope==='global').length,3);
  assert.equal(auth[firstGlobal+1].url.includes('grant_type=password'),true);
  assert.equal(auth[firstGlobal+2].scope,'local');
  assert.equal(auth.filter(x=>x.url.includes('grant_type=password')).length,6);
  assert.equal(auth.filter(x=>x.scope==='local').length,6);
  assert.ok(auth.every(x=>x.url.startsWith(QA_ORIGIN+'/auth/v1/')));
});
test('QA reset never globally revokes any account after a failed preflight',async()=>{
  const f=fake({broken:1});
  await assert.rejects(qaFixtureGlobalReset({env,fetchImpl:f.fetchImpl}),/QA_RESET_AUTH_PRECHECK_FAILED:coach/u);
  assert.equal(f.calls.filter(x=>x.scope==='global').length,0);
  assert.equal(f.calls.filter(x=>x.scope==='local').length,1);
});
