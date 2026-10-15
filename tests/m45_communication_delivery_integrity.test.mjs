import test from 'node:test';
import assert from 'node:assert/strict';

import {createCommunicationService} from '../src/m26/communication/service.js';
import {
  createCommunicationController,
  __communicationControllerInternals as controllerInternals,
} from '../src/m26/communication/controller.js';

const tick=()=>new Promise((resolve)=>setImmediate(resolve));

function messageInput(operationId='m45-send-1'){
  return {
    type:'MESSAGE_SEND',
    operationId,
    entityId:'thread-a',
    payload:{threadId:'thread-a',body:'Mensaje real de prueba'},
  };
}

function serviceHarness({execute,refreshState=async()=>{},pushKick}={}){
  let writes=0;
  let kicks=0;
  const transport={
    async execute(...args){
      writes+=1;
      return execute?execute(...args):{ok:true,kind:'ack'};
    },
    async webPushDispatchKick(){
      kicks+=1;
      return pushKick?.()??{ok:true};
    },
  };
  const service=createCommunicationService({
    transport,
    getToken:async()=> 'signed-test-token',
    getRole:()=> 'coach',
    getState:()=> ({available:true,identity:{id:'coach-test'}}),
    isOnline:()=>true,
    refreshState,
  });
  return {service,getWrites:()=>writes,getKicks:()=>kicks};
}

test('M45: confirmed remote ACK remains success if local refresh fails; no duplicate send',async()=>{
  const h=serviceHarness({refreshState:async()=>{throw Error('broken projection');}});
  const result=await h.service.execute(messageInput());
  assert.equal(result.ok,true);
  assert.equal(result.response.kind,'ack');
  assert.equal(result.syncPending,true);
  assert.equal(h.getWrites(),1);
  await tick();
  assert.equal(h.getKicks(),1,'push dispatch must still be attempted after acknowledged send');
});

test('M45: server rejection still fails closed (not an optimistic success)',async()=>{
  const h=serviceHarness({execute:async()=>{throw Error('authorization_denied');}});
  await assert.rejects(()=>h.service.execute(messageInput()),/authorization_denied/);
  assert.equal(h.getWrites(),1);
  assert.equal(h.getKicks(),0);
});

test('M45: same in-flight operation deduplicates; a changed payload cannot reuse its ID',async()=>{
  let release;
  const pending=new Promise((resolve)=>{release=resolve;});
  const h=serviceHarness({execute:()=>pending});
  const first=h.service.execute(messageInput('same-id'));
  const second=h.service.execute(messageInput('same-id'));
  await assert.rejects(
    ()=>h.service.execute({...messageInput('same-id'),payload:{threadId:'thread-a',body:'Distinto'}}),
    /M26_COMMUNICATION_OPERATION_ID_COLLISION/,
  );
  release({ok:true,kind:'ack'});
  const results=await Promise.all([first,second]);
  assert.equal(h.getWrites(),1);
  assert.equal(results[0],results[1]);
});

function composer(id,body,{focused=false,open=true}={}){
  const detail={open};
  const textarea={
    value:body,selectionStart:3,selectionEnd:4,scrollTop:12,
    focus(){this.wasFocused=true;},
    setSelectionRange(start,end){this.selection=[start,end];},
  };
  const form={
    querySelector(selector){
      if(selector==='[name="threadId"]')return {value:id};
      if(selector==='textarea[name="body"]')return textarea;
      return null;
    },
    closest(){return detail;},
  };
  return {form,textarea,detail,focused};
}

function draftRoot(...composers){
  return {
    ownerDocument:{activeElement:composers.find((entry)=>entry.focused)?.textarea||null},
    querySelectorAll(selector){
      return selector==='[data-communication-form="message-send"]'
        ?composers.map((entry)=>entry.form):[];
    },
  };
}

test('M45: unsent messages, focus, cursor, scroll and expanded thread survive rerender',()=>{
  const source=composer('thread-a','No perder este borrador',{focused:true,open:true});
  const drafts=controllerInternals.captureMessageDrafts(draftRoot(source));
  const destination=composer('thread-a','',{open:false});
  controllerInternals.restoreMessageDrafts(draftRoot(destination),drafts);
  assert.equal(destination.textarea.value,'No perder este borrador');
  assert.equal(destination.detail.open,true);
  assert.equal(destination.textarea.wasFocused,true);
  assert.deepEqual(destination.textarea.selection,[3,4]);
  assert.equal(destination.textarea.scrollTop,12);
});

test('M45: pending retry is not cleared by a stale ACK for an older choice',()=>{
  const pending={coachMessages:false,scheduleChanges:true};
  const ack={coachMessages:true,scheduleChanges:true};
  assert.deepEqual(controllerInternals.clearSyncedPreferenceKeys(pending,ack),{coachMessages:false});
});

test('M45: a late remote read never overwrites an explicit newer preference',async()=>{
  let release;
  const status=new Promise((resolve)=>{release=resolve;});
  const applied=[],updated=[];
  const control={
    type:'checkbox',checked:false,
    getAttribute(name){return name==='data-m26-preference'?'notifications.coachMessages':null;},
  };
  const handlers=new Map();
  const root={
    ownerDocument:{defaultView:null},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    addEventListener(kind,fn){handlers.set(kind,fn);},
    removeEventListener(kind){handlers.delete(kind);},
  };
  const controller=createCommunicationController({
    root,
    render(){throw Error('stale hydration must not render');},
    service:{
      notificationPreferences:{
        status:()=>status,
        applyRemote(value){applied.push(value);},
        async update(value){updated.push(value);return {ok:true};},
      },
      webPush:{async status(){return {active:false};}},
    },
  });
  controller.mount();
  await tick();
  handlers.get('change')({target:{closest(){return control;}}});
  release({ok:true,preferences:{coachMessages:true}});
  await tick();
  await tick();
  assert.deepEqual(applied,[]);
  assert.deepEqual(updated,[{coachMessages:false}]);
  controller.destroy();
});


test('M45: shell redraw restores unsent private composer without browser persistence',async()=>{
  const original=composer('thread-a','Texto pendiente que no se debe perder',{focused:true});
  const replacement=composer('thread-a','',{open:false});
  const listeners=new Map();
  let visible=[original];
  let role='coach';
  original.textarea.closest=()=>original.form;
  const root={
    ownerDocument:{defaultView:null,activeElement:original.textarea},
    querySelector(selector){
      if(selector==='[data-communication-role]'&&role){
        return {dataset:{communicationRole:role}};
      }
      return null;
    },
    querySelectorAll(selector){
      return selector==='[data-communication-form="message-send"]'
        ?visible.map(x=>x.form):[];
    },
    addEventListener(name,handler){listeners.set(name,handler);},
    removeEventListener(name){listeners.delete(name);},
  };
  const controller=createCommunicationController({root,service:{webPush:{async status(){return {};}}}});
  controller.mount();
  listeners.get('input')({target:original.textarea});
  visible=[replacement];
  listeners.get('m26:shell-rendered')();
  assert.equal(replacement.textarea.value,'Texto pendiente que no se debe perder');
  assert.equal(replacement.detail.open,true);
  assert.equal(replacement.textarea.wasFocused,true);

  // The draft is scoped to the communication role, and leaving clears it.
  role=null;
  listeners.get('m26:shell-rendered')();
  const next=composer('thread-a','');
  visible=[next];
  role='client';
  listeners.get('m26:shell-rendered')();
  assert.equal(next.textarea.value,'');
  controller.destroy();
  assert.equal(listeners.size,0);
});


test('M45: a superseded preference failure never sends the old value on reconnect',async()=>{
  const handlers=new Map();
  const windowHandlers=new Map();
  let rejectFirst;
  const updates=[];
  const root={
    ownerDocument:{defaultView:{
      addEventListener(name,handler){windowHandlers.set(name,handler);},
      removeEventListener(name){windowHandlers.delete(name);},
    }},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    addEventListener(name,handler){handlers.set(name,handler);},
    removeEventListener(name){handlers.delete(name);},
  };
  const controller=createCommunicationController({
    root,
    service:{
      notificationPreferences:{
        async status(){return {ok:true,preferences:{}};},
        applyRemote(){return true;},
        update(payload){
          updates.push({...payload});
          if(updates.length===1)return new Promise((resolve,reject)=>{rejectFirst=reject;});
          return Promise.resolve({ok:true,preferences:payload});
        },
      },
      webPush:{async status(){return {active:false};}},
    },
  });
  function send(value){
    const control={
      type:'checkbox',checked:value,
      getAttribute(name){return name==='data-m26-preference'?'notifications.coachMessages':null;},
    };
    handlers.get('change')({target:{closest(){return control;}}});
  }
  controller.mount();
  await tick();
  send(true);
  send(false);
  assert.deepEqual(updates,[{coachMessages:true}]);
  rejectFirst(new Error('network-failure'));
  await tick();
  await tick();
  assert.deepEqual(updates,[{coachMessages:true},{coachMessages:false}]);
  windowHandlers.get('online')();
  await tick();
  assert.equal(
    updates.some((payload,index)=>index>1&&payload.coachMessages===true),
    false,
    'older value must never be resurrected on reconnection',
  );
  controller.destroy();
});
