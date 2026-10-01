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
  assert.match(migration, /v_item_index\s*=\s*v_first_compatible_index/i);
  assert.match(migration, /v_scope\s*\|\|\s*':'\s*\|\|\s*v_legacy_key/i);
  assert.match(migration, /v_results\s*\?\s*v_scoped_key/i);
  assert.match(migration, /v_skipped_sets\s*\?\s*v_scoped_key/i);
  assert.match(migration, /v_results\s*\?\s*v_legacy_key/i);
  assert.match(migration, /v_skipped_sets\s*\?\s*v_legacy_key/i);
});

test('migration carries executable assertions for the original collision and compatibility cases', () => {
  assert.match(migration, /canonical scoped results rejected/i);
  assert.match(migration, /duplicate legacy key over-accepted/i);
  assert.match(migration, /per-set scope mismatch/i);
  assert.match(migration, /scoped skipped set rejected/i);
  assert.match(migration, /block-b:same-exercise:1/i);
  assert.match(migration, /mixed-exercise:2/i);
});

test('backend contract remains tied to the same collision rule used by the live JS engine', () => {
  assert.match(
    engine,
    /compatible\.length\s*>\s*1/,
    'engine must continue detecting result-key collisions per compatible exercise/set occurrence',
  );
  assert.match(
    engine,
    /entryIndex\s*===\s*firstCompatibleIndex/,
    'engine must continue limiting legacy fallback to the first compatible occurrence',
  );
  assert.match(
    engine,
    /return scopedResultKey\(step\)/,
    'engine must continue writing scoped keys for colliding block occurrences',
  );

  assert.match(migration, /v_compatible_count\s*>\s*1/);
  assert.match(migration, /v_item_index\s*=\s*v_first_compatible_index/);
});
