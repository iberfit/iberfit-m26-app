import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const config=read('playwright.admin-interaction.config.mjs');
const workflow=read('.github/workflows/admin-interaction-matrix.yml');
const fixture=read('qa/admin-interaction/real-client-onboarding.fixture.mjs');
const spec=read('qa/admin-interaction/real-client-onboarding.spec.mjs');

test('canonical Client onboarding regression is part of the cross-browser interaction matrix',()=>{
  assert.match(config,/real-client-onboarding\.spec\.mjs/u);
  for(const project of [
    'admin-desktop-chromium','admin-tablet-chromium','admin-tablet-landscape-chromium','admin-mobile-chromium',
    'admin-desktop-webkit','admin-mobile-webkit','admin-desktop-firefox',
  ])assert.ok(config.includes(`name:'${project}'`),`missing ${project}`);
});

test('interaction matrix runs whenever canonical route or app interaction code changes',()=>{
  const routeMatches=workflow.match(/src\/m26\/modules\/route-render\.js/gu)||[];
  const appMatches=workflow.match(/src\/m26\/app\/\*\*/gu)||[];
  assert.equal(routeMatches.length,2,'route-render path must exist for pull_request and push');
  assert.equal(appMatches.length,2,'app interaction path must exist for pull_request and push');
});

test('fixture mounts production renderer shell and workflow controller',()=>{
  assert.ok(fixture.includes("import {renderClientsRoute} from '../../src/m26/modules/route-render.js'"));
  assert.ok(fixture.includes("import {createWorkflowController} from '../../src/m26/app/workflow-controller.js'"));
  assert.ok(fixture.includes("import {createShellController} from '../../src/m26/shell/shell-controller.js'"));
  assert.ok(fixture.includes('renderClientsRoute(vm)'));
  assert.ok(fixture.includes('canCreate:true'));
  assert.ok(fixture.includes('workflow.mount()'),'real workflow controller must be mounted');
});

test('canonical regression locks release-to-type native-select and delayed-draft continuity',()=>{
  assert.ok(spec.includes('data-workflow-form="client-onboarding"'),'canonical onboarding form selector missing');
  for(const field of ['name','email','birthDate','sexForNorms','preferredContactChannel','accessInstructions']){
    assert.ok(spec.includes(field),`missing canonical control ${field}`);
  }
  assert.match(spec,/pointerup/u);
  assert.match(spec,/toBeFocused\(\)/u);
  assert.match(spec,/expectSameNode/u);
  assert.match(spec,/page\.keyboard\.type/u);
  assert.ok(spec.includes('data-client-search'),'client search coverage missing');
  assert.ok(spec.includes('data-client-filter="iri"'),'IRI filter coverage missing');
  assert.ok(spec.includes('releaseDraftLoad'),'delayed draft race release missing');
  assert.ok(spec.includes('draftLoadResolved'),'delayed draft resolution assertion missing');
  assert.ok(spec.includes('draftSaveCount'),'workflow draft autosave assertion missing');
  assert.ok(fixture.includes('BORRADOR ANTIGUO NO DEBE VOLVER'),'fixture must inject a stale draft');
});
