import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderHoyRoute,renderActivityRoute} from '../src/m26/modules/route-render.js';
import {clientHealthSnapshot,renderClientTodayHealth,renderSessionHealthContext} from '../src/m26/wearables/client-health-snapshot.js';
import {renderClientDeviceHub} from '../src/m26/wearables/device-hub.js';
import {renderGuidedExecution} from '../src/m26/workflows/session-ui.js';
const summary={daysWithData:5,days:7,freshness:'reciente',metrics:{steps:7821,sleepMinutes:435,restingHeartRate:null},providers:['health_connect']};
const wearables={summary,connections:[],providers:[],canControl:true,dailyRecords:[]};
const home={role:'client',clients:[{id:'c1',name:'Cliente',cycle:{name:'Fuerza Base'},iri:{confirmed:true}}],appointments:[],upcoming:[],proposals:[],operations:{pending:0,conflicts:0,rejected:0},rc39:{sessionProjections:[]},wearables};
const catalog={get:()=>({name_es:'Sentadilla',id:'ex1'}),search:()=>[],list:()=>[]};
test('Hoy shows observed health directly without searching settings or competing with session',()=>{
  const html=renderHoyRoute(home);
  assert.match(html,/data-m26-client-health/u);
  assert.match(html,/Tu actividad, a la vista/u);
  assert.match(html,/7.821/u);
  assert.match(html,/7 h 15 min/u);
  assert.match(html,/5<\/strong> Días con datos/u);
  assert.match(html,/data-m26-area="actividad">Ver mi actividad/u);
  assert.match(html,/Registrar cómo estoy/u);
});
test('No-data, invalid and partial permissions never fabricate zeros or guessed watch sources',()=>{
  assert.equal(renderSessionHealthContext(null),'');
  assert.equal(clientHealthSnapshot({summary:{daysWithData:8,metrics:{steps:999}}}),null);
  assert.match(renderClientTodayHealth(null),/Sin datos todavía/u);
  const invalid=renderClientTodayHealth({summary:{daysWithData:1,metrics:{steps:-5,sleepMinutes:15000,restingHeartRate:NaN}}});
  assert.equal(clientHealthSnapshot({summary:{daysWithData:1,metrics:{
    steps:-5,sleepMinutes:15000,restingHeartRate:NaN,
  }}}),null);
  assert.match(invalid,/Sin datos todavía/u);
  assert.doesNotMatch(invalid,/m26-client-health-metrics|15.000|NaN/u);
});
test('Activity describes received daily health truthfully without false disconnected badge',()=>{
  const html=renderClientDeviceHub(wearables);
  assert.match(html,/Datos de salud recibidos/u);
  assert.match(html,/Tus datos, a la vista/u);
  assert.match(html,/Pasos medios/u);
  assert.match(html,/Historial de datos y permisos/u);
  assert.doesNotMatch(html,/Sin dispositivo vinculado/u);
});
test('Session preparation shows passive client-only recent context, never clinical or live claims',()=>{
  const execution={status:'ready',queue:[],results:{},setIndex:0,index:0};
  const session={id:'s1',title:'Sesión IBERFIT',blocks:[]};
  const client=renderGuidedExecution({execution,session,catalog,role:'client',wearableContext:wearables});
  assert.match(client,/data-session-health-context/u);
  assert.match(client,/Sueño medio 7 h 15 min/u);
  assert.match(client,/data-session-action="start"/u);
  const coach=renderGuidedExecution({execution,session,catalog,role:'coach',wearableContext:wearables});
  assert.doesNotMatch(coach,/data-session-health-context/u);
  const noData=renderGuidedExecution({execution,session,catalog,role:'client'});
  assert.doesNotMatch(noData,/data-session-health-context/u);
});
test('Hydrated owner-scoped data feeds Hoy and live session without cross-account leakage',()=>{
  const vm=readFileSync('src/m26/modules/route-view-model.js','utf8');
  const app=readFileSync('src/m26/app/application.js','utf8');
  const css=readFileSync('src/m26/design/dark-iberfit-v2.css','utf8');
  assert.match(vm,/const clientWearables=overview.role==='client'&&clientId&&/u);
  assert.match(vm,/buildClientDayContext/u);
  assert.match(vm,/recordsForClient\(state,'wearableDailySummaries',clientId\)/u);
  assert.match(app,/wearableContext:role==='client'&&memoryClientId/u);
  assert.match(app,/identity\?\.clientId/u);
  assert.match(css,/\.m26-client-health-metrics/u);
  assert.match(css,/min-height:44px/u);
});

test('IRI-only client with consented health can still view recorded data; longitudinal tracking stays separate',()=>{
  const capability={role:'client',serviceKind:'none',wearables,checkins:[],habits:[],capabilities:{checkins:{ready:false},habits:{ready:false}}};
  const html=renderActivityRoute(capability);
  assert.match(html,/data-m26-device-hub/u);
  assert.match(html,/Seguimiento diario no activado/u);
  assert.doesNotMatch(html,/data-engagement-form="checkin"/u);
  const noData=renderActivityRoute({...capability,wearables:{...wearables,summary:{daysWithData:0,metrics:{}}}});
  assert.doesNotMatch(noData,/data-m26-device-hub/u);
});


test('Connected360 Client Today shows verified activity and sport without inventing health interpretation',()=>{
 const data={summary:{daysWithData:4,days:7,metrics:{
   steps:8200,sleepMinutes:435,restingHeartRate:59,
   activeMinutes:47.5,workoutMinutes:32,
 }}};
 const vm=clientHealthSnapshot(data);
 assert.equal(vm.active,47.5);
 assert.equal(vm.workouts,32);
 const html=renderClientTodayHealth(data);
 assert.match(html,/Actividad diaria media<\/span><strong>48 min/u);
 assert.match(html,/Entrenamiento diario medio<\/span><strong>32 min/u);
 assert.match(html,/Sueño medio<\/span><strong>7 h 15 min/u);
 assert.doesNotMatch(html,/riesgo|salud mala|debes entrenar|recovery score/iu);
 const invalid=renderClientTodayHealth({summary:{daysWithData:2,metrics:{
   steps:8200,activeMinutes:-3,workoutMinutes:9999,
 }}});
 assert.doesNotMatch(invalid,/Actividad diaria media|Entrenamiento diario medio/u);
});

test('U62 health: valid zero measurement is distinct from unavailable metrics',()=>{
 const record={summary:{daysWithData:1,metrics:{steps:0}}};
 const observed=clientHealthSnapshot(record);
 assert.equal(observed.steps,0);
 assert.equal(observed.sleep,null);
 const html=renderClientTodayHealth(record);
 assert.match(html,/Tu actividad, a la vista/u);
 assert.match(html,/Pasos medios<\/span><strong>0<\/strong>/u);
 assert.doesNotMatch(html,/sin dispositivo vinculado/iu);
});
