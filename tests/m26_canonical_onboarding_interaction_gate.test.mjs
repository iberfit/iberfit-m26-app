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

test('fixture mounts the production renderer through the production shell controller',()=>{
  assert.match(fixture,/import \{renderClientsRoute\} from '\.\.\/\.\.\/src\/m26\/modules\/route-render\.js'/u);
  assert.match(fixture,/import \{createShellController\} from '\.\.\/\.\.\/src\/m26\/shell\/shell-controller\.js'/u);
  assert.match(fixture,/renderClientsRoute\(vm\)/u);
  assert.match(fixture,/canCreate:true/u);
});

test('canonical regression locks release-to-type and native-select continuity on reported controls',()=>{
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
});
