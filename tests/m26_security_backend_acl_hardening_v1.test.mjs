import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(
  'supabase/migrations/20261005164000_security_backend_acl_hardening_v1.sql',
  'utf8',
);
const inviteEdge=fs.readFileSync(
  'supabase/functions/iberfit-admin-client-invite-v1/index.ts',
  'utf8',
);

test('private auth activation trigger is not directly executable by application roles',()=>{
  assert.match(
    migration,
    /revoke execute on function private\.iberfit_sync_client_access_activation_v26\(\)[\s\S]*from public, anon, authenticated;/u,
  );
});

test('legacy invitation RPCs are revoked only when present so QA and PROD remain migration-compatible',()=>{
  for(const signature of [
    'public.iberfit_client_invitation_begin_v26(uuid,text)',
    'public.iberfit_client_invitation_fail_v26(uuid,text)',
    'public.iberfit_client_invitation_finalize_v26(uuid,uuid,text)',
  ]){
    assert.ok(migration.includes(`to_regprocedure('${signature}')`),signature);
    assert.ok(
      migration.includes(`revoke execute on function ${signature} from authenticated`),
      `missing authenticated revoke for ${signature}`,
    );
  }
});

test('current invitation transport depends only on canonical Admin invitation RPCs',()=>{
  for(const rpc of [
    'iberfit_admin_client_invitation_prepare_v26',
    'iberfit_admin_client_invitation_bind_v26',
    'iberfit_admin_client_invitation_finalize_v26',
  ])assert.ok(inviteEdge.includes(rpc),rpc);

  for(const legacy of [
    'iberfit_client_invitation_begin_v26',
    'iberfit_client_invitation_fail_v26',
    'iberfit_client_invitation_finalize_v26',
  ])assert.equal(inviteEdge.includes(legacy),false,legacy);
});

test('ACL hardening uses a named owner-only reconciliation routine instead of an anonymous block',()=>{
  const sql=migration.replace(/--[^\r\n]*/gu,' ');
  assert.match(sql,/create or replace function private\.iberfit_reconcile_security_backend_acl_v1\(\)/iu);
  assert.doesNotMatch(sql,/\bdo\s+(?:language\s+\w+\s+)?(?:\$\w*\$)/iu);
  assert.doesNotMatch(sql,/security\s+definer/iu);
  assert.match(
    migration,
    /revoke all on function private\.iberfit_reconcile_security_backend_acl_v1\(\)[\s\S]*from public, anon, authenticated;/iu,
  );
  assert.match(migration,/select private\.iberfit_reconcile_security_backend_acl_v1\(\);/iu);
});

test('ACL hardening is non-destructive and never revokes the canonical Admin RPCs',()=>{
  const sql=migration.replace(/--[^\r\n]*/gu,' ');
  assert.doesNotMatch(sql,/\bdrop\b|\bdelete\b|\btruncate\b|\bupdate\b|\binsert\b/iu);
  assert.doesNotMatch(
    sql,
    /revoke[\s\S]*iberfit_admin_client_invitation_(?:prepare|bind|finalize)_v26/iu,
  );
});
