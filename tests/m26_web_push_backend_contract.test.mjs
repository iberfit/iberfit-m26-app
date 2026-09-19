import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrations=[
  '../supabase/migrations/20260919183000_web_push_subscriptions_v1.sql',
  '../supabase/migrations/20260919184500_web_push_subscription_ownership_guard.sql',
  '../supabase/migrations/20260919222000_web_push_device_status_v1.sql',
  '../supabase/migrations/20260919230000_web_push_delivery_preferences_v1.sql',
  '../supabase/migrations/20260919231500_notification_preferences_partial_update_v1.sql',
].map(path=>fs.readFileSync(new URL(path,import.meta.url),'utf8'));
const migration=migrations.join('\n');

function functionBody(name){
  const marker=`create or replace function public.${name}`.toLowerCase();
  const source=migration.toLowerCase();
  const start=source.lastIndexOf(marker);
  assert.notEqual(start,-1,`${name} missing`);
  const next=source.indexOf('create or replace function public.',start+marker.length);
  return migration.slice(start,next===-1?migration.length:next);
}

test('web push subscription state is internal, RLS-forced and unavailable by direct client grants',()=>{
  assert.match(migration,/create table if not exists public\.iberfit_web_push_subscriptions/i);
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
});

test('device status is scoped to auth.uid() and the supplied HTTPS endpoint',()=>{
  const status=functionBody('iberfit_web_push_status_v1');
  assert.match(status,/p_endpoint text default null/i);
  assert.match(status,/auth\.uid\(\)/i);
  assert.match(status,/s\.user_id = v_user_id/i);
  assert.match(status,/s\.endpoint = v_endpoint/i);
  assert.match(status,/left\(v_endpoint, 8\) <> 'https:\/\/'/i);
});

test('notification preferences are private and browser access is RPC-only',()=>{
  assert.match(migration,/create table if not exists public\.iberfit_notification_preferences/i);
  assert.match(migration,/alter table public\.iberfit_notification_preferences force row level security/i);
  assert.match(migration,/revoke all on table public\.iberfit_notification_preferences from public, anon, authenticated/i);
  const status=functionBody('iberfit_notification_preferences_status_v1');
  const upsert=functionBody('iberfit_notification_preferences_upsert_v1');
  for(const body of [status,upsert]){
    assert.match(body,/auth\.uid\(\)/i);
    assert.match(body,/iberfit_organization_memberships/i);
    assert.match(body,/cardinality\(v_org_ids\) <> 1/i);
    assert.match(body,/set search_path = ''/i);
  }
  assert.match(upsert,/jsonb_typeof\(p_preferences->v_key\) <> 'boolean'/i);
});

test('notification enqueue is consent gated, subscription gated and deduplicated',()=>{
  const body=functionBody('iberfit_web_push_enqueue_notification_v1');
  assert.match(body,/iberfit_notification_preferences/i);
  assert.match(body,/iberfit_web_push_subscriptions/i);
  assert.match(body,/status = 'active'/i);
  assert.match(body,/on conflict \(channel, dedupe_key\)/i);
  assert.match(body,/'notification:' \|\| new\.id::text/i);
  assert.match(migration,/create unique index if not exists iberfit_notification_deliveries_push_dedupe_uidx/i);
});

test('delivery claim is service-role-only and never granted to browser roles',()=>{
  const claim=functionBody('iberfit_web_push_claim_v1');
  const finalize=functionBody('iberfit_web_push_finalize_v1');
  assert.match(claim,/for update skip locked/i);
  assert.match(claim,/iberfit_web_push_delivery_attempts/i);
  assert.match(finalize,/p_outcome/i);
  for(const signature of ['iberfit_web_push_claim_v1\\(integer\\)','iberfit_web_push_finalize_v1\\(uuid,text,integer,text\\)']){
    assert.match(migration,new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated;`,'i'));
    assert.match(migration,new RegExp(`grant execute on function public\\.${signature} to service_role;`,'i'));
    assert.doesNotMatch(migration,new RegExp(`grant execute on function public\\.${signature} to authenticated;`,'i'));
  }
});

test('dispatch authorization is bound to the authenticated actor and recent MESSAGE_SEND receipt',()=>{
  const body=functionBody('iberfit_web_push_dispatch_authorize_v1');
  assert.match(body,/auth\.uid\(\)/i);
  assert.match(body,/r\.actor_user_id = v_user_id/i);
  assert.match(body,/r\.command_type = 'MESSAGE_SEND'/i);
  assert.match(body,/interval '15 minutes'/i);
  assert.match(body,/iberfit_web_push_dispatch_kicks/i);
});

test('browser-facing RPC grants exclude anon/public and expose only intended authenticated functions',()=>{
  for(const signature of [
    'iberfit_web_push_status_v1\\(text\\)',
    'iberfit_web_push_upsert_v1\\(jsonb\\)',
    'iberfit_web_push_revoke_v1\\(text\\)',
    'iberfit_notification_preferences_status_v1\\(\\)',
    'iberfit_notification_preferences_upsert_v1\\(jsonb\\)',
    'iberfit_web_push_dispatch_authorize_v1\\(text\\)',
  ]){
    assert.match(migration,new RegExp(`revoke all on function public\\.${signature} from public, anon(?:, authenticated)?;`,'i'));
    assert.match(migration,new RegExp(`grant execute on function public\\.${signature} to authenticated;`,'i'));
  }
});
