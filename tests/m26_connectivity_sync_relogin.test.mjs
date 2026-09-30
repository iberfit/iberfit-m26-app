import test from 'node:test';
import assert from 'node:assert/strict';

import {createConnectivitySync} from '../src/m26/platform/pwa.js';

function deferred(){
  let resolve;
  let reject;
  const promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

function fakeTarget(){
  const listeners=new Map();
  const dispatched=[];
  return {
    dispatched,
    addEventListener(type,handler){
      const bucket=listeners.get(type)||new Set();
      bucket.add(handler);
      listeners.set(type,bucket);
    },
    removeEventListener(type,handler){listeners.get(type)?.delete(handler);},
    dispatchEvent(event){
      dispatched.push(event);
      for(const handler of listeners.get(event?.type)||[])handler(event);
      return true;
    },
    emit(type){
      for(const handler of listeners.get(type)||[])handler({type});
    },
  };
}

async function flush(){
  await Promise.resolve();
  await new Promise((resolve)=>setImmediate(resolve));
}

test('post-login connectivity sync reconciles once while already online without emitting an artificial connectivity event',async()=>{
  const target=fakeTarget();
  const navigatorLike={onLine:true};
  let synchronizeCalls=0;
  let resultCalls=0;
  const sync=createConnectivitySync({
    target,
    navigatorLike,
    coordinator:{
      async synchronize(){
        synchronizeCalls+=1;
        return {online:true,attempted:1,deferred:0,results:[]};
      },
    },
    onResult:async()=>{resultCalls+=1;},
  });

  const stop=sync.start({emitInitial:false,reconcileInitial:true});
  await flush();

  assert.equal(synchronizeCalls,1);
  assert.equal(resultCalls,1);
  assert.equal(
    target.dispatched.filter((event)=>event?.type==='m26:connectivity').length,
    0,
    'silent post-login reconciliation must not pretend connectivity was restored',
  );

  target.emit('online');
  await flush();
  assert.equal(synchronizeCalls,1,'duplicate online state must not duplicate remote commands');

  stop();
});

test('offline login defers reconciliation until the first real online transition',async()=>{
  const target=fakeTarget();
  const navigatorLike={onLine:false};
  let synchronizeCalls=0;
  const sync=createConnectivitySync({
    target,
    navigatorLike,
    coordinator:{
      async synchronize(){
        synchronizeCalls+=1;
        return {online:true,attempted:1,deferred:0,results:[]};
      },
    },
  });

  const stop=sync.start({emitInitial:false,reconcileInitial:true});
  await flush();
  assert.equal(synchronizeCalls,0);

  navigatorLike.onLine=true;
  target.emit('online');
  await flush();

  assert.equal(synchronizeCalls,1);
  assert.equal(
    target.dispatched.filter((event)=>event?.type==='m26:connectivity').length,
    1,
  );

  stop();
});

test('concurrent reconciliation requests share the same in-flight operation',async()=>{
  const target=fakeTarget();
  const navigatorLike={onLine:true};
  const gate=deferred();
  let synchronizeCalls=0;
  const sync=createConnectivitySync({
    target,
    navigatorLike,
    coordinator:{
      async synchronize(){
        synchronizeCalls+=1;
        await gate.promise;
        return {online:true,attempted:1,deferred:0,results:[]};
      },
    },
  });

  const stop=sync.start({emitInitial:false,reconcileInitial:true});
  const first=sync.sync();
  const second=sync.sync();

  assert.equal(first,second);
  assert.equal(synchronizeCalls,1);

  gate.resolve();
  await first;
  await flush();
  assert.equal(synchronizeCalls,1);

  stop();
});
