import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const workflow=read('.github/workflows/authenticated-client-interaction.yml');
const config=read('playwright.authenticated-interaction.config.mjs');
const spec=read('qa/rc64/authenticated-interaction.spec.mjs');

test('authenticated interaction gate stays QA-only and public-key-only',()=>{
  assert.ok(workflow.includes('environment: m26-canary-readonly'));
  assert.ok(workflow.includes('M26_PROJECT_REF: gjztkdwfmunnzhtvxrsu'));
  assert.ok(workflow.includes("M26_QA_ONLY: 'true'"));
  assert.ok(!workflow.includes('SERVICE_ROLE'),'workflow must never receive a service-role secret');
  assert.ok(spec.includes('service[_-]?role'),'spec must reject service-role keys');
});

test('authenticated interaction network policy remains fail-closed for mutations',()=>{
  assert.ok(spec.includes("context.route('**/*'"),'all browser requests must be intercepted');
  assert.ok(spec.includes('READ_ONLY_RPCS'),'read-only RPC allow-list missing');
  assert.ok(spec.includes("route.abort('blockedbyclient')"),'unexpected network requests must be blocked');
  assert.ok(spec.includes('Authenticated interaction attempted a mutation or foreign request'));
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
  assert.ok(spec.includes("openArea(page,'actividad')"),'activity route coverage missing');
  assert.ok(spec.includes("openArea(page,'ajustes')"),'settings route coverage missing');
  assert.ok(spec.includes('data-engagement-form="checkin"'),'check-in form coverage missing');
  assert.ok(spec.includes('data-m26-ui-language'),'language select coverage missing');
  assert.ok(spec.includes('data-m26-ui-locale'),'locale select coverage missing');
  assert.ok(spec.includes('m26-client-bottom-nav-more'),'mobile More coverage missing');
});

test('authenticated interaction runs on code and design families that can steal focus block hits or rerender the shell',()=>{
  for(const path of ['src/m26/app/**','src/m26/design/**','src/m26/modules/route-render.js','src/m26/shell/**','src/m26/ui/**']){
    assert.equal(workflow.split(path).length-1,2,`${path} must trigger on pull_request and push`);
  }
});
