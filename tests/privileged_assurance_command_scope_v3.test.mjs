import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migrationPath = 'supabase/migrations/20260920015340_privileged_assurance_command_scope_v3.sql';

function functionBody(sql, functionName) {
  const marker = `create or replace function public.${functionName}(p_command jsonb)`;
  const start = sql.toLowerCase().indexOf(marker.toLowerCase());
  assert.notEqual(start, -1, `${functionName} must exist in migration`);
  const next = sql.toLowerCase().indexOf('\ncreate or replace function public.', start + marker.length);
  return sql.slice(start, next === -1 ? sql.length : next);
}

for (const [name, delegate] of [
  ['iberfit_command_preflight_v26_pre_crm_renewal', 'iberfit_command_preflight_v26_pre_v65e'],
  ['iberfit_execute_command_v26_pre_crm_renewal', 'iberfit_execute_command_v26_pre_v65e'],
]) {
  test(`${name} guards only explicit privileged commands`, async () => {
    const sql = await readFile(migrationPath, 'utf8');
    const body = functionBody(sql, name);

    assert.match(
      body,
      /if\s+v_type\s+in\s*\(\s*'RENOVACION_REGISTRAR'\s*,\s*'CHECKIN_ANULAR'\s*\)\s+then[\s\S]*?perform\s+public\.iberfit_require_privileged_assurance_v65d\(\);[\s\S]*?end\s+if;/i,
    );
    assert.doesNotMatch(body, /conflict_sensitive/i);
    assert.doesNotMatch(body, /domain_command_registry_v26/i);
    assert.match(body, new RegExp(`return\\s+public\\.${delegate}\\(p_command\\);`, 'i'));

    const assuranceCalls = body.match(/iberfit_require_privileged_assurance_v65d\(\)/gi) ?? [];
    assert.equal(assuranceCalls.length, 1, 'wrapper must contain exactly one explicit assurance call');
  });
}
