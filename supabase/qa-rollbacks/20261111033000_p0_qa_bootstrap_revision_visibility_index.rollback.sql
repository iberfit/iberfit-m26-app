-- QA-only source-pinned rollback. Reinstates the exact prior source, never widens permissions.
-- From 5b9547e2230994fa96cb6cb629f8fb2d to 243c5df0f05cb35fffd3cf777a5932c5; no table DML, Auth or PROD.
SELECT 1/(CASE WHEN
  EXISTS (SELECT 1 FROM public.iberfit_system_settings s WHERE s.key='environment' AND s.value#>>'{}'='QA')
  AND md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure))='5b9547e2230994fa96cb6cb629f8fb2d'
  AND EXISTS (
  SELECT 1 FROM pg_proc p
  WHERE p.oid='public.iberfit_bootstrap_v26()'::regprocedure
    AND p.prosecdef AND p.provolatile='s'
    AND p.proconfig @> ARRAY['search_path=""']::text[]
    AND pg_get_userbyid(p.proowner)='postgres'
)
AND has_function_privilege('authenticated','public.iberfit_bootstrap_v26()','EXECUTE')
AND has_function_privilege('service_role','public.iberfit_bootstrap_v26()','EXECUTE')
AND NOT has_function_privilege('anon','public.iberfit_bootstrap_v26()','EXECUTE')
THEN 1 ELSE 0 END) AS p0_qa_bootstrap_source_acl_guard;

CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_payload jsonb;
  v_org uuid;
  v_clients jsonb;
begin
  v_payload:=public.iberfit_bootstrap_v26_pre_person_service_v1();
  v_org:=nullif(public.iberfit_application_context_v14()->>'organizationId','')::uuid;

  select coalesce(jsonb_agg(
    c.value||jsonb_build_object(
      'trainingServiceStatus',coalesce(s.status,'none')
    )
    order by c.ordinality
  ),'[]'::jsonb)
  into v_clients
  from jsonb_array_elements(coalesce(v_payload#>'{data,clients}','[]'::jsonb))
       with ordinality c(value,ordinality)
  left join lateral (
    select e.status
    from public.iberfit_training_service_events_v1 e
    where e.organization_id=v_org
      and e.person_id=nullif(c.value->>'id','')::uuid
    order by e.effective_at desc,e.created_at desc,e.id desc
    limit 1
  ) s on true;

  v_payload:=jsonb_set(v_payload,'{data,clients}',coalesce(v_clients,'[]'::jsonb),true);

  -- M43: SECURITY DEFINER bootstrap must enforce the same publication
  -- boundary as domain_entities_v26 SELECT RLS, not delegate it to UI.
  -- Coach/Admin keep unchanged full authorised access. Client only.
  if public.iberfit_current_role_v26() in ('client','cliente') then
    v_payload:=jsonb_set(v_payload,'{data,trainingCycles}',coalesce((
      select jsonb_agg(public.iberfit_m43_client_safe_plan_v2(item))
      from jsonb_array_elements(coalesce(v_payload#>'{data,trainingCycles}','[]'::jsonb)) item
      where lower(coalesce(item->>'status','')) in
        ('publicado','publicada','published','disponible','en_curso',
         'activo','active','habilitado','enabled','completado','completada','completed')
        AND lower(coalesce(item->>'visibleToClient','true')) NOT IN ('false','0','no')
    ),'[]'::jsonb),true);

    v_payload:=jsonb_set(v_payload,'{data,sessions}',coalesce((
      select jsonb_agg(public.iberfit_m43_client_safe_session_v2(item))
      from jsonb_array_elements(coalesce(v_payload#>'{data,sessions}','[]'::jsonb)) item
      where lower(coalesce(item->>'status','')) in
        ('publicado','publicada','published','disponible','en_curso',
         'activo','active','habilitado','enabled','completado','completada','completed')
        AND lower(coalesce(item->>'visibleToClient','true')) NOT IN ('false','0','no')
    ),'[]'::jsonb),true);

    -- QA synthetic-only P0 fast path: upstream fields are already sanitized.
    -- Any drift in the exact authoritative authorization/sanitizer chain
    -- automatically restores the original full sanitizer below.
    if NOT (
      EXISTS (SELECT 1 FROM public.iberfit_system_settings s WHERE s.key='environment' AND s.value#>>'{}'='QA')
      and EXISTS (SELECT 1 FROM auth.users u WHERE u.id=auth.uid() AND lower(u.email) IN ('qa.rc74.client-a@iberfit.cl','qa.rc74.client-b@iberfit.cl'))
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure))='6e738331104794833987e82b6b6d105f'
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_v65e()'::regprocedure))='384fc9f71774e79a6aad987ad67a0c9a'
      and md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_person_service_v1()'::regprocedure))='f7f30204f8e84e1d5c9fe43331b7f0c8'
      and md5(pg_get_functiondef('public.iberfit_m43_client_safe_execution_v1(jsonb)'::regprocedure))='29f09c54467ac50aaa91bce79ebe5680'
      and md5(pg_get_functiondef('public.iberfit_m43_client_safe_session_v2(jsonb)'::regprocedure))='2c0f16829cd8731af964f107969f025a'
      and md5(pg_get_functiondef('public.iberfit_m43_client_safe_plan_v2(jsonb)'::regprocedure))='56ee5426a2a83ea3ad00fd863f65e007'
      and md5(pg_get_functiondef('public.iberfit_m43_client_scalar_fields_v1(jsonb,text[])'::regprocedure))='34df411a2b9ce5b60635d6db84ecd240'
      and md5(pg_get_functiondef('public.iberfit_m43_client_safe_block_v2(jsonb)'::regprocedure))='d8ac8222cef323f45224e1fcc58c4131'
    ) then
    v_payload:=jsonb_set(v_payload,'{data,m26Entities}',coalesce((
      select jsonb_agg(case when item->>'entityType'='session_execution'
        then public.iberfit_m43_client_scalar_fields_v1(item,
          ARRAY['entityType','entityId','clientId','status','revision','updatedAt']::text[])
          || jsonb_build_object('body',public.iberfit_m43_client_safe_execution_v1(item->'body'))
        when item->>'entityType'='planning' then
          public.iberfit_m43_client_scalar_fields_v1(item,
            ARRAY['entityType','entityId','clientId','status','revision','updatedAt']::text[])
          || jsonb_build_object('body',public.iberfit_m43_client_safe_plan_v2(item->'body'))
        when item->>'entityType'='session' then
          public.iberfit_m43_client_scalar_fields_v1(item,
            ARRAY['entityType','entityId','clientId','status','revision','updatedAt']::text[])
          || jsonb_build_object('body',public.iberfit_m43_client_safe_session_v2(item->'body'))
        else item end)
      from jsonb_array_elements(coalesce(v_payload#>'{data,m26Entities}','[]'::jsonb)) item
      where item->>'entityType' not in ('planning','session','report')
         or (
           lower(coalesce(item->>'status',item->'body'->>'status','')) in
             ('publicado','publicada','published','disponible','en_curso',
              'activo','active','habilitado','enabled','completado','completada','completed')
           and lower(coalesce(item->'body'->>'visibleToClient','true'))
             not in ('false','0','no')
         )
    ),'[]'::jsonb),true);

    end if;
    -- Canonical and legacy completed executions must share the same HTTP
    -- privacy contract. Client JS filtering is defense-in-depth, not an API boundary.
    v_payload:=jsonb_set(v_payload,'{data,sessionExecutions}',coalesce((
      select jsonb_agg(public.iberfit_m43_client_safe_execution_v1(item))
      from jsonb_array_elements(coalesce(v_payload#>'{data,sessionExecutions}','[]'::jsonb)) item
    ),'[]'::jsonb),true);

    -- Internal domain event history is not Client UI data; the existing
    -- JS projection discards it. Avoid leaking unpublished entity activity.
    v_payload:=jsonb_set(v_payload,'{data,domainEvents}','[]'::jsonb,true);

    -- Never leak identifiers/revisions of unpublished planning/session/report
    -- through an otherwise filtered bootstrap response.
    v_payload:=jsonb_set(v_payload,'{remoteRevisions}',coalesce((
      select jsonb_object_agg(entry.key,entry.value)
      from jsonb_each(coalesce(v_payload->'remoteRevisions','{}'::jsonb)) entry
      where split_part(entry.key,':',1) not in ('planning','session','report')
         or exists (
           select 1
           from jsonb_array_elements(coalesce(v_payload#>'{data,m26Entities}','[]'::jsonb)) item
           where item->>'entityType'=split_part(entry.key,':',1)
             and item->>'entityId'=split_part(entry.key,':',2)
         )
    ),'{}'::jsonb),true);
  end if;

  -- M44_REPORT_BOOTSTRAP_PRIVATE_PROJECTION_V1
  -- Client-safe projections are explicit; SECURITY DEFINER bypasses table RLS.
  if public.iberfit_current_role_v26() in ('client','cliente') then
    v_payload:=jsonb_set(v_payload,'{data,reports}',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',r.value->'id',
        'client_id',r.value->'client_id',
        'title',r.value->'title',
        'summary',r.value->'summary',
        'report_type',r.value->'report_type',
        'status',r.value->'status',
        'audience','cliente',
        'revision',r.value->'revision',
        'published_at',r.value->'published_at',
        'content',jsonb_build_object(
          'reportType',coalesce(r.value#>>'{content,reportType}',r.value->>'report_type'),
          'summary',r.value->>'summary',
          'conclusions',r.value#>>'{content,conclusions}',
          'recommendations',r.value#>>'{content,recommendations}',
          'periodStart',r.value#>>'{content,periodStart}',
          'periodEnd',r.value#>>'{content,periodEnd}',
          'evidence',coalesce(r.value#>'{content,evidence}','[]'::jsonb),
          'activitySeries',coalesce(r.value#>'{content,activitySeries}','[]'::jsonb)
        )
      ) order by r.ordinality)
      from jsonb_array_elements(coalesce(v_payload#>'{data,reports}','[]'::jsonb))
           with ordinality r(value,ordinality)
      where r.value->>'client_id'=public.iberfit_client_id()::text
        and r.value->>'status'='publicado'
        and r.value->>'audience'='cliente'
    ),'[]'::jsonb),true);
    -- Never send internal report entity bodies, even if a previous migration
    -- incorrectly marked visibleToClient=true. The public reports projection
    -- above is the *only* supported Client report read path.
    v_payload:=jsonb_set(v_payload,'{data,m26Entities}',coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_payload#>'{data,m26Entities}','[]'::jsonb)) item
      where item->>'entityType' is distinct from 'report'
    ),'[]'::jsonb),true);
    -- Canonical revision maps can leak the existence of private reports.
    v_payload:=jsonb_set(v_payload,'{remoteRevisions}',coalesce((
      select jsonb_object_agg(k.key,k.value)
      from jsonb_each(coalesce(v_payload->'remoteRevisions','{}'::jsonb)) k
      where split_part(k.key,':',1)<>'report'
    ),'{}'::jsonb),true);
  end if;

  -- P0 FREE QA: exact-envelope equality is required for EACH compacted body.
  -- The client rebuilds all five fields before canonical reconciliation.
  -- Security stays server-side; a missing flag leaves the response untouched.
  IF public.iberfit_current_role_v26() IN ('client','cliente')
     AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
        WHERE s.key='environment' AND s.value#>>'{}'='QA')
     AND EXISTS (SELECT 1 FROM auth.users u
        WHERE u.id=auth.uid() AND lower(u.email)='qa.rc74.client-a@iberfit.cl')
     AND EXISTS (SELECT 1 FROM public.iberfit_system_settings s
        WHERE s.key='free_client_body_envelope_compact_v1' AND s.value#>>'{}'='true')
  THEN
    v_payload := jsonb_set(v_payload,'{data,m26Entities}',
      COALESCE((
        SELECT jsonb_agg(
          CASE WHEN item->>'entityType' IN ('planning','session','session_execution')
            AND jsonb_typeof(item->'body')='object'
            AND NOT (item ? '__iberfitQaClientBodyMetaV1')
            AND item->'body'->>'id'=item->>'entityId'
            AND item->'body'->>'clientId'=item->>'clientId'
            AND item->'body'->>'status'=item->>'status'
            AND item->'body'->>'revision'=item->>'revision'
            AND item->'body'->>'updatedAt'=item->>'updatedAt'
            THEN (item-'body')||jsonb_build_object(
              'body',(item->'body') - ARRAY['id','clientId','status','revision','updatedAt']::text[],
              '__iberfitQaClientBodyMetaV1',1)
            ELSE item END ORDER BY ordinal
        )
        FROM jsonb_array_elements(COALESCE(v_payload#>'{data,m26Entities}','[]'::jsonb))
          WITH ORDINALITY AS objects(item,ordinal)
      ),'[]'::jsonb),true);
  END IF;
  return v_payload;
end
$function$;

SELECT 1/(CASE WHEN
  EXISTS (SELECT 1 FROM public.iberfit_system_settings s WHERE s.key='environment' AND s.value#>>'{}'='QA')
  AND md5(pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure))='243c5df0f05cb35fffd3cf777a5932c5'
  AND EXISTS (
  SELECT 1 FROM pg_proc p
  WHERE p.oid='public.iberfit_bootstrap_v26()'::regprocedure
    AND p.prosecdef AND p.provolatile='s'
    AND p.proconfig @> ARRAY['search_path=""']::text[]
    AND pg_get_userbyid(p.proowner)='postgres'
)
AND has_function_privilege('authenticated','public.iberfit_bootstrap_v26()','EXECUTE')
AND has_function_privilege('service_role','public.iberfit_bootstrap_v26()','EXECUTE')
AND NOT has_function_privilege('anon','public.iberfit_bootstrap_v26()','EXECUTE')
THEN 1 ELSE 0 END) AS p0_qa_bootstrap_source_acl_guard;

NOTIFY pgrst, 'reload schema';
