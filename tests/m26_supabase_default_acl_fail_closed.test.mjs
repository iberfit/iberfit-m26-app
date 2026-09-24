import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const migrationPath=new URL('../supabase/migrations/20260924033000_public_table_default_privileges_fail_closed_v1.sql',import.meta.url);
const sql=await readFile(migrationPath,'utf8');
const normalized=sql.toLowerCase().replace(/\s+/gu,' ');

test('default ACL hardening is scoped to future postgres-owned public tables',()=>{
  assert.match(normalized,/alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;/);
  assert.match(normalized,/current_user <> 'postgres'/);
  assert.match(normalized,/to_regrole\('anon'\)/);
  assert.match(normalized,/to_regrole\('authenticated'\)/);
  assert.match(normalized,/to_regrole\('service_role'\)/);
});

test('migration self-certifies the resulting default ACL catalog',()=>{
  assert.match(normalized,/cross join lateral aclexplode\(d\.defaclacl\)/);
  assert.match(normalized,/pg_get_userbyid\(d\.defaclrole\) = 'postgres'/);
  assert.match(normalized,/n\.nspname = 'public'/);
  assert.match(normalized,/d\.defaclobjtype = 'r'/);
  assert.match(normalized,/iberfit_public_table_default_acl_not_fail_closed/);
});

test('migration behaviorally probes a newly created table and removes the probe',()=>{
  assert.match(normalized,/create table public\.iberfit_default_acl_probe_v1 \(id integer\)/);
  assert.match(normalized,/has_table_privilege\('anon', 'public\.iberfit_default_acl_probe_v1', 'select'\)/);
  assert.match(normalized,/has_table_privilege\('authenticated', 'public\.iberfit_default_acl_probe_v1', 'select'\)/);
  assert.match(normalized,/has_table_privilege\('service_role', 'public\.iberfit_default_acl_probe_v1', 'select'\)/);
  assert.match(normalized,/iberfit_public_table_default_acl_probe_exposed/);
  assert.match(normalized,/iberfit_public_table_default_acl_probe_owner_unexpected/);
  assert.match(normalized,/drop table public\.iberfit_default_acl_probe_v1/);
});

test('existing tables and rows are not mutated by the hardening migration',()=>{
  const executable=sql
    .replace(/^\s*--.*$/gmu,'')
    .replace(/\$[A-Za-z_0-9]*\$[\s\S]*?\$[A-Za-z_0-9]*\$/gu,'');
  assert.doesNotMatch(executable,/\b(?:create|drop|truncate)\s+table\b/iu);
  assert.doesNotMatch(executable,/\balter\s+table\b/iu);
  assert.doesNotMatch(executable,/\b(?:insert\s+into|update|delete\s+from)\b/iu);
  assert.doesNotMatch(executable,/\b(?:grant|revoke)\b[\s\S]*?\bon\s+table\b/iu);
});

test('migration documents a deterministic emergency rollback',()=>{
  assert.match(normalized,/rollback \(emergency only\)/);
  assert.match(normalized,/grant all on tables to anon, authenticated, service_role;/);
});
