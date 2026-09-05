import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createActionState,
  beginAction,
  runAction,
  renderActionState,
} from '../src/m26/ui/action-state.js';

test('RC74.18 distingue éxito remoto de cambio local pendiente de sincronización',async()=>{
  const state=createActionState();
  const result=await runAction(state,async()=>({queued:true,operationId:'op-1'}));
  assert.equal(result.ok,true);
  assert.equal(state.status,'pending');
  assert.match(state.message,/pendiente de sincronización/i);
  const html=renderActionState(state);
  assert.match(html,/is-pending/);
  assert.match(html,/role="status"/);
  assert.match(html,/aria-live="polite"/);
});

test('RC74.18 expone offline como estado propio y accesible',async()=>{
  const state=createActionState();
  const error=Object.assign(new Error('M26_NETWORK_UNAVAILABLE'),{code:'M26_NETWORK_UNAVAILABLE'});
  const result=await runAction(state,async()=>{throw error;});
  assert.equal(result.ok,false);
  assert.equal(state.status,'offline');
  const html=renderActionState(state);
  assert.match(html,/is-offline/);
  assert.match(html,/role="alert"/);
  assert.match(html,/aria-live="assertive"/);
  assert.doesNotMatch(html,/aria-busy="true"/);
});

test('RC74.18 loading conserva señal de ocupación sin confundirse con pending u offline',()=>{
  const state=createActionState();
  beginAction(state);
  assert.equal(state.status,'loading');
  const html=renderActionState(state);
  assert.match(html,/role="status"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/aria-busy="true"/);
});
