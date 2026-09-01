import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  M26_AREAS,
  areaAllowedForRole,
  navigationForRole,
} from '../src/m26/shell/navigation.js';

const roles=['admin','coach','client'];
const routeRenderSources=[
  'src/m26/modules/route-render.js',
  'src/m26/admin/route-render.js',
  'src/m26/communication/route-render.js',
  'src/m26/rc39/route-render.js',
].map((file)=>fs.readFileSync(file,'utf8')).join('\n');

test('cada área que declara un rol coincide con el guard efectivo',()=>{
  for(const [key,definition] of Object.entries(M26_AREAS)){
    if(key==='acceso')continue;
    for(const role of roles){
      const declared=definition.roles.includes(role);
      assert.equal(
        areaAllowedForRole(key,role),
        declared,
        `${key} declara=${declared} pero guard difiere para ${role}`
      );
    }
  }
});

test('todo elemento realmente mostrado por navegación es accesible para ese rol',()=>{
  for(const role of roles){
    const nav=navigationForRole(role);
    for(const section of ['primary','context','tools','mobile']){
      for(const item of nav[section]){
        assert.equal(areaAllowedForRole(item.key,role),true,`${role}/${section}/${item.key} no supera el guard`);
      }
    }
  }
});

test('cada ruta visible tiene implementación de render y no cae por diseño en placeholder',()=>{
  for(const role of roles){
    const nav=navigationForRole(role);
    const keys=new Set(['retos','ajustes',...nav.primary.map((x)=>x.key),...nav.context.map((x)=>x.key),...nav.tools.map((x)=>x.key)]);
    for(const key of keys){
      if(!areaAllowedForRole(key,role))continue;
      assert.ok(routeRenderSources.includes(key),`No se encontró contrato de renderer para ${role}/${key}`);
    }
  }
});

test('Admin no anuncia rutas genéricas que su guard reserva a Coach/Cliente',()=>{
  assert.equal(M26_AREAS.retos.roles.includes('admin'),false);
  assert.equal(M26_AREAS.ajustes.roles.includes('admin'),false);
  assert.equal(areaAllowedForRole('retos','admin'),false);
  assert.equal(areaAllowedForRole('ajustes','admin'),false);
});
