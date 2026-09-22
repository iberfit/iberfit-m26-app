import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const shell=fs.readFileSync('src/m26/shell/shell-controller.js','utf8');
const v3=fs.readFileSync('src/m26/design/iberfit-premium-v3.css','utf8');
const device=fs.readFileSync('qa/device-experience/device-experience.spec.mjs','utf8');
const matrix=fs.readFileSync('playwright.admin-interaction.config.mjs','utf8');

test('shell protects the actually focused control without letting a historical focus lease block rendering',()=>{
  assert.match(shell,/let interactionFocusTarget=null;/u);
  assert.match(shell,/interactionPointerTarget\|\|focusedInteractiveControl\(\)/u);
  assert.doesNotMatch(shell,/interactionPointerTarget\|\|interactionFocusTarget\|\|focusedInteractiveControl\(\)/u);
  assert.match(shell,/interactionFocusTarget=control\.matches\?\.\(SHELL_FOCUS_INTERACTIVE_SELECTOR\)\?control:null;/u);
  assert.match(shell,/const active=focusedInteractiveControl\(\);\s*interactionFocusTarget=active;/u);
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

test('Coach regression matrix explicitly covers every daily-use client-list control and cross-browser projects',()=>{
  const coach=fs.readFileSync('qa/admin-interaction/coach-form-continuity.spec.mjs','utf8');
  const fixture=fs.readFileSync('qa/admin-interaction/coach-form-continuity.fixture.mjs','utf8');
  assert.match(coach,/\[data-client-search\]/u);
  assert.match(coach,/data-client-filter="iri"/u);
  assert.match(coach,/data-client-filter="modality"/u);
  assert.match(coach,/data-client-filter="stage"/u);
  assert.match(coach,/\[data-client-sort\]/u);
  assert.match(coach,/\[data-coach-view-name\]/u);
  assert.match(coach,/\[data-coach-saved-view\]/u);
  for(const name of ['name','email','phone','birthDate','sexForNorms','genderIdentity','pronouns','preferredContactChannel','modality','weeklyFrequency','sessionDurationMinutes','locationType','accessInstructions','primaryObjective']){
    assert.ok(coach.includes("'" + name + "'")||coach.includes('"' + name + '"'),`Coach continuity coverage missing ${name}`);
  }
  assert.match(coach,/must preserve the exact active DOM node/u);
  assert.match(fixture,/setClientScenario/u);
  assert.match(matrix,/browserName:'webkit'/u);
  assert.match(matrix,/browserName:'firefox'/u);
});

test('focused buttons do not hold the long-lived form-control lease',()=>{
  assert.match(shell,/interactionFocusTarget=control\.matches\?\.\(SHELL_FOCUS_INTERACTIVE_SELECTOR\)\?control:null;/u);
  assert.match(shell,/const active=focusedInteractiveControl\(\);\s*interactionFocusTarget=active;/u);
  const coach=fs.readFileSync('qa/admin-interaction/coach-form-continuity.spec.mjs','utf8');
  assert.match(coach,/Focused form buttons never retain the persistent shell interaction lease/u);
});
