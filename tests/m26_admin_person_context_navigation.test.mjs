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
const shellRender=await readFile(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');

test('Admin person routes stay authorized and classified as contextual',()=>{
  const navigation=navigationForRole('admin');
  const contextualKeys=navigation.context.map((item)=>item.key);
  for(const area of ['admin-expediente','admin-iri','admin-informes','admin-notas']){
    assert.equal(contextualKeys.includes(area),true,area);
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
  assert.equal(routeRender.includes('data-m26-open-client-area="${e(primaryArea)}" data-m26-client-id='),true);
  assert.equal(routeRender.includes('data-m26-open-client-area="informes" data-m26-client-id='),true);
  assert.match(shellController,/const contextualClientButton=event\.target\.closest\?\.\('\[data-m26-open-client-area\]'\)/u);
  assert.match(shellController,/const targetArea=roleScopedArea\(current,rawTargetArea\)/u);
  assert.match(shellController,/\?adminClientContextArea\(value\)/u);
});


test('Admin shell hides person-context destinations until a person is active and shares that rule with mobile More',()=>{
  assert.match(shellRender,/hideAdminPersonContext=String\(vm\?\.identity\?\.role\|\|''\)==='admin'&&!vm\?\.selectedClient/u);
  assert.match(shellRender,/personContext=hideAdminPersonContext&&\['selected-client','client-context'\]\.includes/u);
  assert.match(shellRender,/if\(personContext\)continue;/u);
  assert.match(shellRender,/const allMobileItems = \[\.\.\.allNavigationItems\(vm\)\.values\(\)\];/u);
});
