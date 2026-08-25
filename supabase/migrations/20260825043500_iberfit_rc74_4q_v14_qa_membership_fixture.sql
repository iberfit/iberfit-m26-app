-- IBERFIT M26 RC74.4Q · V14 QA ORGANIZATION MEMBERSHIP FIXTURE · QA ONLY
-- Reproduces the minimal synthetic organization/membership basis required by
-- authenticated V14 application-context and communication bootstrap checks.
-- No conversations, messages, appointments, assignments or health data are created.

do $$
declare
  v_env jsonb := public.iberfit_environment();
  v_org constant uuid := '00000000-0000-4000-8000-000000000140';
  v_count integer;
begin
  if coalesce(v_env->>'environment','') <> 'QA'
     or coalesce((v_env->>'realDataAllowed')::boolean,true) is not false
     or coalesce((v_env->>'productionBlocked')::boolean,false) is not true then
    raise exception 'RC74_4Q_QA_ENVIRONMENT_REQUIRED' using errcode='42501';
  end if;

  if exists (
    select 1 from public.iberfit_organizations
    where slug='iberfit-qa-rc74' and id<>v_org
  ) then
    raise exception 'RC74_4Q_ORGANIZATION_SLUG_COLLISION';
  end if;

  if exists (
    select 1 from public.iberfit_organizations
    where id=v_org and (
      slug<>'iberfit-qa-rc74'
      or name<>'IBERFIT QA RC74'
      or status<>'active'
      or timezone<>'America/Santiago'
      or locale<>'es-CL'
    )
  ) then
    raise exception 'RC74_4Q_ORGANIZATION_CONFLICT';
  end if;

  insert into public.iberfit_organizations(
    id,slug,name,status,timezone,locale,settings,revision
  )
  values (
    v_org,
    'iberfit-qa-rc74',
    'IBERFIT QA RC74',
    'active',
    'America/Santiago',
    'es-CL',
    '{}'::jsonb,
    1
  )
  on conflict (id) do nothing;

  with expected(email,role_name) as (
    values
      ('qa.rc74.admin@iberfit.cl','admin'),
      ('qa.rc74.coach@iberfit.cl','coach'),
      ('qa.rc74.client-a@iberfit.cl','client'),
      ('qa.rc74.client-b@iberfit.cl','client')
  )
  select count(*) into v_count
  from expected e
  join auth.users u on lower(u.email)=e.email
  join public.user_profiles p on p.user_id=u.id
  where lower(p.role::text)=e.role_name;

  if v_count<>4 then
    raise exception 'RC74_4Q_QA_IDENTITIES_REQUIRED';
  end if;

  if exists (
    with expected(email) as (
      values
        ('qa.rc74.admin@iberfit.cl'),
        ('qa.rc74.coach@iberfit.cl'),
        ('qa.rc74.client-a@iberfit.cl'),
        ('qa.rc74.client-b@iberfit.cl')
    )
    select 1
    from expected e
    join auth.users u on lower(u.email)=e.email
    join public.iberfit_organization_memberships m
      on m.organization_id=v_org and m.user_id=u.id
    where m.status<>'active'
  ) then
    raise exception 'RC74_4Q_EXISTING_MEMBERSHIP_NOT_ACTIVE';
  end if;

  insert into public.iberfit_organization_memberships(
    organization_id,user_id,status,revision
  )
  select v_org,u.id,'active',1
  from auth.users u
  where lower(u.email) in (
    'qa.rc74.admin@iberfit.cl',
    'qa.rc74.coach@iberfit.cl',
    'qa.rc74.client-a@iberfit.cl',
    'qa.rc74.client-b@iberfit.cl'
  )
  on conflict (organization_id,user_id) do nothing;

  select count(*) into v_count
  from public.iberfit_organization_memberships m
  join auth.users u on u.id=m.user_id
  where m.organization_id=v_org
    and m.status='active'
    and lower(u.email) in (
      'qa.rc74.admin@iberfit.cl',
      'qa.rc74.coach@iberfit.cl',
      'qa.rc74.client-a@iberfit.cl',
      'qa.rc74.client-b@iberfit.cl'
    );

  if v_count<>4 then
    raise exception 'RC74_4Q_MEMBERSHIP_POSTCHECK_FAILED';
  end if;
end $$;
