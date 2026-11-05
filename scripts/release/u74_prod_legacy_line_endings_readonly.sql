-- U74 READ-ONLY production portability diagnostic. No schema or record writes.
-- Legacy rc29 persisted in QA with LF, PROD with 92 CRLF line breaks.
-- Never drop, replace, normalize or rewrite a live database function.
WITH expected(signature,body_sha256,auth_exec) AS (VALUES
 ('public.iberfit_execute_command_v26(jsonb)',
  '8a4800de487ef9f0babc51662e152fa0318cd56dd341e5b376fccda99ab5bea7',true),
 ('public.iberfit_execute_command_v26_rc29(jsonb)',
  '5a157b889f720157223b625c7bb1314278ce506fff7cb4d06d29e88db17f1bd8',false),
 ('public.iberfit_persist_entity_v26(text,uuid,uuid,text,bigint,jsonb)',
  '78bf27593b1e6f4277c73bacf04329eb21a0354f40557249d630df6a3da8bd9e',false),
 ('public.iberfit_persist_entity_v26_rc29(text,uuid,uuid,text,bigint,jsonb)',
  'd436dd82a48644ce8701aa797b1323ebafe9b2b1dbde36872cd83c170374a9e9',false)
), observed AS (
 SELECT e.signature,
   p.oid IS NOT NULL AS exists_on_server,
   encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=e.body_sha256 AS raw_match,
   encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')=e.body_sha256 AS newline_normalized_match,
   position(E'\r' IN replace(p.prosrc,E'\r\n',''))=0 AS no_stray_cr,
   p.prosecdef AND pg_get_userbyid(p.proowner)='postgres'
     AND p.proconfig @> ARRAY['search_path=""']::text[] AS secure_definer,
   has_function_privilege('authenticated',p.oid,'EXECUTE')=e.auth_exec
     AND NOT has_function_privilege('anon',p.oid,'EXECUTE') AS acl_exact
 FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
)
SELECT jsonb_build_object(
  'schema','iberfit.u74.prod-legacy-source-portability.v1',
  'readOnly',true,'total',count(*),
  'certified',count(*) FILTER (WHERE exists_on_server AND newline_normalized_match
    AND no_stray_cr AND secure_definer AND acl_exact),
  'lineEndingOnly',count(*) FILTER (WHERE NOT raw_match AND newline_normalized_match),
  'unexpectedDrift',count(*) FILTER (WHERE NOT coalesce(
    exists_on_server AND newline_normalized_match AND no_stray_cr
    AND secure_definer AND acl_exact,false)),
  'safeForFutureMigrationPreflight',coalesce(bool_and(
    exists_on_server AND newline_normalized_match AND no_stray_cr
    AND secure_definer AND acl_exact),false)
) AS u74_readonly_parity FROM observed;
