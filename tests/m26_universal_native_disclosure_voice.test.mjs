import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const controller=readFileSync(new URL('../src/m26/workflows/session-controller.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');
const visual=readFileSync(new URL('../qa/live-workout/live-workout-browser.spec.mjs',import.meta.url),'utf8');
const design=readFileSync(new URL('../DESIGN.md',import.meta.url),'utf8');

test('IBERFIT WebKit uses native summary default once; redraw preserves set-scoped disclosure',()=>{
  const nativeSection=controller.slice(controller.indexOf('// Trust native <details>/<summary>'),controller.indexOf('const openSubstitution='));
  assert.ok(nativeSection.length>100);
  assert.doesNotMatch(nativeSection,/\bif\s*\(skipSummary\)|details\.open\s*=|event\.preventDefault\?\.\(/u);
  for(const marker of ['function liveDisclosureScope(','function captureLiveDisclosure(','function restoreLiveDisclosure('])
    assert.ok(controller.includes(marker),marker);
  assert.match(visual,/Enter closes the native summary/u);
  assert.match(visual,/Enter reopens the native summary/u);
  assert.match(visual,/data-session-action="skip-set"/u);
});
test('IBERFIT human voice explains effort and keeps mandatory form and truthful persistence',()=>{
  assert.match(ui,/Tu esfuerzo \(1 a 10\)/u);
  assert.match(ui,/¿Qué esfuerzo te supuso\? 1 = muy suave/u);
  assert.match(ui,/¿Por qué no hiciste esta serie\?/u);
  assert.match(ui,/Guardar motivo y omitir serie/u);
  assert.match(ui,/data-session-feedback-rpe required/u);
  assert.match(ui,/data-session-skip-set-reason/u);
  assert.match(ui,/solo se marca como completado cuando confirmas/u);
  assert.match(ui,/pendientes de sincronización/u);
  assert.match(design,/## Voz propia IBERFIT · lenguaje humano y preciso/u);
});
