import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {advanceExecution,createExecution,startExecution,recordSet} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
import {dispatchSessionAction} from '../src/m26/workflows/session-controller.js';

const data=JSON.parse(
  fs.readFileSync(
    new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url)
  )
);
const catalog=createExerciseCatalog(data);

function session(){
  const draft=createSessionDraft({
    clientId:'client-live-v3',
    title:'Sesión Live V3',
    durationMinutes:50,
  });
  const exercise=catalog.list()[0];
  addCatalogExercise(draft,exercise.id,catalog,{
    sets:2,
    reps:'10',
    plannedLoad:'20 kg',
    restSeconds:75,
    tempo:'controlado',
    targetRpe:7,
    targetRir:3,
    prescriptionNotes:'Mantener técnica estable.',
    progression:'Progresar solo con ejecución confirmada.',
  });
  return draft;
}

test('Live Workout V3 pone navegación serie y registro antes del contexto secundario',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:s.clientId});
  startExecution(x);

  const html=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
    role:'client',
  });

  assert.match(html,/m26-session-live-v3/);
  assert.match(html,/data-session-live-v3/);
  assert.doesNotMatch(html,/m26-session-live-quick-actions/);
  assert.doesNotMatch(html,/aria-label="Acciones de navegación"/);
  assert.doesNotMatch(html,/data-session-action="previous"/);
  assert.match(html,/m26-session-live-entry-v3/);
  assert.match(html,/Registra repeticiones o tiempo/);
  assert.match(html,/data-session-action="complete-set"/);
  assert.match(html,/m26-session-live-secondary-context/);
  assert.match(html,/Historial, datos y ajustes/);

  const focus=html.indexOf('data-session-touch-focus');
  const entry=html.indexOf('data-session-live-entry');
  const prescription=html.indexOf('data-session-live-prescription');
  const secondary=html.indexOf('m26-session-live-secondary-context');

  assert.ok(focus>=0);
  assert.ok(entry>focus);
  assert.ok(prescription>entry);
  assert.ok(secondary>prescription);

  recordSet(x,s,{reps:10,rpe:7});
  advanceExecution(x);
  const laterHtml=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
    role:'client',
  });
  assert.match(laterHtml,/m26-session-live-quick-actions/);
  assert.match(laterHtml,/aria-label="Acciones de navegación"/);
  assert.match(laterHtml,/data-session-action="previous"/);
});

test('Live Workout V3 mantiene ajustes críticos dentro del disclosure secundario',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:s.clientId});
  startExecution(x);

  const html=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
    role:'client',
  });

  const secondary=html.slice(html.indexOf('m26-session-live-secondary-context'));
  for(const action of [
    'substitute',
    'skip-exercise',
    'pause',
    'cancel',
  ]){
    assert.match(secondary,new RegExp(`data-session-action="${action}"`));
  }
  assert.match(secondary,/Ajustes y alternativas/);
  assert.match(secondary,/Pausa o cancelación/);
  assert.doesNotMatch(html,/onclick=/);
});

test('Live Workout V3 mantiene herramientas estructurales del Coach',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:s.clientId});
  startExecution(x);

  const html=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
    role:'coach',
  });

  assert.match(html,/Ajuste estructural del Coach/);
  assert.match(html,/data-session-action="add-set"/);
  assert.match(html,/data-session-live-add-exercise/);
  assert.match(html,/data-session-action="add-live-exercise"/);
  assert.match(html,/data-session-action="substitute"/);
  assert.match(html,/data-session-action="skip-exercise"/);
});

test('Coach pausa la sesión desde el mando rápido usando la acción real y sin duplicados',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:s.clientId});
  startExecution(x);

  const html=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
    role:'coach',
  });

  const quick=html.indexOf('data-session-coach-quick-controls');
  const pause=html.indexOf('data-session-action="pause"');
  const workbench=html.indexOf('m26-session-live-workbench');
  const secondary=html.indexOf('m26-session-live-secondary-context');

  assert.ok(quick>=0);
  assert.ok(pause>quick);
  assert.ok(pause<workbench);
  assert.ok(secondary>workbench);
  assert.equal((html.match(/data-session-action="pause"/g)||[]).length,1);
  assert.match(html,/aria-label="Controles rápidos de sesión"/);
  assert.match(html,/m26-session-live-quick-pause/);

  const result=dispatchSessionAction({
    action:'pause',
    execution:x,
    session:s,
    catalog,
    actor:{role:'coach'},
  });

  assert.equal(result.kind,'execution');
  assert.equal(x.status,'paused');
  assert.equal(x.restUntil,null);

  const pausedHtml=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
    role:'coach',
  });
  assert.match(pausedHtml,/data-session-live-state="paused"/);
  assert.match(pausedHtml,/data-session-action="resume"/);
  assert.match(pausedHtml,/Tu progreso está conservado/);
});

test('Coach puede completar la serie desde Enter en RPE sin exponer el atajo al Cliente',()=>{
  const s=session();
  const coachExecution=createExecution({session:s,clientId:s.clientId});
  startExecution(coachExecution);
  const coachHtml=renderGuidedExecution({execution:coachExecution,session:s,catalog,role:'coach'});
  assert.match(coachHtml,/data-set-field="rpe" data-session-enter-complete/);

  const clientExecution=createExecution({session:s,clientId:s.clientId});
  startExecution(clientExecution);
  const clientHtml=renderGuidedExecution({execution:clientExecution,session:s,catalog,role:'client'});
  assert.doesNotMatch(clientHtml,/data-session-enter-complete/);
});

test('Coach agrupa el registro de serie sin perder campos ni alterar el Cliente',()=>{
  const s=session();
  const coachExecution=createExecution({session:s,clientId:s.clientId});
  startExecution(coachExecution);
  const coachHtml=renderGuidedExecution({execution:coachExecution,session:s,catalog,role:'coach'});

  assert.match(coachHtml,/data-session-coach-set-fields/);
  assert.match(coachHtml,/data-session-entry-group="work"/);
  assert.match(coachHtml,/data-session-entry-group="load"/);
  assert.match(coachHtml,/data-session-entry-group="effort"/);

  for(const field of ['reps','seconds','load','rpe','rir']){
    assert.equal(
      (coachHtml.match(new RegExp(`data-set-field="${field}"`,'g'))||[]).length,
      1,
      field,
    );
  }
  assert.match(coachHtml,/data-set-field="rpe" data-session-enter-complete/);
  assert.doesNotMatch(coachHtml,/data-set-field="load"[^>]*value=/);

  const work=coachHtml.indexOf('data-session-entry-group="work"');
  const load=coachHtml.indexOf('data-session-entry-group="load"');
  const effort=coachHtml.indexOf('data-session-entry-group="effort"');
  const complete=coachHtml.indexOf('data-session-action="complete-set"');
  assert.ok(work>=0&&load>work&&effort>load&&complete>effort);

  const clientExecution=createExecution({session:s,clientId:s.clientId});
  startExecution(clientExecution);
  const clientHtml=renderGuidedExecution({execution:clientExecution,session:s,catalog,role:'client'});
  assert.doesNotMatch(clientHtml,/data-session-coach-set-fields/);
  assert.match(clientHtml,/m26-field-grid m26-session-set-fields/);
  for(const field of ['reps','seconds','load','rpe','rir']){
    assert.equal(
      (clientHtml.match(new RegExp(`data-set-field="${field}"`,'g'))||[]).length,
      1,
      field,
    );
  }
});


test('atajo Enter del Coach reutiliza el botón estándar y conserva guardas de teclado',()=>{
  const source=fs.readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
  assert.match(source,/root\.addEventListener\('keydown',keydown\)/);
  assert.match(source,/root\.removeEventListener\('keydown',keydown\)/);
  assert.match(source,/!isCoachContext\(context\)/);
  assert.match(source,/event\?\.key!==\'Enter\'/);
  assert.match(source,/event\?\.repeat/);
  assert.match(source,/event\?\.isComposing/);
  assert.match(source,/data-session-enter-complete/);
  assert.match(source,/data-session-action="complete-set"/);
  assert.match(source,/button\.click\?\.\(\)/);
});

test('Live Workout V3 hace del descanso la superficie dominante sin perder corrección ni contexto',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:s.clientId});
  startExecution(x);
  recordSet(x,s,{reps:10,load:'20 kg',rpe:7,rir:3});
  x.restUntil=new Date(Date.now()+75000).toISOString();

  const html=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
    role:'client',
  });

  assert.match(html,/data-session-live-state="rest"/);
  assert.match(html,/m26-session-rest-focus-v3/);
  assert.match(html,/Tu serie ya está guardada/);
  assert.match(html,/m26-session-live-workbench is-rest/);
  assert.match(html,/m26-session-rest-countdown/);
  assert.match(html,/data-session-action="rest-minus"/);
  assert.match(html,/data-session-action="rest-plus"/);
  assert.match(html,/data-session-action="next"/);
  assert.match(html,/data-session-action="correct-set"/);
  assert.match(html,/data-session-live-prescription/);
  assert.match(html,/m26-session-live-secondary-context/);
});

test('Live Workout V3 conserva memoria confirmada sin autocompletar la carga real',()=>{
  const s=session();
  const exerciseId=s.blocks[0].exerciseId;
  const x=createExecution({session:s,clientId:s.clientId});
  startExecution(x);

  const memory={
    clientId:s.clientId,
    exerciseId,
    exposureCount:2,
    latest:{
      completedAt:'2026-09-10T10:00:00Z',
      lastLoad:{raw:'24 kg',value:24,unit:'kg',comparableKey:'kg'},
      sets:[{load:{raw:'24 kg'},reps:10,rpe:7,rir:3}],
      averageRpe:7,
      averageRir:3,
    },
    comparison:{lastLoad:null},
  };

  const html=renderGuidedExecution({
    execution:x,
    session:s,
    catalog,
    role:'client',
    exerciseMemoryFor:(id)=>id===exerciseId?memory:null,
  });

  assert.match(html,/Memoria de rendimiento/);
  assert.match(html,/24 kg/);
  assert.match(html,/Historial, datos y ajustes/);
  assert.match(html,/data-set-field="load">/);
  assert.doesNotMatch(html,/data-set-field="load"[^>]*value="24 kg"/);
});

test('Live Workout V3 mantiene corrección y omisión de serie',()=>{
  const s=session();
  const x=createExecution({session:s,clientId:s.clientId});
  startExecution(x);

  let html=renderGuidedExecution({execution:x,session:s,catalog,role:'client'});
  assert.match(html,/data-session-action="skip-set"/);

  recordSet(x,s,{reps:10,rpe:7});
  x.restUntil=new Date(Date.now()+75000).toISOString();
  html=renderGuidedExecution({execution:x,session:s,catalog,role:'client'});
  assert.match(html,/data-session-action="correct-set"/);
  assert.match(html,/Guardar corrección/);
});

test('Live Workout V3 añade geometría responsive sin ocultar capacidades',()=>{
  const css=fs.readFileSync(
    new URL('../src/m26/design/premium-ux.css',import.meta.url),
    'utf8'
  );
  const start=css.indexOf('LIVE_WORKOUT_FOCUS_V3_BEGIN');
  assert.ok(start>=0);
  const added=css.slice(start);

  for(const selector of [
    '.m26-session-live-v3',
    '.m26-session-live-quick-actions',
    '.m26-session-live-entry-v3',
    '.m26-session-rest-focus-v3',
    '.m26-session-live-secondary-context',
    '.m26-session-coach-set-fields',
    '.m26-session-coach-work-fields',
    '.m26-session-coach-effort-fields',
  ]) assert.ok(added.includes(selector),selector);

  assert.match(added,/grid-template-areas:[\s\S]*?"work load"[\s\S]*?"effort effort"/);
  assert.match(added,/@media \(max-width:900px\)/);
  assert.match(added,/@media \(max-width:580px\)[\s\S]*?grid-template-areas:[\s\S]*?"work"[\s\S]*?"load"[\s\S]*?"effort"/);
  assert.match(added,/@media \(forced-colors:active\)/);
  assert.match(added,/@media \(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(added,/display\s*:\s*none|visibility\s*:\s*hidden/iu);
  assert.doesNotMatch(added,/pointer-events\s*:\s*none/iu);
});
