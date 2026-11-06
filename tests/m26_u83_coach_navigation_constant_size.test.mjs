import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanonicalStore} from '../src/m26/canonical-store.js';
import {createProductionState} from '../src/m26/production-state.js';

const shell=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
const probe=readFileSync(new URL('../qa/signature-u26-authenticated-professional-routes.mjs',import.meta.url),'utf8');

test('U83: a huge Coach history never gets cloned to read the authenticated route or identity',()=>{
  const base=createProductionState();
  const store=createCanonicalStore({
    ...base,activeArea:'hoy',
    identity:{id:'verified-coach',role:'coach'},
    collections:{...base.collections,domainEvents:Array.from({length:2000},(_,i)=>({id:String(i),body:{detail:'v'.repeat(1500)}}))},
  });
  const originalClone=globalThis.structuredClone;
  let clones=0;
  try{
    globalThis.structuredClone=(value)=>{clones+=1;return originalClone(value);};
    const actual=store.getNavigationSnapshot();
    assert.deepEqual(actual,{activeArea:'hoy',identity:{id:'verified-coach',role:'coach'}});
    assert.equal(clones,0,'route-only read must never clone any history');
    assert.ok(Object.isFrozen(actual));
    assert.ok(Object.isFrozen(actual.identity));
    store.navigate('clientes');
    const before=clones;
    assert.equal(store.getNavigationSnapshot().activeArea,'clientes');
    assert.equal(clones,before,'route read must not clone after the navigation');
    const reset={...base,activeArea:'acceso',identity:null};
    store.reset(reset);
    const anonymous=store.getNavigationSnapshot();
    assert.equal(anonymous.activeArea,'acceso');
    assert.equal(anonymous.identity.id,'');
    assert.equal(anonymous.identity.role,'');
  }finally{
    globalThis.structuredClone=originalClone;
  }
});

test('U83: pointer CAS still checks current id, role, route and controller generation',()=>{
  assert.match(shell,/const latest=store\.getNavigationSnapshot\?\.\(\)\?\?store\.getState\(\);/u);
  assert.match(shell,/ticket!==touchRouteTicket\|\|version!==generation\|\|!unsubscribe/u);
  assert.match(shell,/String\(latest\.identity\?\.id\|\|''\)!==ownerId/u);
  assert.match(shell,/String\(latest\.identity\?\.role\|\|''\)!==expectedRole/u);
  assert.match(shell,/String\(latest\.activeArea\|\|''\)!==previousArea/u);
  assert.match(shell,/const active=store\.getNavigationSnapshot\?\.\(\)\?\.activeArea;/u);
  assert.match(shell,/if\(String\(state\.activeArea\|\|''\)!==expected\)return;/u);
});

test('U83: real pointer, authenticated state and DOM route must all agree without relaxing the SLA',()=>{
  assert.match(app,/getNavigationSnapshot:\(\)=>store\.getNavigationSnapshot\(\)/u);
  assert.match(probe,/app\?\.getNavigationSnapshot\?\.\(\)\?\.activeArea/u);
  assert.match(probe,/String\(stateArea\)!==String\(renderedArea\)/u);
  assert.match(probe,/choice\.click\(\{noWaitAfter:true,timeout:12000\}\)/u);
  assert.match(probe,/expect\.poll\(\(\)=>activeArea\(page\)/u);
  assert.doesNotMatch(probe,/dispatchEvent\(|force:true/u);
});
