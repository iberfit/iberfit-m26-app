-- Post-install certification in isolated QA. No real-client fixture mutations.
-- Run as migration owner after GX319 + GX321. The authenticated positive/concurrency
-- scenario below is a separate mandatory gate, NOT implied by these catalog assertions.
BEGIN;
DO $tests$
DECLARE fn regprocedure; n integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='private.iberfit_gx_publication_event_v1'::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'GX_PUBLICATION_RLS_REQUIRED'; END IF;
 IF EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_table_privilege(r,'private.iberfit_gx_publication_event_v1','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) THEN RAISE EXCEPTION 'GX_PUBLICATION_DIRECT_TABLE_ACCESS'; END IF;
 FOREACH fn IN ARRAY ARRAY['public.iberfit_gx_publication_write_v1(uuid,uuid,uuid,integer,text,jsonb)'::regprocedure,'public.iberfit_gx_publication_read_v1(uuid,uuid)'::regprocedure,'public.iberfit_gx_publication_find_v1(uuid,uuid,uuid)'::regprocedure,'public.iberfit_gx_publication_list_v1(uuid,uuid,integer)'::regprocedure,'public.iberfit_gx_publication_recover_v1(uuid,uuid,uuid,integer,text,jsonb)'::regprocedure] LOOP
  IF (SELECT prosecdef FROM pg_proc WHERE oid=fn) OR has_function_privilege('anon',fn,'EXECUTE') OR has_function_privilege('service_role',fn,'EXECUTE') OR NOT has_function_privilege('authenticated',fn,'EXECUTE') THEN RAISE EXCEPTION 'GX_PUBLICATION_RPC_PERMISSIONS:%',fn; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.m26_client_measurements_v43'::regclass AND tgname='iberfit_gx_publication_void_lock_v1' AND tgenabled='O') THEN RAISE EXCEPTION 'GX_PUBLICATION_VOID_LOCK_MISSING'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.m26_client_measurements_v43'::regclass AND tgname IN ('iberfit_gx_publication_source_void_v1','iberfit_gx_publication_source_delete_v1','iberfit_gx_publication_void_delete_guard_v1') AND tgenabled='O')<>3 THEN RAISE EXCEPTION 'GX_PUBLICATION_INVALIDATION_TRIGGERS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.m26_client_measurements_v43'::regclass AND tgname='iberfit_gx_publication_void_delete_guard_v1' AND tgdeferrable AND tginitdeferred) THEN RAISE EXCEPTION 'GX_PUBLICATION_ERASURE_NOT_DEFERRED'; END IF;
 FOREACH fn IN ARRAY ARRAY['private.iberfit_gx_publication_source_invalidate_v1()'::regprocedure,'private.iberfit_gx_publication_void_delete_guard_v1()'::regprocedure] LOOP
  IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid=fn) OR EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) r WHERE has_function_privilege(r,fn,'EXECUTE')) THEN RAISE EXCEPTION 'GX_PUBLICATION_INTERNAL_TRIGGER_ACL:%',fn; END IF;
 END LOOP;
 IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='private' AND table_name='iberfit_gx_publication_event_v1' AND column_name IN ('invalidated_previous_at','invalidated_current_at'))<>2 THEN RAISE EXCEPTION 'GX_PUBLICATION_INVALIDATION_MARKS'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='private' AND table_name='iberfit_gx_publication_event_v1' AND column_name IN ('metadata','value','protocol','notes','pair')) THEN RAISE EXCEPTION 'GX_PUBLICATION_RAW_DUPLICATION'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='private.iberfit_gx_publication_event_v1'::regclass AND contype='f' AND confrelid='public.clients'::regclass AND confdeltype='c') THEN RAISE EXCEPTION 'GX_PUBLICATION_ERASURE_CASCADE'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid='private.iberfit_gx_publication_pair_identity_v1_idx'::regclass AND indisunique AND indpred IS NOT NULL) THEN RAISE EXCEPTION 'GX_PUBLICATION_PAIR_INDEX'; END IF;
 SELECT count(*) INTO n FROM private.iberfit_gx_publication_event_v1;
 IF n<>0 THEN RAISE EXCEPTION 'GX_PUBLICATION_FRESH_INSTALL_EXPECTED'; END IF;
END $tests$;
SET LOCAL ROLE authenticated;
DO $negative$
BEGIN
 -- Use no JWT identity; must not reach ledger/source reads.
 PERFORM set_config('request.jwt.claims','{}',true);
 BEGIN
  PERFORM public.iberfit_gx_publication_read_v1('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
  RAISE EXCEPTION 'GX_PUBLICATION_NO_IDENTITY_READ_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.iberfit_gx_publication_write_v1('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003',0,'published','{}'::jsonb);
  RAISE EXCEPTION 'GX_PUBLICATION_NO_IDENTITY_WRITE_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $negative$;
RESET ROLE;
ROLLBACK;
