import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseQaAuthSessions} from '../scripts/remote-gates/release_qa_auth_sessions.mjs';
const ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const setup={base:ORIGIN,projectRef:'gjztkdwfmunnzhtvxrsu',qaOnly:'true',
  key:'sb_publishable_'+'a'.repeat(25)};
const token='eyJ'+'a'.repeat(48)+'.'+'b'.repeat(48)+'.'+'c'.repeat(48);
const coaches=['qa.rc74.coach@iberfit.cl','qa.rc74.client-a@iberfit.cl','qa.rc74.client-b@iberfit.cl'];
const sessions=coaches.map(email=>({email,token}));
test('releases only scoped QA current-run JWTs',async()=>{
  const seen=[];
  const result=await releaseQaAuthSessions({...setup,sessions,fetchImpl:async(url,init)=>{
    seen.push({url,init});return {ok:true};
  }});
  assert.deepEqual(result,{released:3,failed:0,skipped:0});
  assert.equal(seen.length,3);
  for(const {url,init} of seen){
    assert.equal(url,ORIGIN+'/auth/v1/logout?scope=local');
    assert.equal(init.method,'POST');
    assert.equal(init.credentials,'omit');
    assert.equal(init.redirect,'error');
    assert.equal(init.cache,'no-store');
    assert.ok(init.signal);
  }
});
test('rejects production, mixed runtime, secret keys and unexpected base URLs',async()=>{
  for(const override of [
    {base:'https://pjhmrhejsoofmouedavw.supabase.co'},
    {base:ORIGIN+'.evil.example'},{base:ORIGIN+'/path'},{base:ORIGIN+'?x=1'},
    {projectRef:'pjhmrhejsoofmouedavw'},{qaOnly:'false'},{key:'sb_secret_fake'},
  ]){
    let n=0;
    const result=await releaseQaAuthSessions({...setup,...override,sessions,fetchImpl:async()=>{n++;return {ok:true};}});
    assert.deepEqual(result,{released:0,failed:0,skipped:3});
    assert.equal(n,0);
  }
});
test('skips real actors, malformed tokens and unexpected session volume',async()=>{
  let n=0;const fetchImpl=async()=>{n++;return {ok:true};};
  const x=await releaseQaAuthSessions({...setup,fetchImpl,sessions:[
    sessions[0],{email:'person@example.com',token},{email:coaches[1],token:'invalid'},
  ]});
  assert.deepEqual(x,{released:1,failed:0,skipped:2});assert.equal(n,1);
  assert.deepEqual(await releaseQaAuthSessions({...setup,fetchImpl,sessions:[...sessions,sessions[0]]}),
    {released:0,failed:0,skipped:4});assert.equal(n,1);
});
test('never hides failed revocation or throws when the network fails',async()=>{
  const result=await releaseQaAuthSessions({...setup,sessions,fetchImpl:async()=>{throw Error('offline');}});
  assert.deepEqual(result,{released:0,failed:3,skipped:0});
});
