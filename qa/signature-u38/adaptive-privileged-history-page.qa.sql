-- U38 QA-ONLY keyset history page reader with section-aware budgets.
-- Requires U37 tested QA schema, existing WebAuthn assurances and explicit rollout.
-- Never pass this file to production migration runners. No existing functions,
-- grants, RLS, auth or data are modified. Use the documented rollback file.
SELECT 1/(CASE WHEN (
  SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment'
)='QA'
 AND md5(pg_get_functiondef('private.iberfit_history_page_internal_u37_qa(uuid,text,timestamptz,jsonb,bigint,integer)'::regprocedure))
   ='9e37c298970aaa022befa69e9f585c10'
 AND md5(pg_get_functiondef('public.iberfit_privileged_history_page_u37_qa(uuid,text,timestamptz,jsonb,bigint,integer)'::regprocedure))
   ='c631760341a93e9105eea80685060648'
 AND to_regprocedure('private.iberfit_history_page_internal_u38_qa(uuid,text,timestamptz,jsonb,bigint,integer)') IS NULL
 AND to_regprocedure('public.iberfit_privileged_history_page_u38_qa(uuid,text,timestamptz,jsonb,bigint,integer)') IS NULL
THEN 1 ELSE 0 END) AS u38_qa_source_baseline_and_clean_install_required;

CREATE OR REPLACE FUNCTION private.iberfit_history_page_internal_u38_qa(p_client_id uuid, p_section text, p_snapshot_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor jsonb DEFAULT NULL::jsonb, p_expected_count bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 32)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_fence timestamptz := coalesce(p_snapshot_at,statement_timestamp());
  v_before_at timestamptz;
  v_before_id text;
  v_before_type text;
  v_total bigint;
  v_records jsonb := '[]'::jsonb;
  v_more boolean := false;
  v_next jsonb;
  v_revisions jsonb := '{}'::jsonb;
begin
  -- Security-definer must never rely on an untrusted client_id or frontend role.
  if auth.uid() is null or p_client_id is null then
    raise exception 'U35_HISTORY_FORBIDDEN' using errcode='42501';
  end if;
  v_role := public.iberfit_current_role_v26();
  if v_role not in ('coach','admin') or
     public.iberfit_can_access_client_v26(p_client_id) is not true or
     public.iberfit_canary_enabled_v26(p_client_id) is not true or
     not exists (select 1 from public.clients c where c.id=p_client_id) then
    raise exception 'U35_HISTORY_FORBIDDEN' using errcode='42501';
  end if;
  if p_section is null or p_section not in ('m26Entities','domainEvents','sessionExecutions')
     or p_limit is null or p_limit<1
     or (p_section='m26Entities' and p_limit>256)
     or (p_section='domainEvents' and p_limit>512)
     or (p_section='sessionExecutions' and p_limit>64) then
    raise exception 'U35_HISTORY_ARGUMENT_INVALID' using errcode='22023';
  end if;
  if v_fence>statement_timestamp() or
     (p_snapshot_at is null and (p_cursor is not null or p_expected_count is not null)) then
    raise exception 'U35_HISTORY_SNAPSHOT_INVALID' using errcode='22023';
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object'
       or not (p_cursor ? 'at' and p_cursor ? 'id')
       or jsonb_typeof(p_cursor->'at')<>'string'
       or jsonb_typeof(p_cursor->'id')<>'string'
       or nullif(p_cursor->>'id','') is null
       or p_expected_count is null then
      raise exception 'U35_HISTORY_CURSOR_INVALID' using errcode='22023';
    end if;
    v_before_at := (p_cursor->>'at')::timestamptz;
    v_before_id := p_cursor->>'id';
    v_before_type := p_cursor->>'type';
    if v_before_at>v_fence then
      raise exception 'U35_HISTORY_CURSOR_INVALID' using errcode='22023';
    end if;
  end if;

  if p_section='m26Entities' then
    if p_cursor is not null and (nullif(v_before_type,'') is null or
       jsonb_typeof(p_cursor->'type')<>'string') then
      raise exception 'U35_HISTORY_CURSOR_INVALID' using errcode='22023';
    end if;
    select count(*) into v_total from public.domain_entities_v26 e
    where e.client_id=p_client_id and e.updated_at<=v_fence;
    if p_snapshot_at is not null and exists (
      select 1 from public.domain_entities_v26 e
      where e.client_id=p_client_id and e.updated_at>v_fence
    ) then
      raise exception 'U35_HISTORY_SNAPSHOT_CHANGED_RESTART' using errcode='40001';
    end if;
    with page as materialized (
      select e.* from public.domain_entities_v26 e
      where e.client_id=p_client_id and e.updated_at<=v_fence
        and (v_before_at is null or
          (e.updated_at,e.entity_type,e.entity_id)<
          (v_before_at,v_before_type,v_before_id::uuid))
      order by e.updated_at desc,e.entity_type desc,e.entity_id desc
      limit (p_limit+1)
    ), numbered as (
      select page.*,row_number() over (
        order by updated_at desc,entity_type desc,entity_id desc
      ) as rn from page
    )
    select
      (select coalesce(jsonb_agg(jsonb_build_object(
        'entityType',e.entity_type,'entityId',e.entity_id,
        'clientId',e.client_id,'status',e.status,'revision',e.revision,
        'body',e.body,'updatedAt',e.updated_at
      ) order by e.rn),'[]'::jsonb) from numbered e where e.rn<=p_limit),
      (select exists(select 1 from numbered e where e.rn>p_limit)),
      (select jsonb_build_object('at',e.updated_at,'type',e.entity_type,
        'id',e.entity_id::text) from numbered e where e.rn<=p_limit
        order by e.rn desc limit 1)
    into v_records,v_more,v_next;
    select coalesce(jsonb_object_agg(
      (e.value->>'entityType')||':'||(e.value->>'entityId'),e.value->'revision'
    ),'{}'::jsonb) into v_revisions
    from jsonb_array_elements(v_records) e(value);

  elsif p_section='domainEvents' then
    if p_cursor is not null and (v_before_id !~ '^[0-9]{1,19}$') then
      raise exception 'U35_HISTORY_CURSOR_INVALID' using errcode='22023';
    end if;
    select count(*) into v_total from public.domain_events_v26 e
    where e.client_id=p_client_id and e.created_at<=v_fence;
    -- Domain events are append-only. Newer writes are outside this fence.
    with page as materialized (
      select e.* from public.domain_events_v26 e
      where e.client_id=p_client_id and e.created_at<=v_fence
        and (v_before_at is null or
          (e.created_at,e.id)<(v_before_at,v_before_id::bigint))
      order by e.created_at desc,e.id desc limit (p_limit+1)
    ), numbered as (
      select page.*,row_number() over (
        order by created_at desc,id desc
      ) as rn from page
    )
    select
      (select coalesce(jsonb_agg(to_jsonb(e)-'rn' order by e.rn),'[]'::jsonb)
       from numbered e where e.rn<=p_limit),
      (select exists(select 1 from numbered e where e.rn>p_limit)),
      (select jsonb_build_object('at',e.created_at,'id',e.id::text)
       from numbered e where e.rn<=p_limit order by e.rn desc limit 1)
    into v_records,v_more,v_next;

  else
    if p_cursor is not null and v_before_id !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception 'U35_HISTORY_CURSOR_INVALID' using errcode='22023';
    end if;
    select count(*) into v_total from public.session_executions e
    where e.client_id=p_client_id and e.updated_at<=v_fence;
    if p_snapshot_at is not null and exists (
      select 1 from public.session_executions e
      where e.client_id=p_client_id and e.updated_at>v_fence
    ) then
      raise exception 'U35_HISTORY_SNAPSHOT_CHANGED_RESTART' using errcode='40001';
    end if;
    with page as materialized (
      select e.* from public.session_executions e
      where e.client_id=p_client_id and e.updated_at<=v_fence
        and (v_before_at is null or
          (e.updated_at,e.id)<(v_before_at,v_before_id::uuid))
      order by e.updated_at desc,e.id desc limit (p_limit+1)
    ), numbered as (
      select page.*,row_number() over (
        order by updated_at desc,id desc
      ) as rn from page
    )
    select
      (select coalesce(jsonb_agg(to_jsonb(e)-'rn' order by e.rn),'[]'::jsonb)
       from numbered e where e.rn<=p_limit),
      (select exists(select 1 from numbered e where e.rn>p_limit)),
      (select jsonb_build_object('at',e.updated_at,'id',e.id::text)
       from numbered e where e.rn<=p_limit order by e.rn desc limit 1)
    into v_records,v_more,v_next;
  end if;

  -- Detect deletes / changed cardinality between pages. Do not silently
  -- present an incomplete history after concurrent mutation.
  if p_expected_count is not null and v_total<>p_expected_count then
    raise exception 'U35_HISTORY_SNAPSHOT_CHANGED_RESTART' using errcode='40001';
  end if;
  -- Cost ceiling independent from requested row count; never serialize
  -- unbounded notes or large execution bodies in one browser response.
  IF octet_length(v_records::text)>1800000 THEN
    RAISE EXCEPTION 'U38_PAGE_BODY_BUDGET_EXCEEDED' USING errcode='54000';
  END IF;
  return jsonb_build_object(
    'schema','iberfit.u35.privileged-history-page.qa.v1',
    'section',p_section,'snapshotAt',v_fence,'totalCount',v_total,
    'hasMore',v_more,'nextCursor',case when v_more then v_next else null end,
    'records',v_records,'remoteRevisions',v_revisions
  );
end
$function$
;

CREATE OR REPLACE FUNCTION public.iberfit_privileged_history_page_u38_qa(p_client_id uuid, p_section text, p_snapshot_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor jsonb DEFAULT NULL::jsonb, p_expected_count bigint DEFAULT NULL::bigint, p_limit integer DEFAULT 32)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_role text; v_assurance jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'U37_AUTH_REQUIRED' USING errcode='42501';
  END IF;
  v_role:=public.iberfit_current_role_v26();
  IF v_role NOT IN ('coach','admin') THEN
    RAISE EXCEPTION 'U37_PRIVILEGED_ROLE_REQUIRED' USING errcode='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.iberfit_system_settings s WHERE s.key='environment'
      AND s.value#>>'{}'='QA'
  ) THEN
    RAISE EXCEPTION 'U37_QA_ONLY' USING errcode='42501';
  END IF;
  PERFORM public.iberfit_require_privileged_assurance_v65d();
  -- Require an explicitly privileged and verified real session. Never infer
  -- assurance from a claimed role or from a passed QA fixture account.
  v_assurance:=public.iberfit_privileged_assurance_context_v65d();
  IF coalesce((v_assurance->>'privileged')::boolean,false) IS NOT TRUE
     OR v_assurance->>'iberfitAssurance' IS DISTINCT FROM 'verified' THEN
    RAISE EXCEPTION 'U37_PRIVILEGED_ASSURANCE_REQUIRED' USING errcode='42501';
  END IF;
  RETURN private.iberfit_history_page_internal_u38_qa(
    p_client_id,p_section,p_snapshot_at,p_cursor,p_expected_count,p_limit);
END
$function$
;

REVOKE ALL ON FUNCTION private.iberfit_history_page_internal_u38_qa(
  uuid,text,timestamptz,jsonb,bigint,integer
) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.iberfit_privileged_history_page_u38_qa(
  uuid,text,timestamptz,jsonb,bigint,integer
) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iberfit_privileged_history_page_u38_qa(
  uuid,text,timestamptz,jsonb,bigint,integer
) TO authenticated;
