-- Client HTTP projection for execution evidence. Reversible additive M43 QA migration.
-- No user data changes. Callers have no direct EXECUTE permission.
BEGIN;
CREATE OR REPLACE FUNCTION public.iberfit_m43_client_scalar_fields_v1(p_record jsonb,p_keys text[])
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO '' AS $safe$
 SELECT COALESCE(jsonb_object_agg(x.key,x.value),'{}'::jsonb)
 FROM jsonb_each(CASE WHEN jsonb_typeof(p_record)='object' THEN p_record ELSE '{}'::jsonb END) x
 WHERE x.key=ANY(p_keys) AND jsonb_typeof(x.value) IN ('string','number','boolean');
$safe$;
CREATE OR REPLACE FUNCTION public.iberfit_m43_client_safe_execution_v1(p_body jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO '' AS $safe$
 WITH body AS (
   SELECT CASE WHEN jsonb_typeof(p_body)='object' THEN p_body ELSE '{}'::jsonb END AS x
 ), result_rows AS (
   SELECT t.val,t.n FROM body b,
   LATERAL (
      SELECT v AS val, row_number() OVER (ORDER BY k)::bigint AS n
      FROM jsonb_each(CASE WHEN jsonb_typeof(b.x->'results')='object' THEN b.x->'results' ELSE '{}'::jsonb END) r(k,v)
      UNION ALL
      SELECT v AS val, 1000000 + idx::bigint AS n
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(b.x->'results')='array' THEN b.x->'results' ELSE '[]'::jsonb END)
           WITH ORDINALITY a(v,idx)
   ) t
 ), safe_results AS (
   SELECT COALESCE(jsonb_agg(public.iberfit_m43_client_scalar_fields_v1(val,
     ARRAY['blockId','exerciseId','setIndex','setNumber','reps','seconds','load','loadKg',
           'rpe','rir','distanceKm','distanceM','paceMinPerKm','pacePer100M',
           'avgSpeedKmh','avgHeartRateBpm','cadenceRpm','powerWatts','elevationGainM',
           'intervalsCompleted','completed','recordedAt','completedAt','correctedAt']::text[])
     ORDER BY n),'[]'::jsonb) AS rows FROM result_rows
 )
 SELECT public.iberfit_m43_client_scalar_fields_v1(b.x,
     ARRAY['id','clientId','sessionId','appointmentId','status','revision','title',
           'startedAt','completedAt','remoteConfirmedAt','localClosedAt','updatedAt',
           'executionStatus','currentBlockIndex','currentSetIndex']::text[])
   || jsonb_build_object('feedback',public.iberfit_m43_client_scalar_fields_v1(b.x->'feedback',
       ARRAY['sessionRpe','comment','pain','painNotes']::text[]),
      'results',r.rows,
      'sourceSnapshot',public.iberfit_m43_client_scalar_fields_v1(b.x->'sourceSnapshot',ARRAY['title']::text[]),
      'planSnapshot',public.iberfit_m43_client_scalar_fields_v1(b.x->'planSnapshot',ARRAY['title']::text[]))
 FROM body b CROSS JOIN safe_results r;
$safe$;
REVOKE ALL ON FUNCTION public.iberfit_m43_client_scalar_fields_v1(jsonb,text[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.iberfit_m43_client_safe_execution_v1(jsonb) FROM PUBLIC,anon,authenticated;

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
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_payload#>'{data,trainingCycles}','[]'::jsonb)) item
      where lower(coalesce(item->>'status','')) in
        ('publicado','publicada','published','disponible','en_curso',
         'activo','active','habilitado','enabled','completado','completada','completed')
    ),'[]'::jsonb),true);

    v_payload:=jsonb_set(v_payload,'{data,sessions}',coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(coalesce(v_payload#>'{data,sessions}','[]'::jsonb)) item
      where lower(coalesce(item->>'status','')) in
        ('publicado','publicada','published','disponible','en_curso',
         'activo','active','habilitado','enabled','completado','completada','completed')
    ),'[]'::jsonb),true);

    v_payload:=jsonb_set(v_payload,'{data,m26Entities}',coalesce((
      select jsonb_agg(case when item->>'entityType'='session_execution'
        then (item - 'body') || jsonb_build_object('body',public.iberfit_m43_client_safe_execution_v1(item->'body'))
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
