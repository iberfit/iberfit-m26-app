import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(
  here,
  '../supabase/migrations/20261001005911_execution_completion_scoped_result_keys_v1.sql',
);
const enginePath = resolve(here, '../src/m26/workflows/session-execution.js');
const migration = readFileSync(migrationPath, 'utf8');
const engine = readFileSync(enginePath, 'utf8');

test('completion validator migration mirrors canonical scoped result-key semantics', () => {
  assert.match(
    migration,
    /create or replace function public\.iberfit_validate_execution_completion_v26\(p_body jsonb\)/i,
  );
  assert.match(migration, /v_scope\s+text/i);
  assert.match(migration, /with ordinality as q\(candidate_item, candidate_idx\)/i);
  assert.match(migration, /v_compatible_count\s*>\s*1/i);
  assert.match(migration, /v_occurrence_index\s*=\s*v_first_compatible_index/i);
  assert.match(migration, /v_scope\s*\|\|\s*':'\s*\|\|\s*v_legacy_key/i);
  assert.match(migration, /p_body->'results'\)\s*\?\s*v_scoped_key/i);
  assert.match(migration, /p_body->'skippedSets'.*v_scoped_key/is);
  assert.match(migration, /p_body->'results'\)\s*\?\s*v_legacy_key/i);
  assert.match(migration, /p_body->'skippedSets'.*v_legacy_key/is);
});

test('completion migration preserves the deployed v26 validation and response contract', () => {
  assert.match(migration, /jsonb_typeof\(p_body\) is distinct from 'object'/i);
  assert.match(migration, /jsonb_array_length\(p_body->'queue'\)\s*=\s*0/i);
  assert.match(migration, /M26_EXECUTION_COMPLETION_SNAPSHOT_INVALID/);
  assert.match(migration, /M26_EXECUTION_FEEDBACK_REQUIRED/);
  assert.match(migration, /M26_EXECUTION_SESSION_RPE_REQUIRED/);
  assert.match(migration, /M26_EXECUTION_PAIN_FLAG_REQUIRED/);
  assert.match(migration, /M26_EXECUTION_PAIN_NOTES_REQUIRED/);
  assert.match(migration, /M26_EXECUTION_NOT_READY_TO_COMPLETE/);

  assert.match(
    migration,
    /'ok',true,\s*'feedback',jsonb_build_object\(/i,
    'successful validation must continue returning normalized feedback',
  );
  assert.match(migration, /'comment',left\(btrim\(v_feedback->>'comment'\),2000\)/i);
  assert.match(
    migration,
    /'painNotes',left\(btrim\(coalesce\(v_feedback->>'painNotes',''\)\),1000\)/i,
  );
  assert.doesNotMatch(migration, /M26_EXECUTION_COMPLETION_ALLOWED/);
  assert.doesNotMatch(migration, /M26_EXECUTION_FEEDBACK_INVALID/);
  assert.doesNotMatch(migration, /M26_EXECUTION_COMPLETION_EVENT_MISSING/);
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
    /v_scope\s*<>\s*''[\s\S]*?p_body->'results'\)\s*\?\s*v_scoped_key[\s\S]*?p_body->'skippedSets'[\s\S]*?v_scoped_key/i,
  );
  assert.match(
    migration,
    /v_can_use_legacy_key[\s\S]*?p_body->'results'\)\s*\?\s*v_legacy_key[\s\S]*?p_body->'skippedSets'[\s\S]*?v_legacy_key/i,
  );
  assert.match(migration, /'missingResultKey',v_expected_key/i);
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
