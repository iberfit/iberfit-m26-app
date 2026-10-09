import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeMigration,findCreatedTables} from '../scripts/ci/check_migration_security_policy.mjs';

const SQL_PATH=new URL('../supabase/qa-migrations/20261009221320_connected360_v45_closed_provenance_qa.sql',import.meta.url);
const ROLLBACK_PATH=new URL('../supabase/qa-rollbacks/20261009221320_connected360_v45_closed_provenance_qa.rollback.sql',import.meta.url);
const sql=readFileSync(SQL_PATH,'utf8');
const rollback=readFileSync(ROLLBACK_PATH,'utf8');

test('v45 QA source provenance migration passes repository table security policy',()=>{
  assert.deepEqual(analyzeMigration(sql,{file:'QA-only v45 provenance'}),[]);
  assert.deepEqual(findCreatedTables(sql).map(t=>t.schema+'.'+t.table),
    ['public.m26_wearable_source_daily_v45']);
  assert.match(sql,/enable row level security/iu);
  assert.match(sql,/force row level security/iu);
  assert.match(sql,/revoke all on table public\.m26_wearable_source_daily_v45\s+from public,anon,authenticated/iu);
  assert.match(sql,/grant select,insert,update,delete\s+on table public\.m26_wearable_source_daily_v45 to service_role/iu);
  assert.doesNotMatch(sql,/create policy|security definer|grant\s+\w+(?:,\w+)*\s+on\s+table\s+public\.m26_wearable_source_daily_v45\s+to\s+(?:anon|authenticated)/iu);
});

test('v45 QA data model does not infer source timestamps and requires bounded physical source identity',()=>{
  assert.match(sql,/measured_at timestamptz null/iu);
  assert.match(sql,/source_updated_at timestamptz null/iu);
  assert.match(sql,/acquired_at timestamptz not null/iu);
  assert.match(sql,/imported_at timestamptz not null default now\(\)/iu);
  assert.match(sql,/source_key text null check \(source_key is null or source_key ~/iu);
  assert.match(sql,/source_time_verified = false and measured_at is null\s+and source_updated_at is null and quality = 'limitada'/iu);
  assert.match(sql,/automatic_sync_certified = false/iu);
  assert.doesNotMatch(sql,/coalesce\(\s*measured_at|source_updated_at\s+default\s+now|update\s+public\.m26_wearable_daily_summaries_v44/iu);
});

test('known and unknown sources have separate unique daily keys without invented sentinel',()=>{
  assert.match(sql,/create unique index m26_wearable_source_daily_v45_known_source_uq[\s\S]*?where source_key is not null;/iu);
  assert.match(sql,/create unique index m26_wearable_source_daily_v45_unknown_source_uq[\s\S]*?where source_key is null;/iu);
  assert.match(sql,/source_record_count between 1 and 100000/iu);
  assert.match(sql,/client_id uuid not null references public\.clients\(id\) on delete cascade/iu);
  assert.match(sql,/owner_user_id uuid not null references auth\.users\(id\) on delete cascade/iu);
});

test('QA staging has no live import, sync activation or backfill',()=>{
  assert.doesNotMatch(sql,/(?:insert\s+into|update\s+public\.m26_wearable_|delete\s+from|truncate\s+table|create\s+or\s+replace\s+function)/iu);
  assert.match(sql,/no historical import/iu);
  assert.match(sql,/no app read\/write path/iu);
});

test('manual rollback refuses to remove a populated provenance table',()=>{
  assert.match(rollback,/ROLLBACK_NONEMPTY_FORBIDDEN/u);
  assert.match(rollback,/if exists\(select 1 from public\.m26_wearable_source_daily_v45 limit 1\)/iu);
  assert.match(rollback,/drop table public\.m26_wearable_source_daily_v45;/iu);
  assert.doesNotMatch(rollback,/drop\s+table\s+[^;]+\s+cascade\s*;/iu);
});
