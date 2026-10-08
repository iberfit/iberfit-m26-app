-- Connected 360 v5: additive storage for non-normalized provider grants.
-- Original normalized_file authorization constraint remains unchanged.
-- IBERFIT-TABLE-ACCESS: public.m26_wearable_authorization_sources_v3 :: authenticated SELECT own client only; RPC controls writes.
-- IBERFIT-POLICY: public.m26_wearable_authorization_sources_v3 = rls-client
begin;
create table if not exists public.m26_wearable_authorization_sources_v3 (
 owner_user_id uuid not null,
 client_id uuid not null,
 provider text not null check(provider in
   ('health_connect','samsung_health','apple_health','strava','garmin_connect','fitbit','oura')),
 grant_id uuid not null default gen_random_uuid(),
 revocation_cursor bigint not null default 0 check(revocation_cursor>=0),
 scopes text[] not null,
 granted_at timestamptz not null default now(),
 constraint m26_wearable_authorization_sources_v3_pk primary key(owner_user_id,client_id,provider)
);
alter table public.m26_wearable_authorization_sources_v3 enable row level security;
revoke all on public.m26_wearable_authorization_sources_v3 from public,anon,authenticated;
grant select on public.m26_wearable_authorization_sources_v3 to authenticated;
grant all on public.m26_wearable_authorization_sources_v3 to service_role;
create policy m26_wearable_authorization_sources_read_v3
 on public.m26_wearable_authorization_sources_v3 for select to authenticated
 using(owner_user_id=(select auth.uid()) and client_id=public.iberfit_client_id());
commit;
