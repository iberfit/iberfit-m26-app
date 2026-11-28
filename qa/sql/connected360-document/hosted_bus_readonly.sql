BEGIN READ ONLY;
-- Catalog-only inspection for the deployed GX350 M26 path. No writes, auth
-- impersonation, real identities or report reads. Run before any activation.
-- A QA fingerprint is not a production authorization. Report the exact
-- assurance variant; never replace the stronger PROD assurance with QA.
WITH expected(signature,digest,prod_digest,browser) AS (VALUES
 ('public.iberfit_execute_command_v26(jsonb)','dda28c8b1b48944adf8fa4c1317224a9',NULL,true),
 ('public.iberfit_execute_command_v26_pre_action_outcome(jsonb)','b12a61e2c221691aea8422697851e524',NULL,false),
 ('public.iberfit_execute_command_v26_pre_crm_renewal(jsonb)','897ed04a09045171aad0089530b10cf9','ac088cd2fb9c9b7aecfea56aea16d325',false),
 ('public.iberfit_execute_command_v26_pre_rc74_4h(jsonb)','2de4d90506d27da6d085c1156b5cc615',NULL,false),
 ('public.iberfit_execute_command_v26_pre_training_service_guard_v1(jsonb)','c8de2236a935b73da2368ab3b556151c',NULL,false),
 ('public.iberfit_execute_command_v26_pre_v65e(jsonb)','65e512d6ef85e00a98ac548f183a3ee7',NULL,false),
 ('public.iberfit_execute_command_v26_rc29(jsonb)','9ac9d2ae740b433a161f21cca2015a0c',NULL,false),
 ('public.iberfit_m44_report_private_body_guard_v1()','46ca7fda3e66592e007a127acc9143b5',NULL,false),
 ('public.iberfit_m44_report_public_projection_v1()','d1ee7050ad8b4a0a1a47d4a52fa62cae',NULL,false),
 ('public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)','74b32e905e753f3c164538b9adc6c70c',NULL,false),
 ('public.iberfit_persist_entity_v26_rc29(text,uuid,uuid,text,bigint,jsonb)','8ab7f549c2afa1db75f7fa2900c0b6af',NULL,false),
 ('public.iberfit_prepare_command_rc30_v26(jsonb)','68d42390889e7b7cbf8d2f9df437715a',NULL,false),
 ('public.iberfit_prepare_command_rc30_v26_pre_rc74_4(jsonb)','2414ce7aaa3c89227590bd366aee40e9',NULL,false)
), checked AS (
 SELECT e.*,md5(replace(pg_get_functiondef(p.oid),chr(13),'')) AS actual,
   p.oid IS NOT NULL AND p.prosecdef AND has_function_privilege('authenticated',p.oid,'EXECUTE')=e.browser AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AS acl_ok
 FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
), registry_expected(command_type,event_name,roles,reason,preview,snapshot) AS (VALUES
 ('INFORME_APROBAR','APROBAR',ARRAY['admin','coach']::text[],false,false,false),
 ('INFORME_PUBLICAR','PUBLICAR',ARRAY['admin','coach']::text[],false,true,true),
 ('INFORME_RETIRAR','RETIRAR',ARRAY['admin','coach']::text[],true,false,false),
 ('INFORME_ANULAR','ANULAR',ARRAY['admin']::text[],true,false,false)
), registry_checks AS (
 SELECT e.command_type,r.command_type IS NOT NULL AND r.enabled AND r.entity_type='report' AND r.event_name=e.event_name AND r.allowed_roles=e.roles AND r.requires_reason=e.reason AND r.requires_preview=e.preview AND r.snapshot_on_apply=e.snapshot AND NOT r.bootstrap_allowed AND r.conflict_sensitive AS ok
 FROM registry_expected e LEFT JOIN public.domain_command_registry_v26 r USING(command_type)
), transitions_expected(from_status,event_name,to_status) AS (VALUES
 ('borrador','APROBAR','aprobado'),('aprobado','PUBLICAR','publicado'),('publicado','RETIRAR','retirado'),('borrador','ANULAR','anulado'),('aprobado','ANULAR','anulado')
), transition_drift AS (
 (SELECT from_status,event_name,to_status FROM transitions_expected EXCEPT SELECT from_status,event_name,to_status FROM public.domain_transitions_v26 WHERE entity_type='report')
 UNION ALL
 (SELECT from_status,event_name,to_status FROM public.domain_transitions_v26 WHERE entity_type='report' EXCEPT SELECT from_status,event_name,to_status FROM transitions_expected)
)
SELECT count(*) AS checked_functions,
 count(*) FILTER(WHERE acl_ok AND actual=digest) AS qa_exact,
 count(*) FILTER(WHERE acl_ok AND actual=coalesce(prod_digest,digest)) AS prod_exact,
 count(*) FILTER(WHERE acl_ok IS NOT TRUE OR actual IS NULL OR (actual<>digest AND actual IS DISTINCT FROM prod_digest)) AS unrecognized,
 count(*) FILTER(WHERE acl_ok IS NOT TRUE) AS acl_failures,
 (SELECT count(*) FROM registry_checks WHERE ok IS TRUE) AS registry_passed,
 (SELECT count(*) FROM transition_drift) AS transition_drift,
 CASE WHEN count(*) FILTER(WHERE acl_ok AND actual=digest)=count(*) THEN 'qa_known'
 WHEN count(*) FILTER(WHERE acl_ok AND actual=coalesce(prod_digest,digest))=count(*) THEN 'prod_stronger_assurance_known' ELSE 'drift' END AS variant
FROM checked;
-- Actual preparer only (inspected read-only), not the write command bus.
-- Synthetic UUIDs and evidence; exact inputs are not persisted.
WITH base AS (SELECT jsonb_build_object('operationId','10000000-0000-4000-8000-000000000001','entityType','report','entityId','10000000-0000-4000-8000-000000000002','clientId','10000000-0000-4000-8000-000000000003','baseRevision',1,'conflictSensitive',false) AS j), inputs AS (
 SELECT 'approve' AS action,j||jsonb_build_object('type','INFORME_APROBAR','payload',jsonb_build_object('patch',jsonb_build_object('evidence',jsonb_build_array(jsonb_build_object('source','connected360:health_connect:10000000-0000-4000-8000-000000000004','label','Synthetic','text','Synthetic','quality','Synthetic'))))) AS command FROM base
 UNION ALL SELECT 'publish',j||jsonb_build_object('type','INFORME_PUBLICAR','payload',jsonb_build_object('previewConfirmed',true,'targetClientId',j->>'clientId')) FROM base
), checks AS (SELECT action,command,public.iberfit_prepare_command_rc30_v26(command) AS result FROM inputs)
SELECT action,result->>'operationId'=command->>'operationId' AND result->>'clientId'=command->>'clientId' AND result->>'entityId'=command->>'entityId' AND result->'baseRevision'=command->'baseRevision' AND result->'conflictSensitive'='true'::jsonb AND result->'payload'=command->'payload' AS passed FROM checks ORDER BY action;
ROLLBACK;
