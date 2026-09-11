import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(
  new URL('../supabase/migrations/20260911135500_active_execution_locks_least_privilege_v1.sql',import.meta.url),
  'utf8',
);

test('active execution locks remain RLS-protected internal state',()=>{
  assert.match(migration,/active_execution_locks_v26/);
  assert.match(migration,/relrowsecurity/);
  assert.doesNotMatch(migration,/create policy/i);
});

test('direct anon and authenticated grants are removed without opening RLS',()=>{
  assert.match(
    migration,
    /revoke select, references, trigger\s+on table public\.active_execution_locks_v26\s+from anon, authenticated;/i,
  );
  assert.match(migration,/DIRECT_GRANT_FORBIDDEN/);
  assert.doesNotMatch(migration,/grant\s+(?:select|insert|update|delete|all)[\s\S]*active_execution_locks_v26/i);
});

test('guarded command RPC surface is preserved and anon stays excluded',()=>{
  assert.match(migration,/iberfit_execute_command_v26\(jsonb\)/);
  assert.match(migration,/iberfit_command_preflight_v26\(jsonb\)/);
  assert.match(migration,/ANON_RPC_FORBIDDEN/);
  assert.match(migration,/AUTHENTICATED_RPC_REQUIRED/);
});
