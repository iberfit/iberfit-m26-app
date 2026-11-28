import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeV47DailyIntoClientProgress} from '../src/m26/wearables/v47-progress-bridge.js';
import {summarizeWearableData} from '../src/m26/wearables/normalization.js';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const today='2026-10-12';
const row={date:today,steps:7821,sleepMinutes:455,restingHeartRate:59,
  acquiredAt:'2026-10-12T17:00:00Z',sourceVerified:false};
const legacy={id:'health_connect:'+a+':'+today,clientId:a,provider:'health_connect',
  date:today,metrics:{steps:7000,hrvMs:51,activeEnergyKcal:310,restingHeartRate:null,
    sleepMinutes:null},quality:'media',sourceUpdatedAt:'2026-10-12T14:00:00Z'};
test('V47 daily steps, sleep and resting HR reach canonical progress without erasing V44',()=>{
  const merged=mergeV47DailyIntoClientProgress({existing:[legacy],dailyHealth:[row],clientId:a});
  assert.equal(merged.length,1);
  assert.equal(merged[0].metrics.steps,7821);
  assert.equal(merged[0].metrics.sleepMinutes,455);
  assert.equal(merged[0].metrics.restingHeartRate,59);
  assert.equal(merged[0].metrics.hrvMs,51);
  assert.equal(merged[0].metrics.activeEnergyKcal,310);
  assert.equal(merged[0].quality,'limitada');
  const summary=summarizeWearableData(merged,{now:new Date('2026-10-12T21:00:00Z'),days:7});
  assert.equal(summary.metrics.steps,7821);
  assert.equal(summary.metrics.sleepMinutes,455);
  assert.equal(summary.metrics.restingHeartRate,59);
  assert.equal(summary.daysWithData,1);
});
test('missing metrics remain absent and are not converted into zero or readiness',()=>{
  const merged=mergeV47DailyIntoClientProgress({clientId:a,dailyHealth:[{
    date:today,acquiredAt:row.acquiredAt,steps:0,sourceVerified:false,
  }]});
  assert.equal(merged[0].metrics.steps,0);
  assert.equal(merged[0].metrics.sleepMinutes,null);
  assert.equal(merged[0].metrics.restingHeartRate,null);
});
test('revocation or missing summary preserves existing records without destructive changes',()=>{
  assert.deepEqual(mergeV47DailyIntoClientProgress({clientId:a,existing:[legacy],dailyHealth:[]}),[legacy]);
  assert.deepEqual(mergeV47DailyIntoClientProgress({clientId:a,existing:[legacy],dailyHealth:null}),[legacy]);
  assert.deepEqual(mergeV47DailyIntoClientProgress({clientId:a,existing:[legacy],
    dailyHealth:[{...row,steps:999999}]}),[legacy]);
  assert.deepEqual(mergeV47DailyIntoClientProgress({clientId:a,existing:[legacy],
    dailyHealth:[row,row]}),[legacy]);
});
test('cross-client row is denied and unrelated provider data are retained',()=>{
  const other={clientId:b,provider:'health_connect',date:today,metrics:{steps:9000}};
  const garmin={clientId:a,provider:'garmin_connect',date:today,metrics:{steps:5000}};
  const denied=mergeV47DailyIntoClientProgress({clientId:a,existing:[legacy,garmin],
    dailyHealth:[{...row,clientId:b}]});
  assert.deepEqual(denied,[legacy,garmin]);
  const safe=mergeV47DailyIntoClientProgress({clientId:a,existing:[other,garmin],
    dailyHealth:[row]});
  assert.equal(safe.some(x=>x.clientId===b),false);
  assert.equal(safe.find(x=>x.provider==='garmin_connect').metrics.steps,5000);
  assert.equal(safe.find(x=>x.provider==='health_connect').metrics.steps,7821);
});


test('P0: old but real V47 data appear only as a clearly dated history',async()=>{
  const {buildWearableViewModel}=await import('../src/m26/wearables/view-model.js');
  const {renderClientTodayHealth}=await import('../src/m26/wearables/client-health-snapshot.js');
  const records=mergeV47DailyIntoClientProgress({clientId:a,dailyHealth:[row]});
  const vm=buildWearableViewModel({records,role:'client',
    now:new Date('2026-11-03T12:00:00Z'),scope:{}});
  assert.equal(vm.summary.daysWithData,0);
  assert.equal(vm.summary.metrics.steps,null);
  assert.equal(vm.dailyRecords.length,0);
  assert.equal(vm.lastHistoricalDate,'2026-10-12');
  assert.equal(vm.historicalRecords.length,1);
  assert.equal(vm.historicalRecords[0].metrics.sleepMinutes,455);
  const markup=renderClientTodayHealth(vm);
  assert.match(markup,/No hay mediciones de los últimos 7 días/u);
  assert.match(markup,/Último registro 12\/10\/2026/u);
  assert.doesNotMatch(markup,/Pasos medios|Sueño medio|7 h 35 min/u);
  assert.match(markup,/no representa tu estado actual/u);
  const oneMonthLater=buildWearableViewModel({records,role:'client',
    now:new Date('2026-12-03T12:00:00Z'),scope:{}});
  assert.equal(oneMonthLater.lastHistoricalDate,'2026-10-12');
  assert.equal(oneMonthLater.summary.daysWithData,0);
  assert.equal(oneMonthLater.summary.metrics.steps,null);
  assert.equal(oneMonthLater.historicalRecords.length,1);
});

test('P0: historical Client activity is explicitly dated; never converts it to current status',async()=>{
  const {readFileSync}=await import('node:fs');
  const route=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
  assert.match(route,/data-wearable-historical/u);
  assert.match(route,/No reflejan el estado actual/u);
  assert.match(route,/dailyRecords:dailyRecords\+historicalRecords/u);
});

test('P0: historical health stays accessible to Client even when training service is inactive',async()=>{
  const {buildWearableViewModel}=await import('../src/m26/wearables/view-model.js');
  const {renderActivityRoute}=await import('../src/m26/modules/route-render.js');
  const records=mergeV47DailyIntoClientProgress({clientId:a,dailyHealth:[row]});
  const wearables=buildWearableViewModel({records,role:'client',now:new Date('2026-11-03T12:00:00Z'),scope:{}});
  const html=renderActivityRoute({role:'client',serviceKind:'none',wearables});
  assert.match(html,/data-m26-device-hub/u);
  assert.match(html,/Historial anterior/u);
  assert.match(html,/2026-10-12/u);
  assert.doesNotMatch(html,/Sin mediciones confirmadas/u);
  assert.match(html,/No hay datos de los últimos siete días/u);
  assert.doesNotMatch(html,/Medias de los últimos siete días/u);
});

test('V47 delayed or equal-time conflicting observation never overwrites newer measured categories',()=>{
  const current={...legacy,metrics:{...legacy.metrics,steps:9000,sleepMinutes:null},
    sourceUpdatedAt:'2026-10-12T20:00:00Z'};
  const delayed={...row,steps:5000,sleepMinutes:420,restingHeartRate:null,
    acquiredAt:'2026-10-12T17:00:00Z'};
  const merged=mergeV47DailyIntoClientProgress({clientId:a,existing:[current],dailyHealth:[delayed]});
  assert.equal(merged[0].metrics.steps,9000);
  assert.equal(merged[0].metrics.sleepMinutes,420);
  assert.equal(merged[0].sourceUpdatedAt,new Date(current.sourceUpdatedAt).toISOString());
  const tie=mergeV47DailyIntoClientProgress({clientId:a,existing:merged,dailyHealth:[{
    ...row,steps:1,sleepMinutes:0,restingHeartRate:null,acquiredAt:current.sourceUpdatedAt,
  }]});
  assert.equal(tie[0].metrics.steps,9000);
  assert.equal(tie[0].metrics.sleepMinutes,420);
  const fresh=mergeV47DailyIntoClientProgress({clientId:a,existing:tie,dailyHealth:[{
    ...row,steps:0,sleepMinutes:null,restingHeartRate:null,acquiredAt:'2026-10-12T21:00:00Z',
  }]});
  assert.equal(fresh[0].metrics.steps,0);
  assert.equal(fresh[0].metrics.sleepMinutes,420);
  assert.equal(fresh[0].metrics.hrvMs,51);
  assert.equal(fresh[0].sourceUpdatedAt,'2026-10-12T21:00:00.000Z');
});
test('recent and previous daily evidence coexist without making historical data current',async()=>{
  const {buildWearableViewModel}=await import('../src/m26/wearables/view-model.js');
  const {renderActivityRoute}=await import('../src/m26/modules/route-render.js');
  const records=mergeV47DailyIntoClientProgress({clientId:a,dailyHealth:[
    row,{...row,date:'2026-11-02',steps:10000,acquiredAt:'2026-11-02T17:00:00Z'},
  ]});
  const wearables=buildWearableViewModel({records,role:'client',now:new Date('2026-11-03T12:00:00Z'),scope:{}});
  assert.equal(wearables.summary.daysWithData,1);
  assert.equal(wearables.summary.metrics.steps,10000);
  assert.equal(wearables.historicalRecords.length,1);
  assert.equal(wearables.historicalRecords[0].date,today);
  const html=renderActivityRoute({role:'client',serviceKind:'none',wearables});
  assert.match(html,/Últimos registros diarios/u);
  assert.match(html,/Historial anterior · registros no actuales/u);
  assert.match(html,/2026-10-12/u);
  assert.match(html,/2026-11-02/u);
});

test('historical projection uses the canonical normalization and leaves default summary shape unchanged',()=>{
  const old={...legacy,date:'2026-09-10',id:'old-record',sourceUpdatedAt:'2026-09-10T15:00:00Z'};
  const future={...legacy,date:'2026-12-01',id:'future-record'};
  const now=new Date('2026-10-12T21:00:00Z');
  const input=[legacy,old,old,future];
  const original=summarizeWearableData(input,{now,days:7});
  const extended=summarizeWearableData(input,{now,days:7,includeHistorical:true});
  const {historicalRecords,...recent}=extended;
  assert.deepEqual(recent,original);
  assert.equal(historicalRecords.length,1);
  assert.equal(historicalRecords[0].date,'2026-09-10');
  assert.equal(Object.hasOwn(original,'historicalRecords'),false);
});
