-- IBERFIT M26 RC74.4H · OPERATION IDENTITY HARDENING · QA ONLY
do $guard$
declare v_env jsonb;
begin
  v_env:=public.iberfit_environment();
  if coalesce(v_env->>'environment','')<>'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true) is not false
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'M26_RC74_4H_QA_ENVIRONMENT_GUARD_FAILED';
  end if;
  if to_regprocedure('public.iberfit_command_preflight_v26(jsonb)') is null
     or to_regprocedure('public.iberfit_execute_command_v26(jsonb)') is null then
    raise exception 'M26_RC74_4H_COMMAND_RPC_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_command_preflight_v26_pre_rc74_4h(jsonb)') is not null
     or to_regprocedure('public.iberfit_execute_command_v26_pre_rc74_4h(jsonb)') is not null then
    raise exception 'M26_RC74_4H_ALREADY_WRAPPED';
  end if;
end
$guard$;

create table public.command_operation_identities_v26(
  operation_id uuid primary key,
  command_hash text not null check (command_hash ~ '^[0-9a-f]{64}$'),
  command_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  base_revision bigint not null check(base_revision>=0),
  claimed_at timestamptz not null default now()
);
alter table public.command_operation_identities_v26 enable row level security;
revoke all on table public.command_operation_identities_v26 from public,anon,authenticated;
grant select,insert on table public.command_operation_identities_v26 to service_role;

create or replace function public.iberfit_operation_identity_guard_v26(p_command jsonb,p_claim boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_prepared jsonb;
  v_operation_id uuid;
  v_entity_id uuid;
  v_client_id uuid;
  v_base_revision bigint;
  v_command_type text;
  v_entity_type text;
  v_hash text;
  v_payload_hash text;
  v_identity public.command_operation_identities_v26%rowtype;
  v_receipt public.command_receipts_v26%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  v_prepared:=public.iberfit_prepare_command_rc30_v26(p_command);
  v_operation_id:=nullif(v_prepared->>'operationId','')::uuid;
  v_command_type:=nullif(v_prepared->>'type','');
  v_entity_type:=nullif(v_prepared->>'entityType','');
  v_entity_id:=nullif(v_prepared->>'entityId','')::uuid;
  v_client_id:=nullif(v_prepared->>'clientId','')::uuid;
  v_base_revision:=nullif(v_prepared->>'baseRevision','')::bigint;
  if v_operation_id is null or v_command_type is null or v_entity_type is null
     or v_entity_id is null or v_client_id is null or v_base_revision is null then
    raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
  end if;
  if not public.iberfit_can_access_client_v26(v_client_id) then
    raise exception 'CLIENT_ACCESS_DENIED' using errcode='42501';
  end if;

  v_hash:=encode(extensions.digest(v_prepared::text,'sha256'),'hex');
  perform pg_advisory_xact_lock(hashtextextended('m26-operation:'||v_operation_id::text,0));

  select * into v_identity from public.command_operation_identities_v26 where operation_id=v_operation_id;
  if found then
    if v_identity.command_hash<>v_hash
       or v_identity.command_type<>v_command_type
       or v_identity.entity_type<>v_entity_type
       or v_identity.entity_id<>v_entity_id
       or v_identity.client_id<>v_client_id
       or v_identity.actor_user_id<>auth.uid()
       or v_identity.base_revision<>v_base_revision then
      return jsonb_build_object('ok',false,'reason','OPERATION_ID_COLLISION','operationId',v_operation_id);
    end if;
    return jsonb_build_object('ok',true,'operationId',v_operation_id,'existingIdentity',true);
  end if;

  select * into v_receipt from public.command_receipts_v26 where operation_id=v_operation_id;
  if found then
    select e.payload_hash into v_payload_hash
    from public.command_events_v26 e
    where e.operation_id=v_operation_id and e.phase='applied' and e.payload_hash is not null
    order by e.id desc limit 1;
    if v_receipt.command_type<>v_command_type
       or v_receipt.entity_type<>v_entity_type
       or v_receipt.entity_id<>v_entity_id
       or v_receipt.client_id<>v_client_id
       or v_receipt.actor_user_id<>auth.uid()
       or v_receipt.base_revision<>v_base_revision
       or v_payload_hash is null
       or v_payload_hash<>md5(coalesce(v_prepared->'payload','{}'::jsonb)::text) then
      return jsonb_build_object('ok',false,'reason','OPERATION_ID_COLLISION','operationId',v_operation_id);
    end if;
    if p_claim then
      insert into public.command_operation_identities_v26(operation_id,command_hash,command_type,entity_type,entity_id,client_id,actor_user_id,base_revision)
      values(v_operation_id,v_hash,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_base_revision)
      on conflict(operation_id) do nothing;
    end if;
    return jsonb_build_object('ok',true,'operationId',v_operation_id,'legacyReceiptVerified',true);
  end if;

  if p_claim then
    insert into public.command_operation_identities_v26(operation_id,command_hash,command_type,entity_type,entity_id,client_id,actor_user_id,base_revision)
    values(v_operation_id,v_hash,v_command_type,v_entity_type,v_entity_id,v_client_id,auth.uid(),v_base_revision);
  end if;
  return jsonb_build_object('ok',true,'operationId',v_operation_id,'claimed',p_claim);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'INVALID_COMMAND_IDENTIFIERS' using errcode='22023';
end
$function$;

revoke all on function public.iberfit_operation_identity_guard_v26(jsonb,boolean) from public,anon;
grant execute on function public.iberfit_operation_identity_guard_v26(jsonb,boolean) to authenticated,service_role;

alter function public.iberfit_command_preflight_v26(jsonb) rename to iberfit_command_preflight_v26_pre_rc74_4h;
alter function public.iberfit_execute_command_v26(jsonb) rename to iberfit_execute_command_v26_pre_rc74_4h;

create or replace function public.iberfit_command_preflight_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_guard jsonb;
begin
  v_guard:=public.iberfit_operation_identity_guard_v26(p_command,false);
  if coalesce((v_guard->>'ok')::boolean,false) is not true then
    return jsonb_build_object('kind','rejected','operationId',v_guard->>'operationId','remoteRevision',null,'reason',v_guard->>'reason','serverAt',now());
  end if;
  return public.iberfit_command_preflight_v26_pre_rc74_4h(p_command);
end
$function$;

create or replace function public.iberfit_execute_command_v26(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_guard jsonb;
begin
  v_guard:=public.iberfit_operation_identity_guard_v26(p_command,true);
  if coalesce((v_guard->>'ok')::boolean,false) is not true then
    return jsonb_build_object('kind','rejected','operationId',v_guard->>'operationId','remoteRevision',null,'reason',v_guard->>'reason','serverAt',now());
  end if;
  return public.iberfit_execute_command_v26_pre_rc74_4h(p_command);
end
$function$;

revoke all on function public.iberfit_command_preflight_v26(jsonb) from public,anon;
revoke all on function public.iberfit_execute_command_v26(jsonb) from public,anon;
grant execute on function public.iberfit_command_preflight_v26(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_execute_command_v26(jsonb) to authenticated,service_role;

do $postcheck$
declare v_env jsonb;
begin
  v_env:=public.iberfit_environment();
  if coalesce(v_env->>'environment','')<>'QA' then raise exception 'M26_RC74_4H_POSTCHECK_ENVIRONMENT'; end if;
  if to_regprocedure('public.iberfit_command_preflight_v26_pre_rc74_4h(jsonb)') is null
     or to_regprocedure('public.iberfit_execute_command_v26_pre_rc74_4h(jsonb)') is null
     or to_regprocedure('public.iberfit_operation_identity_guard_v26(jsonb,boolean)') is null then
    raise exception 'M26_RC74_4H_POSTCHECK_FUNCTIONS';
  end if;
  if has_table_privilege('authenticated','public.command_operation_identities_v26','SELECT')
     or has_table_privilege('anon','public.command_operation_identities_v26','SELECT') then
    raise exception 'M26_RC74_4H_IDENTITY_TABLE_EXPOSURE';
  end if;
end
$postcheck$;
