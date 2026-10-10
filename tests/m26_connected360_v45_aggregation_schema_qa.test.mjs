import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(
  new URL('../supabase/qa-migrations/20261010200000_connected360_v45_aggregation_zone_qa.sql',import.meta.url),'utf8'
);
const rollback=readFileSync(
  new URL('../supabase/qa-rollbacks/20261010200000_connected360_v45_aggregation_zone_qa.rollback.sql',import.meta.url),'utf8'
);

test('v45 QA records civil aggregation zone separately from original sensor zone',()=>{
  assert.match(migration,/add column aggregation_time_zone text null/u);
  assert.match(migration,/aggregation_time_zone ~ /u);
  assert.match(migration,/length\(aggregation_time_zone\) between 1 and 80/u);
  assert.match(migration,/NOT a sensor\/source time zone/u);
  assert.match(migration,/NOT proof of the physical watch\/source zone/u);
  assert.doesNotMatch(migration,/alter\s+(?:table|column)[^;]*source_time_zone/iu);
  assert.doesNotMatch(migration,/source_updated_at\s*=|measured_at\s*=/iu);
  assert.doesNotMatch(migration,/\b(insert\s+into|update\s+public\.m26_wearable_source_daily_v45)\b/iu);
});

test('v45 QA additive migration refuses to weaken RLS, grants or native ingestion guard',()=>{
  for(const token of [
    'c.relrowsecurity and c.relforcerowsecurity',
    "m26_wearable_v45_block_unverified_write_qa_v1",
    "t.tgenabled='O'",
    "grantee in ('anon','authenticated')",
    'M26_CONNECTED360_V45_CLIENT_GRANTS_NOT_ALLOWED',
  ])assert.ok(migration.includes(token),token);
  assert.doesNotMatch(migration,/grant\s+(?:select|insert|update|delete|execute)\s+[^;]*\s+to\s+(?:anon|authenticated)/iu);
  assert.doesNotMatch(migration,/drop\s+trigger|disable\s+trigger|create\s+policy|security\s+definer/iu);
  assert.match(rollback,/where aggregation_time_zone is not null/u);
  assert.match(rollback,/M26_CONNECTED360_V45_AGGREGATION_ZONE_HAS_DATA/u);
  assert.doesNotMatch(rollback,/cascade/iu);
});

test('v45 schema remains explicitly QA-only with no production migration',async()=>{
  assert.match(migration,/NOT a sensor\/source time zone/u);
  const {existsSync}=await import('node:fs');
  assert.equal(existsSync(new URL('../supabase/migrations/20261010200000_connected360_v45_aggregation_zone_qa.sql',import.meta.url)),false);
});
