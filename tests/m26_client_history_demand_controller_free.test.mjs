import test from 'node:test';
import assert from 'node:assert/strict';
import {canOfferClientHistory,shouldLoadClientHistory,createClientHistoryDemandController}
  from '../src/m26/app/client-history-demand-controller.js';

const id='00000000-0000-4000-8000-000000000001';
const entityId='00000000-0000-4000-8000-000000000003';
const state=()=>({activeArea:'sesion',identity:{id:'u',clientId:id,role:'client'},
  hydration:{status:'ready',confirmedAt:'2026-10-31T03:00:00Z'}});
const page=(section='session')=>({schema:'iberfit.client.completed-history.page.qa.v1',section,
  snapshotAt:'2026-10-31T03:00:00+00:00',total:1,fingerprint:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  rows:[{entityType:section,entityId,clientId:id,status:'completada',revision:1,
    updatedAt:'2026-10-31T02:59:00+00:00',body:{id:entityId,clientId:id,status:'completada',blocks:[]}}],
  hasMore:false,nextCursor:null});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
  let current=state(),calls=0,release,rejectRequest,incorporated=0,pendingSection='session';
  const listeners=new Map(),route={node:null,prepend(element){this.node=element;}};
  const doc={createElement(){
    const element={dataset:{},children:[],setAttribute(){},append(child){this.children.push(child);},
      remove(){if(route.node===this)route.node=null;}};
    Object.defineProperty(element,'textContent',{get(){return this._text;},
      set(value){this._text=value;this.children=[];}});
    return element;
  }};
  const root={ownerDocument:doc,addEventListener(name,fn){listeners.set(name,fn);},
    removeEventListener(name){listeners.delete(name);},
    querySelector(selector){
      return selector==='.m26-route'?route:
        selector==='[data-m26-free-history-status]'?route.node:null;
    },
    dispatch(name,detail){listeners.get(name)?.(detail);}
  };
  const owner={},transport={clientCompletedHistoryPage:async(_token,params)=>{
    calls++;pendingSection=params.p_section;
    return new Promise((resolve,reject)=>{release=resolve;rejectRequest=reject;});
  }};
  const store={getState:()=>current,incorporateClientCompletedHistory(){incorporated++;}};
  const ctrl=createClientHistoryDemandController({root,store,transport,enabled:true,
    getToken:async()=>'token',getOwner:()=>owner,isOnline:()=>true});
  const shell=area=>{current.activeArea=area;
    root.dispatch('m26:shell-rendered',{detail:{role:current.identity.role,area}});
  };
  const click=()=>{const button=route.node?.children?.find(c=>c.dataset.m26FreeHistoryOpen!==undefined
    ||c.dataset.m26FreeHistoryRetry!==undefined);
    assert.ok(button,'Explicit archive action must be present');
    root.dispatch('click',{target:{closest:()=>button},preventDefault(){}});
  };
  return {ctrl,root,route,store,shell,click,resolve:()=>release?.(page(pendingSection)),reject:()=>rejectRequest?.(new Error('NETWORK_FAIL')),
    get calls(){return calls;},get incorporated(){return incorporated;},
    setRole(role){current.identity.role=role;}};
}

test('entry to session, plan and progress never triggers paginated Egress',async()=>{
  const s=state();
  for(const area of ['sesion','planificacion','progreso']){
    assert.equal(canOfferClientHistory(s,area,true),true);
    assert.equal(shouldLoadClientHistory(s,area,true),false);
    assert.equal(shouldLoadClientHistory(s,area,true,true),true);
  }
  assert.equal(canOfferClientHistory(s,'hoy',true),false);
  assert.equal(shouldLoadClientHistory(s,'sesion',false,true),false);
  s.identity.role='coach';
  assert.equal(canOfferClientHistory(s,'sesion',true),false);
  s.identity.role='client';s.hydration.status='loading';
  assert.equal(canOfferClientHistory(s,'sesion',true),false);

  const h=harness();h.ctrl.mount();
  for(const area of ['sesion','planificacion','progreso','sesion'])h.shell(area);
  await tick();
  assert.equal(h.calls,0);
  assert.equal(h.incorporated,0);
  h.ctrl.destroy();
});
test('explicit disclosure fetches exactly once; re-render and navigation do not refetch',async()=>{
  const h=harness();h.ctrl.mount();h.shell('sesion');await tick();
  assert.match(h.route.node.textContent,/sólo cuando los solicitas/u);
  h.click();await tick();
  assert.equal(h.calls,1);
  h.shell('sesion');await tick();assert.equal(h.calls,1);
  h.resolve();await tick();
  assert.equal(h.calls,2,'execution history must be read after sessions');
  assert.equal(h.incorporated,0,'no partial history may reach the store');
  h.resolve();await tick();
  assert.equal(h.incorporated,1);
  h.shell('sesion');h.shell('progreso');await tick();
  assert.equal(h.calls,2);
  h.ctrl.destroy();
});
test('navigating away or switching role cancels late pages and never incorporates them',async()=>{
  const h=harness();h.ctrl.mount();h.shell('sesion');h.click();await tick();
  assert.equal(h.calls,1);
  h.shell('hoy');h.resolve();await tick();
  assert.equal(h.incorporated,0);
  h.shell('sesion');await tick();assert.equal(h.calls,1);
  h.click();await tick();assert.equal(h.calls,2);
  h.setRole('coach');h.root.dispatch('m26:shell-rendered',{detail:{role:'coach',area:'sesion'}});
  h.resolve();await tick();
  assert.equal(h.incorporated,0);
  h.ctrl.destroy();
});

test('a failed authenticated archive read never polls: only a second explicit click may retry',async()=>{
  const h=harness();h.ctrl.mount();h.shell('sesion');h.click();await tick();
  assert.equal(h.calls,1);
  h.reject();await tick();
  h.shell('sesion');h.shell('sesion');await tick();
  assert.equal(h.calls,1,'rerender must not repeat a failed request');
  h.click();await tick();
  assert.equal(h.calls,2,'user click explicitly retries the failed request');
  h.resolve();await tick();
  assert.equal(h.calls,3,'retry must fetch execution history too');
  assert.equal(h.incorporated,0);
  h.resolve();await tick();
  assert.equal(h.incorporated,1);
  h.ctrl.destroy();
});
