import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatConnected360ProductionSummary,connected360WorkoutHistory,createConnected360SummaryReader,connected360WorkoutMix,connected360ActivityPage,connected360ActivityPageParams,connected360WorkoutDays} from '../src/m26/wearables/v46-production-summary.js';

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

test('Evolución shows a bounded activity mix, never a training completion or total workload',()=>{
  const now=new Date('2026-10-13T12:00:00Z');
  const row=(sport,startedAt,endedAt)=>({sport,startedAt,endedAt,linkedToTraining:false});
  const observations=[
    row('running','2026-10-12T10:00:00Z','2026-10-12T10:30:00Z'),
    row('running','2026-10-12T10:00:00Z','2026-10-12T10:30:00Z'),
    row('strength','2026-10-11T10:00:00Z','2026-10-11T10:30:00Z'),
  ];
  const mix=connected360WorkoutMix(connected360WorkoutHistory({...empty(),exerciseEvidence:observations},{now}));
  assert.deepEqual(mix.map(row=>row.label),['Carrera','Fuerza']);
  assert.ok(mix.every(row=>row.detail.includes('30 min')&&!Object.hasOwn(row,'count')));
  assert.deepEqual(connected360WorkoutMix([{label:'<script>'}]),[]);
  assert.ok(Object.isFrozen(mix)&&mix.every(Object.isFrozen));
  const routes=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const progress=routes.slice(routes.indexOf('export function renderProgressRoute(vm)'),routes.indexOf('export function renderActivityRoute(vm)'));
  assert.match(progress,/if\(vm\.role==='client'\)\{[\s\S]*data-prod-connected360-feed="evolution" hidden/u);
  const inactive=routes.slice(routes.indexOf('export function renderActivityRoute(vm)'),routes.indexOf('// The newest confirmed wellbeing check-in'));
  assert.match(inactive,/vm\.role==='client'\?'<section class="m26-panel" data-prod-connected360-feed="full" hidden/u);
  assert.match(controller,/connected360WorkoutMix\(rows\)/u);
  assert.match(controller,/No mide el cumplimiento del plan/u);
});
test('invalid civil dates and rolled-over 24h timestamps are never rendered as observations',()=>{
  const now=new Date('2026-03-04T12:00:00Z');
  const exerciseEvidence=[
    {sport:'running',startedAt:'2026-02-30T10:00:00Z',endedAt:'2026-03-02T10:30:00Z'},
    {sport:'running',startedAt:'2026-03-02T24:00:00Z',endedAt:'2026-03-03T00:30:00Z'},
    {sport:'cycling',startedAt:'2026-03-03T10:00:00-03:00',endedAt:'2026-03-03T10:30:00-03:00'},
  ];
  assert.deepEqual(connected360WorkoutHistory({...empty(),exerciseEvidence},{now}).map(row=>row.label),['Ciclismo']);
});

test('workout mean heart rate is optional, sample-backed and never inferred from daily pulse',()=>{
  const now=new Date('2026-10-13T12:00:00Z');
  const row={sport:'running',startedAt:'2026-10-12T10:00:00Z',endedAt:'2026-10-12T10:30:00Z',linkedToTraining:false};
  const display=patch=>connected360WorkoutHistory({...empty(),exerciseEvidence:[{...row,...patch}]},{now})[0].detail;
  assert.match(display({avgBpm:148,heartRateSamples:120}),/FC media 148 lpm/u);
  for(const patch of [{avgBpm:148},{avgBpm:148,heartRateSamples:0},{avgBpm:'148',heartRateSamples:120},{avgBpm:241,heartRateSamples:120},{heartRateSamples:120,minBpm:100,maxBpm:190},{avgBpm:0,heartRateSamples:120}])
    assert.doesNotMatch(display(patch),/FC media/u);
});

test('running pace uses elapsed time and valid distance, never claims active pace',()=>{
  const now=new Date('2026-10-13T12:00:00Z');
  const row={sport:'running',startedAt:'2026-10-12T10:00:00Z',endedAt:'2026-10-12T10:30:00Z',distanceMeters:5000};
  const display=patch=>connected360WorkoutHistory({...empty(),exerciseEvidence:[{...row,...patch}]},{now})[0].detail;
  assert.match(display({}),/Ritmo total estimado 6:00 min\/km/u);
  assert.match(display({sport:'interval_running',distanceMeters:5400}),/Ritmo total estimado 5:33 min\/km/u);
  assert.match(display({endedAt:'2026-10-12T10:29:59Z'}),/Ritmo total estimado 6:00 min\/km/u);
  for(const patch of [{sport:'cycling'},{sport:'walking'},{sport:'strength'},{sport:'hiit'},
    {distanceMeters:null},{distanceMeters:0},{distanceMeters:99},{distanceMeters:'5000'},
    {distanceMeters:NaN},{distanceMeters:Infinity},{distanceMeters:500001},
    {distanceMeters:100000},{distanceMeters:100}])
    assert.doesNotMatch(display(patch),/Ritmo total estimado/u);
  assert.doesNotMatch(display({}),/Ritmo activo|en movimiento/u);
});

const pageNow=new Date('2026-10-13T12:00:00Z');
const pageRow=(n,startedAt='2026-10-12T10:00:00.000000Z')=>({
  id:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),
  sport:'running',startedAt,endedAt:'2026-10-12T10:30:00.000000Z',
  distanceMeters:5000,avgBpm:148,heartRateSamples:120,linkedToTraining:false,
});
const pageDto=(exerciseEvidence,nextCursor=null)=>({
  ok:true,schema:'iberfit.connected360.activity-page.v1',provider:'health_connect',exerciseEvidence,nextCursor,
});
test('activity page accepts stable equal-timestamp keys, bounded 20 items and measured fields',()=>{
  const items=Array.from({length:20},(_,i)=>pageRow(30-i));
  const last=items.at(-1),cursor={id:last.id,startedAt:last.startedAt};
  const first=connected360ActivityPage(pageDto(items,cursor),{now:pageNow});
  assert.equal(first.rows.length,20);
  assert.deepEqual(first.nextCursor,cursor);
  assert.match(first.rows[0].detail,/FC media 148 lpm/u);
  assert.ok(Object.isFrozen(first)&&Object.isFrozen(first.rows)&&Object.isFrozen(first.nextCursor));
  assert.ok(!Object.hasOwn(first.rows[0],'id'));
  const next=connected360ActivityPage(pageDto([pageRow(10)]),{cursor,now:pageNow});
  assert.equal(next.rows.length,1);assert.equal(next.nextCursor,null);
  assert.deepEqual(connected360ActivityPageParams(cursor),{p_before_started_at:cursor.startedAt,p_before_id:cursor.id});
  assert.deepEqual(connected360ActivityPageParams(),{p_before_started_at:null,p_before_id:null});
});
test('activity page rejects oversized, duplicate, replayed, malformed and out-of-order evidence',()=>{
  const a=pageRow(2),b=pageRow(1),cursor={id:a.id,startedAt:a.startedAt};
  const invalid=[
    pageDto(Array.from({length:21},(_,i)=>pageRow(22-i))),
    pageDto([b,a]),pageDto([a,a]),pageDto([{...a,sport:'unknown'}]),
    pageDto([{...a,linkedToTraining:true}]),pageDto([{...a,id:'opaque-source-secret'}]),
    pageDto([a],cursor),{...pageDto([]),provider:'apple_health'},
    {...pageDto([]),schema:'unknown'}, {...pageDto([]),nextCursor:undefined},
  ];
  for(const dto of invalid)assert.throws(()=>connected360ActivityPage(dto,{now:pageNow}),/M26_V48_ACTIVITY_/u);
  assert.throws(()=>connected360ActivityPage(pageDto([a]),{cursor,now:pageNow}),/M26_V48_ACTIVITY_/u);
  assert.throws(()=>connected360ActivityPageParams({id:a.id,startedAt:'2026-02-30T10:00:00.000000Z'}),/M26_V48_ACTIVITY_/u);
  assert.equal(connected360ActivityPage(pageDto([]),{cursor,now:pageNow}).rows.length,0);
});
test('activity page preserves submillisecond order without coercing cursor timestamps',()=>{
  const a=pageRow(1,'2026-10-12T10:00:00.000002Z'),b=pageRow(2,'2026-10-12T10:00:00.000001Z');
  assert.equal(connected360ActivityPage(pageDto([a,b]),{now:pageNow}).rows.length,2);
  assert.throws(()=>connected360ActivityPage(pageDto([b,a]),{now:pageNow}),/M26_V48_ACTIVITY_/u);
});
test('full activity UI is explicit, capability-gated and fenced on owner changes',()=>{
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(controller,/response\.activityHistoryAvailable===true/u);
  assert.match(controller,/async function renderActivityPage/u);
  assert.match(controller,/const page=await transport\.connected360ProductionActivityPage\(token,cursor\);\s*if\(!stillCurrent\(\)\|\|!history\.isConnected\)return/u);
  assert.match(controller,/button\.isConnected/u);
});

test('imported workouts group by Chilean start day, not UTC, preserving each separate session',()=>{
  const now=new Date('2026-11-28T12:00:00Z');
  const workout=(sport,startedAt,endedAt)=>({sport,startedAt,endedAt,linkedToTraining:false});
  const rows=connected360WorkoutHistory({...empty(),exerciseEvidence:[
    workout('running','2026-11-28T00:30:00Z','2026-11-28T01:00:00Z'),
    workout('strength','2026-11-27T12:00:00Z','2026-11-27T12:45:00Z'),
    workout('cycling','2026-11-28T03:15:00Z','2026-11-28T04:00:00Z'),
    workout('running','2026-11-27T02:45:00Z','2026-11-27T03:15:00Z'),
    workout('running','2026-11-27T13:00:00Z','2026-11-27T13:30:00Z'),
  ]},{now});
  const days=connected360WorkoutDays(rows);
  assert.deepEqual(days.map(d=>d.dayKey),['2026-11-28','2026-11-27','2026-11-26']);
  assert.deepEqual(days.map(d=>d.rows.map(row=>row.label)),[['Ciclismo'],['Carrera','Carrera','Fuerza'],['Carrera']]);
  assert.match(days[1].rows[0].dayDetail,/21:30/u);
  assert.match(days[2].rows[0].dayDetail,/23:45/u);
  assert.ok(Object.isFrozen(days)&&days.every(d=>Object.isFrozen(d)&&Object.isFrozen(d.rows)));
  assert.equal(days.flatMap(d=>d.rows).length,5);
});
test('a day crossing a page boundary is explicitly continued, never merged or dropped',()=>{
  const items=[pageRow(3),pageRow(2)];
  const page=connected360ActivityPage(pageDto(items),{now:pageNow});
  const days=connected360WorkoutDays(page.rows,{beforeStartedAt:'2026-10-12T11:00:00.000000Z'});
  assert.equal(days.length,1);assert.equal(days[0].continued,true);assert.equal(days[0].rows.length,2);
  assert.equal(connected360WorkoutDays(page.rows)[0].continued,false);
  assert.equal(connected360WorkoutDays(page.rows,{beforeStartedAt:'2026-10-13T11:00:00.000000Z'})[0].continued,false);
  assert.deepEqual(connected360WorkoutDays([]),[]);
});
test('recent and paginated activity UI reuse the day renderer, preserving the separate Evolution overview',()=>{
  const controller=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  assert.match(controller,/children\.push\(heading,note,\.\.\.renderProductionWorkoutDays\(document,rows\)\)/u);
  assert.match(controller,/renderProductionWorkoutDays\(document,page\.rows,cursor\?\.startedAt\?\?null\)/u);
  assert.match(controller,/group\.dataset\.prodConnected360Day=day\.dayKey/u);
  assert.match(controller,/connected360WorkoutMix\(rows\)/u);
});
