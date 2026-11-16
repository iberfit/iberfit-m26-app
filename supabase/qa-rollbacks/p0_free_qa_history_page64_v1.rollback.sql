-- Exact inverse, QA only, fail closed on unexpected definitions.
DO $p64_revert$
DECLARE
 reader text;core text;outside text;
 ar aclitem[];ac aclitem[];ao aclitem[];
 ordr oid;ordc oid;ordo oid;
 r constant regprocedure := 'public.iberfit_client_completed_history_page_free_v1(text,timestamptz,jsonb,bigint,text,integer)'::regprocedure;
 c constant regprocedure := 'public.iberfit_bootstrap_v26_rc29()'::regprocedure;
 o constant regprocedure := 'public.iberfit_bootstrap_v26()'::regprocedure;
BEGIN
 IF (select value #>> '{}' from public.iberfit_system_settings where key='environment') IS DISTINCT FROM 'QA'
 THEN RAISE EXCEPTION 'PAGE64_ROLLBACK_QA_ONLY' USING ERRCODE='42501'; END IF;
 reader:=pg_get_functiondef(r);core:=pg_get_functiondef(c);outside:=pg_get_functiondef(o);
 IF md5(reader)<>'a254291ca0e199d176b10aefa8b2fd61'
 OR md5(core)<>'25c8ff090b162f23fd818d12e8eb9843'
 OR md5(outside)<>'a71e8ccd806ae1e783799cc1a6e2efce'
 THEN RAISE EXCEPTION 'PAGE64_ROLLBACK_SOURCE_DRIFT' USING ERRCODE='42501'; END IF;
 SELECT proacl,proowner INTO ar,ordr FROM pg_proc WHERE oid=r;
 SELECT proacl,proowner INTO ac,ordc FROM pg_proc WHERE oid=c;
 SELECT proacl,proowner INTO ao,ordo FROM pg_proc WHERE oid=o;
 EXECUTE replace(reader,'p_limit NOT BETWEEN 1 AND 64','p_limit NOT BETWEEN 1 AND 32');
 EXECUTE replace(core,'a254291ca0e199d176b10aefa8b2fd61','ae01c1771319b99f0404612a4b84fd2a');
 EXECUTE replace(outside,'25c8ff090b162f23fd818d12e8eb9843','88220acc54e26bb1ee91332d9b89a3b3');
 IF md5(pg_get_functiondef(r))<>'ae01c1771319b99f0404612a4b84fd2a'
 OR md5(pg_get_functiondef(c))<>'88220acc54e26bb1ee91332d9b89a3b3'
 OR md5(pg_get_functiondef(o))<>'0813cbe612bf24b2f08f99bf42a96662'
 OR EXISTS (SELECT 1 FROM (VALUES (r,ar,ordr),(c,ac,ordc),(o,ao,ordo)) x(id,acl,owner)
 JOIN pg_proc p ON p.oid=x.id WHERE p.proacl IS DISTINCT FROM x.acl OR p.proowner IS DISTINCT FROM x.owner)
 THEN RAISE EXCEPTION 'PAGE64_ROLLBACK_VERIFICATION_FAILED' USING ERRCODE='42501'; END IF;
END $p64_revert$;
