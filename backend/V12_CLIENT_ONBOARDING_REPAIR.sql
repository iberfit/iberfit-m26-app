-- IBERFIT V12.2.1 · Reparación transaccional del alta de clientes
-- Adaptada al esquema remoto real diagnosticado el 30-07-2026.
-- No altera tablas, no elimina funciones existentes y no modifica el RPC histórico.
-- Añade dos RPC V12: preflight autenticado y alta transaccional visible en canary.
-- Ejecutar desde Supabase SQL Editor con el rol propietario del proyecto.

begin;

do $$
begin
  if to_regclass('public.clients') is null then
    raise exception 'V12_INSTALL_CLIENTS_TABLE_REQUIRED';
  end if;
  if to_regclass('public.client_intake_profiles') is null then
    raise exception 'V12_INSTALL_INTAKE_TABLE_REQUIRED';
  end if;
  if to_regclass('public.client_assignments') is null then
    raise exception 'V12_INSTALL_ASSIGNMENTS_TABLE_REQUIRED';
  end if;
  if to_regclass('public.m26_canary_clients_v26') is null then
    raise exception 'V12_INSTALL_CANARY_REGISTRY_REQUIRED';
  end if;
  if to_regclass('public.user_profiles') is null then
    raise exception 'V12_INSTALL_USER_PROFILES_REQUIRED';
  end if;
  if to_regclass('public.iberfit_system_settings') is null then
    raise exception 'V12_INSTALL_SYSTEM_SETTINGS_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_bootstrap_v26()') is null then
    raise exception 'V12_INSTALL_BOOTSTRAP_RPC_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_create_client_draft(jsonb)') is null then
    raise exception 'V12_INSTALL_LEGACY_RPC_REQUIRED';
  end if;

  -- El correo no vive en public.clients: está en public.client_intake_profiles.
  if not (
    select count(*) = 1
    from information_schema.columns
    where table_schema='public' and table_name='clients' and column_name='id'
  ) then
    raise exception 'V12_INSTALL_CLIENT_ID_REQUIRED';
  end if;
  if not (
    select count(*) = 2
    from information_schema.columns
    where table_schema='public' and table_name='client_intake_profiles'
      and column_name in ('client_id','email')
  ) then
    raise exception 'V12_INSTALL_INTAKE_EMAIL_COLUMNS_REQUIRED';
  end if;
  if not (
    select count(*) = 3
    from information_schema.columns
    where table_schema='public' and table_name='client_assignments'
      and column_name in ('coach_user_id','client_id','active')
  ) then
    raise exception 'V12_INSTALL_ASSIGNMENT_COLUMNS_REQUIRED';
  end if;
  if not (
    select count(*) = 6
    from information_schema.columns
    where table_schema='public' and table_name='m26_canary_clients_v26'
      and column_name in ('client_id','active','enabled_by','enabled_at','disabled_at','reason')
  ) then
    raise exception 'V12_INSTALL_CANARY_COLUMNS_REQUIRED';
  end if;
  if not (
    select count(*) = 2
    from information_schema.columns
    where table_schema='public' and table_name='user_profiles'
      and column_name in ('user_id','role')
  ) then
    raise exception 'V12_INSTALL_USER_ROLE_COLUMNS_REQUIRED';
  end if;

  if exists(
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='client_assignments'
      and is_nullable='NO' and column_default is null and identity_generation is null
      and column_name not in ('coach_user_id','client_id','active')
  ) then
    raise exception 'V12_INSTALL_ASSIGNMENT_REQUIRED_COLUMNS_UNSUPPORTED';
  end if;
  if exists(
    select 1
    from information_schema.columns
    where table_schema='public' and table_name='m26_canary_clients_v26'
      and is_nullable='NO' and column_default is null and identity_generation is null
      and column_name not in ('client_id','active','reason')
  ) then
    raise exception 'V12_INSTALL_CANARY_REQUIRED_COLUMNS_UNSUPPORTED';
  end if;
end;
$$;

create or replace function public.iberfit_client_onboarding_preflight_v12()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_ready boolean;
  v_environment text;
  v_real_data_allowed boolean;
  v_production_blocked boolean;
begin
  if v_actor is null then
    raise exception using errcode='28000', message='V12_AUTH_REQUIRED';
  end if;

  select lower(up.role::text)
    into v_role
    from public.user_profiles up
   where up.user_id=v_actor;

  if v_role not in ('admin','coach') then
    raise exception using errcode='42501', message='V12_COACH_ROLE_REQUIRED';
  end if;

  select s.value #>> '{}'
    into v_environment
    from public.iberfit_system_settings s
   where s.key='environment';
  select coalesce((s.value #>> '{}')::boolean,false)
    into v_real_data_allowed
    from public.iberfit_system_settings s
   where s.key='real_data_allowed';
  select coalesce((s.value #>> '{}')::boolean,true)
    into v_production_blocked
    from public.iberfit_system_settings s
   where s.key='production_blocked';

  v_ready :=
    to_regclass('public.clients') is not null
    and to_regclass('public.client_intake_profiles') is not null
    and to_regclass('public.client_assignments') is not null
    and to_regclass('public.m26_canary_clients_v26') is not null
    and to_regclass('public.user_profiles') is not null
    and to_regclass('public.iberfit_system_settings') is not null
    and to_regprocedure('public.iberfit_bootstrap_v26()') is not null
    and to_regprocedure('public.iberfit_create_client_draft(jsonb)') is not null
    and coalesce(v_environment,'')='PRODUCTION'
    and coalesce(v_real_data_allowed,false)=true
    and coalesce(v_production_blocked,true)=false;

  return jsonb_build_object(
    'ok',true,
    'ready',v_ready,
    'version','v12.2.1',
    'role',v_role,
    'emailSource','client_intake_profiles.email',
    'canaryRegistry','m26_canary_clients_v26',
    'environment',coalesce(v_environment,''),
    'realDataAllowed',coalesce(v_real_data_allowed,false),
    'productionBlocked',coalesce(v_production_blocked,true)
  );
end;
$$;

revoke all on function public.iberfit_client_onboarding_preflight_v12() from public;
revoke all on function public.iberfit_client_onboarding_preflight_v12() from anon;
grant execute on function public.iberfit_client_onboarding_preflight_v12() to authenticated;

create or replace function public.iberfit_create_client_draft_v12(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_environment text;
  v_real_data_allowed boolean;
  v_production_blocked boolean;
  v_email text := lower(btrim(coalesce(p_payload->>'email',p_payload#>>'{profile,email}','')));
  v_request_id text;
  v_raw jsonb;
  v_item jsonb;
  v_candidate_text text;
  v_candidate uuid;
  v_snapshot jsonb;
  v_clients jsonb;
  v_iris jsonb;
  v_visible boolean := false;
  v_iri_available boolean := false;
  v_assignment_repaired boolean := false;
  v_canary_activated boolean := false;
  v_reused boolean := false;
  v_row_count integer := 0;
  v_email_matches integer := 0;
  v_other_assignment boolean := false;
begin
  if v_actor is null then
    raise exception using errcode='28000', message='V12_AUTH_REQUIRED';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception using errcode='22023', message='V12_PAYLOAD_INVALID';
  end if;
  if v_email='' or position('@' in v_email)<=1 then
    raise exception using errcode='22023', message='V12_EMAIL_INVALID';
  end if;

  select lower(up.role::text)
    into v_actor_role
    from public.user_profiles up
   where up.user_id=v_actor;
  if v_actor_role not in ('admin','coach') then
    raise exception using errcode='42501', message='V12_COACH_ROLE_REQUIRED';
  end if;

  -- Conserva exactamente las restricciones operativas del RPC histórico.
  select s.value #>> '{}'
    into v_environment
    from public.iberfit_system_settings s
   where s.key='environment';
  select coalesce((s.value #>> '{}')::boolean,false)
    into v_real_data_allowed
    from public.iberfit_system_settings s
   where s.key='real_data_allowed';
  select coalesce((s.value #>> '{}')::boolean,true)
    into v_production_blocked
    from public.iberfit_system_settings s
   where s.key='production_blocked';
  if coalesce(v_environment,'')<>'PRODUCTION'
     or coalesce(v_real_data_allowed,false)=false
     or coalesce(v_production_blocked,true)=true then
    raise exception using errcode='42501', message='V12_CLIENT_CREATE_ENVIRONMENT_BLOCKED';
  end if;

  v_request_id:=coalesce(
    nullif(btrim(p_payload->>'idempotencyKey'),''),
    nullif(btrim(p_payload->>'requestId'),''),
    v_email
  );

  -- Serializa todas las altas del mismo correo, incluso en pestañas distintas.
  perform pg_advisory_xact_lock(hashtextextended(v_email,0));

  -- Recupera un expediente huérfano por la tabla real que contiene el correo.
  select count(*),min(i.client_id::text)
    into v_email_matches,v_candidate_text
    from public.client_intake_profiles i
    join public.clients c on c.id=i.client_id
   where lower(btrim(i.email))=v_email;

  if v_email_matches>1 then
    raise exception using errcode='P0001', message='V12_CLIENT_EMAIL_AMBIGUOUS';
  end if;
  v_reused:=v_candidate_text is not null;

  if v_candidate_text is null then
    -- El RPC histórico sigue siendo el único responsable de crear las entidades de negocio.
    select public.iberfit_create_client_draft(p_payload) into v_raw;
    v_item:=case when jsonb_typeof(v_raw)='array' then v_raw->0 else v_raw end;
    v_candidate_text:=nullif(btrim(coalesce(
      v_item->>'client_id',v_item->>'clientId',v_item->>'cliente_id',
      v_item#>>'{client,id}',v_item#>>'{data,client_id}',v_item#>>'{data,clientId}',
      v_item#>>'{data,client,id}',v_item#>>'{result,client_id}',v_item#>>'{result,clientId}',
      v_item#>>'{result,client,id}',v_item->>'id',v_item#>>'{data,id}',v_item#>>'{result,id}'
    )), '');

    -- Si el contrato devolvió un id operativo, recupera la fila real por correo.
    if v_candidate_text is null then
      select count(*),min(i.client_id::text)
        into v_email_matches,v_candidate_text
        from public.client_intake_profiles i
        join public.clients c on c.id=i.client_id
       where lower(btrim(i.email))=v_email;
      if v_email_matches>1 then
        raise exception using errcode='P0001', message='V12_CLIENT_EMAIL_AMBIGUOUS';
      end if;
    end if;
  else
    v_raw:=jsonb_build_object('reused',true,'client_id',v_candidate_text);
  end if;

  begin
    v_candidate:=v_candidate_text::uuid;
  exception when others then
    v_candidate:=null;
  end;

  -- La identidad solo se acepta si existe simultáneamente en clients e intake con el mismo correo.
  if v_candidate is null or not exists(
    select 1
      from public.clients c
      join public.client_intake_profiles i on i.client_id=c.id
     where c.id=v_candidate and lower(btrim(i.email))=v_email
  ) then
    -- Último intento de recuperación por correo tras el RPC histórico.
    select count(*),min(i.client_id::text)
      into v_email_matches,v_candidate_text
      from public.client_intake_profiles i
      join public.clients c on c.id=i.client_id
     where lower(btrim(i.email))=v_email;
    if v_email_matches>1 then
      raise exception using errcode='P0001', message='V12_CLIENT_EMAIL_AMBIGUOUS';
    end if;
    begin
      v_candidate:=v_candidate_text::uuid;
    exception when others then
      v_candidate:=null;
    end;
  end if;

  if v_candidate is null or not exists(
    select 1
      from public.clients c
      join public.client_intake_profiles i on i.client_id=c.id
     where c.id=v_candidate and lower(btrim(i.email))=v_email
  ) then
    raise exception using errcode='P0001', message='V12_CLIENT_ROW_NOT_CREATED';
  end if;

  if v_actor_role='coach' then
    -- Un Coach nunca puede apropiarse de un expediente asignado a otra identidad.
    select exists(
      select 1
        from public.client_assignments a
       where a.client_id=v_candidate
         and a.coach_user_id is distinct from v_actor
    ) into v_other_assignment;
    if v_other_assignment then
      raise exception using errcode='42501', message='V12_CLIENT_EMAIL_ASSIGNED_OTHER_COACH';
    end if;

    update public.client_assignments a
       set active=true
     where a.client_id=v_candidate
       and a.coach_user_id=v_actor
       and a.active is distinct from true;
    get diagnostics v_row_count=row_count;
    v_assignment_repaired:=v_row_count>0;

    insert into public.client_assignments(client_id,coach_user_id,active)
    values(v_candidate,v_actor,true)
    on conflict(client_id,coach_user_id)
    do update set active=true;
    get diagnostics v_row_count=row_count;
    v_assignment_repaired:=v_assignment_repaired or v_row_count>0;

    if not exists(
      select 1 from public.client_assignments a
       where a.client_id=v_candidate and a.coach_user_id=v_actor and a.active=true
    ) then
      raise exception using errcode='P0001', message='V12_CLIENT_ASSIGNMENT_NOT_CREATED';
    end if;
  end if;

  -- Esta era la pieza ausente: el bootstrap V26 solo proyecta expedientes habilitados en canary.
  insert into public.m26_canary_clients_v26(
    client_id,active,enabled_by,enabled_at,disabled_at,reason
  ) values(
    v_candidate,true,v_actor,clock_timestamp(),null,'Alta transaccional IBERFIT V12.2.1'
  )
  on conflict(client_id) do update
     set active=true,
         enabled_by=excluded.enabled_by,
         enabled_at=excluded.enabled_at,
         disabled_at=null,
         reason=excluded.reason;
  get diagnostics v_row_count=row_count;
  v_canary_activated:=v_row_count>0;

  if not exists(
    select 1 from public.m26_canary_clients_v26 q
     where q.client_id=v_candidate and q.active=true
  ) then
    raise exception using errcode='P0001', message='V12_CLIENT_CANARY_NOT_ACTIVATED';
  end if;

  -- Verificación en la misma transacción. Si no aparece, toda la operación se revierte.
  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_clients:=coalesce(v_snapshot#>'{data,clients}',v_snapshot#>'{collections,clients}','[]'::jsonb);
  if jsonb_typeof(v_clients)<>'array' then
    v_clients:='[]'::jsonb;
  end if;
  select exists(
    select 1
      from jsonb_array_elements(v_clients) item
     where coalesce(
       item->>'id',item->>'client_id',item->>'clientId',item->>'cliente_id',
       item#>>'{body,id}',item#>>'{body,client_id}',item#>>'{body,clientId}'
     )=v_candidate::text
  ) into v_visible;

  if not v_visible then
    raise exception using errcode='P0001', message='V12_CLIENT_NOT_VISIBLE_AFTER_CANARY_ACTIVATION';
  end if;

  v_iris:=coalesce(
    v_snapshot#>'{data,iriAssessments}',
    v_snapshot#>'{data,iri_assessments}',
    v_snapshot#>'{collections,iriAssessments}',
    '[]'::jsonb
  );
  if jsonb_typeof(v_iris)<>'array' then
    v_iris:='[]'::jsonb;
  end if;
  select exists(
    select 1
      from jsonb_array_elements(v_iris) item
     where coalesce(
       item->>'clientId',item->>'client_id',
       item#>>'{body,clientId}',item#>>'{body,client_id}'
     )=v_candidate::text
  ) into v_iri_available;

  return jsonb_build_object(
    'ok',true,
    'visible',true,
    'client_id',v_candidate,
    'request_id',v_request_id,
    'reused',v_reused,
    'assignment_repaired',v_assignment_repaired,
    'canary_activated',v_canary_activated,
    'iri_entity_available',v_iri_available,
    'version','v12.2.1'
  );
end;
$$;

revoke all on function public.iberfit_create_client_draft_v12(jsonb) from public;
revoke all on function public.iberfit_create_client_draft_v12(jsonb) from anon;
grant execute on function public.iberfit_create_client_draft_v12(jsonb) to authenticated;

comment on function public.iberfit_client_onboarding_preflight_v12() is
'IBERFIT V12.2.1: preflight autenticado adaptado al esquema real de clients, intake y canary.';
comment on function public.iberfit_create_client_draft_v12(jsonb) is
'IBERFIT V12.2.1: alta idempotente; recupera por intake.email, garantiza asignación Coach, activa canary y verifica bootstrap.';

notify pgrst, 'reload schema';
commit;

select jsonb_build_object(
  'ok',
  to_regprocedure('public.iberfit_client_onboarding_preflight_v12()') is not null
  and to_regprocedure('public.iberfit_create_client_draft_v12(jsonb)') is not null,
  'version','v12.2.1',
  'preflight',to_regprocedure('public.iberfit_client_onboarding_preflight_v12()')::text,
  'create',to_regprocedure('public.iberfit_create_client_draft_v12(jsonb)')::text,
  'emailSource','public.client_intake_profiles.email',
  'canaryRegistry','public.m26_canary_clients_v26'
) as iberfit_v12_2_1_installation;
