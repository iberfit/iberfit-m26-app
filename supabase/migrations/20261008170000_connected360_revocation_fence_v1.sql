-- IBERFIT Connected 360 · fence de revocación multisesión v1.
-- Aditivo, sin eliminar resúmenes ni consentimientos; conserva RPC RC44.
-- IBERFIT-TABLE-ACCESS: public.m26_wearable_revocation_fence_v1 :: authenticated: SELECT/INSERT own only; no UPDATE/DELETE.
-- IBERFIT-POLICY: public.m26_wearable_revocation_fence_v1 = rls-client
begin;

create table if not exists public.m26_wearable_revocation_fence_v1 (
  owner_user_id uuid not null,
  client_id uuid not null,
  provider text not null check (provider in (
    '*','normalized_file','health_connect','samsung_health','apple_health',
    'strava','garmin_connect','fitbit','oura'
  )),
  revoked_at timestamptz not null default pg_catalog.now(),
  constraint m26_wearable_revocation_fence_v1_pk primary key
    (owner_user_id,client_id,provider)
);
alter table public.m26_wearable_revocation_fence_v1 enable row level security;
revoke all on public.m26_wearable_revocation_fence_v1 from public,anon,authenticated;
grant select,insert on public.m26_wearable_revocation_fence_v1 to authenticated;
grant all on public.m26_wearable_revocation_fence_v1 to service_role;

create policy m26_wearable_fence_own_read_v1
  on public.m26_wearable_revocation_fence_v1 for select to authenticated
  using (owner_user_id=(select auth.uid())
    and client_id=public.iberfit_client_id());

create policy m26_wearable_fence_own_insert_v1
  on public.m26_wearable_revocation_fence_v1 for insert to authenticated
  with check (owner_user_id=(select auth.uid())
    and client_id=public.iberfit_client_id());

-- Un bloqueo por cliente por transacción serializa importación frente a revocación
-- incluso si todavía no existe una fila de estado para ese proveedor.
create or replace function public.m26_wearable_fence_write_gate_v1()
returns trigger
language plpgsql security invoker set search_path=''
as $fn$
declare
  v_owner uuid;
  v_client uuid;
  v_source text;
  v_actor uuid:=(select auth.uid());
  v_blocked boolean;
  v_log_revocation boolean:=false;
  v_check_write boolean:=false;
begin
  if tg_table_name='m26_wearable_connections_v44' then
    v_owner:=new.owner_user_id;
    v_client:=new.client_id;
    v_source:=new.provider;
    v_log_revocation:=new.status='revoked';
    v_check_write:=new.status='active';
  elsif tg_table_name='m26_wearable_daily_summaries_v44' then
    v_owner:=new.imported_by;
    v_client:=new.client_id;
    v_source:=new.provider;
    v_check_write:=true;
  elsif tg_table_name='m26_wearable_consents_v44' then
    v_owner:=new.actor_user_id;
    v_client:=new.client_id;
    v_source:=new.provider;
    v_log_revocation:=new.action in ('revoke','delete');
  else
    raise exception using message='M26_CONNECTED360_FENCE_TABLE_INVALID',errcode='42501';
  end if;
  if v_owner is null or v_client is null or v_source is null then
    raise exception using message='M26_CONNECTED360_FENCE_SCOPE_REQUIRED',errcode='42501';
  end if;
  if (v_actor is distinct from v_owner
      or v_client is distinct from public.iberfit_client_id())
      and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception using message='M26_CONNECTED360_FENCE_OWNER_REQUIRED',errcode='42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'iberfit:wfence:v1:'||v_owner::text||':'||v_client::text,0::bigint
    )
  );

  if v_log_revocation then
    insert into public.m26_wearable_revocation_fence_v1(
      owner_user_id,client_id,provider
    ) values(v_owner,v_client,v_source)
    on conflict do nothing;
    return new;
  end if;

  if v_check_write then
    select exists(
      select 1 from public.m26_wearable_revocation_fence_v1 f
      where f.owner_user_id=v_owner
        and f.client_id=v_client
        and f.provider in (v_source,'*')
    ) into v_blocked;
    if v_blocked then
      raise exception using message='M26_CONNECTED360_CONSENT_REVOKED',errcode='42501';
    end if;
  end if;
  return new;
end;
$fn$;
revoke all on function public.m26_wearable_fence_write_gate_v1()
  from public,anon,authenticated;

create trigger m26_wearable_connections_fence_v1
  before insert or update on public.m26_wearable_connections_v44
  for each row execute function public.m26_wearable_fence_write_gate_v1();

create trigger m26_wearable_summaries_fence_v1
  before insert or update on public.m26_wearable_daily_summaries_v44
  for each row execute function public.m26_wearable_fence_write_gate_v1();

create trigger m26_wearable_consents_fence_v1
  after insert on public.m26_wearable_consents_v44
  for each row execute function public.m26_wearable_fence_write_gate_v1();

-- Backfill de revocaciones existentes, conservando íntegro el historial.
insert into public.m26_wearable_revocation_fence_v1(
  owner_user_id,client_id,provider
)
select owner_user_id,client_id,provider
from public.m26_wearable_connections_v44
where status='revoked'
on conflict do nothing;

-- RC44 delete-all mantiene todos sus controles; añade fence global aunque
-- todavía no existan filas remotas (otro teléfono puede tener cola offline).
create or replace function public.m26_wearable_delete_all_v44()
returns jsonb
language plpgsql security invoker set search_path=''
as $fn$
declare
  v_client_id uuid;
  v_provider text;
  v_deleted integer:=0;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if auth.uid() is null then
    raise exception 'M26_RC44_AUTH_REQUIRED';
  end if;
  v_client_id:=public.iberfit_client_id();
  if v_client_id is null then
    raise exception 'M26_RC44_CLIENT_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'iberfit:wfence:v1:'||auth.uid()::text||':'||v_client_id::text,0::bigint
    )
  );
  insert into public.m26_wearable_revocation_fence_v1(
    owner_user_id,client_id,provider
  ) values(auth.uid(),v_client_id,'*')
  on conflict do nothing;

  for v_provider in
    select distinct provider from (
      select provider from public.m26_wearable_connections_v44
      where client_id=v_client_id
      union
      select provider from public.m26_wearable_daily_summaries_v44
      where client_id=v_client_id
    ) providers
  loop
    insert into public.m26_wearable_consents_v44(
      actor_user_id,client_id,provider,action,scopes,policy_version
    ) values(auth.uid(),v_client_id,v_provider,'delete','{}'::text[],'v44-zero-cost');
  end loop;
  delete from public.m26_wearable_daily_summaries_v44
  where client_id=v_client_id;
  get diagnostics v_deleted=row_count;
  delete from public.m26_wearable_connections_v44
  where owner_user_id=auth.uid() and client_id=v_client_id;
  return jsonb_build_object('ok',true,'deleted',true,'recordsDeleted',v_deleted,'clientId',v_client_id);
end;
$fn$;

comment on table public.m26_wearable_revocation_fence_v1 is
  'Tombstones de revocación por usuario/cliente/proveedor; * bloquea colas antiguas tras borrado global; nunca contiene biometría ni tokens.';
comment on function public.m26_wearable_fence_write_gate_v1() is
  'Control transaccional contra escrituras wearable posteriores a revocación, incluyendo llamadas directas y dispositivos concurrentes.';
commit;
