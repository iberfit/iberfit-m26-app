import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileV45SourceDailyMetrics as reconcile,reconcileConnected360ExercisePeriod} from '../src/m26/wearables/v45-source-reconciliation.js';

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
  assert.equal(result.days[0].evidence.steps.aggregationTimeZone,null);
  assert.equal(result.days[0].evidence.steps.sourceTimeZone,null);
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
  assert.equal(result.days[0].conflictFree,false);
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

test('all tied snapshots are checked and empty numeric strings cannot become zeros',()=>{
  const tied=reconcile([record(),record(),record({steps:9000})],options);
  assert.equal(tied.days[0].metrics.steps,null);
  assert.throws(()=>reconcile([record({steps:''})],options),/METRIC_INVALID/u);
  assert.throws(()=>reconcile([record()],{...options,preferredSources:{constructor:'health_connect:unknown'}}),/INPUT_INVALID/u);
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

test('the same source and date but a different aggregation zone is a conflict',()=>{
  const a=record({steps:7000,aggregation_time_zone:'America/Santiago'});
  const b=record({steps:8000,aggregation_time_zone:'Pacific/Auckland'});
  const mixed=reconcile([a,b],options);
  assert.equal(mixed.days[0].metrics.steps,null);
  assert.equal(mixed.days[0].conflicts[0].reason,'civil_zone_mismatch');
  const single=reconcile([a],options);
  assert.equal(single.days[0].evidence.steps.aggregationTimeZone,'America/Santiago');
  assert.equal(single.days[0].evidence.steps.sourceTimeZone,null);
  assert.throws(()=>reconcile([record({aggregation_time_zone:'@@invalid@@'})],options),/ZONE_INVALID/u);
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


const exerciseOptions={...options,periodStart:'2026-01-01',periodEnd:'2026-11-28',now:new Date('2026-11-28T20:00:00Z'),complete:true};
const exercise=(changes={})=>({
  owner_user_id:ownerId,client_id:clientId,provider:'health_connect',sport:'running',
  source_record_key:'a'.repeat(64),grant_id:grant,revocation_cursor:0,
  observed_started_at:'2026-11-28T12:00:00Z',observed_ended_at:'2026-11-28T12:30:00Z',
  distance_meters:5000,link_status:'unlinked',quality:'limitada',
  source_identity_verified:false,automatic_sync_certified:false,...changes
});
test('same-provider replay is idempotent and elapsed duration is not active duration',()=>{
  const result=reconcileConnected360ExercisePeriod([exercise(),exercise()],exerciseOptions);
  assert.equal(result.observedDays,1);
  assert.deepEqual(result.disciplines[0],{sport:'running',observedDays:1,unambiguousObservations:1,
    ambiguousGroups:0,elapsedSeconds:1800,activeSeconds:null,distanceMeters:5000});
  assert.equal(result.authorizationChecked,false);
  assert.equal(result.automaticPlanChange,false);
});
test('overlapping Apple and Android observations never double count or merge',()=>{
  const apple=exercise({provider:'apple_health',source_record_key:'b'.repeat(64),active_seconds:1700});
  const result=reconcileConnected360ExercisePeriod([exercise(),apple],exerciseOptions);
  assert.equal(result.observedDays,1);
  assert.equal(result.disciplines[0].distanceMeters,null);
  assert.equal(result.disciplines[0].elapsedSeconds,null);
  assert.equal(result.disciplines[0].ambiguousGroups,1);
  assert.deepEqual(result.conflicts[0].providers,['apple_health','health_connect']);
  assert.deepEqual(reconcileConnected360ExercisePeriod([apple,exercise()],exerciseOptions),result);
  assert.doesNotMatch(JSON.stringify(result),/source_record_key|grant_id|aaaaaaaa/u);
});
test('separate days and non-overlapping activities are retained, including swimming',()=>{
  const swim=exercise({provider:'apple_health',sport:'swimming',source_record_key:'b'.repeat(64),
    observed_started_at:'2026-11-27T14:00:00Z',observed_ended_at:'2026-11-27T14:30:00Z',
    active_seconds:1200,distance_meters:1000});
  const result=reconcileConnected360ExercisePeriod([exercise(),swim],exerciseOptions);
  assert.equal(result.observedDays,2);
  assert.equal(result.disciplines.find(x=>x.sport==='swimming').activeSeconds,1200);
  assert.equal(result.disciplines.find(x=>x.sport==='swimming').distanceMeters,1000);
  const partial=reconcileConnected360ExercisePeriod([exercise(),swim],{...exerciseOptions,complete:false});
  assert.ok(partial.disciplines.every(x=>x.distanceMeters===null&&x.elapsedSeconds===null));
});
test('overlap across midnight and transitive overlaps remain ambiguous; touching sessions do not',()=>{
  const a=exercise({observed_started_at:'2026-11-28T02:40:00Z',observed_ended_at:'2026-11-28T03:10:00Z'});
  const b=exercise({provider:'apple_health',source_record_key:'b'.repeat(64),
    observed_started_at:'2026-11-28T03:00:00Z',observed_ended_at:'2026-11-28T03:30:00Z'});
  const c=exercise({provider:'strava',source_record_key:'c'.repeat(64),
    observed_started_at:'2026-11-28T03:20:00Z',observed_ended_at:'2026-11-28T03:40:00Z'});
  const d=exercise({source_record_key:'d'.repeat(64),
    observed_started_at:'2026-11-28T03:40:00Z',observed_ended_at:'2026-11-28T04:00:00Z'});
  const result=reconcileConnected360ExercisePeriod([a,b,c,d],exerciseOptions);
  assert.equal(result.conflicts.length,1);
  assert.deepEqual(result.conflicts[0].days,['2026-11-27','2026-11-28']);
  assert.equal(result.disciplines[0].unambiguousObservations,1);
  assert.equal(result.disciplines[0].distanceMeters,null);
});
test('exercise projection rejects different ownership, divergent replay and invalid or future observations',()=>{
  for(const bad of [exercise({owner_user_id:clientId}),exercise({client_id:ownerId}),
    exercise({automatic_sync_certified:true}),exercise({distance_meters:''}),
    exercise({active_seconds:3600}),exercise({observed_started_at:'2026-11-31T12:00:00Z'}),
    exercise({observed_ended_at:'2026-11-29T12:00:00Z'}),exercise({link_status:'linked'}),
    exercise({source_record_key:'native-uuid'})])
    assert.throws(()=>reconcileConnected360ExercisePeriod([bad],exerciseOptions));
  assert.throws(()=>reconcileConnected360ExercisePeriod([exercise(),exercise({distance_meters:5001})],exerciseOptions));
  const noDistance=reconcileConnected360ExercisePeriod([exercise({distance_meters:null})],exerciseOptions);
  assert.equal(noDistance.disciplines[0].distanceMeters,null);
  assert.equal(reconcileConnected360ExercisePeriod([],exerciseOptions).observedDays,0);
});
