import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createSessionForegroundRefreshCoordinator} from '../src/m26/app/session-foreground-refresh.js';

class FakeEventTarget{
  constructor(){this.listeners=new Map();}
  addEventListener(type,handler){
    const set=this.listeners.get(type)||new Set();
    set.add(handler);
    this.listeners.set(type,set);
  }
  removeEventListener(type,handler){
    this.listeners.get(type)?.delete(handler);
  }
  emit(type){
    for(const handler of [...(this.listeners.get(type)||[])])handler({type,target:this});
  }
  count(type){return this.listeners.get(type)?.size||0;}
}

const tick=()=>new Promise((resolve)=>setImmediate(resolve));

test('foreground refresh ignores hidden/no-session states and runs when visible with a session',async()=>{
  const scope=new FakeEventTarget();
  const documentLike=new FakeEventTarget();
  documentLike.visibilityState='hidden';
  let session={token:'token'};
  let refreshes=0;
  const coordinator=createSessionForegroundRefreshCoordinator({
    scope,
    documentLike,
    getSession:()=>session,
    refreshSession:async()=>{refreshes+=1;},
  });

  documentLike.emit('visibilitychange');
  scope.emit('focus');
  await tick();
  assert.equal(refreshes,0);

  documentLike.visibilityState='visible';
  session=null;
  scope.emit('pageshow');
  await tick();
  assert.equal(refreshes,0);

  session={token:'token'};
  documentLike.emit('visibilitychange');
  await tick();
  assert.equal(refreshes,1);
  coordinator.destroy();
});

test('foreground refresh coalesces focus/pageshow/online storms into one in-flight refresh',async()=>{
  const scope=new FakeEventTarget();
  const documentLike=new FakeEventTarget();
  documentLike.visibilityState='visible';
  let refreshes=0;
  let release;
  const pending=new Promise((resolve)=>{release=resolve;});
  const coordinator=createSessionForegroundRefreshCoordinator({
    scope,
    documentLike,
    getSession:()=>({token:'token'}),
    refreshSession:async()=>{refreshes+=1;await pending;},
  });

  scope.emit('focus');
  scope.emit('pageshow');
  scope.emit('online');
  documentLike.emit('visibilitychange');
  await tick();
  assert.equal(refreshes,1);

  release();
  await tick();
  scope.emit('online');
  await tick();
  assert.equal(refreshes,2);
  coordinator.destroy();
});

test('foreground refresh distinguishes permanent session failure from transient network degradation',async()=>{
  const scope=new FakeEventTarget();
  const documentLike=new FakeEventTarget();
  documentLike.visibilityState='visible';
  const outcomes=['transient','permanent'];
  const transient=[];
  const permanent=[];
  const coordinator=createSessionForegroundRefreshCoordinator({
    scope,
    documentLike,
    getSession:()=>({token:'token'}),
    refreshSession:async()=>{
      const kind=outcomes.shift();
      if(kind==='transient')throw Object.assign(new Error('M26_TIMEOUT'),{status:0});
      if(kind==='permanent')throw Object.assign(new Error('M26_SESSION_EXPIRED'),{status:401});
      return true;
    },
    isPermanentFailure:(error)=>Number(error?.status||0)===401,
    onTransientFailure:(error,reason)=>transient.push({code:error.message,reason}),
    onPermanentFailure:(error,reason)=>permanent.push({code:error.message,reason}),
  });

  assert.equal(await coordinator.run('focus'),false);
  assert.deepEqual(transient,[{code:'M26_TIMEOUT',reason:'focus'}]);
  assert.deepEqual(permanent,[]);

  assert.equal(await coordinator.run('online'),false);
  assert.deepEqual(permanent,[{code:'M26_SESSION_EXPIRED',reason:'online'}]);
  coordinator.destroy();
});

test('foreground refresh cleanup removes every lifecycle listener',async()=>{
  const scope=new FakeEventTarget();
  const documentLike=new FakeEventTarget();
  documentLike.visibilityState='visible';
  let refreshes=0;
  const coordinator=createSessionForegroundRefreshCoordinator({
    scope,
    documentLike,
    getSession:()=>({token:'token'}),
    refreshSession:async()=>{refreshes+=1;},
  });

  assert.equal(documentLike.count('visibilitychange'),1);
  for(const type of ['pageshow','focus','online'])assert.equal(scope.count(type),1);

  coordinator.destroy();
  assert.equal(coordinator.active,false);
  assert.equal(documentLike.count('visibilitychange'),0);
  for(const type of ['pageshow','focus','online'])assert.equal(scope.count(type),0);

  documentLike.emit('visibilitychange');
  scope.emit('pageshow');
  scope.emit('focus');
  scope.emit('online');
  await tick();
  assert.equal(refreshes,0);
});

test('foreground session lifecycle is structurally forbidden from rehydrating or rerendering the workspace',()=>{
  const lifecycle=fs.readFileSync('src/m26/app/session-foreground-refresh.js','utf8');
  for(const forbidden of [/\bhydrate\s*\(/u,/\brender\s*\(/u,/innerHTML/u,/querySelector/u,/store\.reset/u]){
    assert.doesNotMatch(lifecycle,forbidden);
  }

  const application=fs.readFileSync('src/m26/app/application.js','utf8');
  const start=application.indexOf('sessionForegroundRefresh=createSessionForegroundRefreshCoordinator({');
  const end=application.indexOf('  root.addEventListener(\'submit\'',start);
  assert.ok(start>=0&&end>start);
  const wiring=application.slice(start,end);
  assert.match(wiring,/refreshSession:\(\)=>refreshSessionIfNeeded\(\)/u);
  assert.match(wiring,/isPermanentFailure:sessionFailureRequiresFreshLogin/u);
  assert.match(wiring,/onTransientFailure/u);
  assert.doesNotMatch(wiring,/hydrate\(|render\(|store\.reset/u);
});
