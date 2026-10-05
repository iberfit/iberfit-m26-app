import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(
  'supabase/migrations/20261005234500_canary_enabled_rpc_least_privilege_v1.sql',
  'utf8',
);

test('Canary enrolment lookup is no longer directly executable by application roles',()=>{
  assert.match(
    migration,
    /revoke all on function public\.iberfit_canary_enabled_v26\(uuid\)[\s\S]*from public, anon, authenticated/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.iberfit_canary_enabled_v26\(uuid\)[\s\S]*to service_role/u,
  );
});

test('hardening keeps the function intact and only changes its direct ACL',()=>{
  assert.doesNotMatch(migration,/drop function|create or replace function|alter function/u);
  assert.match(migration,/notify pgrst, 'reload schema'/u);
});
