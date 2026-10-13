import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet,advanceExecution,updateActiveSetDraft,updateFinalFeedbackDraft} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const exercise={id:'m34-squat',name_es:'Sentadilla',name:'Sentadilla',pattern:'squat',cues:[]};
const catalog={get:id=>id===exercise.id?exercise:null,has:id=>id===exercise.id,list:()=>[exercise],search:()=>[exercise]};
function fixture(sets=2){
  const session=createSessionDraft({clientId:'client-m34',title:'Fuerza y control'});
  addCatalogExercise(session,exercise.id,catalog,{sets,reps:'8',restSeconds:70,targetRpe:7,targetRir:3});
  const execution=createExecution({session,clientId:'client-m34',executionId:'execution-m34'});
  startExecution(execution);
  return {session,execution};
}
const htmlFor=(role,context)=>renderGuidedExecution({...context,catalog,role});

test('M34 Cliente: registro de fuerza ofrece RPE real 1-10 en botones táctiles sin enviar una serie',()=>{
  const context=fixture();
  const html=htmlFor('client',context);
  assert.match(html,/data-session-client-rpe-quick/);
  const controls=html.match(/data-session-action="set-rpe-quick" data-rpe-value="[0-9]+"/g)||[];
  assert.equal(controls.length,10);
  for(let n=1;n<=10;n++)assert.match(html,new RegExp('data-session-action="set-rpe-quick" data-rpe-value="'+n+'"'));
  assert.match(html,/aria-pressed="false"/);
  assert.match(html,/data-session-action="complete-set"/);
  assert.equal(context.execution.events.filter(event=>event?.type==='SET_RECORDED').length,0);
});
test('M34 Coach: sugerencias rápidas nunca interpretan falta de objetivo RPE como RPE 0',()=>{
  const context=fixture();
  delete context.execution.queue[0].prescription.targetRpe;
  const html=htmlFor('coach',context);
  const controls=[...html.matchAll(/data-session-action="set-rpe-quick" data-rpe-value="([^"]+)"/g)].map(m=>Number(m[1]));
  assert.deepEqual(controls,[6,7,8]);
  assert.match(html,/placeholder="RPE real"/);
});
test('M34 Cliente: el RPE final dispone de 10 botones y mantiene comentario y dolor obligatorios',()=>{
  const context=fixture(1);
  recordSet(context.execution,context.session,{reps:8,rpe:8});
  advanceExecution(context.execution);
  assert.equal(context.execution.status,'awaiting_feedback');
  const html=htmlFor('client',context);
  assert.match(html,/data-session-feedback-rpe-quick/);
  assert.equal((html.match(/data-session-action="set-session-rpe-quick"/g)||[]).length,10);
  assert.match(html,/data-session-feedback-comment/);
  assert.match(html,/data-session-feedback-pain/);
  assert.match(html,/data-session-action="finish"/);
});
test('M34: pulsación rápida actualiza borradores locales mediante servicios canónicos, sin cerrar sesión',()=>{
  const context=fixture();
  const draft=updateActiveSetDraft(context.execution,context.session,{reps:'8',load:'20 kg',rpe:'10',rir:'0'});
  assert.ok(draft);
  assert.equal(Number(context.execution.activeSetDraft.values.rpe),10);
  assert.equal(Number(context.execution.activeSetDraft.values.rir),0);
  assert.equal(context.execution.status,'active');
  const feedback=fixture(1);
  recordSet(feedback.execution,feedback.session,{reps:8,rpe:8});
  advanceExecution(feedback.execution);
  const close=updateFinalFeedbackDraft(feedback.execution,{sessionRpe:'10',comment:'Muy bien',pain:false});
  assert.ok(close);
  assert.equal(Number(feedback.execution.finalFeedbackDraft.values.sessionRpe),10);
  assert.equal(feedback.execution.finalFeedbackDraft.values.comment,'Muy bien');
  assert.equal(feedback.execution.status,'awaiting_feedback');
});
test('M34: selector de pulsación es compartido por ambos roles y el diseño conserva teclado/foco accesibles',()=>{
  const controller=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/m26/design/premium-ux.css',import.meta.url),'utf8');
  assert.match(controller,/if\(action==='set-rpe-quick'\)/);
  assert.match(controller,/if\(action==='set-session-rpe-quick'\)/);
  const finalHandler=controller.slice(controller.indexOf("if(action==='set-session-rpe-quick')"),controller.indexOf("if(action==='exit-session')"));
  assert.doesNotMatch(finalHandler,/isCoachContext/);
  assert.match(finalHandler,/queueExecutionDraftPersist\(context\)/);
  assert.match(css,/\.m26-session-live-v3 \.m26-session-client-rpe-quick button:focus-visible/);
  assert.match(css,/min-height:3\.15rem/);
  assert.match(css,/touch-action:manipulation/);
});
