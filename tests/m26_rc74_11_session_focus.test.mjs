import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sessionFocusPlan} from '../src/m26/ui/session-readiness.js';

test('modo foco conserva la acción principal según el estado real de Live Workout',()=>{
  assert.equal(sessionFocusPlan({state:'ready'}).targetSelector,'[data-session-action="start"]');
  assert.equal(sessionFocusPlan({state:'feedback'}).targetSelector,'[data-session-action="finish"]');
  assert.equal(sessionFocusPlan({state:'paused'}).targetSelector,'[data-session-action="resume"]');
  assert.equal(sessionFocusPlan({state:'active',hasCompleteSet:true}).targetSelector,'[data-session-action="complete-set"]');
  assert.equal(sessionFocusPlan({state:'rest',hasNext:true}).targetSelector,'[data-session-action="next"]');
  assert.equal(sessionFocusPlan({state:'completed'}),null);
  assert.equal(sessionFocusPlan({state:'cancelled'}),null);
});

test('dock móvil actúa como proxy y no duplica la lógica de entrenamiento',async()=>{
  const ui=await readFile(new URL('../src/m26/ui/session-readiness.js',import.meta.url),'utf8');
  assert.match(ui,/data-session-focus-proxy/);
  assert.match(ui,/target\.click\?\.\(\)/);
  assert.match(ui,/data-session-action="complete-set"/);
  assert.match(ui,/data-session-action="next"/);
  assert.match(ui,/@media \(max-width:760px\)/);
  assert.match(ui,/safe-area-inset-bottom/);
  assert.doesNotMatch(ui,/MutationObserver/);
  assert.doesNotMatch(ui,/innerHTML/);
  assert.doesNotMatch(ui,/service[_-]?role/i);
});

test('mantiene la pantalla activa solo durante trabajo o descanso y libera recursos al destruir',async()=>{
  const [ui,shell]=await Promise.all([
    readFile(new URL('../src/m26/ui/session-readiness.js',import.meta.url),'utf8'),
    readFile(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8'),
  ]);
  assert.match(ui,/ACTIVE_WAKE_STATES=new Set\(\['active','rest'\]\)/);
  assert.match(ui,/wakeLock\.request\('screen'\)/);
  assert.match(ui,/visibilitychange/);
  assert.match(ui,/releaseWakeLock/);
  assert.match(shell,/enhanceSessionReadiness\(\{root,viewModel,state\}\);\s*enhanceSessionFocus\(\{root,viewModel\}\);/);
  assert.match(shell,/teardownSessionFocus\(\{root\}\)/);
});
