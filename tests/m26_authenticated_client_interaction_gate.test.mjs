import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const workflow=read('.github/workflows/authenticated-client-interaction.yml');
const config=read('playwright.authenticated-interaction.config.mjs');
const spec=read('qa/rc64/authenticated-interaction.spec.mjs');

test('authenticated interaction gate stays QA-only and public-key-only',()=>{
  assert.match(workflow,/environment: m26-canary-readonly/u);
  assert.match(workflow,/M26_PROJECT_REF: gjztkdwfmunnzhtvxrsu/u);
  assert.match(workflow,/M26_QA_ONLY: 'true'/u);
  assert.ok(!workflow.includes('SERVICE_ROLE'),'workflow must never receive a service-role secret');
  assert.match(spec,/service\[_-\]\?role/iu);
});

test('authenticated interaction network policy remains fail-closed for mutations',()=>{
  assert.match(spec,/context\.route\('\*\*\/\*'/u);
  assert.match(spec,/READ_ONLY_RPCS/u);
  assert.match(spec,/route\.abort\('blockedbyclient'\)/u);
  assert.match(spec,/Authenticated interaction attempted a mutation or foreign request/u);
  assert.ok(!spec.includes('data-engagement-action="submit-checkin"'),'test must not target submit action');
  assert.ok(!spec.includes('data-engagement-action="save-checkin-draft"'),'test must not target draft-save action');
});

test('authenticated interaction covers desktop tablet landscape and mobile touch',()=>{
  for(const project of [
    'auth-interaction-desktop-chromium',
    'auth-interaction-tablet-chromium',
    'auth-interaction-tablet-landscape-chromium',
    'auth-interaction-mobile-chromium',
  ])assert.ok(config.includes(`name:'${project}'`),`missing ${project}`);
  assert.match(spec,/openArea\(page,'actividad'\)/u);
  assert.match(spec,/openArea\(page,'ajustes'\)/u);
  assert.match(spec,/data-engagement-form=\\"checkin\\"/u);
  assert.match(spec,/data-m26-ui-language/u);
  assert.match(spec,/data-m26-ui-locale/u);
  assert.match(spec,/m26-client-bottom-nav-more/u);
});

test('authenticated interaction runs on the code families that can steal focus or rerender the shell',()=>{
  for(const path of ["src/m26/app/**","src/m26/modules/route-render.js","src/m26/shell/**","src/m26/ui/**"]){
    const count=(workflow.match(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gu'))||[]).length;
    assert.equal(count,2,`${path} must trigger on pull_request and push`);
  }
});
