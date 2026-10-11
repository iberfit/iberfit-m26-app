import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionForegroundRefreshCoordinator} from '../src/m26/app/session-foreground-refresh.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const make=(id)=>({token:'synthetic-'+id,refreshToken:'synthetic-refresh-'+id,user:{id}});
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function fixture(){
  let current=make('A');
  const pending=[],permanent=[],transient=[];
  const target={addEventListener(){},removeEventListener(){}};
  const coordinator=createSessionForegroundRefreshCoordinator({
    scope:target,documentLike:{...target,visibilityState:'visible'},
    getSession:()=>current,
    refreshSession:()=>{const d=deferred();pending.push(d);return d.promise;},
    isPermanentFailure:(error)=>error?.status===401,
    onPermanentFailure:(error,reason)=>permanent.push({error:error.message,reason}),
    onTransientFailure:(error,reason)=>transient.push({error:error.message,reason}),
  });
  return {coordinator,pending,permanent,transient,setSession(next){current=next;}};
}

test('old A permanent 401 arriving after switching to B never signs B out',async()=>{
  const x=fixture();
  const old=x.coordinator.run('focus');
  await tick();
  x.setSession(make('B'));
  const newer=x.coordinator.run('online');
  await tick();
  assert.equal(x.pending.length,2,'B refresh must not wait on A');
  x.pending[0].reject(Object.assign(new Error('A refresh expired'),{status:401}));
  assert.equal(await old,false);
  assert.deepEqual(x.permanent,[]);
  x.pending[1].resolve(true);
  assert.equal(await newer,true);
  assert.deepEqual(x.permanent,[]);
  x.coordinator.destroy();
});

test('late A completion cannot clear the new B in-flight foreground refresh',async()=>{
  const x=fixture();
  const a=x.coordinator.run('focus');
  await tick();
  x.setSession(make('B'));
  const b=x.coordinator.run('online');
  await tick();
  x.pending[0].resolve(true);
  assert.equal(await a,true);
  const bAgain=x.coordinator.run('pageshow');
  assert.equal(bAgain,b,'B calls should coalesce despite settled A');
  assert.equal(x.pending.length,2);
  x.pending[1].resolve(true);
  assert.equal(await b,true);
  x.coordinator.destroy();
});

test('same session events still coalesce into one network refresh',async()=>{
  const x=fixture();
  const a=x.coordinator.run('focus');
  const b=x.coordinator.run('pageshow');
  await tick();
  assert.equal(a,b);
  assert.equal(x.pending.length,1);
  x.pending[0].resolve(true);
  assert.equal(await b,true);
  x.coordinator.destroy();
});

test('current owner still gets permanent refresh recovery and stale pre-dispatch is cancelled',async()=>{
  const x=fixture();
  const a=x.coordinator.run('focus');
  await tick();
  x.pending[0].reject(Object.assign(new Error('A expired'),{status:401}));
  assert.equal(await a,false);
  assert.deepEqual(x.permanent,[{error:'A expired',reason:'focus'}]);
  const notDispatched=x.coordinator.run('pageshow');
  x.setSession(make('B'));
  assert.equal(await notDispatched,false);
  assert.equal(x.pending.length,1);
  x.coordinator.destroy();
});
