import test from 'node:test';
import assert from 'node:assert/strict';
import {renderGuidedExecution,explicitSessionEffort} from '../src/m26/workflows/session-ui.js';

const clientId='e7c92022-184a-4593-9305-4ed3c89ec844';
function closeView({feedback={sessionRpe:7,comment:'Correcta.',pain:false},events=[],syncStatus='clean',role='coach'}={}){
  return renderGuidedExecution({
    execution:{id:'close-qa',clientId,sessionId:'session-qa',status:'completed',syncStatus,
      accumulatedActiveMs:2_400_000,queue:[],results:{},events,feedback},
    session:{id:'session-qa',clientId,title:'Fuerza QA'},role,
  });
}

test('legacy missing RPE never implies RPE zero or no pain',()=>{
  for(const value of [null,undefined,'',0,'0','invalid']){
    const html=closeView({feedback:{sessionRpe:value,comment:'Sin RPE',pain:null}});
    assert.doesNotMatch(html,/RPE de sesión 0\/10/u);
    assert.match(html,/Molestias: sin dato registrado/u);
    assert.doesNotMatch(html,/Sin molestias registradas/u);
  }
});
test('missing planned RPE differs from explicit RIR zero',()=>{
  assert.equal(explicitSessionEffort(null,{min:1,max:10}),null);
  assert.equal(explicitSessionEffort('',{min:0}),null);
  assert.equal(explicitSessionEffort(0,{min:1,max:10}),null);
  assert.equal(explicitSessionEffort(0,{min:0}),0);
  assert.equal(explicitSessionEffort('7,5',{min:1,max:10}),7.5);
  assert.equal(explicitSessionEffort('NaN',{min:1,max:10}),null);
  assert.equal(explicitSessionEffort(11,{min:1,max:10}),null);
});
test('pain note and Coach comment appear escaped and actionable',()=>{
  const html=closeView({feedback:{sessionRpe:8,comment:'Molestia <script>mal</script>',pain:true,painNotes:'Rodilla & tobillo'}});
  assert.match(html,/Molestias registradas para seguimiento/u);
  assert.match(html,/Rodilla &amp; tobillo/u);
  assert.match(html,/Molestia &lt;script&gt;mal&lt;\/script&gt;/u);
  assert.doesNotMatch(html,/<script>mal<\/script>/u);
  assert.match(html,/Valora esa señal antes de adaptar la próxima sesión/u);
});
test('post-session adaptations prompt review without changing historical evidence',()=>{
  const events=[{type:'EXERCISE_SUBSTITUTED'},{type:'SET_SKIPPED'},{type:'SET_ADDED'}];
  const original=structuredClone(events);
  const html=closeView({events});
  assert.match(html,/Ajustes realizados/u);
  assert.match(html,/Revisa las adaptaciones registradas y sus motivos/u);
  assert.match(html,/data-m26-target-focus="action-outcome"/u);
  assert.deepEqual(events,original);
});
test('no pain registered is explicit and different from missing pain',()=>{
  const html=closeView({feedback:{sessionRpe:6,comment:'Sesión completada',pain:false}});
  assert.match(html,/Sin molestias registradas/u);
  assert.match(html,/Observación:[\s\S]*Sesión completada/u);
  assert.doesNotMatch(html,/Detalle de molestias/u);
  assert.match(html,/Revisa los resultados y el feedback/u);
});
test('pending local execution does not expose confirmed follow-up action',()=>{
  const html=closeView({syncStatus:'pending',feedback:{sessionRpe:7,comment:'Pendiente de red',pain:true,painNotes:'Revisar'}});
  assert.match(html,/pendientes de sincronización/u);
  assert.doesNotMatch(html,/data-m26-target-focus="action-outcome"/u);
  assert.doesNotMatch(html,/Valora esa señal antes de adaptar la próxima sesión/u);
});
test('Client sees only their own recorded feedback, never Coach action',()=>{
  const html=closeView({role:'client',feedback:{sessionRpe:7,comment:'Buen trabajo',pain:false}});
  assert.match(html,/Buen trabajo/u);
  assert.match(html,/Sin molestias registradas/u);
  assert.doesNotMatch(html,/data-m26-target-focus="action-outcome"/u);
});
