import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunicationController} from '../src/m26/communication/controller.js';

const tick=()=>new Promise((resolve)=>setImmediate(resolve));
function deferred(){
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
function pushControl(){
  const status={textContent:'Comprobando disponibilidad…'};
  const enable={disabled:false,hidden:false};
  const disable={disabled:false,hidden:true};
  return {
    dataset:{},status,enable,disable,
    querySelector(selector){
      if(selector==='[data-m26-web-push-status]')return status;
      if(selector==='[data-m26-web-push-action="enable"]')return enable;
      if(selector==='[data-m26-web-push-action="disable-current"]')return disable;
      return null;
    },
  };
}
function rootHarness(){
  const listeners=new Map(),windowListeners=new Map();
  let current=pushControl(),role='coach',identity='account-A';
  const root={
    ownerDocument:{defaultView:{
      addEventListener(name,listener){windowListeners.set(name,listener);},
      removeEventListener(name){windowListeners.delete(name);},
    }},
    querySelector(selector){
      if(selector==='[data-m26-web-push-control]')return current;
      if(selector==='[data-communication-role]'&&role)return {dataset:{communicationRole:role,communicationIdentity:identity}};
      return null;
    },
    querySelectorAll(){return [];},
    addEventListener(name,callback){listeners.set(name,callback);},
    removeEventListener(name){listeners.delete(name);},
  };
  return {
    root,listeners,windowListeners,
    getControl:()=>current,
    swapControl(){current=pushControl();return current;},
    setRole(value){role=value;},
    setIdentity(value){identity=value;},
  };
}

test('M45 an asynchronous push response cannot repaint a control after unmount',async()=>{
  const h=rootHarness(),remote=deferred();
  let calls=0;
  const controller=createCommunicationController({
    root:h.root,
    service:{webPush:{status(){calls++;return remote.promise;}}},
  });
  const old=h.getControl();
  controller.mount();
  await tick();
  assert.equal(calls,1);
  controller.destroy();
  remote.resolve({active:true,supported:true,configured:true});
  await tick();
  assert.equal(old.status.textContent,'Comprobando disponibilidad…');
  assert.equal(old.dataset.m26WebPushActive,undefined);
});

test('M45 push status attaches only to the latest shell control after a redraw',async()=>{
  const h=rootHarness(),first=deferred(),second=deferred();
  let calls=0;
  const controller=createCommunicationController({
    root:h.root,
    service:{webPush:{status(){calls++;return calls===1?first.promise:second.promise;}}},
  });
  const old=h.getControl();
  controller.mount();
  await tick();
  assert.equal(calls,1);
  const current=h.swapControl();
  h.listeners.get('m26:shell-rendered')();
  await tick();
  assert.equal(calls,2,'new control must get its own status request');
  first.resolve({active:true,supported:true});
  await tick();
  assert.equal(old.dataset.m26WebPushActive,undefined);
  assert.equal(current.dataset.m26WebPushActive,undefined);
  second.resolve({active:false,supported:true,configured:true});
  await tick();
  assert.equal(current.dataset.m26WebPushActive,'false');
  assert.equal(old.status.textContent,'Comprobando disponibilidad…');
  controller.destroy();
});

test('M45 queued preference writes do not replay across logout or role switches',async()=>{
  const h=rootHarness(),first=deferred(),updates=[];
  const controller=createCommunicationController({
    root:h.root,
    service:{
      notificationPreferences:{
        update(payload){
          updates.push({...payload});
          return updates.length===1?first.promise:Promise.resolve({ok:true});
        },
      },
    },
  });
  function toggle(value){
    const control={
      checked:value,type:'checkbox',
      getAttribute(name){return name==='data-m26-preference'?'notifications.coachMessages':null;},
    };
    h.listeners.get('change')({target:{closest(){return control;}}});
  }
  controller.mount();
  toggle(true);
  toggle(false);
  assert.deepEqual(updates,[{coachMessages:true}]);
  controller.destroy();
  first.resolve({ok:true});
  await tick();
  await tick();
  assert.deepEqual(updates,[{coachMessages:true}],
    'queued mutation cannot run using a subsequent identity');
  controller.mount();
  toggle(false);
  await tick();
  assert.deepEqual(updates,[{coachMessages:true},{coachMessages:false}]);
  controller.destroy();
});

test('M45 a queued mount callback cannot revive after immediate destroy',async()=>{
  const h=rootHarness();
  let calls=0;
  const controller=createCommunicationController({
    root:h.root,
    service:{webPush:{async status(){calls++;return {active:false};}}},
  });
  controller.mount();
  controller.destroy();
  await tick();
  assert.equal(calls,0);
});


test('M45 account scope changes prevent an old Coach write queue from executing as Client',async()=>{
  const h=rootHarness(),oldRequest=deferred(),updates=[];
  const controller=createCommunicationController({
    root:h.root,
    service:{
      notificationPreferences:{
        update(payload){
          updates.push({...payload});
          return updates.length===1?oldRequest.promise:Promise.resolve({ok:true});
        },
      },
    },
  });
  function change(value){
    const checkbox={
      type:'checkbox',checked:value,
      getAttribute(name){return name==='data-m26-preference'?'notifications.coachMessages':null;},
    };
    h.listeners.get('change')({target:{closest(){return checkbox;}}});
  }
  controller.mount();
  h.listeners.get('m26:shell-rendered')();
  await tick();
  change(true);
  change(false);
  assert.deepEqual(updates,[{coachMessages:true}]);
  h.setRole('client');
  h.listeners.get('m26:shell-rendered')();
  oldRequest.resolve({ok:true});
  await tick();
  await tick();
  assert.deepEqual(updates,[{coachMessages:true}],
    'Coach queued mutations must not run after role switch');
  change(false);
  await tick();
  assert.deepEqual(updates,[{coachMessages:true},{coachMessages:false}]);
  controller.destroy();
});


test('M45 online reconnect coalesces read-only conversation reloads without repeated writes',async()=>{
  const h=rootHarness(),remote=deferred();
  let reloads=0,renders=0;
  const controller=createCommunicationController({
    root:h.root,
    service:{
      reload(){reloads++;return remote.promise;},
      webPush:{async status(){return {active:false,supported:true};}},
    },
    render(){renders++;},
  });
  controller.mount();
  await tick();
  const onOnline=h.windowListeners.get('online');
  onOnline();
  onOnline();
  assert.equal(reloads,1,'same reconnect cannot start concurrent snapshot calls');
  remote.resolve({ok:true});
  await tick();
  assert.equal(renders,1);
  controller.destroy();
  assert.equal(h.windowListeners.size,0);
});

test('M45 old account reconnect response never rerenders after identity transition',async()=>{
  const h=rootHarness(),remote=deferred();
  let renders=0;
  const controller=createCommunicationController({
    root:h.root,
    service:{
      reload(){return remote.promise;},
      webPush:{async status(){return {active:false,supported:true};}},
    },
    render(){renders++;},
  });
  controller.mount();
  await tick();
  h.windowListeners.get('online')();
  h.setRole('client');
  h.listeners.get('m26:shell-rendered')();
  remote.resolve({ok:true});
  await tick();
  assert.equal(renders,0,'stale Coach reload cannot paint the Client view');
  controller.destroy();
});


test('M45 same-role identity switch fences stale web push result and preference queue',async()=>{
  const h=rootHarness(),statusA=deferred(),statusB=deferred(),saveA=deferred();
  const writes=[];
  let pushCalls=0;
  const controller=createCommunicationController({
    root:h.root,
    service:{
      webPush:{
        status(){
          pushCalls++;
          return pushCalls===1?statusA.promise:statusB.promise;
        },
      },
      notificationPreferences:{
        update(payload){
          writes.push({...payload});
          return writes.length===1?saveA.promise:Promise.resolve({ok:true});
        },
      },
    },
  });
  controller.mount();
  await tick();
  const checkbox=(value)=>({
    type:'checkbox',checked:value,
    getAttribute(name){return name==='data-m26-preference'?'notifications.coachMessages':null;},
  });
  const change=(value)=>h.listeners.get('change')({
    target:{closest(){return checkbox(value);}},
  });
  change(true);
  change(false);
  const previous=h.getControl();
  h.setIdentity('account-B');
  const next=h.swapControl();
  h.listeners.get('m26:shell-rendered')();
  await tick();
  statusA.resolve({active:true});
  saveA.resolve({ok:true});
  await tick();
  await tick();
  assert.deepEqual(writes,[{coachMessages:true}], 'old account queue must be cancelled');
  assert.equal(previous.dataset.m26WebPushActive,undefined);
  statusB.resolve({active:false});
  await tick();
  assert.equal(next.dataset.m26WebPushActive,'false');
  controller.destroy();
});
