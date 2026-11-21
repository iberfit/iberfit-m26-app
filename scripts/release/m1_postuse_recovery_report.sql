-- M1 read-only post-use integrity inventory; aggregate output only.
WITH x AS (
 SELECT o.id,o.client_id,o.session_id,o.appointment_id,o.status,o.execution_id,
  t.id typed_id,t.client_id typed_client,t.session_id typed_session,
  t.occurrence_id typed_occurrence,t.revision typed_revision,t.summary typed_summary,
  d.entity_id domain_id,d.client_id domain_client,
  d.revision domain_revision,d.status domain_status,d.body domain_body
 FROM public.training_session_occurrences_v1 o
 LEFT JOIN public.session_executions t ON t.id=o.execution_id
 LEFT JOIN public.domain_entities_v26 d
   ON d.entity_type='session_execution' AND d.entity_id=o.execution_id
), counts AS (
 SELECT count(*)::integer total,
 count(*) FILTER(WHERE appointment_id IS NULL AND status<>'planificada')::integer autonomous_published,
 count(*) FILTER(WHERE appointment_id IS NULL AND status='completada')::integer autonomous_completed,
 count(*) FILTER(WHERE status='en_curso')::integer active,
 count(*) FILTER(WHERE status='completada')::integer completed,
 count(*) FILTER(WHERE status IN ('en_curso','completada') AND execution_id IS NULL)::integer missing_execution_id,
 count(*) FILTER(WHERE execution_id IS NOT NULL AND (
   typed_id IS NULL OR domain_id IS NULL
   OR typed_client IS DISTINCT FROM client_id
   OR typed_session IS DISTINCT FROM session_id
   OR typed_occurrence IS DISTINCT FROM id
   OR domain_client IS DISTINCT FROM client_id
   OR typed_revision IS DISTINCT FROM domain_revision
   OR typed_summary IS DISTINCT FROM domain_body
   OR NOT (domain_status=status OR (status='en_curso' AND domain_status='pausada'))
 ))::integer execution_drift
 FROM x
), dated AS (
 SELECT count(*)::integer dated_history,
 count(*) FILTER(WHERE o.id IS NULL OR o.execution_id IS DISTINCT FROM s.id)::integer orphan_dated
 FROM public.session_executions s
 LEFT JOIN public.training_session_occurrences_v1 o ON o.id=s.occurrence_id
 WHERE s.occurrence_id IS NOT NULL
), locks AS (
 SELECT count(*)::integer active_locks FROM public.active_execution_locks_v26
)
SELECT jsonb_build_object(
 'schema','iberfit.m1.postuse.recovery.v1',
 'environment',(SELECT value#>>'{}' FROM public.iberfit_system_settings WHERE key='environment'),
 'u72Installed',to_regprocedure('private.iberfit_u72_occurrence_pause_resume_v1(jsonb)') IS NOT NULL,
 'u60Authenticated',has_function_privilege('authenticated','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE'),
 'u60Anonymous',has_function_privilege('anon','public.iberfit_occurrence_api_u60_v1(text,jsonb)','EXECUTE'),
 'rls',(SELECT relrowsecurity FROM pg_class WHERE oid='public.training_session_occurrences_v1'::regclass),
 'counts',to_jsonb(counts.*)||to_jsonb(dated.*)||to_jsonb(locks.*)
) AS report FROM counts CROSS JOIN dated CROSS JOIN locks;
