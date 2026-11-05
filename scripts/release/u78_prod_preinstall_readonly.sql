-- U78 READ-ONLY production source schema readiness; NOT migration approval.
WITH pin(signature,source_hash,auth_granted) AS (VALUES
('public.iberfit_execute_command_v26(jsonb)','8a4800de487ef9f0babc51662e152fa0318cd56dd341e5b376fccda99ab5bea7',true),
('public.iberfit_execute_command_v26_rc29(jsonb)','5a157b889f720157223b625c7bb1314278ce506fff7cb4d06d29e88db17f1bd8',false),
('public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)','78bf27593b1e6f4277c73bacf04329eb21a0354f40557249d630df6a3da8bd9e',false),
('public.iberfit_persist_entity_v26_rc29(text,uuid,uuid,text,bigint,jsonb)','d436dd82a48644ce8701aa797b1323ebafe9b2b1dbde36872cd83c170374a9e9',false)
), writer AS (
 SELECT count(*) AS total,count(*) FILTER(WHERE p.oid IS NOT NULL
 AND encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')=pin.source_hash
 AND position(E'\r' IN replace(p.prosrc,E'\r\n',''))=0
 AND p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
 AND p.proconfig @> ARRAY['search_path=""']::text[]
 AND has_function_privilege('authenticated',p.oid,'EXECUTE')=pin.auth_granted
 AND NOT has_function_privilege('anon',p.oid,'EXECUTE')) AS verified
 FROM pin LEFT JOIN pg_proc p ON p.oid=to_regprocedure(pin.signature)
),checks(name,ok) AS (
 SELECT 'pg17', (current_setting('server_version_num')::int BETWEEN 170000 AND 179999)
 UNION ALL
 SELECT 'same_client_fk', (EXISTS(SELECT 1 FROM pg_constraint WHERE conname='appointments_session_client_signature_v1_fkey' AND convalidated AND conrelid=to_regclass('public.appointments')))
 UNION ALL
 SELECT 'session_key', (EXISTS(SELECT 1 FROM pg_constraint WHERE conname='sessions_id_client_id_signature_v1_key' AND convalidated AND conrelid=to_regclass('public.sessions')))
 UNION ALL
 SELECT 'u30_appointment_key_absent', (NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='appointments_id_client_session_u30_key' AND conrelid=to_regclass('public.appointments')))
 UNION ALL
 SELECT 'u30_occurrences_absent', (to_regclass('public.training_session_occurrences_v1') IS NULL)
 UNION ALL
 SELECT 'u30_execution_column_absent', (NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='session_executions' AND column_name='occurrence_id'))
 UNION ALL
 SELECT 'u36_gateway_absent', (to_regprocedure('public.iberfit_occurrence_api_v1(text,jsonb)') IS NULL)
 UNION ALL
 SELECT 'u60_gateway_absent', (to_regprocedure('public.iberfit_occurrence_api_u60_v1(text,jsonb)') IS NULL)
 UNION ALL
 SELECT 'u60_detail_absent', (to_regprocedure('public.iberfit_occurrence_detail_v1(uuid,uuid)') IS NULL)
 UNION ALL
 SELECT 'u31_private_absent', (to_regprocedure('private.iberfit_u31_occurrence_transition_v1(jsonb)') IS NULL)
 UNION ALL
 SELECT 'u32_private_absent', (to_regprocedure('private.iberfit_u32_create_occurrences_batch_v1(jsonb)') IS NULL)
 UNION ALL
 SELECT 'u33_private_absent', (to_regprocedure('private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer)') IS NULL)
 UNION ALL
 SELECT 'u34_private_absent', (to_regprocedure('private.iberfit_u34_coach_occurrence_change_v1(jsonb)') IS NULL)
 UNION ALL
 SELECT 'u30_u60_ledger_absent', ((SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20261025182000','20261025194000','20261025203500','20261025210500','20261025223000','20261025231500','20261025235500','20261104150000'))=0)
 UNION ALL
 SELECT 'session_executions_present', (to_regclass('public.session_executions') IS NOT NULL)
 UNION ALL
 SELECT 'command_receipts_present', (to_regclass('public.command_receipts_v26') IS NOT NULL)
 UNION ALL
 SELECT 'private_schema_present', (to_regnamespace('private') IS NOT NULL)
 UNION ALL
 SELECT 'legacy_writers_identical', ((SELECT total=4 AND verified=4 FROM writer))
 UNION ALL
 SELECT 'v26_executor_auth_granted', (has_function_privilege('authenticated','public.iberfit_execute_command_v26(jsonb)','EXECUTE'))
 UNION ALL
 SELECT 'appointments_rls', (coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.appointments')),false))
 UNION ALL
 SELECT 'sessions_rls', (coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.sessions')),false))
)
SELECT jsonb_build_object('schema','iberfit.u78.prod-preinstall-readonly.v1',
 'readOnly',true,'total',count(*),'passed',count(*) FILTER(WHERE ok),
 'failed',coalesce(jsonb_agg(name ORDER BY name) FILTER(WHERE NOT coalesce(ok,false)),'[]'::jsonb),
 'sourceSchemaCompatible',bool_and(coalesce(ok,false)),
 'backupCertifiedByThisQuery',false,'deploymentApproved',false) AS report
FROM checks;
