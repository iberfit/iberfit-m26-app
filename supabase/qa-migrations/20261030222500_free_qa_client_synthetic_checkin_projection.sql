-- P0 QA-only: suppress automated certification check-ins only from Client bootstrap;
-- preserve all PostgreSQL rows, audit, direct RLS reads and Coach/Admin contracts.
DO $qa_guard$
BEGIN
 IF (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment') IS DISTINCT FROM 'QA' THEN
 RAISE EXCEPTION 'IBERFIT_FREE_QA_ONLY' USING ERRCODE='42501'; END IF;
 IF md5(pg_get_functiondef('public.iberfit_bootstrap_v26_pre_v65e()'::regprocedure)) <> '7416e0d52d6fa069cf467e95420d4034' THEN
 RAISE EXCEPTION 'IBERFIT_FREE_SOURCE_DRIFT' USING ERRCODE='42501'; END IF;
END; $qa_guard$;
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
      AND NOT (
        v_role in ('client','cliente')
        AND (SELECT value #>> '{}' FROM public.iberfit_system_settings WHERE key='environment')='QA'
        AND c.status='confirmado'
        AND c.notes LIKE 'IBERFIT QA write certification %'
        AND c.created_by=(SELECT id FROM auth.users WHERE email='qa.rc74.client-a@iberfit.cl')
      )
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

