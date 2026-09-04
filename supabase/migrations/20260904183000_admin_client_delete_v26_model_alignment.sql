-- IBERFIT RC74.6 · alineación con el modelo real de clients/client_access_v26.
-- Esta migración es idempotente respecto de la definición incluida en 20260904164000.

create or replace function public.iberfit_admin_delete_client_v26(
  p_command jsonb,
  p_context jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_org uuid;
  v_actor uuid := auth.uid();
  v_operation text := btrim(coalesce(p_command->>'operationId',''));
  v_type text := upper(btrim(coalesce(p_command->>'type','')));
  v_reason text := btrim(coalesce(p_command->>'reason',''));
  v_payload jsonb := coalesce(p_command->'payload','{}'::jsonb);
  v_existing jsonb;
  v_client_id uuid;
  v_confirm_client_id uuid;
  v_client_name text;
  v_client_email text;
  v_expected text;
  v_confirm_value text := btrim(coalesce(v_payload->>'confirmValue',''));
  v_confirm_phrase text := upper(btrim(coalesce(v_payload->>'confirmPhrase','')));
  v_auth_user_id uuid;
  v_audit_id uuid;
  v_result jsonb;
  v_removed integer := 0;
  v_rows integer := 0;
  v_protected integer := 0;
  v_table text;
  v_ref record;
  v_cleanup_tables constant text[] := array[
    'appointment_change_requests','client_assignments','client_intake_profiles',
    'iberfit_client_lifecycle_events','iberfit_coach_client_assignments',
    'iberfit_conversation_threads','iberfit_operational_tasks','ai_provider_calls',
    'ai_safety_events','ai_uploads','dm_message_events','dm_threads','replay_events',
    'session_reschedule_events'
  ];
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_org := public.iberfit_admin_require_v14();

  if v_actor is null then raise exception 'IBERFIT_CLIENT_DELETE_AUTH_REQUIRED' using errcode='42501'; end if;
  if v_type <> 'ADMIN_CLIENTE_ELIMINAR' then raise exception 'IBERFIT_CLIENT_DELETE_COMMAND_INVALID' using errcode='22023'; end if;
  if v_operation = '' then raise exception 'IBERFIT_CLIENT_DELETE_OPERATION_INVALID' using errcode='22023'; end if;
  if char_length(v_reason) < 8 then raise exception 'IBERFIT_CLIENT_DELETE_REASON_REQUIRED' using errcode='22023'; end if;

  select result into v_existing from public.iberfit_admin_mutation_receipts
  where operation_id=v_operation and actor_user_id=v_actor and command_type=v_type;
  if v_existing is not null then return v_existing || jsonb_build_object('kind','duplicate'); end if;
  if exists(select 1 from public.iberfit_admin_mutation_receipts where operation_id=v_operation) then
    raise exception 'IBERFIT_CLIENT_DELETE_OPERATION_COLLISION' using errcode='23505';
  end if;

  begin
    v_client_id := (v_payload->>'clientId')::uuid;
    v_confirm_client_id := (v_payload->>'confirmClientId')::uuid;
  exception when others then
    raise exception 'IBERFIT_CLIENT_DELETE_CLIENT_INVALID' using errcode='22023';
  end;
  if v_client_id is null or v_confirm_client_id is distinct from v_client_id or v_confirm_phrase <> 'ELIMINAR' then
    raise exception 'IBERFIT_CLIENT_DELETE_CONFIRMATION_INVALID' using errcode='22023';
  end if;

  perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client_id::text);

  select c.name into v_client_name from public.clients c where c.id=v_client_id for update;
  if not found then raise exception 'IBERFIT_CLIENT_DELETE_NOT_FOUND' using errcode='P0002'; end if;

  select nullif(lower(btrim(ca.email)),''),ca.auth_user_id
    into v_client_email,v_auth_user_id
  from public.client_access_v26 ca
  where ca.client_id=v_client_id
  order by ca.updated_at desc nulls last,ca.created_at desc
  limit 1;

  v_expected := coalesce(v_client_email,btrim(v_client_name));
  if (v_client_email is not null and lower(v_confirm_value)<>v_expected)
     or (v_client_email is null and v_confirm_value<>v_expected) then
    raise exception 'IBERFIT_CLIENT_DELETE_CONFIRMATION_INVALID' using errcode='22023';
  end if;

  for v_ref in
    select distinct tc.table_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name and kcu.constraint_schema=tc.constraint_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
    join information_schema.referential_constraints rc on rc.constraint_name=tc.constraint_name and rc.constraint_schema=tc.constraint_schema
    where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and kcu.column_name='client_id'
      and ccu.table_schema='public' and ccu.table_name='clients' and ccu.column_name='id'
      and rc.delete_rule in ('NO ACTION','RESTRICT')
  loop
    execute format('select count(*) from public.%I where client_id=$1',v_ref.table_name) into v_rows using v_client_id;
    v_protected := v_protected + coalesce(v_rows,0);
  end loop;
  if v_protected>0 then raise exception 'IBERFIT_CLIENT_DELETE_PROTECTED_HISTORY' using errcode='23503'; end if;

  for v_ref in
    select c.table_name from information_schema.columns c
    where c.table_schema='public' and c.column_name='client_id'
      and c.table_name<>all(v_cleanup_tables) and c.table_name<>'m26_audit_events_v43'
      and not exists(
        select 1 from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name and kcu.constraint_schema=tc.constraint_schema
        join information_schema.constraint_column_usage ccu on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
        where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public' and tc.table_name=c.table_name
          and kcu.column_name='client_id' and ccu.table_schema='public' and ccu.table_name='clients' and ccu.column_name='id'
      )
  loop
    execute format('select count(*) from public.%I where client_id::text=$1',v_ref.table_name) into v_rows using v_client_id::text;
    if coalesce(v_rows,0)>0 then raise exception 'IBERFIT_CLIENT_DELETE_UNMANAGED_REFERENCE:%',v_ref.table_name using errcode='23503'; end if;
  end loop;

  foreach v_table in array v_cleanup_tables loop
    if to_regclass(format('public.%I',v_table)) is not null and exists(
      select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=v_table and c.column_name='client_id'
    ) then
      execute format('delete from public.%I where client_id::text=$1',v_table) using v_client_id::text;
      get diagnostics v_rows=row_count;
      v_removed:=v_removed+coalesce(v_rows,0);
    end if;
  end loop;

  if v_auth_user_id is not null then
    update public.user_application_roles set active=false,granted_at=now(),granted_by=v_actor
    where user_id=v_auth_user_id and role='client' and active=true;
  end if;

  delete from public.clients where id=v_client_id;
  if not found then raise exception 'IBERFIT_CLIENT_DELETE_RACE' using errcode='40001'; end if;

  insert into public.iberfit_admin_audit_events(
    organization_id,event_type,actor_user_id,actor_application,entity_type,entity_id,summary,trace_id,revision
  ) values (
    v_org,v_type,v_actor,'admin','client',v_client_id::text,
    concat('Cliente eliminado de forma permanente por ADMIN. Motivo: ',left(v_reason,240),'. Identidad Auth conservada: ',case when v_auth_user_id is null then 'no vinculada' else 'sí' end,'.'),
    v_operation,1
  ) returning id into v_audit_id;

  v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_operation,'commandType',v_type,
    'entityId',v_client_id::text,'deletedClient',jsonb_build_object('id',v_client_id,'name',v_client_name,'email',v_client_email),
    'explicitRowsRemoved',v_removed,'authIdentityRetained',v_auth_user_id is not null,'auditId',v_audit_id,'serverTime',now());

  insert into public.iberfit_admin_mutation_receipts(operation_id,organization_id,actor_user_id,command_type,result)
  values(v_operation,v_org,v_actor,v_type,v_result);
  return v_result;
end
$function$;

revoke all on function public.iberfit_admin_delete_client_v26(jsonb,jsonb) from public,anon,authenticated;
