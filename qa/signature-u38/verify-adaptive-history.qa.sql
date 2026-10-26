-- SIGNATURE U38: execute ONLY in QA as one transaction:
-- BEGIN; <adaptive-privileged-history-page.qa.sql>; <this file>; ROLLBACK;
-- This is an exhaustive *read-only* SQL paging smoke with artificial user
-- claims in the QA SQL editor. It is NOT a positive WebAuthn certification.
CREATE TEMP TABLE u38_qa_results(
  section text, expected_rows bigint, received_rows bigint,
  pages integer, biggest_page_bytes bigint
) ON COMMIT DROP;
DO $u38_smoke$
DECLARE
 v_coach uuid;v_client uuid;v_section text;v_limit int;
 v_page jsonb;v_at timestamptz;v_cursor jsonb;v_expected bigint;
 v_seen text[];v_rows bigint;v_pages int;v_page_bytes bigint;v_max_bytes bigint;
 v_row jsonb;v_key text;v_denied boolean;
BEGIN
 SELECT id INTO v_coach FROM auth.users WHERE email='qa.rc74.coach@iberfit.cl';
 IF v_coach IS NULL THEN RAISE EXCEPTION 'U38_QA_COACH_FIXTURE_MISSING';END IF;
 PERFORM set_config('request.jwt.claim.sub',v_coach::text,true);
 PERFORM set_config('request.jwt.claim.role','authenticated',true);
 IF public.iberfit_current_role_v26()<>'coach' THEN
   RAISE EXCEPTION 'U38_QA_COACH_ROLE_REQUIRED';
 END IF;
 FOR v_client IN
   SELECT a.client_id FROM public.client_assignments a
   WHERE a.coach_user_id=v_coach AND a.active ORDER BY a.client_id
 LOOP
   FOR v_section,v_limit IN SELECT * FROM (VALUES
     ('m26Entities',256),('domainEvents',512),('sessionExecutions',64)
   ) t(section,cap)
   LOOP
     v_at:=null;v_cursor:=null;v_expected:=null;
     v_seen:=array[]::text[];v_rows:=0;v_pages:=0;v_max_bytes:=0;
     LOOP
       v_page:=private.iberfit_history_page_internal_u38_qa(
         v_client,v_section,v_at,v_cursor,v_expected,v_limit);
       IF v_at IS NULL THEN
         v_at:=(v_page->>'snapshotAt')::timestamptz;
         v_expected:=(v_page->>'totalCount')::bigint;
       END IF;
       v_page_bytes:=octet_length((v_page->'records')::text);
       IF v_page_bytes>1800000 OR
          jsonb_array_length(v_page->'records')>v_limit OR
          (v_page->>'totalCount')::bigint<>v_expected THEN
         RAISE EXCEPTION 'U38_PAGE_CONTRACT_VIOLATION';
       END IF;
       v_max_bytes:=greatest(v_max_bytes,v_page_bytes);
       FOR v_row IN SELECT jsonb_array_elements(v_page->'records') LOOP
         IF (CASE WHEN v_section='m26Entities' THEN v_row->>'clientId'
             ELSE v_row->>'client_id' END) IS DISTINCT FROM v_client::text THEN
           RAISE EXCEPTION 'U38_CROSS_CLIENT_ROW';
         END IF;
         v_key:=CASE WHEN v_section='m26Entities'
           THEN (v_row->>'entityType')||':'||(v_row->>'entityId')
           ELSE v_row->>'id' END;
         IF v_key IS NULL OR v_key=any(v_seen) THEN
           RAISE EXCEPTION 'U38_NULL_OR_DUPLICATE_HISTORY_KEY';
         END IF;
         v_seen:=array_append(v_seen,v_key);
         v_rows:=v_rows+1;
       END LOOP;
       v_pages:=v_pages+1;
       IF v_pages>128 THEN RAISE EXCEPTION 'U38_CURSOR_NOT_TERMINATING';END IF;
       EXIT WHEN v_page->>'hasMore'='false';
       v_cursor:=v_page->'nextCursor';
       IF v_cursor IS NULL THEN RAISE EXCEPTION 'U38_MISSING_CURSOR';END IF;
     END LOOP;
     IF v_rows<>v_expected OR cardinality(v_seen)<>v_expected THEN
       RAISE EXCEPTION 'U38_FULL_HISTORY_LOSS_OR_DUPLICATION';
     END IF;
     INSERT INTO u38_qa_results VALUES(v_section,v_expected,v_rows,v_pages,v_max_bytes);
   END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM u38_qa_results)<>6 THEN
   RAISE EXCEPTION 'U38_MISSING_QA_COACH_CLIENT_FIXTURES';
 END IF;
 -- A valid Coach cannot call the public RPC without verified assurance.
 SELECT client_id INTO v_client FROM public.client_assignments
  WHERE coach_user_id=v_coach AND active ORDER BY client_id LIMIT 1;
 v_denied:=false;
 BEGIN PERFORM public.iberfit_privileged_history_page_u38_qa(v_client,'domainEvents');
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;END;
 IF NOT v_denied THEN RAISE EXCEPTION 'U38_UNVERIFIED_COACH_ALLOWED'; END IF;
 -- Clients must not access even their own historical page through this
 -- privileged-only endpoint.
 PERFORM set_config('request.jwt.claim.sub',(
   SELECT id::text FROM auth.users WHERE email='qa.rc74.client-a@iberfit.cl'),true);
 v_denied:=false;
 BEGIN PERFORM public.iberfit_privileged_history_page_u38_qa(v_client,'m26Entities');
 EXCEPTION WHEN insufficient_privilege THEN v_denied:=true;END;
 IF NOT v_denied THEN RAISE EXCEPTION 'U38_CLIENT_ALLOWED';END IF;
END $u38_smoke$;
SELECT section,count(*) client_count,sum(expected_rows) expected,
       sum(received_rows) received,sum(pages) pages,max(biggest_page_bytes) max_page_bytes
 FROM u38_qa_results GROUP BY section ORDER BY section;
