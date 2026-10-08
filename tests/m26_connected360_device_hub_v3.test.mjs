import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderClientDeviceHub,deviceConfirmedStats,deviceSourceChoice} from '../src/m26/wearables/device-hub.js';
import {buildWearableViewModel} from '../src/m26/wearables/view-model.js';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const providers=[
  {key:'apple_health',label:'Salud',mode:'native_bridge',nativeReady:false,usableNow:false,policy:{productionAllowed:false}},
  {key:'health_connect',label:'Health Connect',mode:'native_bridge',nativeReady:false,usableNow:false,policy:{productionAllowed:false}},
  {key:'garmin_connect',label:'Garmin',mode:'server_oauth',nativeReady:false,usableNow:false,policy:{productionAllowed:false}},
  {key:'strava',label:'Strava',mode:'server_oauth',nativeReady:false,usableNow:false,policy:{productionAllowed:false}},
];
const summary={daysWithData:3,metrics:{steps:8230,sleepMinutes:455,restingHeartRate:57}};
test('device hub is a single prominent linking path; import is an optional disclosure',()=>{
  const html=renderClientDeviceHub({providers,connections:[],summary},
    {importer:'<form data-wearable-import></form>',deviceSummary:'<p>Historial</p>'});
  assert.match(html,/data-m26-device-hub/u);
  assert.match(html,/<summary class="m26-device-link-cta">Vincular dispositivo/u);
  assert.match(html,/<summary>Importar un archivo \(opción avanzada\)<\/summary>/u);
  assert.match(html,/<summary>Mis datos y permisos<\/summary>/u);
  assert.match(html,/7 h 35 min/u);
  assert.match(html,/8230/u);
  assert.match(html,/57 lpm/u);
  assert.match(html,/no está disponible en esta versión web/u);
  assert.ok(html.indexOf('Vincular dispositivo')<html.indexOf('Importar un archivo'));
  assert.ok(html.indexOf('Vincular dispositivo')<html.indexOf('Mis datos y permisos'));
  assert.match(html,/data-wearable-import/u);
  assert.doesNotMatch(html,/>Conectado</u);
});

test('an imported file is data, not a connected wearable',()=>{
  const html=renderClientDeviceHub({
    providers,summary,connections:[{provider:'normalized_file',status:'conectado',mode:'confirmed_import',policy:{productionAllowed:true}}],
  });
  assert.match(html,/Datos incorporados · sin enlace automático/u);
  assert.doesNotMatch(html,/1 fuente vinculada/u);
});
test('legacy status alone never certifies native/cloud auto sync',()=>{
  const html=renderClientDeviceHub({
    providers:[{key:'apple_health',nativeReady:true,usableNow:true,policy:{productionAllowed:true}}],
    summary,connections:[{provider:'apple_health',status:'conectado',mode:null,policy:{productionAllowed:true}}],
  });
  assert.match(html,/Datos incorporados · sin enlace automático/u);
  assert.doesNotMatch(html,/1 fuente vinculada/u);
});
test('no fabricated data or impossible permissions are offered as working links',()=>{
  assert.equal(deviceConfirmedStats({daysWithData:0,metrics:{steps:8000}}),'');
  const disabled=deviceSourceChoice({key:'apple_health',label:'Salud',nativeReady:true,usableNow:false});
  assert.match(disabled,/En preparación/u);
  assert.doesNotMatch(disabled,/data-wearable-action/u);
  const enabled=deviceSourceChoice({key:'health_connect',label:'Health',nativeReady:true,usableNow:true});
  assert.match(enabled,/Disponible/u);
  assert.match(enabled,/data-provider="health_connect"/u);
  assert.doesNotMatch(enabled,/requestAuthorization/u);
  assert.doesNotMatch(deviceSourceChoice({key:'strava',label:'<script>alert(1)<\/script>',mode:'server_oauth'}),/<script>/u);
});
test('settings and sessions reuse only confirmed summaries and no training mutation',()=>{
  const vm=read('src/m26/modules/route-view-model.js');
  const render=read('src/m26/modules/route-render.js');
  assert.match(vm,/wearableContext:role==='client'/u);
  assert.match(vm,/wearableSnapshot:String\(shellVm\.identity\?\.role/u);
  assert.match(render,/renderClientDeviceHub\(wearable,/u);
  assert.match(render,/deviceSessionContext=isClient&&vm\.wearableContext\?\.summary/u);
  assert.match(render,/data-m26-area="actividad">Ver mis dispositivos/u);
  assert.match(render,/deviceConfirmedStats\(settingsSummary\)/u);
  assert.match(read('src/m26/wearables/device-hub.js'),/Importar un archivo/u);
});
test('the view model preserves confirmed import provenance without changing grants',()=>{
  const connection={id:'import1',provider:'normalized_file',status:'active',
    metadata:{mode:'confirmed_import'},scopes:['steps'],lastSyncedAt:'2026-10-08T12:00:00Z'};
  const vm=buildWearableViewModel({role:'client',connections:[connection],records:[]});
  assert.equal(vm.connections.length,1);
  assert.equal(vm.connections[0].mode,'confirmed_import');
  assert.equal(vm.connections[0].status,'conectado');
  assert.equal(vm.connections[0].scopes.length,1);
  assert.equal(vm.summary.daysWithData,0);
});
