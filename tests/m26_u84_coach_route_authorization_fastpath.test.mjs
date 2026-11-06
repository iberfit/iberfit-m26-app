import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanonicalStore} from '../src/m26/canonical-store.js';
import {createProductionState} from '../src/m26/production-state.js';
import {resolveM26Route} from '../src/m26/shell/route-guard.js';

const shell=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
const qa=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');

function sample(role,client={id:'client-a',serviceKind:'training'}){
  const root=createProductionState();
  return {...root,identity:{id:'user-a',role,clientId:role==='client'?client.id:null},
    hydration:{status:'ready'},activeArea:role==='admin'?'admin-inicio':'hoy',
    selectedClientId:role==='client'?client.id:client.id,
    collections:{...root.collections,clients:[client]},
    admin:{available:true,organization:{settings:{admin_media_review_enabled:true}}}};
}
test('U84: the lightweight authorization snapshot is route-guard equivalent for every role and service',()=>{
  const scenarios=[
    ['coach',{id:'client-a',serviceKind:'training'},['hoy','clientes','sesion','planificacion','iri','admin-inicio']],
    ['coach',{id:'client-a',serviceKind:'iri_only'},['hoy','clientes','sesion','planificacion','iri']],
    ['client',{id:'client-a',serviceKind:'training'},['hoy','planificacion','sesion','admin-inicio']],
    ['client',{id:'client-a',serviceKind:'iri_only'},['hoy','planificacion','sesion','informes']],
    ['admin',{id:'client-a',serviceKind:'training'},['admin-inicio','admin-clientes','admin-media-review','sesion']],
  ];
  for(const [role,client,areas] of scenarios){
    const store=createCanonicalStore(sample(role,client));
    const entire=store.getState();
    const minimal=store.getRouteAuthorizationSnapshot();
    for(const area of areas)assert.deepEqual(resolveM26Route(minimal,area),resolveM26Route(entire,area),role+'/'+area);
  }
});
test('U84: route fast paths never read, copy or mutate the 38-page archive',()=>{
  const base=sample('coach');
  base.collections.domainEvents=Array.from({length:2200},(_,i)=>({id:String(i),summary:'X'.repeat(1000)}));
  const store=createCanonicalStore(base);
  const original=globalThis.structuredClone;
  let cloneCount=0;
  try{
    globalThis.structuredClone=(value)=>{
      if(value?.collections?.domainEvents?.length>2000)throw Error('U84_FULL_ARCHIVE_CLONE');
      cloneCount++;
      return original(value);
    };
    const auth=store.getRouteAuthorizationSnapshot();
    assert.equal(auth.identity.role,'coach');
    assert.equal(auth.collections.clients.length,1);
    assert.equal(cloneCount,1,'only the tiny visible-client authorization slice is copied');
    assert.equal(store.navigateFast('clientes'),true);
    assert.equal(store.getNavigationSnapshot().activeArea,'clientes');
    assert.equal(store.navigateFast('clientes'),false);
    assert.equal(cloneCount,1,'fast route should not copy a second archive after a no-return navigation');
    auth.collections.clients[0].id='tampered';
    assert.equal(store.getRouteAuthorizationSnapshot().collections.clients[0].id,'client-a');
  }finally{globalThis.structuredClone=original;}
});
test('U84: real role and ownership decisions remain server-independent and fail-closed',()=>{
  const s=sample('coach');
  s.selectedClientId='foreign';
  const store=createCanonicalStore(s);
  for(const area of ['sesion','planificacion','expediente']){
    assert.deepEqual(resolveM26Route(store.getRouteAuthorizationSnapshot(),area),
      resolveM26Route(store.getState(),area));
  }
  const anonymous=createCanonicalStore({...sample('coach'),hydration:{status:'loading'}});
  assert.equal(resolveM26Route(anonymous.getRouteAuthorizationSnapshot(),'clientes').allowed,false);
  const del=createCanonicalStore({...sample('coach'),identity:null});
  assert.equal(resolveM26Route(del.getRouteAuthorizationSnapshot(),'clientes').allowed,false);
});
test('U84: shell retains real route guard, identity/role CAS, and full-state fallback',()=>{
  assert.match(shell,/current=store\.getRouteAuthorizationSnapshot\?\.\(\)\?\?store\.getState\(\)/u);
  assert.match(shell,/resolveM26Route\(current, nextArea\)/u);
  assert.match(shell,/if\(typeof store\.navigateFast==='function'\)store\.navigateFast\(decision\.area\)/u);
  assert.match(shell,/else store\.navigate\(decision\.area\)/u);
  assert.match(shell,/ticket!==touchRouteTicket\|\|version!==generation\|\|!unsubscribe/u);
  assert.match(shell,/String\(latest\.identity\?\.id\|\|''\)!==ownerId/u);
  assert.match(shell,/String\(latest\.identity\?\.role\|\|''\)!==expectedRole/u);
  assert.match(qa,/SIGNATURE_U84_ROUTE_FAILURE_DIAGNOSTIC/u);
  assert.match(qa,/expect\.poll\(\(\)=>activeArea\(page\)/u);
  assert.match(qa,/throw error;/u);
  assert.doesNotMatch(qa,/dispatchEvent\(|force:true/u);
});
