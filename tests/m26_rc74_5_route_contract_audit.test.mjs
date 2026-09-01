import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionState } from '../src/m26/production-state.js';
import { M26_AREAS, areaAllowedForRole, navigationForRole } from '../src/m26/shell/navigation.js';
import { resolveM26Route } from '../src/m26/shell/route-guard.js';
import { renderRouteView } from '../src/m26/modules/route-render.js';

const clientId='57339e70-7a99-48d6-820f-7d4a51f89d9d';

function readyState(role){
  const identity=role==='client'
    ?{id:'61227666-d8b4-4d1e-aa08-2405ad2000db',role,clientId,name:'Cliente QA M26'}
    :{id:'2425747b-93aa-44ed-86f3-334919a1f832',role,name:role==='admin'?'Admin QA':'Coach QA M26'};
  return createProductionState({
    hydration:{status:'ready',error:null,confirmedAt:'2026-08-31T20:00:00Z',serverTime:'2026-08-31T20:00:00Z'},
    identity,
    environment:'PRODUCTION',
    selectedClientId:role==='admin'?null:clientId,
    collections:{
      ...createProductionState().collections,
      clients:[{id:clientId,name:'Cliente Prueba IBERFIT'}],
    },
  });
}

function navigationKeys(role){
  const nav=navigationForRole(role);
  return [...nav.primary,...nav.context,...nav.tools,...nav.mobile].map((item)=>item.key);
}

test('RC74.5 · Retos y Ajustes son superficies Cliente y no amplían privilegios',()=>{
  for(const area of ['retos','ajustes']){
    assert.deepEqual(M26_AREAS[area].roles,['client']);
    assert.equal(areaAllowedForRole(area,'client'),true);
    assert.equal(areaAllowedForRole(area,'coach'),false);
    assert.equal(areaAllowedForRole(area,'admin'),false);
  }
});

test('RC74.5 · acceso directo Coach/Admin a Retos o Ajustes falla cerrado',()=>{
  for(const area of ['retos','ajustes']){
    assert.deepEqual(resolveM26Route(readyState('coach'),area),{
      area:'hoy',allowed:false,reason:'M26_ROUTE_FORBIDDEN',contextClientId:null,
    });
    assert.deepEqual(resolveM26Route(readyState('admin'),area),{
      area:'admin-inicio',allowed:false,reason:'M26_ROUTE_FORBIDDEN',contextClientId:null,
    });
  }
});

test('RC74.5 · Cliente conserva Retos y Ajustes funcionales en su propio contexto',()=>{
  for(const area of ['retos','ajustes']){
    assert.deepEqual(resolveM26Route(readyState('client'),area),{
      area,allowed:true,reason:null,contextClientId:clientId,
    });
  }
  const html=renderRouteView({kind:'placeholder',role:'client',title:'Contrato Cliente'});
  assert.match(html,/data-m26-area="retos"/);
  assert.match(html,/data-m26-area="ajustes"/);
});

test('RC74.5 · navegación declarada nunca contiene un destino prohibido para su rol',()=>{
  for(const role of ['admin','coach','client']){
    for(const area of new Set(navigationKeys(role))){
      assert.equal(areaAllowedForRole(area,role),true,`${role}:${area}`);
    }
  }
});

test('RC74.5 · Coach no recibe superficies personales Cliente',()=>{
  const keys=new Set(navigationKeys('coach'));
  assert.equal(keys.has('retos'),false);
  assert.equal(keys.has('ajustes'),false);
});

test('RC74.5 · metadata Admin solo existe en superficies admin-*',()=>{
  for(const definition of Object.values(M26_AREAS)){
    if(definition.roles.includes('admin')){
      assert.match(definition.key,/^admin-/,definition.key);
      assert.equal(areaAllowedForRole(definition.key,'admin'),true,definition.key);
    }
  }
});
