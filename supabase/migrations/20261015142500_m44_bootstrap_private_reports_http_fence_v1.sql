-- M44 P0: Security-definer bootstrap must not return private report rows.
-- Existing PROD implementation uses SECURITY DEFINER and reads public.reports
-- without RLS, so raw report content can bypass the SELECT RLS policy.
-- Fail closed if a future baseline replaces the M43 bootstrap contract.
-- Idempotent: do not inject the projection twice.
do $m44_bootstrap$
declare
  v_definition text;
  v_anchor text:='  return v_payload;';
  v_guard text:='M44_REPORT_BOOTSTRAP_PRIVATE_PROJECTION_V1';
  v_patch text;
begin
  select pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure)
    into v_definition;
  if v_definition is null then
    raise exception 'M44_BOOTSTRAP_FUNCTION_MISSING';
  end if;
  if position(v_guard in v_definition)>0 then return;end if;
  if position('-- M43: SECURITY DEFINER bootstrap' in v_definition)=0
     or (length(v_definition)-length(replace(v_definition,v_anchor,'')))<>length(v_anchor)
  then
    raise exception 'M44_BOOTSTRAP_BASELINE_CHANGED_REVIEW_REQUIRED';
  end if;
  v_patch:=$projection$
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
$projection$;
  execute replace(v_definition,v_anchor,v_patch||v_anchor);
  if position(v_guard in pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure))=0
  then raise exception 'M44_BOOTSTRAP_PROJECTION_INSTALL_NOT_VERIFIED';end if;
end
$m44_bootstrap$;

-- Contract invariant: only authenticated tokens can invoke bootstrap.
-- The existing bootstrap privilege set is unchanged by this migration.
