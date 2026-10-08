import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  CONNECTED360_INVITATION_SCHEMA,
  connected360InvitationKey,
  connected360Capabilities,
  connected360InvitationDecision,
  connected360InvitationMarkup,
  createClientWearableInvitationController,
} from '../src/m26/onboarding/client-wearable-invitation.js';
import {clientGuidedWelcomeScopeKey} from '../src/m26/onboarding/client-guided-welcome.js';

function createStore(){
  const values=new Map();
  return {
    getItem(key){return values.has(key)?values.get(key):null;},
    setItem(key,value){values.set(key,String(value));},
    removeItem(key){values.delete(key);},
    values,
  };
}
function readiness(){
  return {direct:[],importReady:true};
}
test('Connected 360 onboarding is client-only identity-isolated and stores no user ID or health content',()=>{
  assert.equal(CONNECTED360_INVITATION_SCHEMA,'iberfit.connected360.invitation.v1');
  const a=connected360InvitationKey({role:'client',userId:'private-user-a'});
  const b=connected360InvitationKey({role:'client',userId:'private-user-b'});
  assert.match(a,/^iberfit\.m26\.connected360\.invitation\.v1:[a-f0-9]{8}$/u);
  assert.notEqual(a,b);
  assert.ok(!a.includes('private-user-a'));
  assert.equal(connected360InvitationKey({role:'coach',userId:'private-user-a'}),null);
  assert.equal(connected360InvitationKey({role:'admin',userId:'private-user-a'}),null);
  assert.equal(connected360InvitationKey({role:'client',userId:''}),null);
});
test('PWA import remains real but a detected native bridge never bypasses production certification',()=>{
  const browser=connected360Capabilities({});
  const bridgeScope={IBERFIT_HEALTH_BRIDGE:{healthConnect:{requestAuthorization(){}},appleHealth:{requestAuthorization(){}}}};
  const bridge=connected360Capabilities(bridgeScope);
  assert.equal(browser.importReady,true);
  assert.deepEqual(browser.direct,[]);
  assert.equal(bridge.importReady,true);
  assert.deepEqual(bridge.direct,[],'productionAllowed=false must remain fail-closed even when a fake bridge exists');
});
test('Offer appears only after first-day guided welcome and respects every opt-out',()=>{
  const base={role:'client',userId:'new-client',capabilities:readiness()};
  assert.equal(connected360InvitationDecision({...base,guideStatus:'never'}).show,false);
  assert.equal(connected360InvitationDecision({...base,guideStatus:'in-progress'}).show,false);
  assert.equal(connected360InvitationDecision({...base,guideStatus:'completed'}).show,true);
  assert.equal(connected360InvitationDecision({...base,guideStatus:'skipped'}).show,true);
  for(const status of ['chosen','dismissed','suppressed']){
    assert.deepEqual(
      connected360InvitationDecision({...base,guideStatus:'completed',recorded:{status}}),
      {show:false,status},
    );
  }
  assert.equal(connected360InvitationDecision({...base,guideStatus:'completed',connections:[{provider:'normalized_file',status:'active'}]}).show,false);
  assert.equal(connected360InvitationDecision({...base,guideStatus:'completed',capabilities:{direct:[],importReady:false}}).show,false);
  assert.equal(connected360InvitationDecision({...base,role:'coach',guideStatus:'completed'}).show,false);
});
test('Invitation explains PWA limits, offers a real action and does not use a blocking overlay',()=>{
  const pwa=connected360InvitationMarkup(readiness());
  assert.match(pwa,/¿Quieres vincular tu dispositivo de actividad\?/u);
  assert.match(pwa,/Ver opciones de vinculación/u);
  assert.match(pwa,/Ahora no/u);
  assert.match(pwa,/vinculación automática del reloj aún requiere/u);
  assert.match(pwa,/aria-modal="false"/u);
  assert.doesNotMatch(pwa,/data-m26-connected360-action="start">Conectar ahora/u);
  assert.doesNotMatch(pwa,/autorizar.*automáticamente/iu);
  const native=connected360InvitationMarkup({direct:[{key:'health_connect',label:'Android'}],importReady:true});
  assert.match(native,/Ver opciones de vinculación/u);
});
function fixture({role='client',guide='never'}={}){
  const store=createStore(),userId='qa-client';
  const guideKey=clientGuidedWelcomeScopeKey({role:'client',userId});
  store.setItem(guideKey,JSON.stringify({status:guide}));
  const listeners=new Map();
  let dialog=null,style=null,opened=0,rendered=0;
  const btn={tagName:'BUTTON',click(){opened++;},getClientRects(){return [{width:44}]}};
  const doc={
    head:{append(value){style=value;}},
    body:{insertAdjacentHTML(position,html){
      assert.equal(position,'beforeend');rendered++;
      dialog={
        html,
        contains(value){return Boolean(value&&value.kind==='invitation-button');},
        querySelector(){return null;},
        remove(){dialog=null;},
      };
    }},
    querySelector(selector){
      if(selector==='[data-m26-connected360-invitation]')return dialog;
      if(selector==='[data-m26-connected360-style]')return style;
      return null;
    },
    createElement(){return {setAttribute(){},remove(){style=null;},textContent:''};},
    addEventListener(event,fn){listeners.set(event,fn);},
    removeEventListener(event){listeners.delete(event);},
  };
  const rootListeners=new Map();
  const root={
    ownerDocument:doc,
    addEventListener(event,fn){rootListeners.set(event,fn);},
    removeEventListener(event){rootListeners.delete(event);},
    getAttribute(){return null;},
    querySelector(selector){
      if(selector.includes('aria-current'))return {getAttribute(){return 'hoy';}};
      return null;
    },
    querySelectorAll(selector){return selector==='[data-m26-area="actividad"]'?[btn]:[];},
  };
  const scope={localStorage:store,document:doc,addEventListener(){},removeEventListener(){}};
  const controller=createClientWearableInvitationController({
    root,scope,identityProvider:()=>({role,userId}),stateProvider:()=>({collections:{wearableConnections:[]}}),
  });
  return {
    controller,store,guideKey,rootListeners,listeners,dialog:()=>dialog,
    rendered:()=>rendered,opened:()=>opened,
    action(name){
      const btn={kind:'invitation-button',getAttribute(){return name;}};
      listeners.get('click')?.({target:{closest(){return btn;}}});
    },
  };
}
test('A genuinely new client receives the invitation after welcome; accept opens the existing Activity flow once',async()=>{
  const f=fixture();
  f.controller.mount();await Promise.resolve();
  assert.equal(f.dialog(),null);
  f.store.setItem(f.guideKey,JSON.stringify({status:'completed'}));
  f.rootListeners.get('m26:client-guided-welcome-completed')?.();
  await Promise.resolve();
  assert.ok(f.dialog()?.html.includes('Ver opciones de vinculación'));
  f.action('start');
  assert.equal(f.opened(),1);
  assert.equal(f.dialog(),null);
  const key=connected360InvitationKey({role:'client',userId:'qa-client'});
  assert.equal(JSON.parse(f.store.getItem(key)).status,'chosen');
  f.controller.refresh();await Promise.resolve();
  assert.equal(f.rendered(),1);
  f.controller.destroy();
});
test('Declined permission invite never reappears, and previously onboarded clients are not interrupted',async()=>{
  const f=fixture();
  f.controller.mount();await Promise.resolve();
  f.store.setItem(f.guideKey,JSON.stringify({status:'skipped'}));
  f.controller.refresh();await Promise.resolve();
  assert.ok(f.dialog());
  f.action('later');
  f.controller.refresh();await Promise.resolve();
  assert.equal(f.dialog(),null);
  assert.equal(f.rendered(),1);
  f.controller.destroy();
  const legacy=fixture({guide:'completed'});
  legacy.controller.mount();await Promise.resolve();
  assert.equal(legacy.rendered(),0);
  assert.equal(JSON.parse(legacy.store.getItem(connected360InvitationKey({role:'client',userId:'qa-client'}))).status,'suppressed');
  legacy.controller.destroy();
});
test('Lifecycle is attached once and torn down with the existing progressive onboarding',()=>{
  const p=readFileSync('src/m26/onboarding/progressive-onboarding.js','utf8');
  assert.match(p,/createClientWearableInvitationController/u);
  assert.match(p,/connected360Invitation\.mount\?\.\(\)/u);
  assert.match(p,/connected360Invitation\.refresh\?\.\(\)/u);
  assert.match(p,/connected360Invitation\.destroy\?\.\(\)/u);
  assert.ok(p.indexOf('clientGuidedWelcome.mount?.();')<p.indexOf('connected360Invitation.mount?.();'));
});

test('Native commands remain fail-closed until a provider is certified for production',()=>{
  const source=readFileSync('src/m26/wearables/controller.js','utf8');
  assert.match(source,/const nativePolicy=wearableZeroCostPolicy\(normalized\)/u);
  assert.match(source,/if\(!nativePolicy\?\.productionAllowed\)/u);
  assert.match(source,/if\(!interactive&&!granted\.length\)/u);
  assert.match(source,/reason:'permission-pending'/u);
  assert.match(source,/if\(!healthConnectAvailable\|\|!wearableZeroCostPolicy\(provider\)\?\.productionAllowed\)continue/u);
});

test('Connected sources and consent details are restricted to Client in Settings',()=>{
  const snapshot=readFileSync('src/m26/modules/route-view-model.js','utf8');
  const render=readFileSync('src/m26/modules/route-render.js','utf8');
  assert.match(snapshot,/wearableSources:String\(shellVm\.identity\?\.role\|\|''\)==='client'/u);
  assert.match(snapshot,/permissionCount:item\.scopes\.length/u);
  assert.match(render,/id="m26-settings-devices"/u);
  assert.match(render,/sourceRows=wearableSources\.map/u);
  assert.match(render,/escapeHtml\(item\.label\)/u);
  assert.match(render,/Solo el cliente controla sus fuentes y permisos/u);
  assert.match(render,/vm\.role==='client'&&Array\.isArray\(vm\.wearableSources\)/u);
});

test('Client revocation serializes behind in-flight import, never reactivates or restages automatically',async()=>{
  const {createWearableRemoteSync}=await import('../src/m26/wearables/remote-sync.js');
  const {createMemoryKeyValueStore}=await import('../src/m26/platform/key-value-store.js');
  let online=false,releaseImport,startedImport;
  const started=new Promise(resolve=>{startedImport=resolve;});
  const gate=new Promise(resolve=>{releaseImport=resolve;});
  const calls=[];
  const transport={
    async importWearableAuthorized(_token,authorization,payload){assert.equal(authorization,'11111111-1111-4111-8111-111111111111');calls.push('import');startedImport();await gate;return {accepted:payload.records.length,rejected:0,stale:0};},
    async upsertWearableConnection(){throw Error('legacy connection write is forbidden for file import');},
    async revokeWearableConnection(){calls.push('revoke');return {ok:true};},
    async deleteWearableData(){calls.push('delete');return {ok:true};},
  };
  const remote=createWearableRemoteSync({
    ownerId:'user-revocation-fixture',queueStore:createMemoryKeyValueStore(),transport,
    getToken:async()=>'qa-token',isOnline:()=>online,
  });
  const record={
    clientId:'client-revocation-fixture',provider:'normalized_file',date:'2026-10-08',
    metrics:{steps:1200,activeMinutes:25},sourceUpdatedAt:'2026-10-08T12:00:00Z',quality:'media',
  };
  await remote.stage({clientId:record.clientId,provider:record.provider,records:[record],authorizationGrant:'11111111-1111-4111-8111-111111111111'});
  online=true;
  const flushing=remote.flush();
  await started;
  const revoking=remote.revoke({provider:'normalized_file',deleteData:true});
  await assert.rejects(remote.stage({clientId:record.clientId,provider:record.provider,records:[record]}),/M26_WEARABLE_SOURCE_REVOKED/u);
  assert.deepEqual(calls,['import'],'Revocation must wait for import then become the final server operation');
  releaseImport();
  await flushing;await revoking;
  assert.deepEqual(calls,['import','revoke']);
  assert.equal(await remote.pendingCount(),0);
  const after=await remote.flush();
  assert.equal(after.imported,0);
  assert.deepEqual(calls,['import','revoke']);
});
test('Delete all wins over pending sync in the same identity and prevents queued resurrection',async()=>{
  const {createWearableRemoteSync}=await import('../src/m26/wearables/remote-sync.js');
  const {createMemoryKeyValueStore}=await import('../src/m26/platform/key-value-store.js');
  let online=false;const calls=[];
  const transport={
    async importWearableSummaries(){calls.push('import');return {accepted:1,rejected:0,stale:0};},
    async upsertWearableConnection(){calls.push('grant');return {ok:true};},
    async revokeWearableConnection(){return {ok:true};},
    async deleteWearableData(){calls.push('delete');return {ok:true};},
  };
  const remote=createWearableRemoteSync({
    ownerId:'user-delete-fixture',queueStore:createMemoryKeyValueStore(),
    transport,getToken:async()=>'token',isOnline:()=>online,
  });
  const record={clientId:'client-delete-fixture',provider:'normalized_file',date:'2026-10-08',metrics:{steps:20},sourceUpdatedAt:'2026-10-08T13:00:00Z',quality:'media'};
  await remote.stage({clientId:record.clientId,provider:record.provider,records:[record],authorizationGrant:'11111111-1111-4111-8111-111111111111'});
  online=true;
  const clear=remote.deleteAll();
  const duplicateSync=remote.flush();
  await clear;
  const result=await duplicateSync;
  assert.equal(result.skipped,true);
  assert.deepEqual(calls,['delete']);
  assert.equal(await remote.pendingCount(),0);
  await assert.rejects(remote.stage({clientId:record.clientId,provider:record.provider,records:[record]}),/M26_WEARABLE_SOURCE_REVOKED/u);
});

test('Connected 360 preserves mobile navigation, touch targets, safe areas and the live workout',()=>{
  const source=readFileSync('src/m26/onboarding/client-wearable-invitation.js','utf8');
  assert.match(source,/bottom:calc\(6\.25rem \+ env\(safe-area-inset-bottom\)\)/u);
  assert.match(source,/max-height:min\(62dvh,540px\)/u);
  assert.match(source,/min-height:44px/u);
  assert.match(source,/prefers-reduced-motion:reduce/u);
  assert.match(source,/data-session-live-v3/u);
  assert.match(source,/data-session-live-state/u);
  assert.match(source,/data-session-touch-focus/u);
  assert.match(source,/aria-modal="false"/u);
});

test('First-day Activity handoff opens the real device chooser, never the advanced importer',()=>{
  const source=readFileSync('src/m26/onboarding/client-wearable-invitation.js','utf8');
  assert.match(source,/function openDevicePickerWhenReady\(\)/u);
  assert.match(source,/root\.querySelector\?\.\('\[data-m26-device-link-picker\]'\)/u);
  assert.doesNotMatch(source,/openImportWhenReady/u);
  assert.match(source,/picker\.open=true/u);
  assert.match(source,/requestAnimationFrame\?\./u);
  assert.doesNotMatch(source,/setInterval|MutationObserver/u);
});

test('Strava is not offered as zero-cost direct sync while developer access requires a subscription',async()=>{
  const {wearableZeroCostPolicy}=await import('../src/m26/wearables/free-policy.js');
  const strava=wearableZeroCostPolicy('strava');
  assert.equal(strava.developmentAllowed,false);
  assert.equal(strava.productionAllowed,false);
  assert.equal(strava.fileImportAllowed,true,'compatible local files remain supported');
  assert.equal(strava.tier,'subscription_required');
});
