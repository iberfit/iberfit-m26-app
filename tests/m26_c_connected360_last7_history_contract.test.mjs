import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildWearableViewModel} from '../src/m26/wearables/view-model.js';
import {renderClientTodayHealth} from '../src/m26/wearables/client-health-snapshot.js';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const file='supabase/migrations/20261111131000_connected360_v47_last_seven_owner_history.sql';
const migration=read(file);
const rollback=read('supabase/rollbacks/20261111131000_connected360_v47_last_seven_owner_history.rollback.sql');
const previous=read('supabase/migrations/20261103114500_connected360_v47_bounded_owner_history_read.sql');
const marker='CREATE OR REPLACE FUNCTION public.m26_wearable_v47_my_daily_prod_v1()';
const body=(s)=>s.slice(s.indexOf(marker)).trim();
const oldFilter="WHERE owner_user_id=v_owner AND client_id=v_client\n      AND record_date>=(now() AT TIME ZONE aggregation_time_zone)::date-29\n      AND record_date<=(now() AT TIME ZONE aggregation_time_zone)::date";
const newFilter="WHERE owner_user_id=v_owner AND client_id=v_client\n      AND provider='health_connect'\n      AND record_date<=(now() AT TIME ZONE aggregation_time_zone)::date";
const client='11111111-1111-4111-8111-111111111111';
const record=(date,steps)=>({
  clientId:client,provider:'health_connect',date,
  metrics:{steps},sourceUpdatedAt:date+'T19:00:00Z',quality:'limitada',
});
test('C V47 SQL changes only history selection; preserved verified backend and grants',()=>{
  assert.ok(previous.includes(oldFilter),'baseline 30-day read must match checked-in source');
  assert.equal(body(migration),body(previous).replace(oldFilter,newFilter));
  assert.equal(body(rollback),body(previous),'rollback restores exact prior definition and ACL');
  const sql=body(migration);
  for(const term of ['SECURITY DEFINER SET search_path TO \'\'',
    'v_owner uuid:=(SELECT auth.uid())','v_client uuid:=public.iberfit_client_id()',
    'iberfit_require_privileged_assurance_v65d()',
    'owner_user_id=v_owner AND client_id=v_client',
    "provider='health_connect'",
    'ORDER BY record_date DESC LIMIT 7',
    "'sourceVerified',false","'sourceIdentityVerified',false",
    'REVOKE ALL ON FUNCTION public.m26_wearable_v47_my_daily_prod_v1() FROM PUBLIC,anon',
    'GRANT EXECUTE ON FUNCTION public.m26_wearable_v47_my_daily_prod_v1() TO authenticated'])
    assert.ok(sql.includes(term),term);
  assert.doesNotMatch(sql,/record_date\s*>=/u);
  assert.match(sql,/record_date<=\(now\(\) AT TIME ZONE aggregation_time_zone\)::date/u);
  assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER TABLE|CREATE TABLE|GRANT SELECT ON TABLE)\b/iu);
  assert.doesNotMatch(sql,/\bp_owner\b|\bp_client\b/iu);
});
test('C: oldest real health records remain visible but never become current health evidence',()=>{
  const dates=['2025-01-10','2026-10-01','2026-10-06','2026-10-07',
    '2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-10-12'];
  const rows=dates.map((date,i)=>record(date,5000+i*100));
  const vm=buildWearableViewModel({records:[...rows,rows.at(-1),record('2027-01-10',16000)],
    role:'client',now:new Date('2026-11-11T12:00:00Z'),scope:{}});
  assert.equal(vm.summary.daysWithData,0);
  assert.equal(vm.summary.metrics.steps,null);
  assert.equal(vm.summary.decision.eligible,false);
  assert.equal(vm.historicalRecords.length,7);
  assert.equal(vm.lastHistoricalDate,'2026-10-12');
  assert.deepEqual(vm.historicalRecords.map(r=>r.date),
    ['2026-10-12','2026-10-11','2026-10-10','2026-10-09',
      '2026-10-08','2026-10-07','2026-10-06']);
  assert.match(renderClientTodayHealth(vm),/Último registro 12\/10\/2026/u);
  assert.match(renderClientTodayHealth(vm),/no representa tu estado actual/u);
  const later=buildWearableViewModel({records:[record('2025-01-10',6000)],
    role:'client',now:new Date('2026-11-11T12:00:00Z'),scope:{}});
  assert.equal(later.lastHistoricalDate,'2025-01-10');
  assert.equal(later.summary.daysWithData,0);
});
test('C: recent samples stay current only, historical context cannot inflate their metrics',()=>{
  const vm=buildWearableViewModel({records:[record('2026-11-10',8000),record('2025-01-10',6000)],
    role:'client',now:new Date('2026-11-11T12:00:00Z'),scope:{}});
  assert.equal(vm.summary.daysWithData,1);
  assert.equal(vm.summary.metrics.steps,8000);
  assert.equal(vm.historicalRecords.length,0);
  assert.equal(vm.lastHistoricalDate,null);
});
