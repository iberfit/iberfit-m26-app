import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  __exerciseHistoryWindowInternals,
} from '../src/m26/ui/exercise-history-window.js';

test('Coach exercise history window accepts only supported visual windows',()=>{
  const {windowLimit}=__exerciseHistoryWindowInternals;
  assert.equal(windowLimit(4),4);
  assert.equal(windowLimit('8'),8);
  assert.equal(windowLimit(12),12);
  assert.equal(windowLimit('all'),Number.POSITIVE_INFINITY);
  assert.equal(windowLimit(7),8);
  assert.equal(windowLimit(null),8);
});

test('Coach exercise history window parses chart points fail-soft',()=>{
  const {parsePoints}=__exerciseHistoryWindowInternals;
  assert.deepEqual(
    parsePoints('[{"date":"2026-09-01","value":10}]'),
    [{date:'2026-09-01',value:10}],
  );
  assert.deepEqual(parsePoints('invalid-json'),[]);
  assert.deepEqual(parsePoints('{"value":10}'),[]);
  assert.deepEqual(parsePoints(''),[]);
});


test('Coach exercise history window applies supported windows to every chart series without losing full history',()=>{
  const {windowedPoints}=__exerciseHistoryWindowInternals;
  const points=Array.from({length:14},(_,index)=>({date:`2026-09-${String(index+1).padStart(2,'0')}`,value:index+1}));

  assert.deepEqual(windowedPoints(points,4),points.slice(-4));
  assert.deepEqual(windowedPoints(points,'8'),points.slice(-8));
  assert.deepEqual(windowedPoints(points,12),points.slice(-12));
  assert.deepEqual(windowedPoints(points,'all'),points);
  assert.deepEqual(windowedPoints(points,7),points.slice(-8));
  assert.equal(points.length,14);
});

test('Coach exercise history window stays Coach/Admin Progreso only and keeps full series in memory',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/ui/exercise-history-window.js',import.meta.url),
    'utf8',
  );

  assert.match(source,/\['coach','admin'\]\.includes\(role\)/u);
  assert.match(source,/area!==['"]progreso['"]/u);
  assert.match(source,/seriesByCard:new WeakMap\(\)/u);
  assert.match(source,/querySelectorAll\?\.\('\.m26-echart\[data-points\]'\)/u);
  assert.match(source,/windowedPoints\([\s\S]*source\.points,[\s\S]*selected/u);
  assert.match(source,/charts\.forEach\(\(chart,index\)=>/u);
  assert.match(source,/chart\.cloneNode\(false\)/u);
  assert.match(source,/chart\.replaceWith\(clone\)/u);
  assert.match(source,/data-m27-window-visible/u);
  assert.match(source,/data-m27-window-total/u);
  assert.doesNotMatch(source,/data-all-points/u);
});

test('Coach exercise history window applies only to the focused card and preserves table absences',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/ui/exercise-history-window.js',import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /\[data-m27-exercise-active\][\s\S]*\.m26-exercise-progress-card/u,
  );
  assert.match(
    source,
    /\.m26-exercise-progress-table tbody tr/u,
  );
  assert.match(
    source,
    /row\.hidden=[\s\S]*index>=limit/u,
  );
  assert.doesNotMatch(source,/textContent=['"]0['"]/u);
});

test('Shell activates exercise history windows after focused exercise workspace enhancement',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/shell/shell-controller.js',import.meta.url),
    'utf8',
  );

  assert.match(
    source,
    /import \{enhanceExerciseHistoryWindow\} from '\.\.\/ui\/exercise-history-window\.js';/u,
  );
  assert.match(
    source,
    /enhanceProgressContinuity\(\{root,viewModel,state\}\);\s*enhanceSessionReadiness\(\{root,viewModel,state\}\);\s*enhanceSessionFocus\(\{root,viewModel\}\);\s*enhanceExerciseHistoryWindow\(\{root,viewModel\}\);/u,
  );
});

test('Coach exercise history window keeps responsive, forced-colors and print contracts',()=>{
  const source=fs.readFileSync(
    new URL('../src/m26/ui/exercise-history-window.js',import.meta.url),
    'utf8',
  );

  assert.match(source,/@media \(max-width:720px\)/u);
  assert.match(source,/@media \(forced-colors:active\)/u);
  assert.match(source,/@media print/u);
  assert.match(source,/data-m27-exercise-window-count/u);
  assert.match(source,/data-m27-exercise-window-scope','all-charts'/u);
  assert.match(source,/La ventana recorta todas las gráficas y la tabla del ejercicio activo/u);
  assert.match(source,/La lectura Coach conserva su evaluación confirmada sobre el historial completo/u);
});
