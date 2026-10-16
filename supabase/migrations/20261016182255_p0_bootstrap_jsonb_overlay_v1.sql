-- P0 QA-only candidate; full 4-role exact JSON equality and 12-run timings verified 2026-10-16.
-- Do not alter assurance, RLS, ownership, EXECUTE ACL or statement_timeout.
-- Migration committed under Supabase-generated version after QA application.
DO $p0_guard$ BEGIN
 IF md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_v65e()'::regprocedure)) <> '115246a2fb1aea298d023e44508c7dba' THEN
  RAISE EXCEPTION 'P0_BOOTSTRAP_BASELINE_CHANGED_REVIEW_REQUIRED';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.iberfit_bootstrap_v26_pre_v65e()'::regprocedure AND prosecdef AND provolatile='s' AND proconfig @> ARRAY['search_path=""']::text[]) THEN
  RAISE EXCEPTION 'P0_BOOTSTRAP_SECURITY_ATTRIBUTES_CHANGED';
 END IF;
END $p0_guard$;

CREATE OR REPLACE FUNCTION public.iberfit_bootstrap_v26_pre_v65e()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  v_data jsonb;
  v_role text;
  v_revisions jsonb;
  v_updates jsonb:='{}'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_role:=public.iberfit_current_role_v26();
  v_result:=public.iberfit_bootstrap_v26_rc29();
  v_data:=coalesce(v_result->'data','{}'::jsonb);

  v_updates:=v_updates || jsonb_build_object('clientProfiles',coalesce((
    select jsonb_agg(
      item || coalesce(item->'profile','{}'::jsonb) || jsonb_build_object(
        'clientId',coalesce(item->>'client_id',item->>'clientId'),
        'profile',coalesce(item->'profile','{}'::jsonb)
      )
    )
    from jsonb_array_elements(coalesce(v_data->'clientProfiles','[]'::jsonb)) item
  ),'[]'::jsonb));

  v_updates:=v_updates || jsonb_build_object('iriAssessments',coalesce((
    select jsonb_agg(
      item || coalesce(item->'sections','{}'::jsonb) || jsonb_build_object(
        'clientId',coalesce(item->>'client_id',item->>'clientId'),
        'assessmentDate',coalesce(item->>'evaluated_at',item#>>'{sections,assessmentDate}'),
        'body',coalesce(item->'sections','{}'::jsonb)||jsonb_build_object(
          'id',item->'id',
          'clientId',coalesce(item->>'client_id',item->>'clientId'),
          'status',case item->>'status'
            when 'revisión' then 'completo'
            when 'retirado' then 'sustituido'
            else item->>'status'
          end,
          'revision',coalesce((item->>'revision')::bigint,0)
        )
      )
    )
    from jsonb_array_elements(coalesce(v_data->'iriAssessments','[]'::jsonb)) item
  ),'[]'::jsonb));

  v_updates:=v_updates || jsonb_build_object('checkins',coalesce((
    with candidates as materialized (
      select distinct client_id from public.client_checkins_v26
    ), visible as materialized (
      select client_id from candidates
      where public.iberfit_can_access_client_v26(client_id)
    )
    select jsonb_agg(to_jsonb(c) order by c.recorded_at desc)
    from public.client_checkins_v26 c
    where exists (select 1 from visible v where v.client_id is not distinct from c.client_id)
  ),'[]'::jsonb));

  v_updates:=v_updates || jsonb_build_object('habits',coalesce((
    select jsonb_agg(to_jsonb(h) order by h.updated_at desc)
    from public.client_habits_v26 h
    where public.iberfit_can_access_client_v26(h.client_id)
  ),'[]'::jsonb));

  v_updates:=v_updates || jsonb_build_object('habitLogs',coalesce((
    select jsonb_agg(to_jsonb(l) order by l.recorded_at desc)
    from public.client_habit_logs_v26 l
    where public.iberfit_can_access_client_v26(l.client_id)
  ),'[]'::jsonb));

  if v_role=any(array['admin','coach']) then
    v_updates:=v_updates || jsonb_build_object('privateNotes',coalesce((
      select jsonb_agg(to_jsonb(n) order by n.updated_at desc)
      from public.coach_private_notes_v26 n
      where public.iberfit_can_access_client_v26(n.client_id)
    ),'[]'::jsonb));
  else
    v_updates:=v_updates || jsonb_build_object('privateNotes','[]'::jsonb);
    v_updates:=v_updates || jsonb_build_object('intelligenceRuns','[]'::jsonb);
    v_updates:=v_updates || jsonb_build_object('m26Entities',coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_data->'m26Entities','[]'::jsonb)) item
      where item->>'entityType' not in ('private_note','intelligence')
    ),'[]'::jsonb));
    v_updates:=v_updates || jsonb_build_object('domainEvents',coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_data->'domainEvents','[]'::jsonb)) item
      where item->>'entity_type' not in ('private_note','intelligence')
    ),'[]'::jsonb));
    select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
    into v_revisions
    from jsonb_each(coalesce(v_result->'remoteRevisions','{}'::jsonb))
    where key not like 'private_note:%'
      and key not like 'intelligence:%';
    v_result:=jsonb_set(v_result,'{remoteRevisions}',v_revisions,true);
  end if;

  v_data:=v_data || v_updates;
  v_result:=jsonb_set(v_result,'{data}',v_data,true);
  v_result:=jsonb_set(v_result,'{canary,version}','"M26-RC36-V12.3"'::jsonb,true);
  return v_result;
end
$function$
;
