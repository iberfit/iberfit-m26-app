import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {M26_ACTION_REGISTRY,assertActionAllowed} from '../src/m26/ui/interactive-audit.js';
import {iberfitSurfaceTranslate} from '../src/m26/ui/i18n-surface.js';

test('Coach dispone de RPE final 1–10 táctil sin cambiar la escala de dominio',()=>{
  const ui=fs.readFileSync('src/m26/workflows/session-ui.js','utf8');
  assert.match(ui,/const feedbackQuickRpe=isCoach/u);
  assert.match(ui,/Array\.from\(\{length:10\},\(_,index\)=>index\+1\)/u);
  assert.match(ui,/data-session-action="set-session-rpe-quick"/u);
  assert.match(ui,/inputmode="numeric" data-session-feedback-rpe/u);
});

test('seleccionar RPE final actualiza borrador, estado visual y lleva al comentario',()=>{
  const controller=fs.readFileSync('src/m26/workflows/session-controller.js','utf8');
  assert.match(controller,/function syncFeedbackRpeControl\(\)/u);
  assert.match(controller,/data-session-action="set-session-rpe-quick"/u);
  assert.match(controller,/button\.setAttribute\?\.\('aria-pressed',active\?'true':'false'\)/u);
  assert.match(controller,/if\(action==='set-session-rpe-quick'\)/u);
  assert.match(controller,/input\.value=String\(value\)/u);
  assert.match(controller,/updateFinalFeedbackDraft\(context\.execution,feedbackValues\(root\)\)/u);
  assert.match(controller,/queueExecutionDraftPersist\(context\)/u);
  assert.match(controller,/comment\?\.focus/u);
});

test('RPE final rápido es una acción exclusiva del Coach',()=>{
  assert.deepEqual(M26_ACTION_REGISTRY['set-session-rpe-quick'],{roles:['coach'],domain:'execution'});
  assert.equal(assertActionAllowed('set-session-rpe-quick','coach'),true);
  assert.equal(assertActionAllowed('set-session-rpe-quick','client'),false);
  assert.equal(assertActionAllowed('set-session-rpe-quick','admin'),false);
});

test('RPE final rápido conserva traducciones y targets táctiles útiles',()=>{
  assert.notEqual(iberfitSurfaceTranslate('RPE final rápido',{language:'en'}),'RPE final rápido');
  assert.notEqual(iberfitSurfaceTranslate('RPE final rápido',{language:'fr'}),'RPE final rápido');
  assert.notEqual(iberfitSurfaceTranslate('RPE final rápido',{language:'pt'}),'RPE final rápido');
  const css=fs.readFileSync('src/m26/design/premium-ux.css','utf8');
  assert.match(css,/\.m26-session-feedback-rpe-quick\{[\s\S]*?grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/u);
  assert.match(css,/\.m26-session-feedback-rpe-quick button\{[\s\S]*?min-height:3rem/u);
});