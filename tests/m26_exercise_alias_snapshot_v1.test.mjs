import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalogUrl = new URL('../baseline_m25_2/exercise-catalog-m25.json', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/20260921151500_exercise_catalog_alias_parity_v1.sql', import.meta.url);

const sortById = (rows) => [...rows].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

test('canonical alias migration is an exact snapshot of the versioned exercise catalog', async () => {
  const catalog = JSON.parse(await readFile(catalogUrl, 'utf8'));
  const sql = await readFile(migrationUrl, 'utf8');

  const canonical = sortById(catalog
    .filter((exercise) => Array.isArray(exercise.aliases) && exercise.aliases.length > 0)
    .map((exercise) => ({ id: exercise.id, aliases: exercise.aliases })));

  const match = sql.match(/v_payload jsonb := '(\[[\s\S]*?\])'::jsonb;/);
  assert.ok(match, 'migration canonical alias payload must be readable by the regression test');
  const snapshot = sortById(JSON.parse(match[1].replaceAll("''", "'")));

  assert.equal(canonical.length, 75);
  assert.equal(canonical.reduce((sum, row) => sum + row.aliases.length, 0), 161);
  assert.deepEqual(snapshot, canonical);

  assert.match(sql, /e\.source='IBERFIT_CANONICAL'/);
  assert.match(sql, /e\.review_status='validado_nucleo'/);
  assert.match(sql, /when e\.name_admin_override then/);
  assert.match(sql, /e\.aliases is distinct from d\.aliases/);
  assert.doesNotMatch(sql, /set\s+name_es\s*=/i);
  assert.doesNotMatch(sql, /set\s+load_direction\s*=/i);
});
