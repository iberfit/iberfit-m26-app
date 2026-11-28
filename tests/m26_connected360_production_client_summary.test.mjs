import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatConnected360ProductionSummary,connected360WorkoutHistory,createConnected360SummaryReader} from '../src/m26/wearables/v46-production-summary.js';

const empty=()=>({ok:true,provider:'health_connect',heartRateDaily:[],exerciseEvidence:[]});

test('initial Client screen never invents a wearable measurement before consent',()=>{
  const message=formatConnected360ProductionSummary(empty());
  assert.match(message,/Todavía no hay mediciones sincronizadas/u);
  assert.match(message,/permisos de Android/u);
  assert.doesNotMatch(message,/Sincronización automática completada/u);
});

test('workouts without general pulse are visible but never count as confirmed IBERFIT sessions',()=>{
  const message=formatConnected360ProductionSummary({...empty(),exerciseEvidence:[{sport:'running'}]});
  assert.match(message,/Sin frecuencia cardíaca general registrada/u);
  assert.match(message,/Actividades observadas \(7 días\): 1/u);
  assert.match(message,/No son entrenamientos confirmados/u);
  assert.match(message,/origen físico del reloj no está verificado/u);
});

test('only bounded known fields display, without untrusted tags or device identity',()=>{
  const message=formatConnected360ProductionSummary({...empty(),
    heartRateDaily:[
      {date:'2026-10-11',samples:20,minBpm:60,maxBpm:130},
      {date:'2026-10-12',samples:7821,minBpm:55,maxBpm:175,
        deviceId:'watch-secret',sourceKey:'<script>alert(1)</script>'},
    ],
    exerciseEvidence:[{sport:'running',deviceId:'watch-secret'}],
  });
  assert.match(message,/FC general del 2026-10-12 · 7821 mediciones/u);
  assert.match(message,/55–175 lpm/u);
  assert.match(message,/FC general no equivale a FC en reposo/u);
  assert.doesNotMatch(message,/watch-secret|script|restingHeartRate|clínico/iu);
});

test('invalid counts and pulse values never become plausible measurements',()=>{
  const message=formatConnected360ProductionSummary({...empty(),
    heartRateDaily:[{date:'2026-10-12',samples:'7821',minBpm:-2,maxBpm:800}],
  });
  assert.match(message,/FC general del 2026-10-12/u);
  assert.doesNotMatch(message,/7821|800|–2 lpm/u);
});

test('invalid server summary fails closed instead of showing a healthy sync',()=>{
  for(const value of [null,{},'bad',{...empty(),ok:false},
    {...empty(),provider:'apple_health'},
    {...empty(),heartRateDaily:null},{...empty(),exerciseEvidence:null}]){
    assert.throws(()=>formatConnected360ProductionSummary(value),/M26_V46_PROD_SUMMARY_INVALID/u);
  }
});

test('post-sync Client history refresh fences stale owner and older responses',()=>{
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const sync=controller.slice(controller.indexOf('async function autoSyncNativeProviders'),controller.indexOf('const foregroundSync=createWearableForegroundSync'));
  assert.match(sync,/savedPage=savedPage\|\|page\?\.ok===true/u);
  assert.match(sync,/if\(signal\?\.aborted\|\|!canContinue\(\)\)return results;/u);
  assert.match(sync,/if\(result\?\.ok===true\|\|\(savedPage&&result\?\.skipped==='no-recent-observations'\)\)\{[\s\S]*?void refreshProductionSummary\(wrap,\{supersede:true\}\)/u);
  assert.match(controller,/void refreshProductionSummary\(wrap\)/u);
  assert.match(controller,/const requestEpoch=\+\+productionSummaryEpoch/u);
  assert.match(controller,/requestEpoch===productionSummaryEpoch/u);
  assert.match(controller,/expected\.ownerId===current\.ownerId&&expected\.clientId===current\.clientId/u);
  assert.match(controller,/productionSummaryEpoch\+=1/u);
  assert.match(controller,/target\.textContent=formatConnected360ProductionSummary\(response,\{nativeAvailable:Boolean\(productionSync\)\}\)/u);
  assert.match(controller,/Datos existentes se conservan|Los datos existentes se conservan/u);
});

test('imported activity list displays actual type, date, duration and optional distance in reverse chronology',()=>{
  const now=new Date('2026-10-13T12:00:00Z');
  const row=(sport,startedAt,endedAt,extra={})=>({sport,startedAt,endedAt,linkedToTraining:false,...extra});
  const exerciseEvidence=[
    row('running','2026-10-11T10:00:00Z','2026-10-11T10:30:00Z',{distanceMeters:5000}),
    row('strength','2026-10-12T10:00:00Z','2026-10-12T10:45:00Z',{deviceId:'private-device'}),
    row('cycling','2026-10-10T10:00:00Z','2026-10-10T11:05:00Z',{distanceMeters:0}),
  ];
  const rows=connected360WorkoutHistory({...empty(),exerciseEvidence},{now});
  assert.deepEqual(rows.map(x=>x.label),['Fuerza','Carrera','Ciclismo']);
  assert.match(rows[0].detail,/45 min/u);
  assert.doesNotMatch(rows[0].detail,/km|0 m|private-device/u);
  assert.match(rows[1].detail,/30 min · 5 km/u);
  assert.match(rows[2].detail,/1 h 5 min · 0 m/u);
  assert.ok(Object.isFrozen(rows)&&rows.every(Object.isFrozen));
});
test('invalid, future, linked and malformed observations never become external workout details',()=>{
  const now=new Date('2026-10-13T12:00:00Z');
  const base={sport:'running',startedAt:'2026-10-12T10:00:00Z',endedAt:'2026-10-12T10:30:00Z'};
  const exerciseEvidence=[null,{...base,sport:'<script>'},{...base,startedAt:'2026-10-12T10:00:00'},
    {...base,endedAt:'2026-10-14T10:30:00Z'},{...base,linkedToTraining:true},{...base,distanceMeters:'5000'}];
  const rows=connected360WorkoutHistory({...empty(),exerciseEvidence},{now});
  assert.equal(rows.length,1);
  assert.doesNotMatch(rows[0].detail,/km|script/u);
  assert.deepEqual(connected360WorkoutHistory({...empty(),exerciseEvidence:Array(11).fill(base)},{now}),[]);
});
test('history shares the fenced production read, uses safe text nodes and never claims complete coverage',()=>{
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const section=controller.slice(controller.indexOf('async function refreshProductionSummary'),controller.indexOf('async function autoSyncNativeProviders'));
  assert.match(section,/if\(stillCurrent\(\)\)\{[\s\S]*connected360WorkoutHistory\(response\)/u);
  assert.match(section,/document\.createTextNode/u);
  assert.match(section,/Hasta 10 actividades de los últimos 7 días/u);
  assert.doesNotMatch(section,/innerHTML|insertAdjacentHTML/u);
  assert.match(section,/history\.replaceChildren\(\);history\.hidden=true/u);
});

test('browser empty history does not imply native access or a future browser sync',()=>{
  const message=formatConnected360ProductionSummary(empty(),{nativeAvailable:false});
  assert.match(message,/aplicación Android compatible/u);
  assert.doesNotMatch(message,/se intentará sincronizar automáticamente/u);
});
test('browser and native history reuse one owner-scoped read with no browser login request',()=>{
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.match(app,/productionHistoryEnabled:runtime\.environment==='production'&&runtime\.qaOnly===false/u);
  assert.match(controller,/function appendProductionHistory\(/u);
  const browser=controller.slice(controller.indexOf('if(!productionSync&&canReadProductionHistory()'),controller.indexOf('// Show only inside the Android Canary QA container.'));
  assert.match(browser,/appendProductionHistory\(wrap\)/u);
  assert.doesNotMatch(browser,/refreshProductionSummary|requestPermissions|authorize\(/u);
  assert.match(controller,/action==='prod-connected360-history'[\s\S]{0,150}await refreshProductionSummary/u);
  assert.match(controller,/productionHistoryMutationDepth===0/u);
  assert.match(controller,/stillOwner\(\)&&wrap.isConnected&&requestEpoch===productionSummaryEpoch/u);
  assert.match(controller,/clearProductionHistorySurface\(\);\s*foregroundSync\.invalidate\(\);\s*try\{await remoteSync.deleteAll/u);
  assert.match(controller,/clearProductionHistorySurface\(\);\s*productionSync\?\.invalidate\(\);\s*foregroundSync\.invalidate\(\);\s*try\{await remoteSync.revoke/u);
});

test('post-import refresh supersedes an older summary and retired owner cannot reopen it',()=>{
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(controller,/refreshProductionSummary\(wrap,\{supersede:true\}\)/u);
  assert.match(controller,/if\(refresh\?\.disabled&&!supersede\)return/u);
  assert.match(controller,/canReadProductionHistory=\(\)=>!productionHistoryRetired/u);
  assert.match(controller,/clearOwner:\(\)=>\{\s*productionHistoryRetired=true/u);
});

test('visible Client Hoy and Actividad share the existing owner history without repeating the device list',()=>{
  const home=readFileSync(new URL('../src/m26/wearables/client-health-snapshot.js',import.meta.url),'utf8');
  const routes=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(home,/data-prod-connected360-feed="compact" hidden/u);
  assert.match(routes,/vm\.role==='client'\?'<section class="m26-panel" data-prod-connected360-feed="full" hidden/u);
  assert.match(controller,/appendProductionHistory\(wrap,\{feed:true\}\);[\s\S]{0,100}void refreshProductionSummary\(wrap\)/u);
  assert.match(controller,/prodConnected360Feed==='compact'\?allRows\.slice\(0,3\):allRows/u);
  assert.match(controller,/if\(!feed\)appendProductionHistory\(wrap,\{native:true\}\)/u);
});
test('summary read coalesces replacements, bounds reuse, refreshes after receipt and never reuses another owner',async()=>{
  let clock=100,calls=0,resolve;
  const reader=createConnected360SummaryReader({now:()=>clock});
  const pending=new Promise(r=>{resolve=r});
  const first=reader.read('owner-a',()=>{calls++;return pending;});
  assert.equal(reader.read('owner-a',()=>{throw Error('duplicate');}),first);
  resolve('a');assert.equal(await first,'a');assert.equal(calls,1);
  assert.equal(await reader.read('owner-a',()=>{throw Error('duplicate');}),'a');
  assert.equal(await reader.read('owner-a',()=>{calls++;return 'fresh';},{force:true}),'fresh');
  clock+=15000;
  assert.equal(await reader.read('owner-a',()=>{calls++;return 'expired';}),'expired');
  assert.equal(await reader.read('owner-b',()=>{calls++;return 'b';}),'b');
  reader.clear();
  assert.equal(await reader.read('owner-b',()=>{calls++;return 'after-clear';}),'after-clear');
  assert.equal(calls,5);
});
test('late read after privacy invalidation never becomes reusable',async()=>{
  const reader=createConnected360SummaryReader();
  let resolve;
  const pending=reader.read('owner-a',()=>new Promise(r=>{resolve=r}));
  await Promise.resolve();
  reader.clear();
  const fresh=await reader.read('owner-a',()=> 'fresh');
  resolve('retired');await pending;
  assert.equal(fresh,'fresh');
  assert.equal(await reader.read('owner-a',()=>{throw Error('duplicate');}),'fresh');
});

test('privacy retirement before a queued summary read prevents unnecessary remote work',async()=>{
  const reader=createConnected360SummaryReader();
  let calls=0;
  const pending=reader.read('owner-a',()=>{calls++;return 'old';});
  reader.clear();
  await assert.rejects(pending,/SUMMARY_READ_RETIRED/u);
  assert.equal(calls,0);
});
