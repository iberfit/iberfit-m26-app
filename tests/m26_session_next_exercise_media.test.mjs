import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {createExerciseCatalog} from '../src/m26/exercises/catalog.js';
import {createSessionDraft,addCatalogExercise} from '../src/m26/workflows/session-builder.js';
import {createExecution,startExecution,recordSet} from '../src/m26/workflows/session-execution.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';

const data=JSON.parse(
  fs.readFileSync(
    new URL('../baseline_m25_2/exercise-catalog-m25.json',import.meta.url),
  ),
);
const catalog=createExerciseCatalog(data);

function makeSession({firstSets=1}={}){
  const [first,second]=catalog.list();
  const draft=createSessionDraft({clientId:'c1'});
  addCatalogExercise(draft,first.id,catalog,{sets:firstSets,reps:'10'});
  addCatalogExercise(draft,second.id,catalog,{sets:1,reps:'8'});
  return {draft,first,second};
}

function mediaManifest(...exercises){
  return {
    schemaVersion:1,
    source:{provider:'IBERFIT'},
    items:exercises.map((exercise)=>({
      exercise_id:exercise.id,
      name_es:exercise.name_es,
      review_status:'approved',
      published:true,
      coach_visible:true,
      client_visible:true,
      image_mode:'main',
      image_paths:[
        `/public/iberfit/exercises/images/${exercise.id}/main.webp`,
      ],
    })),
  };
}

function targetText(prescription={}){
  return [
    prescription.reps||null,
    prescription.tempo?`ritmo ${prescription.tempo}`:null,
    Number.isFinite(Number(prescription.targetRpe))?`RPE ${prescription.targetRpe}`:null,
    Number.isFinite(Number(prescription.targetRir))?`RIR ${prescription.targetRir}`:null,
  ].filter(Boolean).join(' · ')||'Según indicación';
}

function renderRest({firstSets=1,withNextMedia=true}={}){
  const {draft,first,second}=makeSession({firstSets});
  const execution=createExecution({session:draft,clientId:'c1'});
  startExecution(execution);
  recordSet(execution,draft,{reps:10,rpe:7});
  execution.restUntil=new Date(Date.now()+60_000).toISOString();
  const mediaMap=withNextMedia
    ?mediaManifest(first,second)
    :mediaManifest(first);
  const html=renderGuidedExecution({
    execution,
    session:draft,
    catalog,
    mediaMap,
    role:'client',
  });
  return {html,first,second,execution};
}

test('Session Live previews the next different exercise and its target during active rest',()=>{
  const {html,first,second,execution}=renderRest();
  assert.match(html,/data-session-live-state="rest"/);
  assert.match(html,/data-session-next-step-preparation/);
  assert.match(html,/data-session-next-exercise-preparation/);
  assert.match(html,/data-session-next-exercise-media/);
  assert.ok(html.includes(`data-exercise-media="${first.id}"`));
  assert.ok(html.includes(`data-exercise-media="${second.id}"`));
  assert.ok(html.includes(`<span>Próximo objetivo</span><strong>${targetText(execution.queue[1].prescription)}</strong>`));

  const currentStart=html.indexOf(`data-exercise-media="${first.id}"`);
  const previewStart=html.indexOf('data-session-next-exercise-media');
  assert.ok(currentStart>=0&&previewStart>currentStart);

  const currentSlice=html.slice(currentStart,previewStart);
  const previewSlice=html.slice(previewStart);
  assert.match(currentSlice,/loading="eager" fetchpriority="high"/);
  assert.match(previewSlice,/loading="lazy" fetchpriority="low"/);
  assert.ok(previewSlice.includes(`alt="${second.name_es} · Referencia visual"`));
  assert.match(previewSlice,/aria-label="Vista previa del siguiente ejercicio"/);
  assert.match(html,/aria-label="Preparación del siguiente ejercicio"/);
});

test('Session Live prepares the next set of the same exercise during active rest',()=>{
  const {html,first,execution}=renderRest({firstSets:2});
  assert.match(html,/data-session-live-state="rest"/);
  assert.match(html,/data-session-next-preview/);
  assert.ok(html.includes(`Siguiente: <strong>${first.name_es}</strong>`));
  assert.match(html,/data-session-next-step-preparation/);
  assert.match(html,/data-session-next-set-preparation/);
  assert.doesNotMatch(html,/data-session-next-exercise-media/);
  assert.doesNotMatch(html,/data-session-next-exercise-preparation/);
  assert.ok(html.includes(`<span>Próxima serie</span><strong>${targetText(execution.queue[0].prescription)}</strong>`));
  assert.match(html,/aria-label="Preparación de la próxima serie"/);
});

test('Session Live preserves next target preparation when next exercise media is unavailable',()=>{
  const {html,second,execution}=renderRest({withNextMedia:false});
  assert.match(html,/data-session-next-preview/);
  assert.ok(html.includes(`Siguiente: <strong>${second.name_es}</strong>`));
  assert.match(html,/data-session-next-step-preparation/);
  assert.doesNotMatch(html,/data-session-next-exercise-media/);
  assert.match(html,/data-session-next-exercise-preparation/);
  assert.ok(html.includes(`<span>Próximo objetivo</span><strong>${targetText(execution.queue[1].prescription)}</strong>`));
});

test('Session Live does not preview next-step preparation outside active rest',()=>{
  const {draft,first,second}=makeSession();
  const execution=createExecution({session:draft,clientId:'c1'});
  startExecution(execution);
  recordSet(execution,draft,{reps:10,rpe:7});
  execution.restUntil=new Date(Date.now()-1_000).toISOString();
  const html=renderGuidedExecution({
    execution,
    session:draft,
    catalog,
    mediaMap:mediaManifest(first,second),
    role:'client',
  });
  assert.doesNotMatch(html,/data-session-next-step-preparation/);
  assert.doesNotMatch(html,/data-session-next-set-preparation/);
  assert.doesNotMatch(html,/data-session-next-exercise-media/);
  assert.doesNotMatch(html,/data-session-next-exercise-preparation/);
});

test('Session UI continues to use the shared exercise renderer for the rest preview',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/workflows/session-ui.js',import.meta.url),
    'utf8',
  );
  assert.match(source,/function nextSessionPreparation/);
  assert.match(source,/compact:true/);
  assert.doesNotMatch(source,/<img\b/);
});
