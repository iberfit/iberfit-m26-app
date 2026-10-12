import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  healthConnectLocalCivilDate,
  createHealthConnectHistoricalPlan,
} from '../src/m26/wearables/historical-acquisition.js';

const nearMidnight=new Date('2026-10-12T02:05:00.000Z');

test('Android Health Connect follows Chilean civil date, not the next UTC day',()=>{
  assert.equal(healthConnectLocalCivilDate(nearMidnight,{timeZone:'America/Santiago'}),'2026-10-11');
  assert.equal(healthConnectLocalCivilDate(nearMidnight,{timeZone:'UTC'}),'2026-10-12');
  assert.equal(healthConnectLocalCivilDate(nearMidnight,{timeZone:'Asia/Tokyo'}),'2026-10-12');
});

test('historical first-read 7-day range spans phone local calendar through local today',()=>{
  const p=createHealthConnectHistoricalPlan({
    endDate:nearMidnight,timeZone:'America/Santiago',
    capabilities:['steps','sleep','resting_heart_rate'],days:7,
  });
  assert.equal(p.endDate,'2026-10-11');
  assert.equal(p.startDate,'2026-10-05');
  assert.equal(p.days,7);
  assert.deepEqual(p.metrics,['steps','sleepMinutes','restingHeartRate']);
});

test('civil date works across Santiago daylight-saving transition without elapsed-hour arithmetic',()=>{
  const p=createHealthConnectHistoricalPlan({
    endDate:new Date('2026-09-07T02:30:00Z'),
    timeZone:'America/Santiago',
    capabilities:['steps'],
    days:3,
  });
  // DST began on 6 September 2026. This is Sept 6 on the phone.
  assert.equal(p.endDate,'2026-09-06');
  assert.equal(p.startDate,'2026-09-04');
});

test('explicit YYYY-MM-DD is a calendar date and is not shifted by a timezone',()=>{
  const p=createHealthConnectHistoricalPlan({
    endDate:'2026-10-11',timeZone:'Asia/Tokyo',
    capabilities:['steps'],days:1,
  });
  assert.equal(p.startDate,'2026-10-11');
  assert.equal(p.endDate,'2026-10-11');
});

test('phone local time is used when caller does not override zone; invalid dates fail closed',()=>{
  const reference=new Date('2026-10-12T02:05:00Z');
  const expected=[reference.getFullYear(),String(reference.getMonth()+1).padStart(2,'0'),
    String(reference.getDate()).padStart(2,'0')].join('-');
  assert.equal(healthConnectLocalCivilDate(reference),expected);
  assert.throws(()=>healthConnectLocalCivilDate(new Date('invalid')),/M26_HEALTH_CONNECT_DATE_INVALID/u);
  assert.throws(()=>healthConnectLocalCivilDate('2026-10-11'),/M26_HEALTH_CONNECT_DATE_INVALID/u);
});

test('passive foreground native window cannot silently switch to UTC date',()=>{
  const c=readFileSync(new URL('../src/m26/wearables/controller.js',import.meta.url),'utf8');
  const native=c.slice(c.indexOf('async function connectNativeProvider('),c.indexOf('async function autoSyncNativeProviders('));
  assert.match(native,/const resolvedEndDate=endDate\|\|healthConnectLocalCivilDate\(new Date\(\)\)/u);
  assert.doesNotMatch(native,/resolvedEndDate=endDate\|\|new Date\(\)\.toISOString/u);
});
