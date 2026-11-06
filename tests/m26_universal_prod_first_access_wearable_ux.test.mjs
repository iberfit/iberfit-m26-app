import test from 'node:test';
import assert from 'node:assert/strict';
import {clientWearableActivation} from '../src/m26/wearables/activation-experience.js';
import {renderClientDeviceHub} from '../src/m26/wearables/device-hub.js';
import {buildWearableViewModel} from '../src/m26/wearables/view-model.js';
import {renderHoyRoute} from '../src/m26/modules/route-render.js';
import {actorCanExecuteSession,sessionRequiresConfirmedAppointment} from '../src/m26/rc39/session-policy.js';

const android={location:{origin:'https://app.iberfit.cl'},
  IBERFIT_CONNECTED360_NATIVE:{postMessage(){},addEventListener(){}}};
const previousData={summary:{daysWithData:7},connections:[],productionNativeReady:true};
const clientHome=(wearables)=>renderHoyRoute({
  role:'client',clients:[{id:'client-a',name:'Cliente de prueba',iri:{confirmed:true},
    cycle:{name:'Plan IBERFIT'}}],appointments:[],upcoming:[],proposals:[],
  rc39:{sessionProjections:[]},operations:{pending:0,conflicts:0,rejected:0},
  wearables,
});

test('historical Health Connect data without native receipt never suppresses first-access reconnect',()=>{
  assert.deepEqual(clientWearableActivation(previousData),
    {kind:'reconnect',cta:true,native:true});
  const html=clientHome(previousData);
  assert.match(html,/data-client-wearable-activation="reconnect"/u);
  assert.match(html,/Elegir qué compartir/u);
  assert.match(html,/Health Connect/u);
  const hub=renderClientDeviceHub(previousData);
  assert.match(hub,/data-m26-device-link-picker open/u);
  assert.doesNotMatch(hub,/fuente vinculada/u);
});

test('browser Client is given a truthful connection path rather than a fake wearable handshake',()=>{
  const browser={summary:{daysWithData:7},connections:[],productionNativeReady:false};
  assert.deepEqual(clientWearableActivation(browser),
    {kind:'compatible-app-required',cta:true,native:false});
  const html=clientHome(browser);
  assert.match(html,/data-client-wearable-activation="compatible-app-required"/u);
  assert.match(html,/Ver opciones de conexión/u);
  assert.match(html,/Esta versión web no puede leer directamente Health Connect/u);
  assert.doesNotMatch(html,/Conexión completada|Permisos concedidos/u);
});

test('only verified native owner-scoped sync metadata counts as linked in both Client Home and Devices',()=>{
  const raw={id:'synthetic-a',provider:'health_connect',status:'active',
    sync_enabled:true,scopes:['steps'],lastSyncedAt:'2026-11-06T10:00:00Z',
    metadata:{mode:'certified_native',automatic:true}};
  const vm=buildWearableViewModel({role:'client',connections:[raw],scope:android,records:[]});
  assert.equal(vm.productionNativeReady,true);
  assert.equal(vm.connections[0].certifiedAutomatic,true);
  assert.equal(clientWearableActivation(vm).cta,false);
  assert.match(renderClientDeviceHub(vm),/1 fuente vinculada/u);
  for(const untrusted of [
    {...raw,sync_enabled:false},
    {...raw,metadata:{mode:'certified_native',automatic:false}},
    {...raw,lastSyncedAt:null},
    {...raw,lastSyncedAt:'not-a-date'},
    {...raw,scopes:[]},
    {...raw,status:'revoked'},
  ]){
    const candidate=buildWearableViewModel({role:'client',connections:[untrusted],scope:android,records:[]});
    assert.equal(candidate.connections[0].certifiedAutomatic,false);
    assert.doesNotMatch(renderClientDeviceHub(candidate),/1 fuente vinculada/u);
  }
});

test('a voluntary pause or revocation does not reissue native permissions, and unknown sources never become certified',()=>{
  for(const status of ['pausado','revocado']){
    const a=clientWearableActivation({productionNativeReady:true,connections:[{status}],summary:{daysWithData:0}});
    assert.equal(a.cta,false);
  }
  const unknown=buildWearableViewModel({role:'client',connections:[{
    provider:'unknown_future_provider',status:'active',metadata:{mode:'certified_native',automatic:true},
    sync_enabled:true,scopes:['steps'],lastSyncedAt:'2026-11-06T10:00:00Z',
  }],scope:android});
  assert.equal(unknown.connections[0].certifiedAutomatic,false);
});

test('Juan-Carlos-like confirmed guided session is startable by Client and permitted Coach without a cancelled appointment',()=>{
  const guided={id:'session-a',clientId:'client-a',status:'disponible',
    deliveryModality:'guiada_en_app',deliveryOwnership:'guided_in_app',
    visibleToClient:true,clientVisibilityLevel:'full',
    blocks:[{id:'block-a',exerciseId:'running',sets:1}]};
  assert.equal(actorCanExecuteSession({role:'client',session:guided}),true);
  assert.equal(actorCanExecuteSession({role:'coach',session:guided}),true);
  assert.equal(sessionRequiresConfirmedAppointment({role:'client',session:guided}),false);
  assert.equal(sessionRequiresConfirmedAppointment({role:'coach',session:guided}),false);
  assert.equal(actorCanExecuteSession({role:'admin',session:guided}),false);
});
