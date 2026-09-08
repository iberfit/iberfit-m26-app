import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20260908144500_admin_client_create_privileged_assurance_v26.sql', import.meta.url), 'utf8');

test('ADMIN client creation checks privileged assurance before delegating to the mutation implementation', () => {
  const assurance = migration.indexOf('iberfit_require_privileged_assurance_v65d()');
  const delegate = migration.indexOf('return public.iberfit_admin_create_client_v26_pre_privileged_assurance');
  assert.ok(assurance >= 0);
  assert.ok(delegate > assurance);
});

test('pre-assurance implementation cannot be executed directly by browser roles', () => {
  assert.match(migration, /revoke all on function public\.iberfit_admin_create_client_v26_pre_privileged_assurance\(jsonb,jsonb\) from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.iberfit_admin_create_client_v26\(jsonb,jsonb\) to authenticated/i);
});
