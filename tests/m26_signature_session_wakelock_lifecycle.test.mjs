import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceSessionFocus,teardownSessionFocus} from '../src/m26/ui/session-readiness.js';

const flush=async()=>{
  await Promise.resolve();
  await new Promise((resolve)=>setImmediate(resolve));
  await Promise.resolve();
};
function deferred(){
  let resolve;
  const promise=new Promise((done)=>{resolve=done;});
  return {promise,resolve};
}
function sentinel(){
  let releases=0;
  return {
    released:false,
    addEventListener(){},
    async release(){releases+=1;this.released=true;},
    get releases(){return releases;},
  };
}
function fixture(request){
  let liveState='active';
  const events=new Map();
  const document={
    visibilityState:'visible',
    defaultView:{navigator:{wakeLock:{request}}},
    addEventListener(type,handler){
      const handlers=events.get(type)||new Set();
      handlers.add(handler);
      events.set(type,handlers);
    },
    removeEventListener(type,handler){events.get(type)?.delete(handler);},
    emit(type){for(const handler of [...(events.get(type)||[])])handler();},
    listeners(type){return events.get(type)?.size||0;},
  };
  const live={
    getAttribute:(attribute)=>attribute==='data-session-live-state'?liveState:null,
    querySelector:()=>null,
  };
  const root={
    ownerDocument:document,
    querySelector:(selector)=>selector==='[data-session-live-state]'?live:null,
    querySelectorAll:()=>[],
    addEventListener(){},
    removeEventListener(){},
  };
  return {
    root,document,
    setState:(next)=>{liveState=next;},
    enhance:()=>enhanceSessionFocus({root,viewModel:{activeArea:'sesion',identity:{role:'coach'}}}),
    teardown:()=>teardownSessionFocus({root}),
  };
}

test('late screen wake-lock grant is released after the Coach pauses a session',async()=>{
  const pending=deferred();
  let requested=0;
  const f=fixture(()=>{requested+=1;return pending.promise;});
  f.enhance();
  await flush();
  assert.equal(requested,1);
  f.setState('paused');
  f.enhance();
  const stale=sentinel();
  pending.resolve(stale);
  await flush();
  assert.equal(stale.releases,1);
  assert.equal(requested,1);
  f.teardown();
  assert.equal(f.document.listeners('visibilitychange'),0);
});

test('background then foreground during an in-flight request discards stale lock and acquires a fresh one',async()=>{
  const queue=[];
  const f=fixture(()=>{
    const next=deferred();
    queue.push(next);
    return next.promise;
  });
  f.enhance();
  await flush();
  assert.equal(queue.length,1);
  f.document.visibilityState='hidden';
  f.document.emit('visibilitychange');
  f.document.visibilityState='visible';
  f.document.emit('visibilitychange');

  const stale=sentinel();
  queue[0].resolve(stale);
  await flush();
  assert.equal(stale.releases,1,'obsolete acquisition cannot survive a visibility round trip');
  assert.equal(queue.length,2,'a newly visible active session must reacquire');

  const current=sentinel();
  queue[1].resolve(current);
  await flush();
  assert.equal(current.releases,0);
  f.document.visibilityState='hidden';
  f.document.emit('visibilitychange');
  await flush();
  assert.equal(current.releases,1,'background releases current lock');
  f.teardown();
});

test('teardown invalidates in-flight wake lock and does not resurrect listeners',async()=>{
  const pending=deferred();
  let calls=0;
  const f=fixture(()=>{calls+=1;return pending.promise;});
  f.enhance();
  await flush();
  assert.equal(f.document.listeners('visibilitychange'),1);
  assert.equal(f.teardown(),true);
  assert.equal(f.document.listeners('visibilitychange'),0);
  const late=sentinel();
  pending.resolve(late);
  await flush();
  assert.equal(late.releases,1);
  assert.equal(calls,1);
});

test('synchronous browser wake-lock errors do not leave permanent pending request state',async()=>{
  let calls=0;
  const fresh=sentinel();
  const f=fixture(()=>{
    calls+=1;
    if(calls===1)throw new Error('temporary wake lock denial');
    return Promise.resolve(fresh);
  });
  f.enhance();
  await flush();
  assert.equal(calls,1);
  f.document.emit('visibilitychange');
  await flush();
  assert.equal(calls,2,'subsequent focus retry must remain available');
  f.document.visibilityState='hidden';
  f.document.emit('visibilitychange');
  await flush();
  assert.equal(fresh.releases,1);
  f.teardown();
});
