-- GX350: replace full bootstrap with a scoped, role-authorized onboarding readback.
-- Exact-source guarded; no new RPC, grant, RLS, timeout or schema change.
DO $gx350_readback$
DECLARE
  target constant regprocedure:='public.iberfit_create_client_draft_v12_pre_v65e(jsonb)'::regprocedure;
  d text:=pg_get_functiondef(target);
  direction constant text:='__GX350_READBACK_DIRECTION__';
  from_hash text;
  to_hash text;
  from_block text;
  to_block text;
  a constant text:=$gx_from$  select public.iberfit_bootstrap_v26() into v_snapshot;
  v_clients:=coalesce(v_snapshot#>'{data,clients}','[]'::jsonb);
  v_profiles:=coalesce(v_snapshot#>'{data,clientProfiles}','[]'::jsonb);
  v_iris:=coalesce(v_snapshot#>'{data,iriAssessments}','[]'::jsonb);

  select exists(select 1 from jsonb_array_elements(v_clients) item
    where coalesce(item->>'id',item->>'clientId',item->>'client_id')=v_candidate::text)
    into v_visible;
  select exists(select 1 from jsonb_array_elements(v_profiles) item
    where coalesce(item->>'clientId',item->>'client_id')=v_candidate::text
      and lower(coalesce(item->>'email',item#>>'{profile,email}',''))=v_email)
    into v_profile_visible;
  select exists(select 1 from jsonb_array_elements(v_iris) item
    where coalesce(item->>'clientId',item->>'client_id')=v_candidate::text
      and coalesce(item->>'id',item#>>'{body,id}')=v_iri_id::text)
    into v_iri_available;$gx_from$;
  b constant text:=$gx_to$  -- GX350_SCOPED_ONBOARDING_READBACK_V1: preserve the original privileged
  -- assurance and canonical Admin/Coach visibility without serializing the
  -- entire application bootstrap inside the client creation transaction.
  perform public.iberfit_require_privileged_assurance_v65d();
  select coalesce(public.iberfit_current_role_v26() in ('admin','coach')
    and public.iberfit_can_access_client_v26(v_candidate),false)
    and exists(select 1 from public.clients c where c.id=v_candidate)
    into v_visible;

  select v_visible and exists(
    select 1
    from public.client_app_profiles p
    cross join lateral (select to_jsonb(p) as raw) source
    cross join lateral (
      select raw || coalesce(raw->'profile','{}'::jsonb) ||
        jsonb_build_object('clientId',coalesce(raw->>'client_id',raw->>'clientId'),
          'profile',coalesce(raw->'profile','{}'::jsonb)) as item
    ) projected
    where p.client_id=v_candidate
      and coalesce(item->>'clientId',item->>'client_id')=v_candidate::text
      and lower(coalesce(item->>'email',item#>>'{profile,email}',''))=v_email
  ) into v_profile_visible;

  select v_visible and exists(
    select 1
    from public.iri_assessments i
    cross join lateral (select to_jsonb(i) as raw) source
    cross join lateral (
      select raw || coalesce(raw->'sections','{}'::jsonb) ||
        jsonb_build_object('clientId',coalesce(raw->>'client_id',raw->>'clientId'),
          'assessmentDate',coalesce(raw->>'evaluated_at',raw#>>'{sections,assessmentDate}'),
          'body',coalesce(raw->'sections','{}'::jsonb)||jsonb_build_object(
            'id',raw->'id','clientId',coalesce(raw->>'client_id',raw->>'clientId'),
            'status',case raw->>'status' when 'revisión' then 'completo'
              when 'retirado' then 'sustituido' else raw->>'status' end,
            'revision',coalesce((raw->>'revision')::bigint,0))) as item
    ) projected
    where i.client_id=v_candidate
      and coalesce(item->>'clientId',item->>'client_id')=v_candidate::text
      and coalesce(item->>'id',item#>>'{body,id}')=v_iri_id::text
  ) into v_iri_available;$gx_to$;
  env jsonb:=public.iberfit_environment();
  before_metadata jsonb;
  after_metadata jsonb;
BEGIN
  if direction='install' then
    from_hash:='833239e847db56f90de23c6b407e1384'; to_hash:='5eca7c696f69e01a25d1d56f053974ce';
    from_block:=a; to_block:=b;
  elsif direction='rollback' then
    from_hash:='5eca7c696f69e01a25d1d56f053974ce'; to_hash:='833239e847db56f90de23c6b407e1384';
    from_block:=b; to_block:=a;
  else raise exception 'GX350_READBACK_DIRECTION_INVALID'; end if;
  if md5(d)<>from_hash then raise exception 'GX350_READBACK_BASE_DRIFT'; end if;
  if direction='install' then
  if md5(pg_get_functiondef('public.iberfit_can_access_client_v26(uuid)'::regprocedure))<>'c6e7dc2917170e35f7ec23dc31d8f964'
    or md5(pg_get_functiondef('public.iberfit_current_role_v26()'::regprocedure))<>'aa12f60d12892506c8e08b0717aa8ee2'
    or md5(pg_get_functiondef('public.iberfit_require_privileged_assurance_v65d()'::regprocedure))<>'a36686e9f9537c174cf5f118f51df50f' then
    raise exception 'GX350_READBACK_AUTH_CHAIN_DRIFT';
  end if;
  if not coalesce((
    (env->>'environment'='QA' and env->>'realDataAllowed'='false' and env->>'productionBlocked'='true'
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure))='e460264e965db3688709101bc30e10fa'
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_person_service_v1()'::regprocedure))='f7f30204f8e84e1d5c9fe43331b7f0c8'
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_v65e()'::regprocedure))='384fc9f71774e79a6aad987ad67a0c9a'
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure))='2dd44be13127df848e335c33febfd183')
    or (env->>'environment'='PRODUCTION' and env->>'realDataAllowed'='true' and env->>'productionBlocked'='false'
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure))='aedea9df3d4986496626e10318628c41'
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_person_service_v1()'::regprocedure))='f7f30204f8e84e1d5c9fe43331b7f0c8'
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_v65e()'::regprocedure))='7416e0d52d6fa069cf467e95420d4034'
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure))='a5c997a2c263357a99caacd90524291c')
  ),false) then raise exception 'GX350_READBACK_BOOTSTRAP_CHAIN_DRIFT'; end if;
  end if;
  if (length(d)-length(replace(d,from_block,'')))/length(from_block)<>1 then raise exception 'GX350_READBACK_ANCHOR_DRIFT'; end if;
  select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'security',prosecdef,'config',proconfig,'volatility',provolatile)
    into before_metadata from pg_proc where oid=target;
  d:=replace(d,from_block,to_block);
  if md5(d)<>to_hash then raise exception 'GX350_READBACK_TARGET_HASH_MISMATCH'; end if;
  execute d;
  select jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'security',prosecdef,'config',proconfig,'volatility',provolatile)
    into after_metadata from pg_proc where oid=target;
  if md5(pg_get_functiondef(target))<>to_hash or before_metadata is distinct from after_metadata then
    raise exception 'GX350_READBACK_CATALOG_MISMATCH';
  end if;
END $gx350_readback$;
