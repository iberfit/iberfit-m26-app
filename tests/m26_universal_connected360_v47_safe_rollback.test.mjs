import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const path=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
test('UNIVERSAL: Connected360 V47 rollback restores exact previous function, owner & grants',()=>{
  const old=path('supabase/migrations/20261012230000_connected360_v47_prod_daily_health_macro.sql');
  const begin=old.indexOf('CREATE OR REPLACE FUNCTION public.m26_wearable_v47_my_daily_prod_v1()');
  const end=old.indexOf('-- Existing V46 delete/erase triggers',begin);
  assert.ok(begin>=0&&end>begin);
  const rollback=path('supabase/rollbacks/20261103114500_connected360_v47_bounded_owner_history_read.rollback.sql');
  assert.equal(rollback.slice(rollback.indexOf('CREATE OR REPLACE FUNCTION')).trim(),
    old.slice(begin,end).trim());
  assert.match(rollback,/owner_user_id=v_owner AND client_id=v_client/u);
  assert.match(rollback,/iberfit_require_privileged_assurance_v65d/u);
  assert.match(rollback,/record_date>=\(now\(\) AT TIME ZONE aggregation_time_zone\)::date-6/u);
  assert.doesNotMatch(rollback,/\bDROP\b|\bDELETE FROM\b|\bTRUNCATE\b/iu);
});
