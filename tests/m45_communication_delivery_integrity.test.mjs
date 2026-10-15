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
  original.textarea.closest=(selector)=>
    selector==='[data-communication-form="message-send"]'?original.form:null;
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


test('M45 failed bootstrap offers a clear and explicit recovery path',async()=>{
  const {renderCommunicationRoute}=await import('../src/m26/communication/route-render.js');
  const html=renderCommunicationRoute({communication:true,kind:'communication-unavailable',role:'client'});
  assert.match(html,/data-m45-communication-retry/);
  assert.match(html,/Volver a intentar/);
  assert.match(html,/Tus datos no se han modificado/);
  assert.doesNotMatch(html,/data-communication-form="message-send"/);
});

test('M45 manual recovery rehydrates without sending mutations or leaving the button locked',async()=>{
  const handlers=new Map();
  let calls=0,renders=0;
  const button={disabled:false};
  const root={
    ownerDocument:{defaultView:null},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    addEventListener(type,handler){handlers.set(type,handler);},
    removeEventListener(type){handlers.delete(type);},
  };
  const controller=createCommunicationController({
    root,
    service:{
      async reload(){calls+=1;return {ok:true};},
      webPush:{async status(){return {active:false};}},
    },
    render(){renders+=1;},
  });
  controller.mount();
  handlers.get('click')({
    target:{closest(selector){return selector==='[data-m45-communication-retry]'?button:null;}},
    preventDefault(){},
  });
  await tick();
  await tick();
  assert.equal(calls,1);
  assert.equal(renders,1);
  assert.equal(button.disabled,false);
  controller.destroy();
});

test('M45 failed explicit recovery retains a functional retry button',async()=>{
  const handlers=new Map();
  let renders=0;
  const button={disabled:false};
  const root={
    ownerDocument:{defaultView:null},
    querySelector(){return null;},
    querySelectorAll(){return [];},
    addEventListener(type,handler){handlers.set(type,handler);},
    removeEventListener(type){handlers.delete(type);},
  };
  const controller=createCommunicationController({
    root,
    service:{
      async reload(){throw Error('network unavailable');},
      webPush:{async status(){return {active:false};}},
    },
    render(){renders+=1;},
  });
  controller.mount();
  handlers.get('click')({
    target:{closest(selector){return selector==='[data-m45-communication-retry]'?button:null;}},
    preventDefault(){},
  });
  await tick();
  assert.equal(renders,0);
  assert.equal(button.disabled,false);
  controller.destroy();
});

test('M45 send composer exposes live status for assistive technology',async()=>{
  const {renderCommunicationRoute}=await import('../src/m26/communication/route-render.js');
  const html=renderCommunicationRoute({
    communication:true,kind:'communication',role:'client',threads:[
      {id:'thread-a',messages:[],unreadCount:0,coachName:'Coach'},
    ],notifications:[],clients:[],canOpenThread:false,
  });
  assert.match(html,/class="m45-compose-status" role="status" aria-live="polite"/);
  assert.match(html,/data-communication-form="message-send"/);
});


test('M45 conversation empty copy does not promise an immediate response',async()=>{
  const {renderCommunicationRoute}=await import('../src/m26/communication/route-render.js');
  const common={communication:true,kind:'communication',threads:[],notifications:[],clients:[],canOpenThread:false};
  const client=renderCommunicationRoute({...common,role:'client'});
  assert.match(client,/Tu coach podrá comunicarse contigo/);
  assert.doesNotMatch(client,/Selecciona un cliente para comenzar/);
  const coach=renderCommunicationRoute({...common,role:'coach'});
  assert.match(coach,/Selecciona un cliente para comenzar/);
  assert.doesNotMatch(coach,/Tu coach podrá comunicarse contigo/);
  const thread=renderCommunicationRoute({...common,role:'client',threads:[
    {id:'thread-a',coachName:'Coach',messages:[],unreadCount:0},
  ]});
  assert.match(thread,/no garantiza respuesta inmediata/);
});


test('M45 same-role account switch clears unsent private drafts and operation identity',async()=>{
  const handlers=new Map();
  const old=composer('thread-a','Borrador confidencial de la cuenta A',{focused:true});
  const fresh=composer('thread-a','',{open:false});
  old.textarea.closest=(selector)=>selector==='[data-communication-form="message-send"]'?old.form:null;
  let shown=old;
  let identity='account-A';
  const root={
    ownerDocument:{defaultView:null,activeElement:old.textarea},
    querySelector(selector){
      if(selector==='[data-communication-role]')return {
        dataset:{communicationRole:'coach',communicationIdentity:identity},
      };
      return null;
    },
    querySelectorAll(selector){
      return selector==='[data-communication-form="message-send"]'?[shown.form]:[];
    },
    addEventListener(name,fn){handlers.set(name,fn);},
    removeEventListener(name){handlers.delete(name);},
  };
  const controller=createCommunicationController({root,service:{webPush:{async status(){return {};}}}});
  controller.mount();
  handlers.get('input')({target:old.textarea});
  identity='account-B';
  shown=fresh;
  handlers.get('m26:shell-rendered')();
  assert.equal(fresh.textarea.value,'','another Coach account must never see the draft');
  assert.equal(fresh.detail.open,false);
  controller.destroy();
});

test('M45 private communication route carries escaped account identity scope',async()=>{
  const {renderCommunicationRoute}=await import('../src/m26/communication/route-render.js');
  const html=renderCommunicationRoute({
    communication:true,kind:'communication',role:'coach',
    communicationIdentityScope:'account-"A"&B',threads:[],notifications:[],
    clients:[],canOpenThread:false,
  });
  assert.match(html,/data-communication-identity="account-&quot;A&quot;&amp;B"/);
  assert.doesNotMatch(html,/data-communication-identity="account-"A"&B"/);
});


test('M45 route view-model uses authenticated state identity, not a stale shell identity',async()=>{
  const {createCommunicationRouteViewModel}=await import('../src/m26/communication/view-model.js');
  const shell={activeArea:'mensajes',identity:{role:'coach',id:'stale-shell-user'}};
  const communication={available:true,threads:[],messages:[],notifications:[]};
  const vm=createCommunicationRouteViewModel(
    {kind:'mensajes',role:'coach'},
    shell,
    {identity:{role:'coach',id:'current-auth-user'},communication,collections:{clients:[]}},
  );
  assert.equal(vm.communicationIdentityScope,'current-auth-user');
  assert.equal(vm.kind,'communication');
  const html=(await import('../src/m26/communication/route-render.js')).renderCommunicationRoute(vm);
  assert.match(html,/data-communication-identity="current-auth-user"/);
});


test('M45 an acknowledged old-account message cannot refresh the next account',async()=>{
  let identity='coach-account-A',release,started;
  const pending=new Promise((resolve)=>{release=resolve;});
  const sent=new Promise((resolve)=>{started=resolve;});
  let refreshes=0;
  const service=createCommunicationService({
    transport:{execute:()=>{started();return pending;}},
    getToken:async()=> 'jwt-account-A',
    getRole:()=> 'coach',
    getState:()=>({available:true,identity:{id:identity}}),
    isOnline:()=>true,
    refreshState:async()=>{refreshes++;},
  });
  const resultPromise=service.execute(messageInput('account-A-op'));
  await sent; // The signed request is already in-flight as account A.
  identity='coach-account-B';
  release({ok:true,kind:'ack'});
  const result=await resultPromise;
  assert.equal(result.ok,true,'the server ACK remains authoritative');
  assert.equal(result.syncPending,true,'the original account is no longer visible');
  assert.equal(refreshes,0,'never hydrate the replacement identity from an old operation');
});


test('M45 account switch while awaiting token prevents sending a command with another account JWT',async()=>{
  let identity='coach-A',resolveToken,remoteCalls=0,refreshes=0;
  const pendingToken=new Promise((resolve)=>{resolveToken=resolve;});
  const service=createCommunicationService({
    transport:{async execute(){remoteCalls++;return {ok:true,kind:'ack'};}},
    getToken:()=>pendingToken,
    getState:()=>({available:true,identity:{id:identity}}),
    getRole:()=> 'coach',
    isOnline:()=>true,
    refreshState:async()=>{refreshes++;},
  });
  const result=service.execute(messageInput('before-token-account-A'));
  identity='coach-B';
  resolveToken('jwt-B');
  await assert.rejects(()=>result,/M45_COMMUNICATION_ACTOR_CHANGED/);
  assert.equal(remoteCalls,0);
  assert.equal(refreshes,0);
});
