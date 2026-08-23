import test from 'node:test';import assert from 'node:assert/strict';
import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise,validateSessionDraft} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet,advanceExecution,retreatExecution,finishExecution,buildExecutionCommand,substituteExercise,markExecutionSync} from '../src/m26/workflows/session-execution.js';
import {renderSessionBuilder,renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {validateCommandCatalog,M26_REQUIRED_COMMANDS} from '../src/m26/command-catalog.js';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync(new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url)));const catalog=createExerciseCatalog(data);
function session(){const d=createSessionDraft({clientId:'c1'});addCatalogExercise(d,catalog.list()[0].id,catalog,{sets:2,reps:'10'});return d;}
test('builder renders real controls and catalog results',()=>{const d=session();const html=renderSessionBuilder({draft:d,catalog});assert.match(html,/data-session-action="publish"/);assert.match(html,/data-session-action="add-exercise"/);assert.doesNotMatch(html,/onclick=/);});
test('execution supports start record advance and rewind',()=>{const s=session();const x=createExecution({session:s,clientId:'c1'});startExecution(x);recordSet(x,s,{reps:10,rpe:7});advanceExecution(x);assert.equal(x.setIndex,1);retreatExecution(x);assert.equal(x.setIndex,0);});
test('execution requires feedback before command',()=>{const s=session();const x=createExecution({session:s,clientId:'c1'});startExecution(x);recordSet(x,s,{reps:10,rpe:7});advanceExecution(x);recordSet(x,s,{reps:9,rpe:8});advanceExecution(x);assert.equal(x.status,'awaiting_feedback');assert.throws(()=>buildExecutionCommand(x),/NOT_COMPLETED/);finishExecution(x,{sessionRpe:8,comment:'Sesión completada'});assert.equal(buildExecutionCommand(x).type,'EJECUCION_COMPLETAR');});
test('substitution only accepts catalog exercise and reason',()=>{const s=session();const x=createExecution({session:s,clientId:'c1'});const a=x.queue[0].exerciseId,b=catalog.list()[1].id;assert.throws(()=>substituteExercise(x,s,{fromExerciseId:a,toExerciseId:b,catalog,reason:''}),/REASON/);substituteExercise(x,s,{fromExerciseId:a,toExerciseId:b,catalog,reason:'molestia'});assert.equal(x.queue[0].exerciseId,b);});
test('completed execution closes the loop into confirmed progress',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:'c1'});

  startExecution(x);

  recordSet(x,s,{reps:10,rpe:7});
  advanceExecution(x);

  recordSet(x,s,{reps:9,rpe:8});
  advanceExecution(x);

  finishExecution(x,{
    sessionRpe:8,
    comment:'Sesión completada correctamente',
    pain:false,
  });

  let html=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
  });

  assert.match(html,/Sesión completada/);
  assert.match(html,/RPE de sesión 8\/10/);
  assert.match(html,/data-m26-area="progreso"/);
  assert.match(html,/>Ver mi progreso</);
  assert.match(html,/resultados y tu feedback quedaron confirmados/i);

  markExecutionSync(
    x,
    'pending',
    {operationId:'op-session-finish'}
  );

  html=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
  });

  assert.match(html,/pendiente de sincronización/i);
  assert.doesNotMatch(html,/data-m26-area="progreso"/);
  assert.doesNotMatch(html,/>Ver mi progreso</);
});
test('guided execution renders navigation and no inline handlers',()=>{const s=session();const x=createExecution({session:s,clientId:'c1'});startExecution(x);const html=renderGuidedExecution({execution:x,session:s,catalog});assert.match(html,/complete-set/);assert.match(html,/data-session-action="previous"/);assert.doesNotMatch(html,/onclick=/);});
test('command catalog reports exact missing commands',()=>{const result=validateCommandCatalog(M26_REQUIRED_COMMANDS.slice(0,-1));assert.equal(result.ok,false);assert.deepEqual(result.missing,['INTELIGENCIA_APLICAR_A_BORRADOR']);});
test('session remains valid after catalog selection',()=>assert.equal(validateSessionDraft(session(),catalog).ok,true));
test('builder y sesión muestran la última referencia confirmada sin aplicar la carga automáticamente',()=>{
  const s=session();
  const exerciseId=s.blocks[0].exerciseId;

  const memory={
    clientId:'c1',
    exerciseId,
    exposureCount:3,
    latest:{
      completedAt:'2026-08-15T10:00:00Z',
      lastLoad:{
        raw:'22.5 kg',
        value:22.5,
        unit:'kg',
        comparableKey:'kg',
      },
      averageRpe:8,
      averageRir:2,
      totalSeconds:null,
      sets:[
        {
          load:{raw:'22.5 kg'},
          reps:10,
          seconds:null,
          rpe:8,
          rir:2,
        },
        {
          load:{raw:'22.5 kg'},
          reps:9,
          seconds:null,
          rpe:8.5,
          rir:1,
        },
      ],
    },
    comparison:{
      lastLoad:{
        value:2.5,
        unit:'kg',
        comparableKey:'kg',
        percent:12.5,
      },
    },
  };

  const exerciseMemoryFor=(id)=>
    id===exerciseId
      ?memory
      :null;

  const builder=renderSessionBuilder({
    draft:s,
    catalog,
    exerciseMemoryFor,
  });

  assert.match(builder,/Última vez/);
  assert.match(builder,/22\.5 kg/);
  assert.match(builder,/Referencia confirmada/);

  const x=createExecution({
    session:s,
    clientId:'c1',
  });

  startExecution(x);

  const guided=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
    exerciseMemoryFor,
  });

  assert.match(guided,/Memoria de rendimiento/);
  assert.match(guided,/Última vez/);
  assert.match(guided,/22\.5 kg/);
  assert.match(guided,/RPE medio 8/);
  assert.match(guided,/RIR medio 2/);
  assert.match(guided,/12\.5%/);
  assert.match(
    guided,
    /No modifica automáticamente la carga ni la prescripción actual/
  );

  assert.match(
    guided,
    /data-set-field="load">/
  );

  assert.doesNotMatch(
    guided,
    /data-set-field="load"[^>]*value=/
  );
});
test('Session Live muestra un preflight claro antes de iniciar',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:'c1'});
  const html=renderGuidedExecution({execution:x,session:s,catalog});
  assert.match(html,/data-session-live-state="ready"/);
  assert.match(html,/data-session-live-summary/);
  assert.match(html,/Tu próxima sesión/);
  assert.match(html,/Series planificadas/);
  assert.match(html,/data-session-action="start"/);
});

test('Session Live no ofrece avance inválido antes de registrar la serie',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:'c1'});
  startExecution(x);
  const html=renderGuidedExecution({execution:x,session:s,catalog});
  assert.match(html,/data-session-live-state="active"/);
  assert.match(html,/data-session-live-entry/);
  assert.match(html,/data-session-progress-label/);
  assert.match(html,/data-session-action="previous"/);
  assert.doesNotMatch(html,/data-session-action="next"/);
});

test('Session Live convierte el descanso en el siguiente foco de acción',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:'c1'});
  startExecution(x);
  recordSet(x,s,{reps:10,rpe:7});
  x.restUntil=new Date(Date.now()+60000).toISOString();
  const html=renderGuidedExecution({execution:x,session:s,catalog});
  assert.match(html,/data-session-live-state="rest"/);
  assert.match(html,/data-session-rest-focus/);
  assert.match(html,/data-session-rest-active="true"/);
  assert.match(html,/data-session-next-preview/);
  assert.match(html,/Continuar ahora/);
  assert.match(html,/data-session-action="rest-minus"/);
  assert.match(html,/data-session-action="rest-plus"/);
  assert.match(html,/data-session-action="next"/);
});

test('Session Live resume ejecución confirmada al cerrar',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:'c1'});
  startExecution(x);
  recordSet(x,s,{reps:10,rpe:7});
  advanceExecution(x);
  recordSet(x,s,{reps:9,rpe:8});
  advanceExecution(x);
  let html=renderGuidedExecution({execution:x,session:s,catalog});
  assert.match(html,/data-session-live-state="feedback"/);
  assert.match(html,/data-session-live-feedback/);
  assert.match(html,/Series/);
  finishExecution(x,{sessionRpe:8,comment:'Bien',pain:false});
  html=renderGuidedExecution({execution:x,session:s,catalog});
  assert.match(html,/data-session-live-state="completed"/);
  assert.match(html,/m26-session-completion-grid/);
  assert.match(html,/Ejercicios registrados/);
});

test('Session Live tiene una capa visual responsive y acotada',()=>{
  const css=fs.readFileSync(new URL('../src/m26/design/role-surfaces.css',import.meta.url),'utf8');
  assert.match(css,/RC71_1_SESSION_LIVE_UX_BEGIN/);
  assert.match(css,/\.m26-session-rest-countdown/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/RC71_1_SESSION_LIVE_UX_END/);
});
test('Session Live conserva contrato histórico de ajustes y alternativas RC48',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:'c1'});
  startExecution(x);
  const html=renderGuidedExecution({execution:x,session:s,catalog});
  assert.match(html,/<details class="m26-session-options">/);
  assert.match(html,/Ajustes y alternativas/);
});
