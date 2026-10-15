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


test('M45 late send acknowledgement cannot clear a new account draft or block its send',async()=>{
  const originalFormData=globalThis.FormData;
  const handlers=new Map();
  const oldAck=deferred();
  const executed=[];
  let identity='account-A';
  let renders=0;
  function composer(message){
    const textarea={value:message,selectionStart:0,selectionEnd:0,scrollTop:0,
      focus(){},setSelectionRange(){}};
    const status={textContent:''};
    const button={disabled:false};
    const details={open:true};
    const form={
      dataset:{communicationForm:'message-send'},
      querySelector(selector){
        if(selector==='[name="threadId"]')return {value:'thread-a'};
        if(selector==='textarea[name="body"]')return textarea;
        if(selector==='button[type="submit"]')return button;
        if(selector==='.m45-compose-status')return status;
        return null;
      },
      closest(selector){return selector==='details.m26-thread'?details:null;},
      setAttribute(){},
      reset(){textarea.value='';},
    };
    return {form,textarea};
  }
  const a=composer('Mensaje privado de A');
  const b=composer('Mensaje privado de B');
  let visible=a;
  const root={
    ownerDocument:{defaultView:null,activeElement:null},
    querySelector(selector){
      return selector==='[data-communication-role]'
        ?{dataset:{communicationRole:'coach',communicationIdentity:identity}}:null;
    },
    querySelectorAll(selector){
      return selector==='[data-communication-form="message-send"]'?[visible.form]:[];
    },
    addEventListener(name,handler){handlers.set(name,handler);},
    removeEventListener(name){handlers.delete(name);},
  };
  globalThis.FormData=class{
    constructor(form){this.form=form;}
    get(key){
      return key==='threadId'?'thread-a':key==='body'
        ?this.form.querySelector('textarea[name="body"]').value:null;
    }
  };
  const controller=createCommunicationController({
    root,
    service:{
      execute(command){
        executed.push(command.payload.body);
        if(command.payload.body==='Mensaje privado de A')return oldAck.promise;
        return Promise.resolve({ok:true,syncPending:false});
      },
    },
    render(){renders++;},
  });
  const submit=(form)=>handlers.get('submit')({
    target:{closest(selector){return selector==='[data-communication-form]'?form:null;}},
    preventDefault(){},
  });
  try{
    controller.mount();
    submit(a.form);
    await tick();
    assert.deepEqual(executed,['Mensaje privado de A']);
    identity='account-B';
    visible=b;
    handlers.get('m26:shell-rendered')();
    submit(b.form);
    await tick();
    assert.deepEqual(executed,['Mensaje privado de A','Mensaje privado de B']);
    assert.equal(b.textarea.value,'','account B send must succeed immediately');
    b.textarea.value='Nuevo borrador exclusivo de B';
    const rendersAfterB=renders;
    oldAck.resolve({ok:true,syncPending:false});
    await tick();
    assert.equal(b.textarea.value,'Nuevo borrador exclusivo de B');
    assert.equal(renders,rendersAfterB,'old ACK cannot paint new account');
  }finally{
    controller.destroy();
    globalThis.FormData=originalFormData;
  }
});


test('M45 a new message typed during a slow send is never cleared by the previous ACK',async()=>{
  const prior=globalThis.FormData;
  const handlers=new Map(),remote=deferred();
  let visible,resetCount=0,renderCount=0;
  const formFor=(body)=>{
    const textarea={
      value:body,scrollTop:0,selectionStart:0,selectionEnd:0,
      setSelectionRange(){},focus(){},
    };
    const details={open:true};
    const status={textContent:''};
    const button={disabled:false};
    const form={
      dataset:{communicationForm:'message-send'},
      querySelector(selector){
        if(selector==='[name="threadId"]')return {value:'thread-A'};
        if(selector==='textarea[name="body"]')return textarea;
        if(selector==='button[type="submit"]')return button;
        if(selector==='.m45-compose-status')return status;
        return null;
      },
      closest(selector){return selector==='details.m26-thread'?details:null;},
      setAttribute(){},
      reset(){resetCount++;textarea.value='';},
    };
    textarea.closest=(selector)=>selector==='[data-communication-form="message-send"]'?form:null;
    return {form,textarea,status,button,details};
  };
  visible=formFor('Primer mensaje');
  const root={
    ownerDocument:{defaultView:null,activeElement:visible.textarea},
    querySelector(selector){
      return selector==='[data-communication-role]'
        ?{dataset:{communicationRole:'coach',communicationIdentity:'account-A'}}:null;
    },
    querySelectorAll(selector){
      return selector==='[data-communication-form="message-send"]'?[visible.form]:[];
    },
    addEventListener(name,cb){handlers.set(name,cb);},
    removeEventListener(name){handlers.delete(name);},
  };
  globalThis.FormData=class{
    constructor(form){this.form=form;}
    get(key){
      if(key==='threadId')return 'thread-A';
      if(key==='body')return this.form.querySelector('textarea[name="body"]').value;
      return null;
    }
  };
  let executeCount=0;
  const controller=createCommunicationController({
    root,
    service:{execute(){executeCount++;return remote.promise;}},
    render(){renderCount++;visible=formFor('');},
  });
  try{
    controller.mount();
    const submitted=visible;
    handlers.get('submit')({
      target:{closest(selector){return selector==='[data-communication-form]'?submitted.form:null;}},
      preventDefault(){},
    });
    await tick();
    assert.equal(executeCount,1);
    submitted.textarea.value='Segundo mensaje todavía sin enviar';
    submitted.textarea.selectionStart=9;
    handlers.get('input')({target:submitted.textarea});
    remote.resolve({ok:true,syncPending:false});
    await tick();
    assert.equal(resetCount,0,'old form must never be reset when user has continued typing');
    assert.equal(visible.textarea.value,'Segundo mensaje todavía sin enviar');
    assert.equal(renderCount,1);
    assert.equal(visible.details.open,true);
  }finally{
    controller.destroy();
    globalThis.FormData=prior;
  }
});

test('M45 a rendering fault after a confirmed send cannot invite duplicate submissions',async()=>{
  const prior=globalThis.FormData,handlers=new Map();
  let operations=0;
  const textarea={value:'Mensaje confirmado',scrollTop:0};
  const button={disabled:false},status={textContent:''};
  const form={
    dataset:{communicationForm:'message-send'},
    querySelector(sel){
      if(sel==='[name="threadId"]')return {value:'thread-A'};
      if(sel==='textarea[name="body"]')return textarea;
      if(sel==='button[type="submit"]')return button;
      if(sel==='.m45-compose-status')return status;
      return null;
    },
    closest(){return {open:true};},
    setAttribute(){},
  };
  const root={
    ownerDocument:{defaultView:null,activeElement:null},
    querySelector(){return null;},
    querySelectorAll(sel){return sel==='[data-communication-form="message-send"]'?[form]:[];},
    addEventListener(name,cb){handlers.set(name,cb);},
    removeEventListener(name){handlers.delete(name);},
  };
  globalThis.FormData=class{
    get(key){return key==='threadId'?'thread-A':key==='body'?'Mensaje confirmado':null;}
  };
  const controller=createCommunicationController({
    root,service:{async execute(){operations++;return {ok:true,syncPending:false};}},
    render(){throw Error('rendering backend refreshed, but UI failed');},
  });
  try{
    controller.mount();
    handlers.get('submit')({
      target:{closest(sel){return sel==='[data-communication-form]'?form:null;}},
      preventDefault(){},
    });
    await tick();
    assert.equal(operations,1);
    assert.equal(button.disabled,false,'confirmed RPC releases its UI lock');
    assert.equal(status.textContent,'Mensaje enviado.');
    assert.equal(textarea.value,'','sent message is cleared after ACK');
  }finally{
    controller.destroy();
    globalThis.FormData=prior;
  }
});


test('M45 stale preference read completion cannot clear the new account single-flight request',async()=>{
  const h=rootHarness(),old=deferred(),fresh=deferred();
  let calls=0;
  const applied=[];
  const controller=createCommunicationController({
    root:h.root,
    service:{
      notificationPreferences:{
        status(){
          calls++;
          return calls===1?old.promise:fresh.promise;
        },
        applyRemote(preferences){applied.push(preferences);}
      },
      webPush:{async status(){return {active:false,supported:false};}},
    },
    render(){},
  });
  controller.mount();
  await tick();
  assert.equal(calls,1);
  h.setIdentity('account-B');
  h.listeners.get('m26:shell-rendered')();
  await tick();
  assert.equal(calls,2);
  old.resolve({ok:true,preferences:{coachMessages:true}});
  await tick();
  h.windowListeners.get('online')();
  await tick();
  assert.equal(calls,2,'old promise completion cannot free account B in-flight slot');
  fresh.resolve({ok:true,preferences:{coachMessages:false}});
  await tick();
  assert.deepEqual(applied,[{coachMessages:false}]);
  controller.destroy();
});


test('M45 Coach sees a clear pending message when trying another thread during a send',async()=>{
  const oldFormData=globalThis.FormData;
  const events=new Map(),hold=deferred();
  let networkCalls=0;
  const compose=(id,body)=>{
    const textarea={value:body,scrollTop:0};
    const status={textContent:''};
    const button={disabled:false};
    let pending='false';
    const form={
      dataset:{communicationForm:'message-send'},
      querySelector(selector){
        if(selector==='[name="threadId"]')return {value:id};
        if(selector==='textarea[name="body"]')return textarea;
        if(selector==='.m45-compose-status')return status;
        if(selector==='button[type="submit"]')return button;
        return null;
      },
      closest(){return {open:true};},
      setAttribute(key,value){if(key==='aria-busy')pending=value;},
      getAttribute(key){return key==='aria-busy'?pending:null;},
    };
    return {form,textarea,status};
  };
  const first=compose('thread-a','Mensaje A');
  const second=compose('thread-b','Mensaje B');
  const root={
    ownerDocument:{defaultView:null,activeElement:null},
    querySelector(){return null;},
    querySelectorAll(selector){return selector==='[data-communication-form="message-send"]'
      ?[first.form,second.form]:[];},
    addEventListener(name,fn){events.set(name,fn);},
    removeEventListener(name){events.delete(name);},
  };
  globalThis.FormData=class{
    constructor(form){this.form=form;}
    get(key){return this.form.querySelector(key==='body'
      ?'textarea[name="body"]':'[name="threadId"]')?.value||null;}
  };
  const controller=createCommunicationController({root,service:{
    execute(){
      networkCalls++;
      return networkCalls===1?hold.promise:Promise.resolve({ok:true,syncPending:true});
    },
  }});
  const send=(x)=>events.get('submit')({target:{
    closest(sel){return sel==='[data-communication-form]'?x.form:null;},
  },preventDefault(){}});
  try{
    controller.mount();
    send(first);
    await tick();
    send(second);
    await tick();
    assert.equal(networkCalls,1);
    assert.match(second.status.textContent,/otra operación en curso/);
    assert.equal(second.textarea.value,'Mensaje B');
    hold.resolve({ok:true,syncPending:true});
    await tick();
    send(second);
    await tick();
    assert.equal(networkCalls,2);
  }finally{
    controller.destroy();
    globalThis.FormData=oldFormData;
  }
});
