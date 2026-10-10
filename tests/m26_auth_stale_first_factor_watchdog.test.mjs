import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAuthBusyWatchdog} from '../src/m26/app/application.js';

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
