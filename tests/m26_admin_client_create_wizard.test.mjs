import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {__clientCreateWizardInternals as internals} from '../src/m26/admin/client-create-wizard.js';

const render=fs.readFileSync('src/m26/admin/route-render.js','utf8');
const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
const css=fs.readFileSync('src/m26/admin/admin.css','utf8');
const sw=fs.readFileSync('public/m26/sw.js','utf8');

test('client create wizard has stable bounded steps and scoped local draft keys',()=>{
  assert.equal(internals.MAX_STEP,5);
  assert.equal(internals.clampStep(-3),1);
  assert.equal(internals.clampStep(3),3);
  assert.equal(internals.clampStep(99),5);
  assert.match(internals.keyFor('org:test'),/^iberfit:m26:admin-client-create:v2:/u);
});

test('client create wizard preserves navigation, draft recovery and review before submit',()=>{
  assert.match(render,/data-client-step="1"/u);
  assert.match(render,/data-client-step="5"/u);
  assert.match(render,/data-client-wizard-prev/u);
  assert.match(render,/data-client-wizard-next/u);
  assert.match(render,/data-client-wizard-discard/u);
  assert.match(render,/data-client-review="identity"/u);
  assert.match(controller,/createClientCreateWizard/u);
  assert.match(controller,/clientWizard\.validateForSubmit\(form\)/u);
  assert.match(controller,/onSuccess:\(\)=>clientWizard\.clear\(\)/u);
});

test('client create payload captures richer profile data needed by IRI 2.0 without removing legacy fields',()=>{
  for(const field of [
    'birthDate',
    'sexForNorms',
    'initialAssessmentMode',
    'weeklyFrequency',
    'sessionDurationMinutes',
    'preferredSchedule',
    'secondaryObjectives',
    'currentTraining',
    'emergencyContactName',
  ])assert.match(controller,new RegExp(field,'u'));
  assert.match(controller,/frequency,/u);
  assert.match(controller,/primaryObjective/u);
  assert.match(controller,/trainingAddress/u);
});

test('wizard stays premium/responsive and ships inside the installed PWA release shell',()=>{
  assert.match(css,/ADMIN_CLIENT_CREATE_WIZARD_V2_BEGIN/u);
  assert.match(css,/\.m26-client-create-progress/u);
  assert.match(css,/\.m26-client-create-grid/u);
  assert.match(css,/@media\(max-width:700px\)/u);
  assert.match(sw,/\/src\/m26\/admin\/client-create-wizard\.js/u);
});
