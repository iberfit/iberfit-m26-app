import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const migrationPath = 'supabase/migrations/20260925023500_process_operation_plpgsql_ambiguity_fix_v1.sql';
const sql = fs.readFileSync(migrationPath, 'utf8');

test('process_operation migration removes PL/pgSQL variable/column ambiguity', () => {
  assert.match(sql, /v_entity_type\s+text\s*:=/u);
  assert.match(sql, /v_entity_id\s+text\s*:=/u);
  assert.doesNotMatch(sql, /^\s*entity_type\s+text\s*:=/mu);
  assert.doesNotMatch(sql, /^\s*entity_id\s+text\s*:=/mu);
  assert.doesNotMatch(sql, /public\.iberfit_process_operation\.entity_(?:type|id)/u);
  assert.match(sql, /from public\.sync_entities as se[\s\S]*se\.entity_type\s*=\s*v_entity_type[\s\S]*se\.entity_id\s*=\s*v_entity_id/u);
});

test('process_operation migration preserves security and privileged-assurance contract', () => {
  assert.match(sql, /language plpgsql[\s\S]*security invoker[\s\S]*set search_path\s*=\s*''/u);
  assert.match(sql, /perform public\.iberfit_require_privileged_assurance_v65d\(\)/u);
  assert.match(sql, /revoke all on function public\.iberfit_process_operation\(jsonb\) from public,anon/u);
  assert.match(sql, /grant execute on function public\.iberfit_process_operation\(jsonb\) to authenticated,service_role/u);
});
