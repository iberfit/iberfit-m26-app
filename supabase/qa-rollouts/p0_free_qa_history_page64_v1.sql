-- Supabase Free 360: QA ONLY. Exact-hash, data-preserving transactional page size.
DO $p64$
DECLARE
 reader text; core text; outside text;
 ar aclitem[]; ac aclitem[]; ao aclitem[];
 ordr oid; ordc oid; ordo oid;
 sr boolean; sc boolean; so boolean;
 vr "char"; vc "char"; vo "char";
 cr text[]; cc text[]; co text[];
 r constant regprocedure := 'public.iberfit_client_completed_history_page_free_v1(text,timestamptz,jsonb,bigint,text,integer)'::regprocedure;
 c constant regprocedure := 'public.iberfit_bootstrap_v26_rc29()'::regprocedure;
 o constant regprocedure := 'public.iberfit_bootstrap_v26()'::regprocedure;
BEGIN
 IF (select value #>> '{}' from public.iberfit_system_settings where key='environment') IS DISTINCT FROM 'QA'
  OR (select value #>> '{}' from public.iberfit_system_settings where key='free_client_completed_execution_details_demand_qa_v1') IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'PAGE64_QA_ONLY_AND_OPTIN_REQUIRED' USING ERRCODE='42501'; END IF;
 reader:=pg_get_functiondef(r); core:=pg_get_functiondef(c); outside:=pg_get_functiondef(o);
 IF md5(reader)<>'ae01c1771319b99f0404612a4b84fd2a'
 OR md5(core)<>'88220acc54e26bb1ee91332d9b89a3b3'
 OR md5(outside)<>'0813cbe612bf24b2f08f99bf42a96662'
 OR length(reader)-length(replace(reader,'p_limit NOT BETWEEN 1 AND 32',''))<>28
 OR length(core)-length(replace(core,'ae01c1771319b99f0404612a4b84fd2a',''))<>32
 OR length(outside)-length(replace(outside,'88220acc54e26bb1ee91332d9b89a3b3',''))<>32
 THEN RAISE EXCEPTION 'PAGE64_SOURCE_DRIFT' USING ERRCODE='42501'; END IF;
 SELECT proacl,proowner,prosecdef,provolatile,proconfig INTO ar,ordr,sr,vr,cr FROM pg_proc WHERE oid=r;
 SELECT proacl,proowner,prosecdef,provolatile,proconfig INTO ac,ordc,sc,vc,cc FROM pg_proc WHERE oid=c;
 SELECT proacl,proowner,prosecdef,provolatile,proconfig INTO ao,ordo,so,vo,co FROM pg_proc WHERE oid=o;
 IF sr IS DISTINCT FROM true OR sc IS DISTINCT FROM true OR so IS DISTINCT FROM true
 OR has_function_privilege('anon',r,'EXECUTE') OR has_function_privilege('anon',c,'EXECUTE')
 OR has_function_privilege('anon',o,'EXECUTE')
 THEN RAISE EXCEPTION 'PAGE64_PRIVILEGE_BASELINE_DRIFT' USING ERRCODE='42501'; END IF;
 EXECUTE replace(reader,'p_limit NOT BETWEEN 1 AND 32','p_limit NOT BETWEEN 1 AND 64');
 EXECUTE replace(core,'ae01c1771319b99f0404612a4b84fd2a','a254291ca0e199d176b10aefa8b2fd61');
 EXECUTE replace(outside,'88220acc54e26bb1ee91332d9b89a3b3','25c8ff090b162f23fd818d12e8eb9843');
 IF md5(pg_get_functiondef(r)) IS DISTINCT FROM 'a254291ca0e199d176b10aefa8b2fd61'
 OR md5(pg_get_functiondef(c)) IS DISTINCT FROM '25c8ff090b162f23fd818d12e8eb9843'
 OR md5(pg_get_functiondef(o)) IS DISTINCT FROM 'a71e8ccd806ae1e783799cc1a6e2efce'
 OR EXISTS (SELECT 1 FROM (VALUES
 (r,ar,ordr,sr,vr,cr),(c,ac,ordc,sc,vc,cc),(o,ao,ordo,so,vo,co)
 ) expected(id,acl,owner,sec,vol,config) JOIN pg_proc p ON p.oid=expected.id
 WHERE p.proacl IS DISTINCT FROM expected.acl OR p.proowner IS DISTINCT FROM expected.owner
 OR p.prosecdef IS DISTINCT FROM expected.sec OR p.provolatile IS DISTINCT FROM expected.vol
 OR p.proconfig IS DISTINCT FROM expected.config)
 OR has_function_privilege('anon',r,'EXECUTE') OR has_function_privilege('anon',c,'EXECUTE')
 OR has_function_privilege('anon',o,'EXECUTE')
 THEN RAISE EXCEPTION 'PAGE64_POST_APPLY_PRIVILEGE_OR_HASH_DRIFT' USING ERRCODE='42501'; END IF;
END $p64$;
