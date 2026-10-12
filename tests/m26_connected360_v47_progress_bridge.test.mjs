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
