import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileV45SourceDailyMetrics as reconcile} from '../src/m26/wearables/v45-source-reconciliation.js';

const ownerId='22222222-2222-4222-8222-222222222222';
const clientId='11111111-1111-4111-8111-111111111111';
const grant='33333333-3333-4333-8333-333333333333';
const options={ownerId,clientId};
const base={
  owner_user_id:ownerId,client_id:clientId,provider:'health_connect',
  record_date:'2026-10-10',source_key:null,grant_id:grant,revocation_cursor:0,
  acquired_at:'2026-10-10T14:00:00Z',source_time_verified:false,
  source_updated_at:null,measured_at:null,automatic_sync_certified:false,
  quality:'limitada',steps:8000,
};
const record=(changes={})=>({...base,...changes});

test('one Health Connect aggregate remains a single, unverified source',()=>{
  const result=reconcile([record()],options);
  assert.equal(result.days.length,1);
  assert.equal(result.days[0].metrics.steps,8000);
  assert.equal(result.days[0].metrics.sleepMinutes,null);
  assert.equal(result.days[0].evidence.steps.provider,'health_connect');
  assert.equal(result.days[0].evidence.steps.sourceKnown,false);
  assert.equal(result.days[0].evidence.steps.sourceUpdatedAt,null);
  assert.equal(result.days[0].evidence.steps.acquiredAt,'2026-10-10T14:00:00.000Z');
  assert.equal(result.days[0].evidence.steps.automaticSyncCertified,false);
  assert.equal(result.authorizationChecked,false);
  assert.equal(result.automaticSyncCertified,false);
  assert.equal(result.persisted,false);
});

test('different providers and different devices are NEVER summed or silently preferred',()=>{
  const input=[
    record({steps:12000,provider:'health_connect'}),
    record({steps:17000,provider:'apple_health'}),
  ];
  const result=reconcile(input,options);
  assert.equal(result.days[0].metrics.steps,null);
  assert.equal(result.days[0].conflicts[0].reason,'overlapping_sources');
  assert.equal(result.days[0].conflicts[0].sourceCount,2);
  assert.equal(result.conflictDays,1);
  assert.equal(result.days[0].complete,false);
  assert.deepEqual(reconcile(input.reverse(),options).days[0].metrics,result.days[0].metrics);
});

test('separate known-source keys conflict despite sharing one provider',()=>{
  const result=reconcile([
    record({source_key:'a'.repeat(64),steps:9000}),
    record({source_key:'b'.repeat(64),steps:10000}),
  ],options);
  assert.equal(result.days[0].metrics.steps,null);
  assert.equal(result.days[0].conflicts[0].sourceCount,2);
});

test('explicit source preference resolves one metric, never automatically merges another',()=>{
  const result=reconcile([
    record({steps:6000,sleep_minutes:400}),
    record({provider:'apple_health',steps:9000,sleep_minutes:450}),
  ],{...options,preferredSources:{steps:'health_connect:unknown'}});
  assert.equal(result.days[0].metrics.steps,6000);
  assert.equal(result.days[0].evidence.steps.selection,'explicit_source');
  assert.equal(result.days[0].metrics.sleepMinutes,null);
  assert.equal(result.days[0].conflicts[0].metric,'sleepMinutes');
});

test('duplicate same-source aggregate is idempotent, but divergent ties fail closed',()=>{
  const stable=reconcile([record(),record()],options);
  assert.equal(stable.days[0].metrics.steps,8000);
  const disputed=reconcile([record(),record({steps:8001})],options);
  assert.equal(disputed.days[0].metrics.steps,null);
  assert.equal(disputed.days[0].conflicts[0].reason,'overlapping_sources');
});

test('later acquisition replaces earlier aggregate but is not source freshness',()=>{
  const result=reconcile([
    record({steps:5000,acquired_at:'2026-10-10T13:00:00Z'}),
    record({steps:8000,acquired_at:'2026-10-10T14:00:00Z'}),
  ],options);
  assert.equal(result.days[0].metrics.steps,8000);
  assert.equal(result.days[0].evidence.steps.sourceTimeVerified,false);
  assert.equal(result.days[0].evidence.steps.sourceUpdatedAt,null);
});

test('verified source revision may determine one-source precedence',()=>{
  const src='a'.repeat(64);
  const result=reconcile([
    record({source_key:src,steps:1000,source_time_verified:true,quality:'alta',
      source_updated_at:'2026-10-10T11:00:00Z',measured_at:'2026-10-10T10:00:00Z'}),
    record({source_key:src,steps:2500,source_time_verified:true,quality:'alta',
      source_updated_at:'2026-10-10T12:00:00Z',measured_at:'2026-10-10T11:30:00Z'}),
  ],options);
  assert.equal(result.days[0].metrics.steps,2500);
  assert.equal(result.days[0].evidence.steps.sourceTimeVerified,true);
  assert.equal(result.days[0].evidence.steps.sourceUpdatedAt,'2026-10-10T12:00:00.000Z');
});

test('strict owner/client boundary, fake provenance, and automatic claims fail closed',()=>{
  assert.throws(()=>reconcile([record({client_id:'99999999-9999-4999-8999-999999999999'})],options),/UNTRUSTED_ROW/u);
  assert.throws(()=>reconcile([record({owner_user_id:'99999999-9999-4999-8999-999999999999'})],options),/UNTRUSTED_ROW/u);
  assert.throws(()=>reconcile([record({automatic_sync_certified:true})],options),/UNTRUSTED_ROW/u);
  assert.throws(()=>reconcile([record({source_updated_at:'2026-10-10T10:00:00Z'})],options),/FABRICATED_TIME/u);
  assert.throws(()=>reconcile([record({quality:'alta'})],options),/FABRICATED_TIME/u);
  assert.throws(()=>reconcile([record({source_key:'unverified_watch_name'})],options),/SOURCE_KEY_INVALID/u);
  assert.throws(()=>reconcile([record({steps:Infinity})],options),/METRIC_INVALID/u);
});

test('no cross-day fusion and missing values stay null, not zero',()=>{
  const result=reconcile([
    record({record_date:'2026-10-09',steps:5000}),
    record({record_date:'2026-10-10',steps:8000}),
  ],options);
  assert.deepEqual(result.days.map(d=>d.date),['2026-10-09','2026-10-10']);
  assert.deepEqual(result.days.map(d=>d.metrics.steps),[5000,8000]);
  assert.deepEqual(result.days.map(d=>d.metrics.sleepMinutes),[null,null]);
});
