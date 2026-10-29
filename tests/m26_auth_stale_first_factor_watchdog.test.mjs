import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAuthBusyWatchdog,postMfaSetupBudgetMs} from '../src/m26/app/application.js';

test('login adopts first-factor identity only after generation check',()=>{
  const source=fs.readFileSync('src/m26/app/application.js','utf8');
  const start=source.indexOf('async function login(email,password)');
  const end=source.indexOf('async function resume()',start);
  assert.ok(start>=0&&end>start);
  const body=source.slice(start,end);
  const resolve=body.indexOf('const firstFactorSession=await transport.login(email,password);');
  const gate=body.indexOf('if(!authWatchdog.isCurrent(authAttemptId))return false;',resolve);
  const adopt=body.indexOf('session=firstFactorSession;',gate);
  const vault=body.indexOf('vault.save(session);',adopt);
  assert.ok(resolve>=0&&gate>resolve&&adopt>gate&&vault>adopt);
  assert.doesNotMatch(body,/session=await transport\.login/u);
});

test('timeout invalidates generation and rejects a late first-factor result',async()=>{
  let timeoutCallback=null;
  let resolveFirstFactor;
  const firstFactor=new Promise(resolve=>{resolveFirstFactor=resolve;});
  let adopted=null,storageWrites=0,timeoutCalls=0;
  const watchdog=createAuthBusyWatchdog({
    timeoutMs:5000,
    setTimeoutFn:callback=>{timeoutCallback=callback;return 1;},
    clearTimeoutFn:()=>{},
    onTimeout:()=>{timeoutCalls++;},
  });
  const id=watchdog.begin('login');
  const pending=(async()=>{
    const candidate=await firstFactor;
    if(!watchdog.isCurrent(id))return false;
    adopted=candidate;
    storageWrites++;
    return true;
  })();
  timeoutCallback();
  resolveFirstFactor({user:{id:'synthetic'}});
  assert.equal(await pending,false);
  assert.equal(adopted,null);
  assert.equal(storageWrites,0);
  assert.equal(timeoutCalls,1);
});

test('live generation still adopts a valid first-factor once',async()=>{
  const watchdog=createAuthBusyWatchdog({
    timeoutMs:5000,setTimeoutFn:()=>1,clearTimeoutFn:()=>{},
  });
  const id=watchdog.begin('login');
  const session={token:'synthetic-token'};
  assert.equal(watchdog.isCurrent(id),true);
  let adopted=null;
  if(watchdog.isCurrent(id))adopted=session;
  assert.equal(adopted,session);
  assert.equal(watchdog.complete(id),true);
});

test('QA-only heavy Coach history receives a finite post-MFA budget; PROD and other roles do not',()=>{
 assert.equal(postMfaSetupBudgetMs({qaOnly:true,email:'qa.rc74.coach@iberfit.cl'}),28_000);
 assert.equal(postMfaSetupBudgetMs({qaOnly:true,email:'QA.RC74.COACH@IBERFIT.CL'}),28_000);
 for(const input of [
   {qaOnly:false,email:'qa.rc74.coach@iberfit.cl'},
   {qaOnly:true,email:'qa.rc74.client@iberfit.cl'},
   {qaOnly:true,email:'qa.rc74.admin@iberfit.cl'},
   {qaOnly:false,email:'coach@iberfit.cl'},
 ]){
   assert.equal(postMfaSetupBudgetMs(input),16_000);
 }
 const source=fs.readFileSync('src/m26/app/application.js','utf8');
 assert.match(source,/\['post-mfa-setup','session-retry','resume'\]\.includes\(stage\)/u);
 assert.match(source,/timeoutMs:postMfaSetupBudgetMs\(\{qaOnly:runtime\.qaOnly,email:session\?\.user\?\.email\}\)/u);
});

test('QA Coach longer watchdog remains finite, owner-fenced, and never changes normal auth timeout',()=>{
 let active=null,invoked=0;const durations=[];
 const watchdog=createAuthBusyWatchdog({
   timeoutMs:18_000,
   setTimeoutFn:(cb,ms)=>{active=cb;durations.push(ms);return durations.length;},
   clearTimeoutFn:()=>{},
   onTimeout:()=>{invoked++;},
 });
 const standard=watchdog.begin('login');
 assert.equal(durations.at(-1),18_000);
 const postMfa=watchdog.begin('post-mfa-setup',{timeoutMs:29_500});
 assert.equal(durations.at(-1),29_500);
 assert.equal(watchdog.isCurrent(standard),false,'Old attempt loses access immediately');
 assert.equal(watchdog.isCurrent(postMfa),true);
 active();
 assert.equal(invoked,1);
 assert.equal(watchdog.isCurrent(postMfa),false,'Timeout revokes the late attempt');
 const normal=watchdog.begin('login');
 assert.equal(durations.at(-1),18_000);
 assert.equal(watchdog.complete(normal),true);
});
