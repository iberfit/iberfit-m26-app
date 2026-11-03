import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  connected360InvitationKey,connected360RecoveryCampaignKey,
  createClientWearableInvitationController,connected360RecoveryMarkup,
} from '../src/m26/onboarding/client-wearable-invitation.js';
import {clientGuidedWelcomeScopeKey} from '../src/m26/onboarding/client-guided-welcome.js';
const completed=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const U='synthetic-owner-a';
const K='iberfit.m26.connected360.recovery.20261103:synthetic';
function fixture({native=false,original='suppressed',role='client',
    userId=U,connections=[],review=async()=>({requested:true})}={}){
  const storage=new Map(),events=new Map(),dialogState={dialog:null,rendered:0,reviewed:0,nav:0};
  const memory={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v))};
  const guideKey=clientGuidedWelcomeScopeKey({userId,role:'client'});
  storage.set(guideKey,JSON.stringify({status:'completed'}));
  const originalKey=connected360InvitationKey({role:'client',userId,native});
  storage.set(originalKey,JSON.stringify({status:original}));
  const status={textContent:''};
  const doc={
    head:{append(){}},
    body:{insertAdjacentHTML(_pos,html){
      dialogState.rendered++;
      dialogState.dialog={html,contains:b=>b?.kind==='action',remove(){dialogState.dialog=null;},
        querySelector:selector=>selector==='.m26-connected360-provider'?status:null};
    }},
    querySelector:selector=>selector==='[data-m26-connected360-invitation]'?dialogState.dialog:null,
    createElement:()=>({setAttribute(){},remove(){},textContent:''}),
    addEventListener:(key,fn)=>events.set('doc:'+key,fn),
    removeEventListener:key=>events.delete('doc:'+key),
  };
  const nav={tagName:'BUTTON',click(){dialogState.nav++;},getClientRects:()=>[{}]};
  const root={
    ownerDocument:doc,
    getAttribute:()=>null,
    querySelector:selector=>selector.includes('aria-current')
      ?{getAttribute:()=> 'hoy'}:null,
    querySelectorAll:selector=>selector==='[data-m26-area="actividad"]'?[nav]:[],
    addEventListener:(key,fn)=>events.set('root:'+key,fn),
    removeEventListener:key=>events.delete('root:'+key),
  };
  const scope={
    ...(native?{
      location:{origin:'https://app.iberfit.cl'},
      IBERFIT_CONNECTED360_NATIVE:{postMessage(){},addEventListener(){}},
    }:{}),
    localStorage:memory,document:doc,addEventListener:(k,fn)=>events.set('scope:'+k,fn),
    removeEventListener:k=>events.delete('scope:'+k),
  };
  const controller=createClientWearableInvitationController({
    root,scope,
    identityProvider:()=>({role,userId}),
    stateProvider:()=>({collections:{wearableConnections:connections}}),
    recoveryCampaignKey:identity=>identity.role==='client'&&identity.userId===U?K:null,
    reviewNativeHealth:async()=>{dialogState.reviewed++;return review();},
  });
  const click=action=>events.get('doc:click')?.({
    target:{closest:()=>({kind:'action',disabled:false,getAttribute:()=>action})},
  });
  return {controller,storage,originalKey,dialog:()=>dialogState.dialog,dialogState,
    click,events,status};
}

test('campaign matches only private dual-fingerprint Client identity, never leaks a name, uid or address',()=>{
  assert.equal(connected360RecoveryCampaignKey({role:'coach',userId:'some-user'}),null);
  assert.equal(connected360RecoveryCampaignKey({role:'client',userId:'some-user'}),null);
  assert.equal(connected360RecoveryCampaignKey({role:'client',userId:''}),null);
  const c=readFileSync(new URL('../src/m26/onboarding/client-wearable-invitation.js',import.meta.url),'utf8');
  assert.match(c,/RECOVERY_COHORT=Object.freeze\(\{a:'[0-9a-f]{8}',b:'[0-9a-f]{8}'\}\)/u);
  assert.match(c,/hash\('second-check\|'/u);
  assert.doesNotMatch(c,/juancarlosjimenez|@|auth\.users|fictitious-uid/u);
});

test('previously suppressed returning Client sees exactly one nonmodal web recovery offer',async()=>{
  const f=fixture();f.controller.mount();await completed();
  assert.match(f.dialog()?.html||'',/data-m26-connected360-recovery/u);
  assert.match(f.dialog()?.html||'',/La web no puede acceder a las mediciones/u);
  assert.doesNotMatch(f.dialog()?.html||'',/Conectar y autorizar/u);
  assert.equal(f.dialogState.reviewed,0);
  f.click('resume');await completed();
  assert.equal(f.dialogState.nav,1);
  assert.equal(JSON.parse(f.storage.get(K)).status,'chosen');
  assert.equal(JSON.parse(f.storage.get(f.originalKey)).status,'suppressed');
  f.controller.refresh();await completed();
  assert.equal(f.dialog(),null);
  f.controller.destroy();
});

test('previous native selection becomes a single OS-permission review, never another grant',async()=>{
  const f=fixture({native:true,original:'chosen'});
  f.controller.mount();await completed();
  assert.match(f.dialog()?.html||'',/Revisar permisos en Android/u);
  assert.doesNotMatch(f.dialog()?.html||'',/data-m26-connected360-native-scope/u);
  f.click('resume');await completed();
  assert.equal(f.dialogState.reviewed,1);
  assert.equal(JSON.parse(f.storage.get(K)).status,'chosen');
  assert.equal(JSON.parse(f.storage.get(f.originalKey)).status,'chosen');
  f.controller.refresh();await completed();assert.equal(f.dialog(),null);
  f.controller.destroy();
});

test('native permission review failure remains retryable; no fabricated connection',async()=>{
  const f=fixture({native:true,original:'chosen',review:async()=>{throw Error('M26_V46_PROD_NATIVE_UNAVAILABLE')}});
  f.controller.mount();await completed();f.click('resume');await completed();
  assert.equal(f.dialogState.reviewed,1);
  assert.ok(f.dialog());
  assert.match(f.status.textContent,/No se pudieron abrir los permisos/u);
  assert.equal(f.storage.get(K),undefined);
  f.controller.destroy();
});

test('explicit refusal, already-connected source and unrelated users are never interrupted',async()=>{
  for(const options of [
    {original:'dismissed'},
    {original:'chosen',connections:[{provider:'health_connect',status:'connected'}]},
    {role:'coach'},
    {userId:'synthetic-owner-b'},
  ]){
    const f=fixture(options);f.controller.mount();await completed();
    assert.equal(f.dialog(),null,JSON.stringify(options));f.controller.destroy();
  }
  const dismiss=fixture({original:'suppressed'});dismiss.controller.mount();await completed();
  dismiss.click('later');await completed();
  assert.equal(JSON.parse(dismiss.storage.get(K)).status,'dismissed');
  assert.equal(JSON.parse(dismiss.storage.get(dismiss.originalKey)).status,'suppressed');
  dismiss.controller.refresh();await completed();assert.equal(dismiss.dialog(),null);
  dismiss.controller.destroy();
});

test('OS review is Client owner-scoped and cannot authorize or send health samples',()=>{
  const code=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const body=code.slice(code.indexOf('async function reviewProductionHealthPermissions(){'),
    code.indexOf('async function startProductionHealthConnection(scopes){'));
  assert.match(body,/qaClientIdentity\(\)/u);
  assert.match(body,/account\.role!=='client'/u);
  assert.match(body,/latest\.ownerId!==account\.ownerId/u);
  assert.match(body,/productionSync\.availability\(\)/u);
  assert.match(body,/productionNative\.requestPermissions\(\[\]\)/u);
  assert.doesNotMatch(body,/\.authorize\(|importConnected360|\.import\(|async function startProduction/u);
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.match(app,/reviewProductionHealthPermissions\(\)/u);
  assert.match(connected360RecoveryMarkup({nativeReady:false}),/La web no puede acceder/u);
});
