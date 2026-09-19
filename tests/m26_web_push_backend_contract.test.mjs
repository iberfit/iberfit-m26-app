import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(
  new URL('../supabase/migrations/20260919183000_web_push_subscriptions_v1.sql',import.meta.url),
  'utf8',
);

function functionBody(name){
  const marker=`create or replace function public.${name}`;
  const start=migration.toLowerCase().indexOf(marker.toLowerCase());
  assert.notEqual(start,-1,`${name} missing`);
  const next=migration.toLowerCase().indexOf('create or replace function public.',start+marker.length);
  return migration.slice(start,next===-1?migration.length:next);
}

test('web push subscription state is internal, RLS-forced and unavailable by direct client grants',()=>{
  assert.match(migration,/create table if not exists public\.iberfit_web_push_subscriptions/i);
  assert.match(migration,/enable row level security/i);
  assert.match(migration,/force row level security/i);
  assert.match(migration,/revoke all on table public\.iberfit_web_push_subscriptions from public, anon, authenticated;/i);
  assert.match(migration,/grant all on table public\.iberfit_web_push_subscriptions to service_role;/i);
  assert.doesNotMatch(migration,/grant\s+(?:select|insert|update|delete|all)\s+on table public\.iberfit_web_push_subscriptions to authenticated/i);
});

test('upsert is identity scoped and derives exactly one active organization membership',()=>{
  const body=functionBody('iberfit_web_push_upsert_v1');
  assert.match(body,/security definer/i);
  assert.match(body,/set search_path = ''/i);
  assert.match(body,/auth\.uid\(\)/i);
  assert.match(body,/iberfit_organization_memberships/i);
  assert.match(body,/m\.user_id = v_user_id/i);
  assert.match(body,/m\.status = 'active'/i);
  assert.match(body,/cardinality\(v_org_ids\) <> 1/i);
  assert.match(body,/organization_context_ambiguous/i);
});

test('subscription payload is validated before persistence and responses do not expose endpoint keys',()=>{
  const body=functionBody('iberfit_web_push_upsert_v1');
  assert.match(body,/left\(v_endpoint, 8\) <> 'https:\/\/'/i);
  assert.match(body,/invalid_push_p256dh/i);
  assert.match(body,/invalid_push_auth/i);
  assert.match(body,/invalid_push_expiration/i);
  const returnBlock=body.slice(body.lastIndexOf('return jsonb_build_object'));
  assert.doesNotMatch(returnBlock,/'endpoint'|'p256dh'|'auth_key'/i);
  assert.match(returnBlock,/'subscriptionId'/i);
});

test('status and revoke can only inspect or delete rows belonging to auth.uid()',()=>{
  const status=functionBody('iberfit_web_push_status_v1');
  const revoke=functionBody('iberfit_web_push_revoke_v1');
  assert.match(status,/s\.user_id = v_user_id/i);
  assert.match(revoke,/s\.user_id = v_user_id/i);
  assert.match(revoke,/delete from public\.iberfit_web_push_subscriptions/i);
  assert.doesNotMatch(status,/select\s+.*endpoint/is);
});

test('RPC grants exclude anon/public and allow authenticated callers only through narrow functions',()=>{
  for(const signature of [
    'iberfit_web_push_status_v1\\(\\)',
    'iberfit_web_push_upsert_v1\\(jsonb\\)',
    'iberfit_web_push_revoke_v1\\(text\\)',
  ]){
    assert.match(migration,new RegExp(`revoke all on function public\\.${signature} from public, anon;`,'i'));
    assert.match(migration,new RegExp(`grant execute on function public\\.${signature} to authenticated;`,'i'));
  }
});
