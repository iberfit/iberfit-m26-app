-- IBERFIT · IRI-only lifecycle and role-safe service projection.
-- Separates commercial training status from coach authorization.
-- "iri_only" keeps the person, IRI, photos and report accessible without
-- counting the record as an active training client.

begin;

do $precheck$
begin
  if to_regclass('public.iberfit_client_lifecycle_events') is null then
    raise exception 'IBERFIT_CLIENT_LIFECYCLE_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_bootstrap_v26()') is null then
    raise exception 'IBERFIT_BOOTSTRAP_V26_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_bootstrap_v26_pre_v65e()') is null then
    raise exception 'IBERFIT_BOOTSTRAP_V26_BASE_REQUIRED';
  end if;
  if to_regprocedure('public.iberfit_can_access_client_v26(text)') is null then
    raise exception 'IBERFIT_CLIENT_SCOPE_HELPER_REQUIRED';
  end if;
end
$precheck$;

alter table public.iberfit_client_lifecycle_events
  drop constraint if exists iberfit_client_lifecycle_events_status_check;

alter table public.iberfit_client_lifecycle_events
  add constraint iberfit_client_lifecycle_events_status_check
  check (
    status = any (
      array[
        'lead'::text,
        'onboarding'::text,
        'iri_only'::text,
        'active'::text,
        'paused'::text,
        'inactive'::text,
        'reactivation'::text
      ]
    )
  );

create or replace function public.iberfit_bootstrap_v26()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_payload jsonb;
  v_data jsonb;
  v_email text;
  v_last_access_at timestamptz;
  v_membership_status text;
  v_lifecycle jsonb;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_payload:=public.iberfit_bootstrap_v26_pre_v65e();

  select u.email,u.last_sign_in_at
  into v_email,v_last_access_at
  from auth.users u
  where u.id=auth.uid();

  select m.status
  into v_membership_status
  from public.iberfit_organization_memberships m
  where m.organization_id='00000000-0000-4000-8000-000000000140'::uuid
    and m.user_id=auth.uid();

  v_data:=coalesce(v_payload->'data','{}'::jsonb);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',e.id,
        'clientId',e.client_id,
        'status',e.status,
        'effectiveAt',e.effective_at,
        'createdAt',e.created_at,
        'revision',e.revision
      )
      order by e.client_id
    ),
    '[]'::jsonb
  )
  into v_lifecycle
  from (
    select distinct on (l.client_id)
      l.id,
      l.client_id,
      l.status,
      l.effective_at,
      l.created_at,
      l.revision
    from public.iberfit_client_lifecycle_events l
    where public.iberfit_can_access_client_v26(l.client_id)
    order by l.client_id,l.effective_at desc,l.created_at desc,l.id desc
  ) e;

  v_data:=jsonb_set(v_data,'{clientLifecycle}',coalesce(v_lifecycle,'[]'::jsonb),true);
  v_payload:=jsonb_set(v_payload,'{data}',v_data,true);
  v_payload:=jsonb_set(v_payload,'{user,email}',to_jsonb(coalesce(v_email,'')),true);
  v_payload:=jsonb_set(v_payload,'{user,status}',to_jsonb(coalesce(v_membership_status,'')),true);
  v_payload:=jsonb_set(v_payload,'{user,lastAccessAt}',coalesce(to_jsonb(v_last_access_at),'null'::jsonb),true);

  return v_payload;
end
$function$;

revoke all on function public.iberfit_bootstrap_v26() from public,anon;
grant execute on function public.iberfit_bootstrap_v26() to authenticated;

comment on function public.iberfit_bootstrap_v26() is
'IBERFIT main bootstrap with role-scoped latest client lifecycle projection. iri_only remains authorized for IRI access but is not an active training lifecycle.';

do $postcheck$
declare
  v_constraint text;
  v_source text;
begin
  select pg_get_constraintdef(c.oid)
    into v_constraint
  from pg_constraint c
  join pg_class t on t.oid=c.conrelid
  join pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public'
    and t.relname='iberfit_client_lifecycle_events'
    and c.conname='iberfit_client_lifecycle_events_status_check';

  if position('iri_only' in coalesce(v_constraint,''))=0 then
    raise exception 'IBERFIT_IRI_ONLY_STATUS_CONSTRAINT_MISSING';
  end if;

  select p.prosrc
    into v_source
  from pg_proc p
  where p.oid='public.iberfit_bootstrap_v26()'::regprocedure;

  if position('clientLifecycle' in coalesce(v_source,''))=0
     or position('iberfit_can_access_client_v26' in coalesce(v_source,''))=0 then
    raise exception 'IBERFIT_IRI_ONLY_BOOTSTRAP_PROJECTION_INCOMPLETE';
  end if;

  if has_function_privilege('anon','public.iberfit_bootstrap_v26()','EXECUTE') then
    raise exception 'IBERFIT_BOOTSTRAP_ANON_EXECUTE_FORBIDDEN';
  end if;
  if not has_function_privilege('authenticated','public.iberfit_bootstrap_v26()','EXECUTE') then
    raise exception 'IBERFIT_BOOTSTRAP_AUTH_EXECUTE_REQUIRED';
  end if;
end
$postcheck$;

commit;
