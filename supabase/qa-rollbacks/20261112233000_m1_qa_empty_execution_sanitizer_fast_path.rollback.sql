-- M1 U60/P0 #1209 · QA synthetic only, no history truncation, no RLS change.
-- Dynamic surgical replacement preserves all unrelated function text.
-- Applied ONLY to QA under the exact original function SHA; never to PROD.
-- Safely reversible by companion SQL after verifying whole-function equality.
DO $m1_qa_empty$
DECLARE
  v_changed text;
  v_needle text;
  v_replacement text;
  v_acl aclitem[];
  v_owner oid;
  v_oid oid := 'public.iberfit_bootstrap_v26()'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.iberfit_system_settings s
    WHERE s.key='environment' AND s.value#>>'{}'='QA') THEN
    RAISE EXCEPTION 'M1_QA_ENVIRONMENT_REQUIRED';
  END IF;
  SELECT proacl,proowner INTO v_acl,v_owner FROM pg_proc WHERE oid=v_oid;
  v_changed := pg_get_functiondef(v_oid);
  IF md5(v_changed)<>'5d3e13ffc4f00c1e5f29d61fb81cd6e3' THEN
    RAISE EXCEPTION 'M1_QA_EMPTY_EXECUTION_ROLLBACK_HEAD_DRIFT';
  END IF;
  v_needle := $m1_needle0$select jsonb_agg(
        case
          when v_m1_qa_fast_empty
            and (item->'results' is null or item->'results' in
              ('null'::jsonb,'{}'::jsonb,'[]'::jsonb))
            and (item->'feedback' is null or item->'feedback' in
              ('null'::jsonb,'{}'::jsonb,'[]'::jsonb))
            and (item->'sourceSnapshot' is null or item->'sourceSnapshot' in
              ('null'::jsonb,'{}'::jsonb,'[]'::jsonb))
            and (item->'planSnapshot' is null or item->'planSnapshot' in
              ('null'::jsonb,'{}'::jsonb,'[]'::jsonb))
          then
            public.iberfit_m43_client_scalar_fields_v1(item,
              ARRAY['id','clientId','sessionId','appointmentId','status',
                'revision','title','startedAt','completedAt',
                'remoteConfirmedAt','localClosedAt','updatedAt',
                'executionStatus','currentBlockIndex','currentSetIndex']::text[])
            ||jsonb_build_object('feedback','{}'::jsonb,
              'results','[]'::jsonb,'sourceSnapshot','{}'::jsonb,
              'planSnapshot','{}'::jsonb)
          else public.iberfit_m43_client_safe_execution_v1(item)
        end)$m1_needle0$;
  v_replacement := $m1_replacement0$select jsonb_agg(public.iberfit_m43_client_safe_execution_v1(item))$m1_replacement0$;
  IF octet_length(v_needle)=0 OR
     (octet_length(v_changed)-octet_length(replace(v_changed,v_needle,'')))<>octet_length(v_needle)
  THEN RAISE EXCEPTION 'M1_QA_EMPTY_EXECUTION_PATCH_ANCHOR_%',1;
  END IF;
  v_changed := replace(v_changed,v_needle,v_replacement);
  v_needle := $m1_needle1$    -- M1_QA_FAST_EMPTY_EXECUTION_V1: only QA's synthetic A/B identities.
    -- Strict hash dependencies revoke this optimization on sanitizer drift.
    -- NO individual training records, revisions or hidden fields are dropped.
    v_m1_qa_fast_empty := (
      EXISTS (SELECT 1 FROM public.iberfit_system_settings s
        WHERE s.key='environment' AND s.value#>>'{}'='QA')
      AND EXISTS (SELECT 1 FROM auth.users u
        WHERE u.id=auth.uid() AND lower(u.email) IN
          ('qa.rc74.client-a@iberfit.cl','qa.rc74.client-b@iberfit.cl'))
      AND md5(pg_get_functiondef('public.iberfit_m43_client_safe_execution_v1(jsonb)'::regprocedure))='29f09c54467ac50aaa91bce79ebe5680'
      AND md5(pg_get_functiondef('public.iberfit_m43_client_scalar_fields_v1(jsonb,text[])'::regprocedure))='34df411a2b9ce5b60635d6db84ecd240'
    );

    -- Canonical and legacy completed executions must share the same HTTP$m1_needle1$;
  v_replacement := $m1_replacement1$    -- Canonical and legacy completed executions must share the same HTTP$m1_replacement1$;
  IF octet_length(v_needle)=0 OR
     (octet_length(v_changed)-octet_length(replace(v_changed,v_needle,'')))<>octet_length(v_needle)
  THEN RAISE EXCEPTION 'M1_QA_EMPTY_EXECUTION_PATCH_ANCHOR_%',2;
  END IF;
  v_changed := replace(v_changed,v_needle,v_replacement);
  v_needle := $m1_needle2$  v_clients jsonb;
  v_m1_qa_fast_empty boolean := false; -- M1_QA_FAST_EMPTY_EXECUTION_V1
begin$m1_needle2$;
  v_replacement := $m1_replacement2$  v_clients jsonb;
begin$m1_replacement2$;
  IF octet_length(v_needle)=0 OR
     (octet_length(v_changed)-octet_length(replace(v_changed,v_needle,'')))<>octet_length(v_needle)
  THEN RAISE EXCEPTION 'M1_QA_EMPTY_EXECUTION_PATCH_ANCHOR_%',3;
  END IF;
  v_changed := replace(v_changed,v_needle,v_replacement);
  IF md5(v_changed)<>'5b9547e2230994fa96cb6cb629f8fb2d' THEN
    RAISE EXCEPTION 'M1_QA_EMPTY_EXECUTION_ROLLBACK_SOURCE_DRIFT';
  END IF;
  EXECUTE v_changed;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid=v_oid
    AND (proowner IS DISTINCT FROM v_owner OR proacl IS DISTINCT FROM v_acl))
  THEN RAISE EXCEPTION 'M1_QA_EMPTY_EXECUTION_OWNER_OR_ACL_CHANGED';
  END IF;
  IF md5(pg_get_functiondef(v_oid))<>'5b9547e2230994fa96cb6cb629f8fb2d' THEN
    RAISE EXCEPTION 'M1_QA_EMPTY_EXECUTION_ROLLBACK_READBACK_FAILED';
  END IF;
END
$m1_qa_empty$;
