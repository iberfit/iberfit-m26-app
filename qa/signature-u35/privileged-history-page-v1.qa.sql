-- U35 QA-ONLY candidate. Do not include in Supabase migration bundles.
-- Not exposed in PostgREST. Validation must run in a single BEGIN ... ROLLBACK.
-- This function does not replace the production bootstrap or any command.
create or replace function private.iberfit_privileged_history_page_u35_qa(
  p_client_id uuid,
  p_section text,
  p_snapshot_at timestamptz default null,
  p_cursor jsonb default null,
  p_expected_count bigint default null,
  p_limit integer default 32
)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $u35$
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
     or p_limit is null or p_limit<1 or p_limit>32 then
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
  return jsonb_build_object(
    'schema','iberfit.u35.privileged-history-page.qa.v1',
    'section',p_section,'snapshotAt',v_fence,'totalCount',v_total,
    'hasMore',v_more,'nextCursor',case when v_more then v_next else null end,
    'records',v_records,'remoteRevisions',v_revisions
  );
end
$u35$;

-- Deliberately never expose the QA private candidate to browser or service_role.
revoke all on function private.iberfit_privileged_history_page_u35_qa(
  uuid,text,timestamptz,jsonb,bigint,integer
) from public,anon,authenticated,service_role;
