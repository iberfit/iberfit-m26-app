import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ACTION_STATE_SEMANTICS,
  beginAction,
  createActionState,
  failAction,
  markActionOffline,
  pendActionSync,
  renderActionState,
  runAction,
  succeedAction,
} from '../src/m26/ui/action-state.js';

const shellSource=readFileSync(new URL('../src/m26/shell/shell-render.js',import.meta.url),'utf8');
const routeSource=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');

test('loading, pending, success, retry, error y offline tienen contratos distintos',()=>{
  assert.deepEqual(ACTION_STATE_SEMANTICS.loading,{role:'status',live:'polite',busy:true});
  assert.deepEqual(ACTION_STATE_SEMANTICS.pending,{role:'status',live:'polite',busy:false});
  assert.deepEqual(ACTION_STATE_SEMANTICS.success,{role:'status',live:'polite',busy:false});
  assert.deepEqual(ACTION_STATE_SEMANTICS.retry,{role:'alert',live:'assertive',busy:false});
  assert.deepEqual(ACTION_STATE_SEMANTICS.error,{role:'alert',live:'assertive',busy:false});
  assert.deepEqual(ACTION_STATE_SEMANTICS.offline,{role:'alert',live:'assertive',busy:false});
});

test('cada action state se expone con identidad de UI explícita',()=>{
  for(const status of ['loading','success','pending','retry','error','offline']){
    const markup=renderActionState({status,message:`estado ${status}`});
    assert.match(markup,new RegExp(`data-action-state="${status}"`));
  }
  assert.match(renderActionState({status:'loading',message:''}),/aria-busy="true"/);
  assert.match(renderActionState({status:'pending',message:'Pendiente'}),/role="status" aria-live="polite"/);
  assert.match(renderActionState({status:'offline',message:'Offline'}),/role="alert" aria-live="assertive"/);
  assert.match(renderActionState({status:'error',message:'Error'}),/role="alert" aria-live="assertive"/);
});

test('transiciones no confunden pendiente, éxito, error recuperable y offline',()=>{
  const state=createActionState();
  beginAction(state);
  assert.equal(state.status,'loading');
  pendActionSync(state);
  assert.equal(state.status,'pending');
  succeedAction(state);
  assert.equal(state.status,'success');
  failAction(state,new Error('falló'),{retryable:true});
  assert.equal(state.status,'retry');
  failAction(state,new Error('falló'),{retryable:false});
  assert.equal(state.status,'error');
  markActionOffline(state);
  assert.equal(state.status,'offline');
});

test('queued se mantiene pending y fallo de red se mantiene offline',async()=>{
  const queued=createActionState();
  const queuedResult=await runAction(queued,async()=>({queued:true,id:'local-1'}));
  assert.equal(queuedResult.ok,true);
  assert.equal(queued.status,'pending');
  assert.notEqual(queued.status,'success');

  const offline=createActionState();
  const error=Object.assign(new Error('M26_NETWORK_UNAVAILABLE'),{code:'M26_NETWORK_UNAVAILABLE'});
  const offlineResult=await runAction(offline,async()=>{throw error;});
  assert.equal(offlineResult.ok,false);
  assert.equal(offline.status,'offline');
  assert.notEqual(offline.status,'error');
});

test('empty content no reutiliza loading/error/pending y queda separado del action state',()=>{
  assert.match(shellSource,/data-content-state=\\?"empty\\?"/);
  assert.match(shellSource,/m26-route-placeholder/);
  assert.match(routeSource,/class=\\?"m26-empty\\?"/);
  assert.doesNotMatch(routeSource,/m26-empty[^\n]*data-action-state/);
});
