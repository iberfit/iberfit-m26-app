import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

import {
  adminClientContextArea,
  adminClientContextBaseArea,
  isAdminClientContextArea,
} from '../src/m26/admin/navigation.js';
import {
  areaAllowedForRole,
  navigationForRole,
} from '../src/m26/shell/navigation.js';

const routeRender=await readFile(new URL('../src/m26/admin/route-render.js',import.meta.url),'utf8');
const shellController=await readFile(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');

test('Admin person routes are authorized but never globally discoverable',()=>{
  const navigation=navigationForRole('admin');
  const globalKeys=[...navigation.primary,...navigation.context,...navigation.tools].map((item)=>item.key);
  for(const area of ['admin-expediente','admin-iri','admin-informes','admin-notas']){
    assert.equal(globalKeys.includes(area),false,area);
    assert.equal(areaAllowedForRole(area,'admin'),true,area);
    assert.equal(isAdminClientContextArea(area),true,area);
  }
});

test('Admin person context maps base client routes into the Admin namespace',()=>{
  assert.equal(adminClientContextArea('expediente'),'admin-expediente');
  assert.equal(adminClientContextArea('iri'),'admin-iri');
  assert.equal(adminClientContextArea('informes'),'admin-informes');
  assert.equal(adminClientContextArea('notas'),'admin-notas');
  assert.equal(adminClientContextBaseArea('admin-expediente'),'expediente');
  assert.equal(adminClientContextBaseArea('admin-iri'),'iri');
  assert.equal(adminClientContextBaseArea('admin-informes'),'informes');
  assert.equal(adminClientContextBaseArea('admin-notas'),'notas');
});

test('Admin reaches person context from an explicit person action, not from global navigation',()=>{
  assert.match(routeRender,/data-m26-open-client-area=\"\$\{e\(primaryArea\)\}\" data-m26-client-id=/u);
  assert.match(routeRender,/data-m26-open-client-area=\"informes\" data-m26-client-id=/u);
  assert.match(shellController,/const contextualClientButton=event\.target\.closest\?\.\('\[data-m26-open-client-area\]'\)/u);
  assert.match(shellController,/const targetArea=roleScopedArea\(current,rawTargetArea\)/u);
  assert.match(shellController,/\?adminClientContextArea\(value\)/u);
});
