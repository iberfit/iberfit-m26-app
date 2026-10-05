import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(
  'supabase/migrations/20261005235000_canary_enabled_rpc_scoped_disclosure_v1.sql',
  'utf8',
);

test('Canary enrolment disclosure is scoped to clients the caller can access',()=>{
  assert.match(
    migration,
    /public\.iberfit_can_access_client_v26\(p_client_id\)[\s\S]*exists\([\s\S]*public\.m26_canary_clients_v26/u,
  );
  assert.match(migration,/p_client_id is not null/u);
  assert.match(migration,/coalesce\([\s\S]*false[\s\S]*\)/u);
});

test('RLS-compatible ACL is preserved without anon or PUBLIC exposure',()=>{
  assert.match(
    migration,
    /revoke all on function public\.iberfit_canary_enabled_v26\(uuid\)[\s\S]*from public, anon/u,
  );
  assert.match(
    migration,
    /grant execute on function public\.iberfit_canary_enabled_v26\(uuid\)[\s\S]*to authenticated, service_role/u,
  );
  assert.doesNotMatch(migration,/from public, anon, authenticated/u);
});

test('function keeps the existing stable SECURITY DEFINER contract',()=>{
  assert.match(migration,/returns boolean[\s\S]*language sql[\s\S]*stable[\s\S]*security definer[\s\S]*set search_path=''/u);
  assert.doesNotMatch(migration,/drop function|alter function/u);
});
