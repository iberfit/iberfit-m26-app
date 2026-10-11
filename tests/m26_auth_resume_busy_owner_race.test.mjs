import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the ACTUAL nested resume() implementation with controlled promises.
// No Supabase network, browser credentials, user account or mocked health data.
const source=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
const start=source.indexOf('  async function resume(){');
const end=source.indexOf('  async function onSubmit(event)',start);
assert.ok(start>=0&&end>start,'Must exercise the production resume() body');
const resumeSource=source.slice(start,end);

function fixture(){
  let settle;
  const pendingBackend=new Promise((resolve,reject)=>{settle={resolve,reject};});
  const completions=[];
  const state={
    runtime:{enabled:true},
    session:null,
    vault:{load:()=>({token:'synthetic-only-token'})},
    loginBusy:false,authMode:'login',sessionRetryAvailable:true,
    activeAttempt:0,
    authMessage(){},
    authWatchdog:{isCurrent:id=>id===state.activeAttempt},
    beginAuthAttempt(){state.activeAttempt+=1;return state.activeAttempt;},
    completeAuthAttempt(id){
      assert.equal(id,state.activeAttempt,'stale resume must never complete newer attempt');
      completions.push(id);
      state.activeAttempt=0;
    },
    continueAfterFirstFactor:()=>pendingBackend,
    sessionFailureRequiresFreshLogin:()=>false,
    discardSessionAfterFailure(){throw new Error('unexpected-discard');},
    surfaceRetriableSessionFailure(){throw new Error('unexpected-recovery');},
  };
  const resume=runInNewContext(resumeSource+'\nresume',state);
  return {resume,state,settle,completions};
}

test('stale resolved resume never unlocks the new login attempt',async()=>{
  const x=fixture();
  const oldResume=x.resume();
  assert.equal(x.state.loginBusy,true);
  assert.equal(x.state.activeAttempt,1);
  // A newer user action retires the old resume and starts a second login.
  x.state.activeAttempt=2;
  x.state.loginBusy=true;
  x.settle.resolve(true);
  assert.equal(await oldResume,true);
  assert.equal(x.state.loginBusy,true,'new login remains busy until its own completion');
  assert.equal(x.state.activeAttempt,2);
  assert.deepEqual(x.completions,[]);
});

test('stale rejected resume also leaves the newer login busy and does not render recovery',async()=>{
  const x=fixture();
  const oldResume=x.resume();
  x.state.activeAttempt=2;
  x.state.loginBusy=true;
  x.settle.reject(new Error('synthetic-backend-timeout'));
  assert.equal(await oldResume,false);
  assert.equal(x.state.loginBusy,true);
  assert.equal(x.state.activeAttempt,2);
  assert.deepEqual(x.completions,[]);
});

test('current resume still completes its own operation and releases the busy UI',async()=>{
  const x=fixture();
  const run=x.resume();
  assert.equal(x.state.loginBusy,true);
  x.settle.resolve(true);
  assert.equal(await run,true);
  assert.equal(x.state.loginBusy,false);
  assert.equal(x.state.activeAttempt,0);
  assert.deepEqual(x.completions,[1]);
});

test('resume finalizer ownership matches retrySession/login and has no unconditional busy reset',()=>{
  const tail=resumeSource.slice(resumeSource.indexOf('}finally{'));
  assert.match(tail,/if\(authWatchdog\.isCurrent\(authAttemptId\)\)\{\s*completeAuthAttempt\(authAttemptId\);\s*loginBusy=false;/u);
  assert.doesNotMatch(tail,/\}finally\{\s*loginBusy=false;/u);
});
