import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync('src/m26/shell/shell-controller.js','utf8');
const v3=fs.readFileSync('src/m26/design/iberfit-premium-v3.css','utf8');
const device=fs.readFileSync('qa/device-experience/device-experience.spec.mjs','utf8');
const matrix=fs.readFileSync('playwright.admin-interaction.config.mjs','utf8');

test('shell holds an explicit focused-control lease so background state cannot replace active forms',()=>{
  assert.match(shell,/let interactionFocusTarget=null;/u);
  assert.match(shell,/interactionPointerTarget\|\|interactionFocusTarget\|\|focusedInteractiveControl\(\)/u);
  assert.match(shell,/interactionFocusTarget=control;/u);
  assert.match(shell,/interactionFocusTarget=active&&root\.contains\?\.\(active\)\?active:null;/u);
  assert.match(shell,/if\(!force&&shellInteractionActive\(\)\)/u);
});

test('Premium V3 neutralizes legacy 3D planes around native controls',()=>{
  assert.match(v3,/P0 form-control stability/u);
  assert.match(v3,/\.m26-shell \.m26-main\{\s*perspective:none!important;/u);
  assert.match(v3,/\.m26-shell \.m26-route\{\s*transform-style:flat!important;/u);
  assert.match(v3,/pointer-events:auto!important;/u);
  assert.match(v3,/\.m26-shell\[data-m26-text-entry-active="true"\]/u);
});

test('Coach productivity is explicitly covered by Premium V3 instead of inheriting a light legacy surface',()=>{
  assert.match(v3,/\.m26-coach-productivity-toolbar/u);
  assert.match(v3,/linear-gradient\(150deg,#14251D,#0F1C17\)!important/u);
  assert.match(v3,/\.m26-coach-productivity-controls :is\(input,select\)/u);
});

test('visual and browser gates exercise the final V3 layer and the real Coach onboarding form',()=>{
  assert.match(device,/\/src\/m26\/design\/iberfit-premium-v3\.css/u);
  assert.match(matrix,/coach-form-continuity\.spec\.mjs/u);
});
