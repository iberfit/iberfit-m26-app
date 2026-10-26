-- SIGNATURE U40: QA-only parity smoke.
-- Run inside BEGIN/ROLLBACK after loading the U40 candidate as
-- private.iberfit_bootstrap_v26_rc29_u40_qa(), then REVOKE its EXECUTE.
-- Never test positive privileged WebAuthn with synthetic SQL claims.
-- This validates rc29 internal visibility, not the public MFA chain.
CREATE TEMP TABLE u40_role_comparison(role text,parity boolean,bytes integer) ON COMMIT DROP;
DO $u40$
DECLARE r record; v_src jsonb; v_target jsonb;
BEGIN
 FOR r IN SELECT * FROM (VALUES
   ('coach','qa.rc74.coach@iberfit.cl'),
   ('admin','qa.rc74.admin@iberfit.cl'),
   ('cliente','qa.rc74.client-a@iberfit.cl'),
   ('cliente','qa.rc74.client-b@iberfit.cl')
 ) AS x(role,email) LOOP
   PERFORM set_config('request.jwt.claim.sub',(SELECT id::text FROM auth.users WHERE email=r.email),true);
   PERFORM set_config('request.jwt.claim.role','authenticated',true);
   IF public.iberfit_current_role_v26()<>r.role THEN
     RAISE EXCEPTION 'U40_ROLE_FIXTURE_MISMATCH_%',r.role;
   END IF;
   v_src:=public.iberfit_bootstrap_v26_rc29();
   v_target:=private.iberfit_bootstrap_v26_rc29_u40_qa();
   IF v_src IS DISTINCT FROM v_target THEN
     RAISE EXCEPTION 'U40_QA_ROLE_OUTPUT_PARITY_MISMATCH_%',r.role;
   END IF;
   INSERT INTO u40_role_comparison VALUES(r.role,true,octet_length(v_target::text));
 END LOOP;
END $u40$;
SELECT role,parity,bytes FROM u40_role_comparison ORDER BY role,bytes;
