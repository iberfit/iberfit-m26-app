import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  connected360InvitationKey,connected360Capabilities,connected360InvitationDecision,
  connected360InvitationMarkup,createClientWearableInvitationController,
} from '../src/m26/onboarding/client-wearable-invitation.js';
import {clientGuidedWelcomeScopeKey} from '../src/m26/onboarding/client-guided-welcome.js';

function nativeFixture({guide='completed',connect=async()=>({requested:true}),ready=()=>true}={}){
  const cache=new Map(),listener=new Map(),rootListener=new Map();
  const storage={getItem:key=>cache.get(key)||null,setItem:(key,value)=>cache.set(key,String(value))};
  let who='native-owner-a',dialog=null,rendered=0,requested=[];
  storage.setItem(clientGuidedWelcomeScopeKey({userId:who,role:'client'}),JSON.stringify({status:guide}));
  const inputs=['steps','sleepMinutes','restingHeartRate','generalHeartRate','exerciseSessions']
    .map(metric=>({checked:false,getAttribute:()=>metric}));
  const status={textContent:''};
  const doc={
    head:{append(){}},
    body:{insertAdjacentHTML(_where,html){
      rendered++;
      dialog={html,contains:x=>x?.kind==='action',remove(){dialog=null;},
        querySelector:s=>s==='[data-m26-connected360-status]'?status:null,
        querySelectorAll:s=>s==='[data-m26-connected360-native-scope]'?inputs:[]};
    }},
    querySelector:s=>s==='[data-m26-connected360-invitation]'?dialog:null,
    createElement:()=>({setAttribute(){},remove(){},textContent:''}),
    addEventListener:(name,fn)=>listener.set(name,fn),removeEventListener:name=>listener.delete(name),
  };
  const root={ownerDocument:doc,addEventListener:(name,fn)=>rootListener.set(name,fn),
    removeEventListener:name=>rootListener.delete(name),
    getAttribute:()=>null,querySelector:s=>s.includes('aria-current')?{getAttribute:()=> 'hoy'}:null,
    querySelectorAll:()=>[],
  };
  const scope={location:{origin:'https://app.iberfit.cl'},document:doc,localStorage:storage,
    IBERFIT_CONNECTED360_NATIVE:{postMessage(){},addEventListener(){}},
    addEventListener(){},removeEventListener(){}};
  const controller=createClientWearableInvitationController({root,scope,
    identityProvider:()=>({role:'client',userId:who}),stateProvider:()=>({collections:{wearableConnections:[]}}),
    nativeHealthReady:ready,
    connectNativeHealth:async scopes=>{requested.push([...scopes]);return connect(scopes);}});
  function action(name){const button={kind:'action',disabled:false,getAttribute:()=>name};
    listener.get('click')?.({target:{closest:()=>button}});return button;}
  return {controller,scope,storage,inputs,status,rootListener,requested,action,
    dialog:()=>dialog,rendered:()=>rendered,setUserId:value=>{who=value;}};
}
const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

test('signed Android gets an own first-run offer, even after web onboarding was completed',async()=>{
  const f=nativeFixture();
  const native=connected360Capabilities(f.scope);
  assert.equal(native.nativeReady,true);
  assert.deepEqual(native.direct,[{key:'health_connect',label:'Android · Health Connect'}]);
  const key=connected360InvitationKey({userId:'native-owner-a',role:'client',native:true});
  assert.notEqual(key,connected360InvitationKey({userId:'native-owner-a',role:'client'}));
  f.controller.mount();await flush();
  assert.match(f.dialog()?.html||'',/Conecta tu actividad al empezar/u);
  assert.match(f.dialog()?.html||'',/data-m26-connected360-native-scope="sleepMinutes"/u);
  assert.doesNotMatch(f.dialog()?.html||'',/Ver opciones de vinculación/u);
  assert.match(f.dialog()?.html||'',/aria-modal="false"/u);
  assert.equal(JSON.parse(f.storage.getItem(key)).status,'pending');
  f.controller.destroy();
});

test('native first-run is an explicit, granular one-tap consent with no navigation',async()=>{
  const f=nativeFixture();f.controller.mount();await flush();
  f.action('start');await flush();
  assert.equal(f.requested.length,0);
  assert.match(f.status.textContent,/Elige al menos una categoría/u);
  f.inputs[0].checked=true;f.inputs[1].checked=true;
  f.action('start');await flush();
  assert.deepEqual(f.requested,[['steps','sleepMinutes']]);
  assert.equal(f.dialog(),null);
  const key=connected360InvitationKey({userId:'native-owner-a',role:'client',native:true});
  assert.equal(JSON.parse(f.storage.getItem(key)).status,'chosen');
  f.controller.refresh();await flush();
  assert.equal(f.rendered(),1,'no repeat after successful first-run authorization');
  f.controller.destroy();
});

test('native welcome waits for the post-login controller without a loading lock or repeated prompt',async()=>{
  let mounted=false;
  const f=nativeFixture({ready:()=>mounted});
  f.controller.mount();await flush();
  assert.equal(f.dialog(),null);
  mounted=true;
  f.rootListener.get('m26:native-wearables-ready')?.();await flush();
  assert.ok(f.dialog());
  assert.equal(f.rendered(),1);
  f.controller.destroy();
});

test('native errors allow retry; declining is respected without writing health consent',async()=>{
  let tries=0;
  const f=nativeFixture({connect:async()=>{tries++;if(tries===1)throw Error('network lost');}});
  f.controller.mount();await flush();f.inputs[0].checked=true;
  f.action('start');await flush();
  assert.equal(f.dialog()!==null,true);
  const key=connected360InvitationKey({userId:'native-owner-a',role:'client',native:true});
  assert.equal(JSON.parse(f.storage.getItem(key)).status,'pending');
  f.action('start');await flush();
  assert.equal(tries,2);
  assert.equal(JSON.parse(f.storage.getItem(key)).status,'chosen');
  f.controller.destroy();
  const dismissed=nativeFixture();dismissed.controller.mount();await flush();
  dismissed.action('later');await flush();
  assert.equal(dismissed.dialog(),null);
  assert.equal(dismissed.requested.length,0);
  dismissed.controller.refresh();await flush();
  assert.equal(dismissed.rendered(),1);
  dismissed.controller.destroy();
});

test('native invite never inherits PWA opt-out nor stores a decision for another account',async()=>{
  let complete;
  const f=nativeFixture({connect:()=>new Promise(resolve=>{complete=resolve;})});
  const pwaKey=connected360InvitationKey({userId:'native-owner-a',role:'client'});
  f.storage.setItem(pwaKey,JSON.stringify({status:'suppressed'}));
  f.controller.mount();await flush();assert.ok(f.dialog());
  f.inputs[0].checked=true;f.action('start');await flush();
  f.setUserId('native-owner-b');complete({requested:true});await flush();
  const key=connected360InvitationKey({userId:'native-owner-a',role:'client',native:true});
  assert.equal(JSON.parse(f.storage.getItem(key)).status,'pending');
  f.controller.destroy();
});

test('native and PWA capability truth do not relax the production policy of generic device import',()=>{
  assert.equal(connected360Capabilities({}).nativeReady,false);
  const pwa=connected360InvitationMarkup({direct:[],importReady:true});
  assert.match(pwa,/Ver opciones de vinculación/u);
  const native=connected360InvitationMarkup({direct:[{key:'health_connect'}],nativeReady:true});
  assert.match(native,/Conectar y autorizar/u);
  assert.doesNotMatch(native,/Ver opciones de vinculación/u);
  assert.equal(connected360InvitationDecision({role:'client',userId:'a',guideStatus:'completed',
    capabilities:{direct:[{key:'health_connect'}],nativeReady:true},
    connections:[{provider:'normalized_file',status:'active'}]}).show,true);
  const src=readFileSync('src/m26/wearables/controller.js','utf8');
  const app=readFileSync('src/m26/app/application.js','utf8');
  const progressive=readFileSync('src/m26/onboarding/progressive-onboarding.js','utf8');
  assert.match(src,/startProductionHealthConnection\(scopes\)/u);
  assert.match(src,/await productionSync\.authorize\(scopes\)/u);
  assert.match(src,/productionNative\.requestPermissions\(scopes\)/u);
  assert.match(progressive,/connectNativeHealth,/u);
  assert.match(app,/wearables\.startProductionHealthConnection\(scopes\)/u);
});
