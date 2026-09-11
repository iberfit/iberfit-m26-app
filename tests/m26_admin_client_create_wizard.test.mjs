import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {__clientCreateWizardInternals as internals} from '../src/m26/admin/client-create-wizard.js';

const render=fs.readFileSync('src/m26/admin/route-render.js','utf8');
const controller=fs.readFileSync('src/m26/admin/controller.js','utf8');
const css=fs.readFileSync('src/m26/admin/admin.css','utf8');
const sw=fs.readFileSync('public/m26/sw.js','utf8');
const wizardSource=fs.readFileSync('src/m26/admin/client-create-wizard.js','utf8');

test('client create wizard has stable bounded steps and scoped local draft keys',()=>{
  assert.equal(internals.MAX_STEP,5);
  assert.equal(internals.clampStep(-3),1);
  assert.equal(internals.clampStep(3),3);
  assert.equal(internals.clampStep(99),5);
  assert.match(internals.keyFor('org:test'),/^iberfit:m26:admin-client-create:v3:/u);
  assert.equal(internals.DRAFT_MAX_AGE_MS,8*60*60*1000);
});


test('client create draft keeps sensitive onboarding data session-scoped, expires stale payloads and cleans legacy persistent keys',()=>{
  assert.match(wizardSource,/defaultDraftStorage\(\)[\s\S]*sessionStorage/u);
  assert.match(wizardSource,/defaultPersistentStorage\(\)[\s\S]*localStorage/u);
  assert.match(wizardSource,/LEGACY_DRAFT_PREFIX/u);
  assert.match(wizardSource,/DRAFT_MAX_AGE_MS/u);
  assert.match(wizardSource,/INPUT_SAVE_DELAY_MS=250/u);
  assert.doesNotMatch(wizardSource,/storage=globalThis\.localStorage/u);

  const key=internals.keyFor('org:test');
  const values=new Map();
  const storage={
    getItem:(name)=>values.get(name)??null,
    setItem:(name,value)=>values.set(name,String(value)),
    removeItem:(name)=>values.delete(name),
  };
  values.set(key,JSON.stringify({
    schema:internals.DRAFT_SCHEMA,
    step:3,
    fields:{pain:'sensitive'},
    savedAt:'2026-09-11T00:00:00.000Z',
  }));
  const now=Date.parse('2026-09-11T09:00:00.000Z');
  assert.equal(internals.readDraft(storage,key,{now}),null);
  assert.equal(values.has(key),false);
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
