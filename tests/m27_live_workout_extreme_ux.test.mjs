import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const css=read('src/m26/design/premium-ux.css');
const ui=read('src/m26/workflows/session-ui.js');
const modality=read('src/m26/domain/modality.js');

test('M27 Live Workout eleva ergonomía móvil sin tocar el motor de ejecución',()=>{
  assert.match(css,/M27 · Live Workout Extreme UX/u);
  assert.match(css,/\.m26-session-live-entry \[data-session-action="complete-set"\]/u);
  assert.match(css,/position:\s*sticky/u);
  assert.match(css,/min-height:\s*4\.4rem/u);
  assert.match(css,/font-variant-numeric:\s*tabular-nums/u);
  assert.match(css,/@media \(pointer: coarse\)/u);
  assert.match(css,/\.m26-session-rest-countdown strong/u);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)/u);
});

test('M27 conserva todas las acciones críticas del Live Workout existente',()=>{
  for(const action of [
    'complete-set',
    'correct-set',
    'previous',
    'next',
    'rest-minus',
    'rest-plus',
    'substitute',
    'skip-set',
    'skip-exercise',
    'pause',
    'cancel',
  ]){
    assert.ok(ui.includes(`data-session-action="${action}"`),`Falta acción Live Workout: ${action}`);
  }
  assert.match(ui,/liveTelemetryStrip/u);
  assert.match(ui,/renderExerciseMemorySession/u);
  assert.match(ui,/deriveLiveSessionIntelligence/u);
});

test('M27 mantiene experiencias distintas para Presencial, Híbrido y Online',()=>{
  assert.match(modality,/presencial_coach_led/u);
  assert.match(modality,/hybrid_coach_led/u);
  assert.match(modality,/hybrid_autonomous/u);
  assert.match(modality,/online_autonomous/u);
  assert.match(modality,/online_live_coach/u);
  assert.match(modality,/clientLiveWorkout:liveWorkout/u);
  assert.match(modality,/adminOversight:actor==='admin'/u);
  assert.match(modality,/offlineEligible:liveWorkout&&!remote/u);
});
