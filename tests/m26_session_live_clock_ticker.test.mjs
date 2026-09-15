import test from 'node:test';
import assert from 'node:assert/strict';

import {createSessionController} from '../src/m26/workflows/session-controller.js';

class FakeTarget{
  constructor(){
    this.listeners=new Map();
    this.visibilityState='visible';
  }
  addEventListener(type,listener){
    const set=this.listeners.get(type)||new Set();
    set.add(listener);
    this.listeners.set(type,set);
  }
  removeEventListener(type,listener){
    this.listeners.get(type)?.delete(listener);
  }
  emit(type){
    for(const listener of this.listeners.get(type)||[])listener();
  }
}

function makeNode(initial='stale'){
  return {textContent:initial};
}

function makeRoot(nodes){
  const target=new FakeTarget();
  target.ownerDocument={activeElement:null};
  target.querySelector=(selector)=>nodes[selector]||null;
  target.querySelectorAll=()=>[];
  return target;
}

function makeClock(){
  let nextId=1;
  const intervals=new Map();
  const cleared=[];
  return {
    intervals,
    cleared,
    setInterval(fn,ms){
      const id=nextId++;
      intervals.set(id,{fn,ms});
      return id;
    },
    clearInterval(id){
      cleared.push(id);
      intervals.delete(id);
    },
  };
}

const telemetryStub={start:async()=>{},pause:async()=>{},resume:async()=>{},stop:async()=>{}};

test('Session Live clock ticker updates elapsed and rest text without rerendering',()=>{
  const elapsed=makeNode();
  const rest=makeNode();
  const countdown=makeNode();
  const root=makeRoot({
    '[data-session-elapsed]':elapsed,
    '[data-session-rest]':rest,
    '[data-session-rest-countdown-value]':countdown,
  });
  const visibility=new FakeTarget();
  const lifecycle=new FakeTarget();
  const clock=makeClock();
  let renders=0;
  const now=Date.now();
  const context={
    actor:{role:'client',userId:'client-clock'},
    execution:{
      id:'execution-clock',
      status:'active',
      accumulatedActiveMs:0,
      activeSince:new Date(now-5000).toISOString(),
      restUntil:new Date(now+5000).toISOString(),
      syncStatus:'clean',
    },
  };
  const controller=createSessionController({
    root,
    getContext:()=>context,
    render:()=>{renders+=1;},
    liveTelemetryController:telemetryStub,
    lifecycleTarget:lifecycle,
    visibilityTarget:visibility,
    clockTarget:clock,
  });

  controller.mount();

  assert.match(elapsed.textContent,/^00:0[45]$/);
  assert.match(rest.textContent,/^[45] s$/);
  assert.match(countdown.textContent,/^[45] s$/);
  assert.equal(clock.intervals.size,1);
  assert.equal([...clock.intervals.values()][0].ms,1000);
  assert.equal(renders,0);

  elapsed.textContent='stale';
  rest.textContent='stale';
  countdown.textContent='stale';
  [...clock.intervals.values()][0].fn();

  assert.notEqual(elapsed.textContent,'stale');
  assert.notEqual(rest.textContent,'stale');
  assert.notEqual(countdown.textContent,'stale');
  assert.equal(renders,0);

  controller.destroy();
  assert.equal(clock.intervals.size,0);
  assert.equal(clock.cleared.length,1);
});

test('Session Live clock ticker stops while document is hidden and resumes when visible',()=>{
  const elapsed=makeNode();
  const root=makeRoot({'[data-session-elapsed]':elapsed});
  const visibility=new FakeTarget();
  const lifecycle=new FakeTarget();
  const clock=makeClock();
  const context={
    actor:{role:'client',userId:'client-clock'},
    execution:{
      id:'execution-clock-hidden',
      status:'active',
      accumulatedActiveMs:0,
      activeSince:new Date(Date.now()-3000).toISOString(),
      restUntil:null,
      syncStatus:'clean',
    },
  };
  const controller=createSessionController({
    root,
    getContext:()=>context,
    render:()=>{},
    liveTelemetryController:telemetryStub,
    lifecycleTarget:lifecycle,
    visibilityTarget:visibility,
    clockTarget:clock,
  });

  controller.mount();
  assert.equal(clock.intervals.size,1);

  visibility.visibilityState='hidden';
  visibility.emit('visibilitychange');
  assert.equal(clock.intervals.size,0);

  visibility.visibilityState='visible';
  visibility.emit('visibilitychange');
  assert.equal(clock.intervals.size,1);

  controller.destroy();
  assert.equal(clock.intervals.size,0);
});
