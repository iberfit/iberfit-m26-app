import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyConversationFilter,
  createCommunicationController,
} from '../src/m26/communication/controller.js';
import {renderCommunicationRoute} from '../src/m26/communication/route-render.js';

const tick=()=>new Promise((resolve)=>setImmediate(resolve));

function fakeThread(label,unread){
  const summary={textContent:label};
  return {
    hidden:false,
    querySelector(selector){return selector==='summary'?summary:
      selector==='.m45-thread-identity'?{textContent:label}:null;},
    getAttribute(name){return name==='data-thread-unread-count'?String(unread):null;},
  };
}

function inboxRoot(threads){
  const search={value:'',closest(selector){return selector==='[data-m45-conversation-search]'?this:null;}};
  const toggle={
    value:null,
    setAttribute(key,value){if(key==='aria-pressed')this.value=value;},
    closest(selector){return selector==='[data-m45-unread-toggle]'?this:null;},
  };
  const feedback={textContent:''};
  const handlers=new Map();
  const root={
    ownerDocument:{defaultView:null},
    querySelector(selector){
      if(selector==='[data-m45-conversation-search]')return search;
      if(selector==='[data-m45-unread-toggle]')return toggle;
      if(selector==='[data-m45-filter-feedback]')return feedback;
      if(selector==='[data-communication-role]')return {dataset:{communicationRole:'coach'}};
      return null;
    },
    querySelectorAll(selector){return selector==='.m26-thread'?threads:[];},
    addEventListener(name,callback){handlers.set(name,callback);},
    removeEventListener(name){handlers.delete(name);},
  };
  return {root,search,toggle,feedback,handlers};
}

test('M45 Coach finds a conversation by accent-insensitive name/subject without searching message text',()=>{
  const threads=[
    fakeThread('Ángela Pérez — fuerza',2),
    fakeThread('Óscar López — movilidad',0),
    fakeThread('Lucía Vera — maratón',1),
  ];
  const x=inboxRoot(threads);
  assert.deepEqual(applyConversationFilter(x.root,{query:'angela'}),{visible:1,total:3});
  assert.deepEqual(threads.map((t)=>t.hidden),[false,true,true]);
  assert.equal(x.feedback.textContent,'1 de 3 conversaciones visibles');
  assert.deepEqual(applyConversationFilter(x.root,{query:'MOVILIDAD',unreadOnly:true}),{visible:0,total:3});
  assert.equal(x.feedback.textContent,'No hay conversaciones que coincidan con este filtro.');
  assert.deepEqual(applyConversationFilter(x.root,{unreadOnly:true}),{visible:2,total:3});
  assert.deepEqual(threads.map((t)=>t.hidden),[false,true,false]);
  assert.equal(x.toggle.value,'true');
});

test('M45 inbox controls appear only when useful for Coach, never as client admin chrome',()=>{
  const threads=[
    {id:'thread-1',clientName:'María <script>',subject:'Fuerza',messages:[],unreadCount:1},
    {id:'thread-2',clientName:'Juan',subject:'Movilidad',messages:[],unreadCount:0},
  ];
  const base={communication:true,kind:'communication',threads,notifications:[],clients:[],canOpenThread:false};
  const coach=renderCommunicationRoute({...base,role:'coach'});
  assert.match(coach,/data-m45-conversation-search/);
  assert.match(coach,/data-m45-unread-toggle aria-pressed="false"/);
  assert.match(coach,/m45-thread-subject/);
  assert.doesNotMatch(coach,/<script>/);
  const client=renderCommunicationRoute({...base,role:'client'});
  assert.doesNotMatch(client,/data-m45-conversation-search|data-m45-unread-toggle/);
  const single=renderCommunicationRoute({...base,role:'coach',threads:[threads[0]]});
  assert.doesNotMatch(single,/data-m45-conversation-search/);
});

test('M45 delegated input/toggle keeps Coach filters across shell repaints and clears on role exit',()=>{
  const entries=[fakeThread('Ángela',2),fakeThread('Juan',0)];
  const x=inboxRoot(entries);
  let renders=0;
  const controller=createCommunicationController({root:x.root,service:{},render(){renders++;}});
  controller.mount();
  x.handlers.get('m26:shell-rendered')();
  x.search.value='angela';
  x.handlers.get('input')({target:x.search});
  assert.deepEqual(entries.map((t)=>t.hidden),[false,true]);
  x.handlers.get('click')({target:x.toggle,preventDefault(){}});
  assert.equal(x.toggle.value,'true');
  assert.equal(entries[0].hidden,false);
  x.handlers.get('m26:shell-rendered')();
  assert.equal(x.search.value,'angela');
  assert.equal(x.toggle.value,'true');
  controller.destroy();
  assert.equal(x.handlers.size,0);
  assert.equal(renders,0);
});

test('M45 an expanded empty conversation survives the remote preference repaint',async()=>{
  let release;
  const status=new Promise((resolve)=>{release=resolve;});
  const draft={
    value:'',scrollTop:0,selectionStart:0,selectionEnd:0,
    focus(){},
    setSelectionRange(){},
  };
  const existingDetails={open:true};
  const nextDetails={open:false};
  function composer(details,textarea){
    const form={
      querySelector(selector){
        if(selector==='[name="threadId"]')return {value:'thread-a'};
        if(selector==='textarea[name="body"]')return textarea;
        return null;
      },
      closest(){return details;},
    };
    return {form};
  }
  let visible=composer(existingDetails,draft);
  const root={
    ownerDocument:{defaultView:null,activeElement:null},
    querySelector(selector){
      return selector==='[data-communication-role]'
        ?{dataset:{communicationRole:'coach'}}:null;
    },
    querySelectorAll(selector){
      return selector==='[data-communication-form="message-send"]'?[visible.form]:[];
    },
    addEventListener(){},
    removeEventListener(){},
  };
  const controller=createCommunicationController({
    root,
    render(){visible=composer(nextDetails,{value:'',scrollTop:0});},
    service:{
      notificationPreferences:{status:()=>status,applyRemote(){}},
      webPush:{async status(){return {active:false};}},
    },
  });
  controller.mount();
  await tick();
  release({ok:true,preferences:{}});
  await tick();
  assert.equal(nextDetails.open,true);
  controller.destroy();
});


test('M45 conversation search ignores unread badge copy and the private message body',()=>{
  const thread=fakeThread('María — recuperación',2);
  const x=inboxRoot([thread]);
  assert.equal(applyConversationFilter(x.root,{query:'nuevos'}).visible,0);
  assert.equal(applyConversationFilter(x.root,{query:'recuperacion'}).visible,1);
  assert.equal(applyConversationFilter(x.root,{query:'contenido privado'}).visible,0);
});

test('M45 focused Coach search keeps caret and query when a preference refresh redraws the route',async()=>{
  let release;
  const remote=new Promise((resolve)=>{release=resolve;});
  let search={
    value:'',selectionStart:0,selectionEnd:0,scrollLeft:0,
    focus(){},
    setSelectionRange(){},
  };
  const previous=search;
  const entries=[fakeThread('Ángela',1),fakeThread('Óscar',0)];
  const events=new Map();
  const document={defaultView:null,activeElement:previous};
  const root={
    ownerDocument:document,
    querySelector(selector){
      if(selector==='[data-m45-conversation-search]')return search;
      if(selector==='[data-communication-role]')return {dataset:{communicationRole:'coach',communicationIdentity:'account-1'}};
      if(selector==='[data-m45-unread-toggle]')return {setAttribute(){}};
      if(selector==='[data-m45-filter-feedback]')return {textContent:''};
      return null;
    },
    querySelectorAll(selector){return selector==='.m26-thread'?entries:[];},
    addEventListener(type,handler){events.set(type,handler);},
    removeEventListener(type){events.delete(type);},
  };
  let renderCount=0;
  const controller=createCommunicationController({
    root,
    service:{
      notificationPreferences:{status:()=>remote,applyRemote(){}},
      webPush:{async status(){return {active:false,supported:false};}},
    },
    render(){
      renderCount++;
      search={
        value:'',selectionStart:0,selectionEnd:0,scrollLeft:0,
        wasFocused:false,
        focus(){this.wasFocused=true;document.activeElement=this;},
        setSelectionRange(a,b){this.selection=[a,b];},
      };
    },
  });
  controller.mount();
  previous.value='oscar';
  previous.selectionStart=2;
  previous.selectionEnd=2;
  previous.scrollLeft=8;
  previous.closest=(selector)=>selector==='[data-m45-conversation-search]'?previous:null;
  events.get('input')({target:previous});
  await tick();
  release({ok:true,preferences:{}});
  await tick();
  assert.equal(renderCount,1);
  assert.equal(search.value,'oscar');
  assert.equal(search.wasFocused,true);
  assert.deepEqual(search.selection,[2,2]);
  assert.equal(search.scrollLeft,8);
  assert.deepEqual(entries.map(x=>x.hidden),[true,false]);
  controller.destroy();
});
