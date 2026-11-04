-- U60 read-only QA drift reconciliation; no mutations or user data.
-- Hashes match source bodies of U30-U36 inspected 2026-11-04.
-- Ready_for_U60 requires the seven canonical migration records (currently
-- missing on QA); do not insert them unless reconciled via official migration
-- repair and independently certified.
WITH expected(schema_name,function_name,body_sha256,definer,volatility) AS (
  VALUES ('public','iberfit_u30_occurrence_snapshot_guard_v1','215983b16b5c505255039bf5c9ef7b88a00b794f82a1a05488214d2180ff8528',false,'v'),
    ('private','iberfit_u31_occurrence_transition_v1','51c557cec4475edb707ccc006039d6ed5e3fff18f25014d9da21792b4a694230',true,'v'),
    ('private','iberfit_u32_build_execution_queue_v1','5cc253a1e4f94343befa1c18fab32f4f9df867b3aac29156fbd01624c2ebac9d',false,'i'),
    ('private','iberfit_u32_create_occurrences_batch_v1','100c1e8b8b9c711d3c5af66cd94ef17cbf310b631251eae7a1a872a5130b4566',true,'v'),
    ('private','iberfit_u32_appointment_writer_fence_v1','0d770b08e09f54b9fc01c2fafc0624e4e2df14a2df13ced8f3c3172f020dffa9',true,'v'),
    ('private','iberfit_u33_occurrence_calendar_v1','c3e2b899b1fd547a8a661b3dbb7515b617f3c136c1058c638af234464fb4c086',true,'s'),
    ('private','iberfit_u34_coach_occurrence_change_v1','e10585eed0526472763410944b0baa149c2e660de0a25ff069f6abd0042f1015',true,'v'),
    ('public','iberfit_occurrence_api_v1','ce048ae054b3787f1bb289fe3673ea9eb1cdb6154f568f6bdb2d40d236379253',true,'v')
), physical AS (
  SELECT e.*,
    p.oid IS NOT NULL AS found,
    (p.oid IS NOT NULL AND
      encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=e.body_sha256
      AND p.prosecdef=e.definer AND p.provolatile=e.volatility
      AND p.proconfig @> ARRAY['search_path=""']::text[]
      AND pg_get_userbyid(p.proowner)='postgres'
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
    ) AS verified
  FROM expected e
  LEFT JOIN pg_namespace n ON n.nspname=e.schema_name
  LEFT JOIN pg_proc p ON p.pronamespace=n.oid AND p.proname=e.function_name
), flags AS (
 SELECT
   (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('20261025182000','20261025194000','20261025203500','20261025210500','20261025223000','20261025231500','20261025235500'))::integer AS ledger_rows,
   (SELECT count(*) FROM physical WHERE verified)::integer AS verified_functions,
   (SELECT count(*) FROM physical WHERE NOT verified)::integer AS drifted_functions,
   (SELECT coalesce(jsonb_agg(schema_name||'.'||function_name ORDER BY function_name),'[]'::jsonb)
      FROM physical WHERE NOT verified) AS drift_names,
   (SELECT count(*)=8 FROM physical) AS signature_count_ok,
   (
     SELECT c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT')
       AND NOT has_table_privilege('authenticated',c.oid,'SELECT')
       AND has_table_privilege('service_role',c.oid,'SELECT')
     FROM pg_class c WHERE c.oid=to_regclass('public.training_session_occurrences_v1')
   ) AS table_private,
   (SELECT count(*)=3 FROM pg_constraint c WHERE c.convalidated AND c.contype='f'
       AND ((c.conname='appointments_session_client_signature_v1_fkey'
          AND c.conrelid=to_regclass('public.appointments')
          AND c.confrelid=to_regclass('public.sessions'))
         OR (c.conname='u30_appointment_same_session_client_fk'
          AND c.conrelid=to_regclass('public.training_session_occurrences_v1')
          AND c.confrelid=to_regclass('public.appointments'))
         OR (c.conname='u30_session_same_client_fk'
          AND c.conrelid=to_regclass('public.training_session_occurrences_v1')
          AND c.confrelid=to_regclass('public.sessions')))) AS same_client_fk,
   EXISTS(SELECT 1 FROM pg_constraint c WHERE c.convalidated AND c.contype='f'
       AND c.conname='u30_execution_occurrence_client_session_fk'
       AND c.conrelid=to_regclass('public.session_executions')
       AND c.confrelid=to_regclass('public.training_session_occurrences_v1')) AS execution_fk,
   (SELECT count(*)=2 FROM pg_trigger t
      WHERE NOT t.tgisinternal AND (
        (t.tgname='u30_occurrence_source_protected'
          AND t.tgrelid=to_regclass('public.training_session_occurrences_v1')
          AND t.tgfoid=to_regprocedure('public.iberfit_u30_occurrence_snapshot_guard_v1()'))
        OR (t.tgname='u32_appointment_writer_fence'
          AND t.tgrelid=to_regclass('public.appointments')
          AND t.tgfoid=to_regprocedure('private.iberfit_u32_appointment_writer_fence_v1()'))
      )) AS source_triggers_count,
   (SELECT count(*)=2 FROM pg_index ix
     WHERE ix.indisunique AND (
       (ix.indexrelid=to_regclass('public.u30_session_one_active_occurrence_per_local_day')
          AND ix.indrelid=to_regclass('public.training_session_occurrences_v1')
          AND pg_get_expr(ix.indpred,ix.indrelid) LIKE '%status%cancelada%')
       OR (ix.indexrelid=to_regclass('public.u30_execution_one_per_occurrence')
          AND ix.indrelid=to_regclass('public.session_executions')
          AND pg_get_expr(ix.indpred,ix.indrelid) LIKE '%occurrence_id%NOT NULL%')
     )) AS unique_index_guards,
   (SELECT count(*)=4 FROM (
      VALUES
        ('public.iberfit_execute_command_v26(jsonb)',
         '8a4800de487ef9f0babc51662e152fa0318cd56dd341e5b376fccda99ab5bea7',true),
        ('public.iberfit_execute_command_v26_rc29(jsonb)',
         '5a157b889f720157223b625c7bb1314278ce506fff7cb4d06d29e88db17f1bd8',false),
        ('public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)',
         '78bf27593b1e6f4277c73bacf04329eb21a0354f40557249d630df6a3da8bd9e',false),
        ('public.iberfit_persist_entity_v26_rc29(text,uuid,uuid,text,bigint,jsonb)',
         'd436dd82a48644ce8701aa797b1323ebafe9b2b1dbde36872cd83c170374a9e9',false)
      ) req(signature,body_sha256,auth_exec)
      JOIN pg_proc p ON p.oid=to_regprocedure(req.signature)
      WHERE encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=req.body_sha256
        AND pg_get_userbyid(p.proowner)='postgres'
        AND p.prosecdef
        AND p.proconfig @> ARRAY['search_path=""']::text[]
        AND has_function_privilege('authenticated',p.oid,'EXECUTE')=req.auth_exec
        AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
   ) AS legacy_write_chain_fingerprints,
   (to_regclass('public.command_receipts_v26') IS NOT NULL
      AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass('public.command_receipts_v26')
         AND contype='p' AND conname='command_receipts_v26_pkey')
      AND to_regclass('public.command_receipts_v26_entity_idx') IS NOT NULL
      AND (SELECT count(*)=10 FROM information_schema.columns
           WHERE table_schema='public' AND table_name='command_receipts_v26'
             AND is_nullable='NO')
   ) AS receipt_schema_ready,
   (SELECT p.prosrc LIKE '%active_execution_client:%' FROM pg_proc p
      WHERE p.oid=to_regprocedure('public.iberfit_execute_command_v26_rc29(jsonb)')) AS legacy_lock_shared
)

SELECT jsonb_build_object(
  'schema','iberfit.u60.qa-reconciliation.v1',
  'project','QA only',
  'ready_for_u60',coalesce((ledger_rows=7 AND verified_functions=8 AND drifted_functions=0 AND signature_count_ok AND table_private AND same_client_fk AND execution_fk AND source_triggers_count AND unique_index_guards AND legacy_write_chain_fingerprints AND receipt_schema_ready AND legacy_lock_shared),false),
  'source_functions_verified',verified_functions,
  'source_functions_drifted',drifted_functions,
  'drift_names',drift_names,
  'ledger_versions_present',ledger_rows,
  'ledger_versions_required',7,
  'private_table_acl',table_private,
  'same_client_fk_validated',same_client_fk,
  'execution_fk_validated',execution_fk,
  'writer_triggers_present',source_triggers_count,
  'legacy_chain_fingerprints',legacy_write_chain_fingerprints,
  'receipt_schema_ready',receipt_schema_ready,
  'unique_index_guards',unique_index_guards,
  'legacy_execution_lock_shared',legacy_lock_shared
) AS report FROM flags;
