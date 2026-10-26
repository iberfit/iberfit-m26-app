-- QA-only one-transaction smoke following core-bootstrap-u36.qa.sql.
-- Compare the full internal rc29 response with the core response for
-- all synthetic roles: every key except the three historical arrays must
-- be byte-for-byte equivalent as JSONB, including remoteRevisions (CAS).
-- No MFA bypass: this only calls the internal rc29 function in isolated QA.
CREATE TEMP TABLE u36_qa_metrics (
 role text, full_bytes integer, core_bytes integer,
 full_ms numeric, core_ms numeric, untouched_contract_exact boolean
) ON COMMIT DROP;

DO $u36$
DECLARE
 r record;v_time timestamptz;v_full jsonb;v_core jsonb;v_expected jsonb;
 v_full_ms numeric;v_core_ms numeric;
BEGIN
 FOR r IN SELECT * FROM (VALUES
   ('coach','qa.rc74.coach@iberfit.cl'),
   ('admin','qa.rc74.admin@iberfit.cl'),
   ('cliente','qa.rc74.client-a@iberfit.cl')
 ) as q(role,email) LOOP
   PERFORM set_config('request.jwt.claim.sub',(
     SELECT id::text FROM auth.users WHERE email=r.email
   ),true);
   PERFORM set_config('request.jwt.claim.role','authenticated',true);
   IF public.iberfit_current_role_v26()<>r.role THEN
     RAISE EXCEPTION 'U36_QA_ROLE_MISMATCH';
   END IF;
   v_time:=clock_timestamp();
   v_full:=public.iberfit_bootstrap_v26_rc29();
   v_full_ms:=round(extract(epoch from clock_timestamp()-v_time)::numeric*1000,1);
   v_time:=clock_timestamp();
   v_core:=private.iberfit_bootstrap_v26_rc29_core_u36_qa();
   v_core_ms:=round(extract(epoch from clock_timestamp()-v_time)::numeric*1000,1);
   v_expected:=jsonb_set(jsonb_set(jsonb_set(v_full,
     '{data,m26Entities}','[]'::jsonb),
     '{data,domainEvents}','[]'::jsonb),
     '{data,sessionExecutions}','[]'::jsonb);
   IF v_expected IS DISTINCT FROM v_core THEN
     RAISE EXCEPTION 'U36_NON_HISTORICAL_PARITY_MISMATCH';
   END IF;
   IF v_core#>'{data,m26Entities}' IS DISTINCT FROM '[]'::jsonb
      OR v_core#>'{data,domainEvents}' IS DISTINCT FROM '[]'::jsonb
      OR v_core#>'{data,sessionExecutions}' IS DISTINCT FROM '[]'::jsonb THEN
     RAISE EXCEPTION 'U36_HISTORY_AGGREGATION_NOT_REMOVED';
   END IF;
   INSERT INTO u36_qa_metrics VALUES(
     r.role,octet_length(v_full::text),octet_length(v_core::text),
     v_full_ms,v_core_ms,true
   );
 END LOOP;
END
$u36$;

SELECT role,full_bytes,core_bytes,full_ms,core_ms,untouched_contract_exact
 FROM u36_qa_metrics ORDER BY role;
