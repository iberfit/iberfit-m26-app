BEGIN;

-- This publication boundary is at the server, not the browser UI.
-- Helpers are invoker-only, immutable and have no table access.
CREATE OR REPLACE FUNCTION public.iberfit_m43_client_safe_block_v2(p_body jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO '' AS $safe$
 WITH raw AS (SELECT CASE WHEN jsonb_typeof(p_body)='object' THEN p_body ELSE '{}'::jsonb END x)
 SELECT public.iberfit_m43_client_scalar_fields_v1(b.x,ARRAY['id','type','groupId','exerciseId','name','sets','reps','restSeconds','tempo','range','load','loadKg','plannedLoad','targetRpe','targetRir','durationSeconds','alternativeId','plannedDurationMinutes','plannedDistanceKm','plannedDistanceM','poolLengthM','plannedSpeedKmh','plannedCadenceRpm','plannedPowerWatts','plannedWarmupMinutes','plannedCooldownMinutes','plannedPace','plannedPacePer100M','targetHeartRateZone','targetHeartRateBpm','plannedElevationM','intervalRepetitions','intervalWorkSeconds','intervalRecoverySeconds','intervalDistanceM','measurementProfile','prescriptionNotes','progression','rounds']::text[])
   || CASE WHEN jsonb_typeof(b.x->'exerciseIds')='array' THEN
     jsonb_build_object('exerciseIds',COALESCE((
       SELECT jsonb_agg(val ORDER BY ord)
       FROM (SELECT val,ord FROM jsonb_array_elements(b.x->'exerciseIds')
             WITH ORDINALITY a(val,ord)
             WHERE jsonb_typeof(val)='string'
               AND (val #>> '{}') ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
             ORDER BY ord LIMIT 12) ids
     ),'[]'::jsonb)) ELSE '{}'::jsonb END
   || CASE WHEN jsonb_typeof(b.x->'prescriptions')='object'
         AND jsonb_typeof(b.x->'exerciseIds')='array' THEN
     jsonb_build_object('prescriptions',COALESCE((
       SELECT jsonb_object_agg(p.k,
         public.iberfit_m43_client_scalar_fields_v1(p.val,ARRAY['id','type','groupId','exerciseId','name','sets','reps','restSeconds','tempo','range','load','loadKg','plannedLoad','targetRpe','targetRir','durationSeconds','alternativeId','plannedDurationMinutes','plannedDistanceKm','plannedDistanceM','poolLengthM','plannedSpeedKmh','plannedCadenceRpm','plannedPowerWatts','plannedWarmupMinutes','plannedCooldownMinutes','plannedPace','plannedPacePer100M','targetHeartRateZone','targetHeartRateBpm','plannedElevationM','intervalRepetitions','intervalWorkSeconds','intervalRecoverySeconds','intervalDistanceM','measurementProfile','prescriptionNotes','progression','rounds']::text[]))
       FROM jsonb_each(b.x->'prescriptions') p(k,val)
       WHERE jsonb_typeof(p.val)='object'
       AND EXISTS(SELECT 1 FROM (
         SELECT (v #>> '{}') id FROM jsonb_array_elements(b.x->'exerciseIds')
           WITH ORDINALITY x(v,ord)
         WHERE jsonb_typeof(v)='string'
           AND (v #>> '{}') ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
         ORDER BY ord LIMIT 12
       ) ids WHERE ids.id=p.k)
     ),'{}'::jsonb)) ELSE '{}'::jsonb END
 FROM raw b;
$safe$;
CREATE OR REPLACE FUNCTION public.iberfit_m43_client_safe_plan_v2(p_body jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO '' AS $safe$
 SELECT public.iberfit_m43_client_scalar_fields_v1(p_body,
   ARRAY['id','clientId','name','title','goal','summary','startDate','endDate',
         'modality','weeklyFrequency','sessionDurationMinutes','status','createdAt',
         'updatedAt','approvedAt','publishedAt','revision','publishedRevision',
         'visibleToClient']::text[]);
$safe$;
CREATE OR REPLACE FUNCTION public.iberfit_m43_client_safe_session_v2(p_body jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO '' AS $safe$
 WITH raw AS (SELECT CASE WHEN jsonb_typeof(p_body)='object' THEN p_body ELSE '{}'::jsonb END x)
 SELECT public.iberfit_m43_client_scalar_fields_v1(b.x,
   ARRAY['id','clientId','cycleId','appointmentId','title','objective','summary',
         'durationMinutes','deliveryModality','deliveryOwnership','clientVisibilityLevel',
         'status','visibleToClient','createdAt','updatedAt','publishedAt',
         'enabledAt','startedAt','completedAt','revision','publishedRevision',
         'startDate','endDate','autoEnabledAfterPublish']::text[])
   || jsonb_build_object('blocks',CASE
     WHEN lower(coalesce(b.x->>'deliveryModality',b.x->>'execution_type','')) IN
           ('presencial','online','supervisada','coach_led')
       OR lower(coalesce(b.x->>'deliveryOwnership','')) IN ('coach_led','live_online')
       OR lower(coalesce(b.x->>'clientVisibilityLevel','')) IN ('hidden','summary_only','summary-only')
       OR lower(coalesce(b.x->>'visibleToClient','true')) IN ('false','0','no')
       THEN '[]'::jsonb
     ELSE COALESCE((
       SELECT jsonb_agg(public.iberfit_m43_client_safe_block_v2(block) ORDER BY ord)
       FROM (SELECT block,ord FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(b.x->'blocks')='array'
              THEN b.x->'blocks' ELSE '[]'::jsonb END)
         WITH ORDINALITY a(block,ord) ORDER BY ord LIMIT 120) allowed_blocks
     ),'[]'::jsonb) END)
 FROM raw b;
$safe$;
REVOKE ALL ON FUNCTION public.iberfit_m43_client_safe_block_v2(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.iberfit_m43_client_safe_plan_v2(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.iberfit_m43_client_safe_session_v2(jsonb) FROM PUBLIC,anon,authenticated;

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
  return v_payload;
end
$function$
;
COMMIT;
