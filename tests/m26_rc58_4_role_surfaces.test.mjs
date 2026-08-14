import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  IBERFIT_ROLE_SURFACE_CONTRACT,
  roleSurfaceFor,
  roleSurfaceAudit,
} from '../src/m26/design/role-surfaces.js';

const read=(path)=>fs.readFileSync(path,'utf8').replace(/\r\n/g,'\n');
const css=read('src/m26/design/role-surfaces.css');
const js=read('src/m26/design/role-surfaces.js');
const index=read('public/m26/index.html');
const uiIndex=read('src/m26/ui/index.js');
const launch=read('docs/APP_IBERFIT_CL_LAUNCH_PARITY.md');
const doc=read('docs/RC58_4_ROLE_SURFACES.md');

test('contrato role surfaces usa densidades canónicas',()=>{
  assert.equal(IBERFIT_ROLE_SURFACE_CONTRACT.version,'58.4.0');
  assert.equal(roleSurfaceAudit().ok,true);
  assert.equal(roleSurfaceFor('client').controlMinPx,48);
  assert.equal(roleSurfaceFor('client').gapPx,16);
  assert.equal(roleSurfaceFor('coach').controlMinPx,44);
  assert.equal(roleSurfaceFor('coach').gapPx,12);
  assert.equal(roleSurfaceFor('admin').controlMinPx,44);
  assert.equal(roleSurfaceFor('admin').gapPx,8);
});

test('Cliente Coach y Admin tienen superficies explícitas del mismo sistema',()=>{
  for(const role of ['client','coach','admin']){
    assert.equal(css.includes(`[data-m26-role="${role}"]`),true,role);
    assert.ok(roleSurfaceFor(role));
  }
  assert.equal(IBERFIT_ROLE_SURFACE_CONTRACT.sharedProductLanguage,true);
});

test('role surfaces no esconden funcionalidad ni se convierten en autorización',()=>{
  assert.doesNotMatch(css,/display\s*:\s*none\s*!?important?/i);
  for(const forbidden of [
    /\bfetch\s*\(/,
    /\bsupabase\b/i,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
    /\bindexedDB\b/,
    /\bservice[_-]?role\b/i,
    /\bauthoriz(?:e|ation)\b/i,
  ]){
    assert.doesNotMatch(js,forbidden);
  }
  assert.equal(IBERFIT_ROLE_SURFACE_CONTRACT.noBusinessLogic,true);
});

test('Admin usa token de rol y Cliente conserva target confortable',()=>{
  assert.match(css,/var\(--iberfit-color-role-admin-accent\)/);
  assert.match(css,/var\(--iberfit-density-client-control-min\)/);
  assert.match(css,/var\(--iberfit-density-coach-control-min\)/);
  assert.match(css,/var\(--iberfit-density-admin-control-min\)/);
});

test('responsive no pisa compact-nav RC39',()=>{
  assert.match(css,/@media \(min-width: 1180px\)/);
  assert.match(css,/@media \(min-width: 720px\) and \(max-width: 1179px\)/);
  assert.match(css,/@media \(max-width: 900px\)/);
  assert.match(css,/@media \(max-width: 580px\)/);
  assert.doesNotMatch(css,/grid-template-columns:\s*17\.25rem[\s\S]*@media \(min-width: 1180px\)/);
});

test('role surfaces cargan después de primitives y exportan contrato',()=>{
  const primitivePosition=index.indexOf('/src/m26/design/primitives.css');
  const rolePosition=index.indexOf('/src/m26/design/role-surfaces.css');
  assert.ok(primitivePosition>0);
  assert.ok(rolePosition>primitivePosition);
  assert.match(uiIndex,/export \* from '\.\.\/design\/role-surfaces\.js';/);
});

test('paridad de lanzamiento y rails paralelos siguen vigentes',()=>{
  assert.match(launch,/FINAL_APP_LAUNCH_DOMAIN=app\.iberfit\.cl/);
  assert.match(launch,/FUNCTIONAL_PARITY_REQUIRED_BEFORE_CUTOVER=TRUE/);
  assert.match(doc,/NEXT_ACTION=RC58_5_NATIVE_COMMERCIAL_ALIGNMENT/);
  assert.match(doc,/NEXT_SECURITY_ACTION=SR0_THREAT_MODEL_AND_SECURITY_INVENTORY_READ_ONLY/);
  assert.match(doc,/NEXT_DEPLOYMENT_ACTION=APP_IBERFIT_CL_SURFACE_INVENTORY_READ_ONLY/);
});