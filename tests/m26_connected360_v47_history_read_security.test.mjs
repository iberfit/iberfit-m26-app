import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const newSql=readFileSync(new URL('../supabase/migrations/20261103114500_connected360_v47_bounded_owner_history_read.sql',import.meta.url),'utf8');
const original=readFileSync(new URL('../supabase/migrations/20261012230000_connected360_v47_prod_daily_health_macro.sql',import.meta.url),'utf8');
const marker='CREATE OR REPLACE FUNCTION public.m26_wearable_v47_my_daily_prod_v1()';
const old=original.slice(original.indexOf(marker),original.indexOf('-- Existing V46 delete/erase triggers'));
const current=newSql.slice(newSql.indexOf(marker));
test('V47 read expands only a bounded 30-day window; never an unbounded history query',()=>{
  assert.match(current,/record_date>=\(now\(\) AT TIME ZONE aggregation_time_zone\)::date-29/u);
  assert.match(current,/record_date<=\(now\(\) AT TIME ZONE aggregation_time_zone\)::date/u);
  assert.match(current,/ORDER BY record_date DESC LIMIT 7/u);
  assert.doesNotMatch(current,/SELECT \*/iu);
});
test('existing V47 SQL RPC is unchanged except two safe date predicates',()=>{
  const upgraded=old.replace('record_date>=(now() AT TIME ZONE aggregation_time_zone)::date-6',
    'record_date>=(now() AT TIME ZONE aggregation_time_zone)::date-29\n      AND record_date<=(now() AT TIME ZONE aggregation_time_zone)::date');
  assert.equal(current.trim(),upgraded.trim());
});
test('V47 own-history read preserves owner scope, explicit client, assurance, no anon and no writes',()=>{
  for(const required of [
    'SECURITY DEFINER SET search_path TO \'\'',
    'v_owner uuid:=(SELECT auth.uid())',
    'v_client uuid:=public.iberfit_client_id()',
    'PERFORM public.iberfit_require_privileged_assurance_v65d()',
    'owner_user_id=v_owner AND client_id=v_client',
    "'sourceVerified',false",
    "'sourceIdentityVerified',false",
    'REVOKE ALL ON FUNCTION public.m26_wearable_v47_my_daily_prod_v1() FROM PUBLIC,anon',
    'GRANT EXECUTE ON FUNCTION public.m26_wearable_v47_my_daily_prod_v1() TO authenticated',
  ]) assert.ok(current.includes(required),required);
  assert.doesNotMatch(current,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER TABLE|GRANT SELECT ON TABLE)\b/iu);
  assert.doesNotMatch(current,/\bp_client\b|\bp_owner\b/iu);
});
test('V47 current authenticated Client integration retains one read with seven-row limit',()=>{
  const transport=readFileSync(new URL('../src/m26/supabase-transport.js',import.meta.url),'utf8');
  assert.match(transport,/prodDailySummary:'m26_wearable_v47_my_daily_prod_v1'/u);
  assert.match(transport,/dailyHealth.length>7/u);
  const app=readFileSync(new URL('../src/m26/app/application.js',import.meta.url),'utf8');
  assert.match(app,/connected360DailyProduction\(currentToken\(\)\)/u);
  assert.match(app,/mergeV47DailyIntoClientProgress/u);
});
