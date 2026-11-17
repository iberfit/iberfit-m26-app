import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommunicationController} from '../src/m26/communication/controller.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function createHarness(){
  let visible=false,identity='QA-client-A',pushControl=push();
  const events=new Map(),wins=new Map(),applied=[],updates=[];
  let prefReads=0,pushReads=0,enableCalls=0;
  const check={type:'checkbox',checked:true,
    getAttribute:k=>k==='data-m26-preference'?'notifications.sessionReminders':null,
    getClientRects:()=>visible?[{width:100,height:22}]:[]};
  const role={dataset:{get communicationRole(){return 'client'},get communicationIdentity(){return identity}}};
  const root={
    ownerDocument:{defaultView:{getComputedStyle:()=>({visibility:'visible'}),addEventListener:(k,f)=>wins.set(k,f),removeEventListener:k=>wins.delete(k)}},
    addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),
    querySelector:k=>k==='[data-communication-role]'?role:k==='[data-m26-web-push-control]'?pushControl:null,
    querySelectorAll:k=>k==='[data-m26-preference^="notifications."]'?[check]:[]
  };
  function push(){
    const state={textContent:''},enable={hidden:false,disabled:false},disable={hidden:false,disabled:false};
    return{state,enable,disable,dataset:{},querySelector:k=>k==='[data-m26-web-push-status]'?state:k==='[data-m26-web-push-action="enable"]'?enable:k==='[data-m26-web-push-action="disable-current"]'?disable:null};
  }
  const prefs={sessionReminders:true,coachMessages:false};
  const service={notificationPreferences:{
    async status(){prefReads++;return{ok:true,preferences:prefs}},
    applyRemote:v=>{applied.push(v);return true},
    async update:v=>{updates.push(v);return{ok:true}}
  },webPush:{
    async status(){pushReads++;return{active:false,supported:true,configured:true,permission:'granted'}},
    async enable(){enableCalls++;return{ok:true}},async disableCurrent(){return{ok:true}}
  }};
  const controller=createCommunicationController({root,service});
  return{controller,applied,updates,visible:()=>{visible=true},actor:x=>{identity=x},render:()=>events.get('m26:shell-rendered')?.(),online:()=>wins.get('online')?.(),
    switchPush:()=>{pushControl=push();return pushControl},
    currentPush:()=>pushControl,
    action:()=>events.get('click')?.({preventDefault(){},target:{closest:k=>k==='[data-m26-web-push-action]'?{dataset:{m26WebPushAction:'enable'},disabled:false}:null}}),
    counts:()=>({prefReads,pushReads,enableCalls})};
}
test('hidden settings never fetch consent on mount, paint or reconnect',async()=>{
 const h=createHarness();h.controller.mount();await tick();h.render();await tick();h.online();await tick();assert.equal(h.counts().prefReads,0);h.controller.destroy();
});
test('opening settings hydrates once, reconnect rechecks, and no default writes occur',async()=>{
 const h=createHarness();h.controller.mount();await tick();h.visible();h.render();await tick();assert.equal(h.counts().prefReads,1);
 h.render();await tick();assert.equal(h.counts().prefReads,1);h.online();await tick();assert.equal(h.counts().prefReads,2);
 assert.equal(h.updates.length,0);assert.equal(h.applied.length,2);h.controller.destroy();
});
test('identity switch revalidates both private preference and device state',async()=>{
 const h=createHarness();h.controller.mount();await tick();h.visible();h.render();await tick();const before=h.counts();
 h.actor('QA-client-B');h.render();await tick();assert.equal(h.counts().prefReads,before.prefReads+1);
 assert.equal(h.counts().pushReads,before.pushReads+1);h.controller.destroy();
});
test('same actor push UI replacement reuses recent status, while explicit action checks once',async()=>{
 const h=createHarness();h.controller.mount();await tick();const before=h.counts().pushReads;
 const element=h.switchPush();h.render();await tick();assert.equal(h.counts().pushReads,before);
 assert.equal(element.state.textContent,'Avisos desactivados en este dispositivo.');
 h.action();await tick();await tick();assert.equal(h.counts().enableCalls,1);
 assert.equal(h.counts().pushReads,before+1);
 assert.equal(h.currentPush().enable.disabled,false);h.controller.destroy();
});
