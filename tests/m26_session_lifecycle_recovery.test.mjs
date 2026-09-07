import test from 'node:test';
import assert from 'node:assert/strict';

import {createExecution,startExecution} from '../src/m26/workflows/session-execution.js';
import {createSessionController} from '../src/m26/workflows/session-controller.js';

const session={
  id:'session-lifecycle-recovery',
  blocks:[{
    id:'block-1',
    type:'exercise',
    exerciseId:'exercise-1',
    sets:2,
    reps:'8-10',
    restSeconds:60,
    targetRpe:7,
    targetRir:3,
  }],
};

class FakeTarget{
  constructor(){this.listeners=new Map();this.visibilityState='visible';}
  addEventListener(type,listener){const listeners=this.listeners.get(type)||new Set();listeners.add(listener);this.listeners.set(type,listeners);}
  removeEventListener(type,listener){this.listeners.get(type)?.delete(listener);}
  emit(type,event={}){for(const listener of this.listeners.get(type)||[])listener(event);}
}

function field(name,value){return {value,getAttribute(attribute){return attribute==='data-set-field'?name:null;}};}
function inputTarget(match){return {closest(selector){return match(selector);}};}
function telemetryStub(){return {start:async()=>{},pause:async()=>{},resume:async()=>{},stop:async()=>{}};}
async function settle(){await new Promise((resolve)=>setTimeout(resolve,0));await new Promise((resolve)=>setTimeout(resolve,0));}

function activeContext(){
  const execution=createExecution({session,clientId:'client-1',executionId:'execution-lifecycle-1'});
  startExecution(execution);
  const persisted=[];
  const recoveryCoordinator={
    async persist(payload){persisted.push(structuredClone(payload));},
    async settle(){},
  };
  return {execution,persisted,recoveryCoordinator};
}

function rootWith({setFields=[],feedback={}}={}){
  const root=new FakeTarget();
  root.querySelectorAll=(selector)=>selector==='[data-set-field]'?setFields:[];
  root.querySelector=(selector)=>{
    if(selector==='[data-session-feedback-rpe]')return feedback.rpe||null;
    if(selector==='[data-session-feedback-comment]')return feedback.comment||null;
    if(selector==='[data-session-feedback-pain]')return feedback.pain||null;
    if(selector==='[data-session-feedback-pain-notes]')return feedback.painNotes||null;
    return null;
  };
  return root;
}

test('visibility hidden flushes the latest active-set draft before the debounce expires',async()=>{
  const reps=field('reps','11');
  const load=field('load','47.5 kg');
  const rpe=field('rpe','8');
  const rir=field('rir','2');
  const seconds=field('seconds','');
  const notes=field('notes','Última repetición controlada');
  const root=rootWith({setFields:[reps,seconds,load,rpe,rir,notes]});
  const lifecycleTarget=new FakeTarget();
  const visibilityTarget=new FakeTarget();
  const {execution,persisted,recoveryCoordinator}=activeContext();
  const context={execution,session,recoveryCoordinator,appointmentId:'appointment-1',sessionRevision:4};
  const controller=createSessionController({root,getContext:()=>context,render:()=>{},autosaveDelayMs:2000,liveTelemetryController:telemetryStub(),lifecycleTarget,visibilityTarget});
  controller.mount();

  root.emit('input',{target:inputTarget((selector)=>selector==='[data-set-field]'?reps:null)});
  assert.equal(execution.activeSetDraft?.values.reps,'11');
  assert.equal(persisted.length,0,'el debounce todavía no debe haber persistido');

  visibilityTarget.visibilityState='hidden';
  visibilityTarget.emit('visibilitychange');
  await settle();

  assert.ok(persisted.length>=1);
  const snapshot=persisted.at(-1);
  assert.equal(snapshot.execution.activeSetDraft.values.reps,'11');
  assert.equal(snapshot.execution.activeSetDraft.values.load,'47.5 kg');
  assert.equal(snapshot.execution.activeSetDraft.values.rpe,'8');
  assert.equal(snapshot.execution.activeSetDraft.values.rir,'2');
  assert.equal(snapshot.execution.activeSetDraft.values.notes,'Última repetición controlada');
});

test('pagehide flushes mandatory final-feedback draft without waiting for the debounce',async()=>{
  const rpe={value:'9'};
  const comment={value:'Sesión intensa pero estable'};
  const pain={checked:true};
  const painNotes={value:'Molestia leve en rodilla derecha'};
  const root=rootWith({feedback:{rpe,comment,pain,painNotes}});
  const lifecycleTarget=new FakeTarget();
  const visibilityTarget=new FakeTarget();
  const {execution,persisted,recoveryCoordinator}=activeContext();
  execution.status='awaiting_feedback';
  const context={execution,session,recoveryCoordinator,appointmentId:'appointment-2',sessionRevision:7};
  const controller=createSessionController({root,getContext:()=>context,render:()=>{},autosaveDelayMs:2000,liveTelemetryController:telemetryStub(),lifecycleTarget,visibilityTarget});
  controller.mount();

  const feedbackSelector='[data-session-feedback-rpe],[data-session-feedback-comment],[data-session-feedback-pain],[data-session-feedback-pain-notes]';
  root.emit('input',{target:inputTarget((selector)=>selector===feedbackSelector?comment:null)});
  assert.equal(execution.finalFeedbackDraft?.values.comment,'Sesión intensa pero estable');
  assert.equal(persisted.length,0,'el debounce todavía no debe haber persistido');

  lifecycleTarget.emit('pagehide');
  await settle();

  assert.ok(persisted.length>=1);
  const snapshot=persisted.at(-1);
  assert.equal(snapshot.execution.finalFeedbackDraft.values.sessionRpe,'9');
  assert.equal(snapshot.execution.finalFeedbackDraft.values.comment,'Sesión intensa pero estable');
  assert.equal(snapshot.execution.finalFeedbackDraft.values.pain,true);
  assert.equal(snapshot.execution.finalFeedbackDraft.values.painNotes,'Molestia leve en rodilla derecha');
});
