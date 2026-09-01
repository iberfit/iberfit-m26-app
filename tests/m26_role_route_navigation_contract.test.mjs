import test from 'node:test';
import assert from 'node:assert/strict';

import {
  M26_AREAS,
  areaAllowedForRole,
  navigationForRole,
} from '../src/m26/shell/navigation.js';
import { resolveM26Route } from '../src/m26/shell/route-guard.js';

const CLIENT_ID='client-route-contract';

function readyState(role, overrides={}){
  const identity=role==='client'
    ? {id:'user-client',role,clientId:CLIENT_ID}
    : {id:`user-${role}`,role};
  return {
    hydration:{status:'ready'},
    identity,
    selectedClientId:CLIENT_ID,
    collections:{clients:[{id:CLIENT_ID,name:'Cliente contrato'}]},
    ...overrides,
  };
}

function navigationKeys(role){
  const nav=navigationForRole(role);
  return {
    all:[...nav.primary,...nav.context,...nav.tools].map((item)=>item.key),
    primary:nav.primary.map((item)=>item.key),
    context:nav.context.map((item)=>item.key),
    tools:nav.tools.map((item)=>item.key),
    mobile:nav.mobile.map((item)=>item.key),
  };
}

test('Retos es contexto Cliente/Coach y Ajustes es global Cliente/Coach',()=>{
  assert.deepEqual(M26_AREAS.retos.roles,['coach','client']);
  assert.equal(M26_AREAS.retos.scope,'client-context');
  assert.deepEqual(M26_AREAS.ajustes.roles,['coach','client']);
  assert.equal(M26_AREAS.ajustes.scope,'global');
});

test('Coach puede descubrir Retos y Ajustes desde la navegación normal',()=>{
  const nav=navigationKeys('coach');
  assert.equal(nav.context.includes('retos'),true);
  assert.equal(nav.tools.includes('ajustes'),true);
  assert.equal(nav.all.includes('retos'),true);
  assert.equal(nav.all.includes('ajustes'),true);
});

test('Retos Coach exige cliente visible y Ajustes Coach no exige contexto',()=>{
  const withoutClient=readyState('coach',{
    selectedClientId:null,
    collections:{clients:[]},
  });
  assert.deepEqual(
    resolveM26Route(withoutClient,'retos'),
    {area:'clientes',allowed:false,reason:'M26_CLIENT_CONTEXT_REQUIRED',contextClientId:null},
  );
  assert.deepEqual(
    resolveM26Route(withoutClient,'ajustes'),
    {area:'ajustes',allowed:true,reason:null,contextClientId:null},
  );

  const withClient=readyState('coach');
  assert.deepEqual(
    resolveM26Route(withClient,'retos'),
    {area:'retos',allowed:true,reason:null,contextClientId:CLIENT_ID},
  );
});

test('Cliente conserva Retos y Ajustes permitidos',()=>{
  const state=readyState('client');
  for(const area of ['retos','ajustes']){
    assert.equal(areaAllowedForRole(area,'client'),true,area);
    assert.equal(resolveM26Route(state,area).allowed,true,area);
  }
});

test('Admin permanece aislado en namespace admin-* sin metadata contradictoria',()=>{
  assert.equal(M26_AREAS.retos.roles.includes('admin'),false);
  assert.equal(M26_AREAS.ajustes.roles.includes('admin'),false);
  assert.equal(areaAllowedForRole('retos','admin'),false);
  assert.equal(areaAllowedForRole('ajustes','admin'),false);
  assert.equal(resolveM26Route(readyState('admin'),'retos').area,'admin-inicio');
  assert.equal(resolveM26Route(readyState('admin'),'ajustes').area,'admin-inicio');
});

test('La corrección no altera la navegación móvil Coach ni la navegación Cliente canónica',()=>{
  assert.deepEqual(
    navigationKeys('coach').mobile,
    ['hoy','clientes','agenda','mensajes'],
  );
  assert.deepEqual(
    navigationKeys('client').primary,
    ['hoy','planificacion','sesion','progreso'],
  );
  assert.deepEqual(
    navigationKeys('client').mobile,
    ['hoy','sesion','progreso','actividad'],
  );
});
