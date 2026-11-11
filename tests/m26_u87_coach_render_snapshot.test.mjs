import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCanonicalStore} from '../src/m26/canonical-store.js';

function sourceState(role='coach',id='coach-a'){
  return {
    identity:{id,role,clientId:role==='client'?'client-one':null},
    activeArea:'hoy',
    hydration:{status:'ready',error:null,refreshing:false},
    selectedClientId:'client-one',
    collections:{
      clients:[{id:'client-one',name:'Verified',profile:{goal:'Strength'}}],
      sessions:[{id:'session-one',body:{blocks:[{sets:[{reps:10}]}]}}],
      sessionExecutions:[{id:'exec-one',revision:1,body:{completed:true}}],
    },
  };
}
test('U87 Coach reuses a defensive immutable collection clone across navigations',()=>{
  const store=createCanonicalStore(sourceState());
  const first=store.getRenderSnapshot();
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.collections));
  assert.ok(Object.isFrozen(first.collections.clients));
  assert.ok(Object.isFrozen(first.collections.clients[0]));
  assert.ok(Object.isFrozen(first.collections.sessions[0].body.blocks[0].sets[0]));
  assert.throws(()=>{first.collections.clients[0].profile.goal='Injected';},TypeError);
  assert.throws(()=>first.collections.clients.push({id:'wrong'}),TypeError);
  assert.equal(store.getState().collections.clients[0].profile.goal,'Strength');
  store.navigateFast('clientes');
  const second=store.getRenderSnapshot();
  assert.strictEqual(second.collections,first.collections);
  assert.notStrictEqual(second,first);
  assert.equal(second.activeArea,'clientes');
  const ordinary=store.getState();
  ordinary.collections.clients[0].profile.goal='Only local';
  assert.equal(store.getState().collections.clients[0].profile.goal,'Strength');
});
test('U87 invalidates immutable archive on owner/reset and preserves Client/Admin contracts',()=>{
  const store=createCanonicalStore(sourceState());
  const first=store.getRenderSnapshot();
  store.reset(sourceState('coach','coach-b'));
  const changed=store.getRenderSnapshot();
  assert.notStrictEqual(changed.collections,first.collections);
  assert.equal(changed.identity.id,'coach-b');
  for(const role of ['client','admin']){
    const other=createCanonicalStore(sourceState(role,role+'-a'));
    const render=other.getRenderSnapshot();
    render.collections.clients[0].name='Mutable independent clone';
    assert.equal(other.getState().collections.clients[0].name,'Verified');
  }
});
test('U87 Coach shell uses bounded snapshot only for presentation, not for permission checks',()=>{
  const source=readFileSync(new URL('../src/m26/shell/shell-controller.js',import.meta.url),'utf8');
  const store=readFileSync(new URL('../src/m26/canonical-store.js',import.meta.url),'utf8');
  assert.match(source,/function readShellSnapshot\(\)/u);
  assert.match(source,/store\.getRenderSnapshot\(\)/u);
  assert.match(source,/markQaShellStage\('render-snapshot'/u);
  assert.match(source,/function renderNow\(state = readShellSnapshot\(\)/u);
  assert.match(source,/const next=needsFreshState\?readShellSnapshot\(\):queuedState/u);
  assert.match(source,/getRouteAuthorizationSnapshot\?\.\(\)\?\?store\.getState\(\)/u);
  assert.match(store,/function getState\(\) \{\s*return clone\(state\)/u);
  assert.match(store,/if\(String\(state.identity\?\.role\|\|''\)!=='coach'\)return getState\(\)/u);
  assert.match(store,/renderCollectionsSource!==collections/u);
  assert.match(store,/renderCollectionsOwnerScope!==ownerScope/u);
});
