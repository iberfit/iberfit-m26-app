import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  '../supabase/migrations/20261001003000_execution_completion_scoped_result_keys_v1.sql',
);
const enginePath = resolve(here, '../src/m26/workflows/session-execution.js');
const migration = readFileSync(migrationPath, 'utf8');
const engine = readFileSync(enginePath, 'utf8');

test('completion validator migration mirrors canonical scoped result-key semantics', () => {
  assert.match(
    migration,
    /create or replace function public\.iberfit_validate_execution_completion_v26\(p_execution jsonb\)/i,
  );
  assert.match(migration, /v_scope\s+text/i);
  assert.match(migration, /with ordinality as q\(candidate_item, candidate_idx\)/i);
  assert.match(migration, /v_compatible_count\s*>\s*1/i);
  assert.match(migration, /v_occurrence_index\s*=\s*v_first_compatible_index/i);
  assert.match(migration, /v_scope\s*\|\|\s*':'\s*\|\|\s*v_legacy_key/i);
  assert.match(migration, /v_results\s*\?\s*v_scoped_key/i);
  assert.match(migration, /v_skipped_sets\s*\?\s*v_scoped_key/i);
  assert.match(migration, /v_results\s*\?\s*v_legacy_key/i);
  assert.match(migration, /v_skipped_sets\s*\?\s*v_legacy_key/i);
});

test('completion migration remains additive and does not bypass production data-safety policy', () => {
  assert.doesNotMatch(migration, /\bdo\s+\$[a-zA-Z0-9_]*\$/i);
  assert.doesNotMatch(migration, /\b(?:insert|update|delete|merge|truncate)\b\s+(?:into\s+|from\s+)?public\./i);
  assert.doesNotMatch(migration, /\bdrop\s+(?:table|function|procedure|type|index|policy|trigger|sequence|extension)\b/i);
});

test('backend contract encodes per-set collision, bounded legacy fallback and skipped-set resolution', () => {
  assert.match(migration, /v_compatible_count\s*>\s*1/i);
  assert.match(
    migration,
    /v_can_use_legacy_key\s*:=\s*not\s+v_requires_scoped_key\s*\n\s*or\s+v_occurrence_index\s*=\s*v_first_compatible_index/i,
  );
  assert.match(
    migration,
    /v_scope\s*<>\s*''\s*\n\s*and\s*\(\(v_results\s*\?\s*v_scoped_key\)\s*or\s*\(v_skipped_sets\s*\?\s*v_scoped_key\)\)/i,
  );
  assert.match(
    migration,
    /v_can_use_legacy_key\s*\n\s*and\s*\(\(v_results\s*\?\s*v_legacy_key\)\s*or\s*\(v_skipped_sets\s*\?\s*v_legacy_key\)\)/i,
  );
  assert.match(migration, /'missingResultKey',\s*v_expected_key/i);
});

test('backend contract remains tied to the same collision rule used by the live JS engine', () => {
  assert.match(
    engine,
    /compatible\.length\s*>\s*1/,
    'engine must continue detecting result-key collisions per compatible exercise/set occurrence',
  );
  assert.match(
    engine,
    /occurrenceIndex\s*>?=\s*0\s*&&\s*occurrenceIndex\s*===\s*firstCompatibleIndex/,
    'engine must continue limiting legacy fallback to the first compatible occurrence',
  );
  assert.match(
    engine,
    /resultKey\(step\.exerciseId,setNumber,requiresScopedEntry\(execution,step,setNumber\)\?step\.blockId\|\|null:null\)/,
    'engine must continue writing scoped keys only when an exercise/set collision requires them',
  );

  assert.match(migration, /v_compatible_count\s*>\s*1/);
  assert.match(migration, /v_occurrence_index\s*=\s*v_first_compatible_index/);
});
