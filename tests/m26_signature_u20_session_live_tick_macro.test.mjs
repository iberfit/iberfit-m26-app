import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionController} from '../src/m26/workflows/session-controller.js';
import {renderGuidedExecution,liveHeartRatePresentation} from '../src/m26/workflows/session-ui.js';
import {deriveLiveSessionIntelligence} from '../src/m26/intelligence/live-session-intelligence.js';
import {createExecution,startExecution,recordSet,advanceExecution} from '../src/m26/workflows/session-execution.js';

const telemetryStub={start:async()=>{},pause:async()=>{},resume:async()=>{},stop:async()=>{}};
const sample=(bpm,at)=>({
  schemaVersion:'iberfit.telemetry.v1',eventType:'heart_rate_sample',
  recordedAt:new Date(at).toISOString(),quality:{grade:'alta',code:'valid'},
  raw:{heartRateBpm:bpm},context:{phase:'work',blockId:'block-1',exerciseId:'exercise-1',setNumber:1},
});
class FakeTarget{
  constructor(){this.listeners=new Map();this.visibilityState='visible';}
  addEventListener(name,listener){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(listener);}
  removeEventListener(name,listener){this.listeners.get(name)?.delete(listener);}
  emit(name){for(const f of this.listeners.get(name)||[])f();}
}
const makeNode=(text='',attrs={})=>({
  textContent:text,hidden:false,attrs:new Map(Object.entries(attrs)),
  getAttribute(key){return this.attrs.get(key)??null;},
  setAttribute(key,value){this.attrs.set(key,String(value));},
  removeAttribute(key){this.attrs.delete(key);},
});
function fakeClock(){
  let next=1;const timers=new Map();
  return {timers,setInterval(fn,ms){const id=next++;timers.set(id,{fn,ms});return id;},
    clearInterval(id){timers.delete(id);},
    tick(){for(const t of [...timers.values()])t.fn();}};
}
function harness({ageMs=1000,initialState='current',status='connected'}={}){
  const now=Date.now();
  const event=sample(136,now-ageMs);
  const execution={
    id:'u20-live',sessionId:'u20-session',clientId:'u20-client',
    status:'active',syncStatus:'clean',accumulatedActiveMs:0,
    activeSince:new Date(now-6000).toISOString(),queue:[{blockId:'block-1',exerciseId:'exercise-1',sets:1}],
    index:0,setIndex:0,results:{},
    liveTelemetry:{status,timeline:{events:[event]}},
  };
  const intel=deriveLiveSessionIntelligence(execution);
  const display=liveHeartRatePresentation(intel);
  const heading=makeNode('FC actual · '+display.bpm);
  const value=makeNode(display.bpm);
  const note=makeNode(display.note,{'data-session-live-reading-state':initialState,
    'data-session-live-last-at':intel.liveReading.lastAt});
  note.hidden=!display.note;
  const typed={value:'8',focusCount:0,focus(){this.focusCount++}};
  const root=new FakeTarget();
  const nodes={
    '[data-session-live-current-heading]':heading,
    '[data-session-live-current-value]':value,
    '[data-session-live-reading-note]':note,
  };
  root.ownerDocument={activeElement:typed};
  root.querySelector=(selector)=>nodes[selector]||null;
  root.querySelectorAll=()=>[];
  const visibility=new FakeTarget(),lifecycle=new FakeTarget(),clock=fakeClock();
  let renders=0;
  const ctrl=createSessionController({root,
    getContext:()=>({execution,actor:{role:'coach'}}),
    render:()=>{renders++;},liveTelemetryController:telemetryStub,
    visibilityTarget:visibility,lifecycleTarget:lifecycle,clockTarget:clock,
  });
  ctrl.mount();
  return {execution,event,root,heading,value,note,typed,clock,visibility,ctrl,
    get renders(){return renders;}};
}

test('U20: current FC expires on an ordinary clock tick without a telemetry callback or full render',()=>{
  const h=harness();
  assert.equal(h.clock.timers.size,1,'HR-only surface must retain a clock even without a visible rest timer');
  assert.equal(h.value.textContent,'136 lpm');
  const beforeRenders=h.renders;
  // Advance age across the 30s boundary without waiting or changing the user's fields.
  const expiredAt=new Date(Date.now()-31000).toISOString();
  h.event.recordedAt=expiredAt;
  h.note.setAttribute('data-session-live-last-at',expiredAt);
  h.clock.tick();
  assert.equal(h.value.textContent,'—');
  assert.equal(h.heading.textContent,'FC actual · —');
  assert.equal(h.note.getAttribute('data-session-live-reading-state'),'stale');
  assert.equal(h.note.hidden,false);
  assert.match(h.note.textContent,/Última FC registrada: 136 lpm/u);
  assert.match(h.note.textContent,/Esperando una lectura reciente/u);
  assert.equal(h.renders,beforeRenders,'the session form must not be recreated');
  assert.equal(h.typed.value,'8');
  assert.strictEqual(h.root.ownerDocument.activeElement,h.typed,'keyboard/touch focus remains stable');
  const notice=h.note.textContent;
  h.clock.tick();
  assert.equal(h.note.textContent,notice,'do not re-announce a stale warning every second');
  h.ctrl.destroy();assert.equal(h.clock.timers.size,0);
});

test('U20: background stops polling; return to foreground immediately marks stale FC',()=>{
  const h=harness();
  h.visibility.visibilityState='hidden';
  h.visibility.emit('visibilitychange');
  assert.equal(h.clock.timers.size,0);
  const expiredAt=new Date(Date.now()-45000).toISOString();
  h.event.recordedAt=expiredAt;
  h.note.setAttribute('data-session-live-last-at',expiredAt);
  h.visibility.visibilityState='visible';
  h.visibility.emit('visibilitychange');
  assert.equal(h.value.textContent,'—');
  assert.equal(h.note.getAttribute('data-session-live-reading-state'),'stale');
  assert.equal(h.clock.timers.size,1);
  h.ctrl.destroy();
});

test('U20: disconnected HR cannot keep a displayed current value',()=>{
  const h=harness();
  h.execution.liveTelemetry.status='disconnected';
  h.clock.tick();
  assert.equal(h.value.textContent,'—');
  assert.equal(h.note.getAttribute('data-session-live-reading-state'),'not-connected');
  assert.match(h.note.textContent,/Sin señal en directo/u);
  h.ctrl.destroy();
});

test('U20: immutable sample time remains truthful after repeated ticks',()=>{
  const stale=deriveLiveSessionIntelligence({liveTelemetry:{
    status:'connected',timeline:{events:[sample(120,Date.now()-90000)]},
  }});
  const view=liveHeartRatePresentation(stale);
  assert.equal(view.state,'stale');
  assert.match(view.note,/Última FC registrada: 120 lpm/u);
  assert.doesNotMatch(view.note,/hace \d+ s|hace \d+ min/u);
  assert.deepEqual(Object.keys(view).sort(),['bpm','note','state']);
});

const session={id:'u20-session',clientId:'u20-client',title:'Entrenamiento',durationMinutes:45,
  status:'published',blocks:[{type:'exercise',id:'block-1',exerciseId:'exercise-1',sets:2,reps:'10',restSeconds:60,tempo:'controlado',targetRpe:7,targetRir:3}]};
const catalog={get(id){return id==='exercise-1'?{id,name_es:'Sentadilla',cues:[],pattern:'squat'}:null;},search(){return [];}};
test('U20: live and rest timers stay visually accurate without screen-reader announcements every second',()=>{
  const execution=createExecution({session,clientId:session.clientId,executionId:'u20-a11y'});
  startExecution(execution);
  let html=renderGuidedExecution({execution,session,catalog,role:'coach'});
  assert.match(html,/m26-session-timers" aria-live="off"/u);
  assert.match(html,/role="timer" aria-live="off" data-session-elapsed/u);
  recordSet(execution,session,{reps:10,rpe:7,rir:0});
  html=renderGuidedExecution({execution,session,catalog,role:'coach'});
  assert.match(html,/m26-session-rest-countdown" aria-live="off"/u);
  assert.match(html,/role="timer" aria-live="off" data-session-rest-countdown-value/u);
});

test('U20: registered zero repetitions remain visible in previous-set review',()=>{
  const execution=createExecution({session,clientId:session.clientId,executionId:'u20-zero-reps'});
  startExecution(execution);
  recordSet(execution,session,{reps:0,rpe:8,rir:0});
  advanceExecution(execution);
  const html=renderGuidedExecution({execution,session,catalog,role:'client'});
  assert.match(html,/data-session-previous-set/u);
  assert.match(html,/0 reps/u);
  assert.match(html,/RIR 0/u);
});
