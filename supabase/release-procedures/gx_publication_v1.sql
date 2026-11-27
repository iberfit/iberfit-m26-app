-- GX324: append-only review events with monotonic source invalidation marks. Install after GX319.
-- Private schema only; no client/Edge visibility until separate certified projection.
-- No raw values, protocols or free text duplicated in ledger. Client erasure cascades.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('private.iberfit_gx_followup_can_coach_v1(uuid)') IS NULL OR
    to_regprocedure('private.iberfit_gx_followup_valid_v1(jsonb,numeric,text)') IS NULL OR
    NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.m26_client_measurements_v43'::regclass AND tgname='iberfit_gx_followup_guard_v1' AND tgenabled='O') OR
    to_regclass('private.iberfit_gx_publication_event_v1') IS NOT NULL THEN
   RAISE EXCEPTION 'GX_PUBLICATION_INSTALL_DRIFT';
 END IF;
END $preflight$;
CREATE TABLE private.iberfit_gx_publication_event_v1 (
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 publication_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision>0),
 operation_id uuid NOT NULL UNIQUE,
 actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 status text NOT NULL CHECK (status IN ('published','withdrawn')),
 previous_id uuid NOT NULL,
 current_id uuid NOT NULL,
 pair_hash bytea NOT NULL CHECK (octet_length(pair_hash)=32),
 event_at timestamptz NOT NULL,
 invalidated_previous_at timestamptz,
 invalidated_current_at timestamptz,
 CHECK (invalidated_previous_at IS NULL OR (status='published' AND invalidated_previous_at>=event_at)),
 CHECK (invalidated_current_at IS NULL OR (status='published' AND invalidated_current_at>=event_at)),
 PRIMARY KEY(client_id,publication_id,revision),
 CHECK(previous_id<>current_id AND publication_id<>client_id AND publication_id<>previous_id AND publication_id<>current_id)
);
CREATE UNIQUE INDEX iberfit_gx_publication_pair_identity_v1_idx ON private.iberfit_gx_publication_event_v1(client_id,previous_id,current_id) WHERE revision=1;
CREATE INDEX iberfit_gx_publication_actor_v1_idx ON private.iberfit_gx_publication_event_v1(actor_id) WHERE actor_id IS NOT NULL;
ALTER TABLE private.iberfit_gx_publication_event_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.iberfit_gx_publication_event_v1 FROM PUBLIC,anon,authenticated,service_role;
-- Private helpers are never exposed through the Data API. Public wrappers are invokers.
CREATE FUNCTION private.iberfit_gx_publication_lock_v1(p_client uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
BEGIN
 IF p_client IS NULL OR private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'GX_PUBLICATION_ISOLATION_REQUIRED' USING ERRCODE='40001'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(1781042601,pg_catalog.hashtext(p_client::text));
 IF private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
END $f$;
-- Covers direct inserts as well as the RPC; pre-existing guard runs first.
CREATE FUNCTION private.iberfit_gx_publication_void_lock_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
BEGIN
 PERFORM private.iberfit_gx_publication_lock_v1(NEW.client_id);
 IF NEW.metric='gx_followup_void_v1' AND NOT EXISTS (SELECT 1 FROM public.m26_client_measurements_v43 m WHERE m.client_id=NEW.client_id AND m.id=(NEW.metadata->>'targetId')::uuid AND m.metric='gx_followup_v1') THEN RAISE EXCEPTION 'GX_FOLLOWUP_TARGET_INVALID' USING ERRCODE='22023'; END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER iberfit_gx_publication_void_lock_v1 BEFORE INSERT ON public.m26_client_measurements_v43
FOR EACH ROW WHEN (NEW.metric IN ('gx_followup_v1','gx_followup_void_v1')) EXECUTE FUNCTION private.iberfit_gx_publication_void_lock_v1();
-- Internal trigger only, never an RPC: use the already-authorized row operation
-- and the same client lock. Full client erasure still cascades.
CREATE FUNCTION private.iberfit_gx_publication_source_invalidate_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE c uuid; target uuid; stamp timestamptz;
BEGIN
 IF TG_OP='INSERT' THEN
  c:=NEW.client_id; target:=(NEW.metadata->>'targetId')::uuid;
  IF NEW.metric IS DISTINCT FROM 'gx_followup_void_v1' OR auth.uid() IS NULL OR private.iberfit_gx_followup_can_coach_v1(c) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 ELSE
  c:=OLD.client_id; target:=CASE WHEN OLD.metric='gx_followup_void_v1' THEN (OLD.metadata->>'targetId')::uuid ELSE OLD.id END;
 END IF;
 -- Deletion can be an authorized erasure by the service/owner, not a Coach RPC.
 -- A missing parent means the ledger itself is being erased by FK cascade.
 IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id=c) THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'GX_PUBLICATION_CLIENT_MISSING' USING ERRCODE='23503';
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'GX_PUBLICATION_ISOLATION_REQUIRED' USING ERRCODE='40001'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(1781042601,pg_catalog.hashtext(c::text));
 stamp:=clock_timestamp();
 UPDATE private.iberfit_gx_publication_event_v1 e
 SET invalidated_previous_at=CASE WHEN e.previous_id=target THEN coalesce(e.invalidated_previous_at,greatest(stamp,e.event_at)) ELSE e.invalidated_previous_at END,
     invalidated_current_at=CASE WHEN e.current_id=target THEN coalesce(e.invalidated_current_at,greatest(stamp,e.event_at)) ELSE e.invalidated_current_at END
 WHERE e.client_id=c AND e.status='published' AND ((e.previous_id=target AND e.invalidated_previous_at IS NULL) OR (e.current_id=target AND e.invalidated_current_at IS NULL));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER iberfit_gx_publication_source_void_v1 AFTER INSERT ON public.m26_client_measurements_v43
FOR EACH ROW WHEN (NEW.metric='gx_followup_void_v1') EXECUTE FUNCTION private.iberfit_gx_publication_source_invalidate_v1();
CREATE TRIGGER iberfit_gx_publication_source_delete_v1 BEFORE DELETE ON public.m26_client_measurements_v43
FOR EACH ROW WHEN (OLD.metric IN ('gx_followup_v1','gx_followup_void_v1')) EXECUTE FUNCTION private.iberfit_gx_publication_source_invalidate_v1();
-- Selective erasure can remove both rows in either order within one transaction.
-- Deleting only the void while retaining its original observation is forbidden.
CREATE FUNCTION private.iberfit_gx_publication_void_delete_guard_v1()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
BEGIN
 IF EXISTS (SELECT 1 FROM public.m26_client_measurements_v43 m WHERE m.client_id=OLD.client_id AND m.id=(OLD.metadata->>'targetId')::uuid AND m.metric='gx_followup_v1') THEN
  RAISE EXCEPTION 'GX_PUBLICATION_VOID_ERASURE_REQUIRES_SOURCE' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $f$;
CREATE CONSTRAINT TRIGGER iberfit_gx_publication_void_delete_guard_v1 AFTER DELETE ON public.m26_client_measurements_v43
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (OLD.metric='gx_followup_void_v1') EXECUTE FUNCTION private.iberfit_gx_publication_void_delete_guard_v1();
REVOKE ALL ON FUNCTION private.iberfit_gx_publication_source_invalidate_v1(),private.iberfit_gx_publication_void_delete_guard_v1() FROM PUBLIC,anon,authenticated,service_role;
-- Canonical pair derives exclusively from immutable, valid, unvoided source rows.
CREATE FUNCTION private.iberfit_gx_publication_normalize_v1(v jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE result jsonb;
BEGIN
 CASE pg_catalog.jsonb_typeof(v)
 WHEN 'number' THEN RETURN pg_catalog.to_jsonb(pg_catalog.trim_scale((v#>>'{}')::numeric));
 WHEN 'object' THEN SELECT coalesce(pg_catalog.jsonb_object_agg(k,private.iberfit_gx_publication_normalize_v1(x)),'{}'::jsonb) INTO result FROM pg_catalog.jsonb_each(v) AS t(k,x);
 WHEN 'array' THEN SELECT coalesce(pg_catalog.jsonb_agg(private.iberfit_gx_publication_normalize_v1(x) ORDER BY ord),'[]'::jsonb) INTO result FROM pg_catalog.jsonb_array_elements(v) WITH ORDINALITY AS t(x,ord);
 ELSE RETURN v;
 END CASE;
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION private.iberfit_gx_publication_normalize_v1(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.iberfit_gx_publication_pair_v1(p_client uuid,p_previous uuid,p_current uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
DECLARE a public.m26_client_measurements_v43%ROWTYPE; b public.m26_client_measurements_v43%ROWTYPE;
BEGIN
 IF private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.m26_client_measurements_v43 WHERE client_id=p_client AND id=p_previous AND metric='gx_followup_v1';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO b FROM public.m26_client_measurements_v43 WHERE client_id=p_client AND id=p_current AND metric='gx_followup_v1';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF EXISTS (SELECT 1 FROM private.iberfit_gx_publication_event_v1 e WHERE e.client_id=p_client AND ((e.previous_id IN (p_previous,p_current) AND e.invalidated_previous_at IS NOT NULL) OR (e.current_id IN (p_previous,p_current) AND e.invalidated_current_at IS NOT NULL))) THEN RETURN NULL; END IF;
 IF a.revision IS DISTINCT FROM 1 OR b.revision IS DISTINCT FROM 1 OR a.source IS DISTINCT FROM 'manual' OR b.source IS DISTINCT FROM 'manual' OR a.notes IS NOT NULL OR b.notes IS NOT NULL OR a.measured_at IS NULL OR b.measured_at IS NULL OR a.created_at<a.measured_at OR b.created_at<b.measured_at OR a.created_at IS NULL OR b.created_at IS NULL OR a.created_at>now() OR b.created_at>now() OR a.measured_at<'1900-01-01'::timestamptz OR b.measured_at>now() OR a.measured_at>=b.measured_at OR (a.measured_at AT TIME ZONE 'America/Santiago')::date >= (b.measured_at AT TIME ZONE 'America/Santiago')::date OR a.unit IS DISTINCT FROM b.unit OR a.metadata IS DISTINCT FROM b.metadata OR private.iberfit_gx_followup_valid_v1(a.metadata,a.value,a.unit) IS DISTINCT FROM true OR private.iberfit_gx_followup_valid_v1(b.metadata,b.value,b.unit) IS DISTINCT FROM true OR EXISTS (SELECT 1 FROM public.m26_client_measurements_v43 m WHERE m.client_id=p_client AND m.metric='gx_followup_void_v1' AND m.metadata->>'targetId' IN (a.id::text,b.id::text)) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('previous',jsonb_build_object('id',a.id,'revision',a.revision,'measuredMicros',trunc(extract(epoch FROM a.measured_at)*1000000)::bigint::text,'value',a.value,'unit',a.unit,'protocol',a.metadata),'current',jsonb_build_object('id',b.id,'revision',b.revision,'measuredMicros',trunc(extract(epoch FROM b.measured_at)*1000000)::bigint::text,'value',b.value,'unit',b.unit,'protocol',b.metadata));
END $f$;
-- Definer restricted to private ledger access; auth identity, assigned Coach,
-- active session + WebAuthn checked explicitly before and after lock.
CREATE FUNCTION private.iberfit_gx_publication_write_v1(p_client uuid,p_publication uuid,p_operation uuid,p_expected integer,p_status text,p_pair jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE latest private.iberfit_gx_publication_event_v1%ROWTYPE; event private.iberfit_gx_publication_event_v1%ROWTYPE; pair jsonb; a uuid; b uuid; h bytea; actor uuid:=auth.uid(); ts timestamptz;
BEGIN
 IF actor IS NULL OR private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_client IS NULL OR p_publication IS NULL OR p_operation IS NULL OR p_expected IS NULL OR p_expected<0 OR p_expected>=2147483647 OR p_status IS NULL OR p_status NOT IN ('published','withdrawn') THEN RAISE EXCEPTION 'GX_PUBLICATION_INVALID' USING ERRCODE='22023'; END IF;
 PERFORM private.iberfit_gx_publication_lock_v1(p_client);
 SELECT * INTO latest FROM private.iberfit_gx_publication_event_v1 WHERE client_id=p_client AND publication_id=p_publication ORDER BY revision DESC LIMIT 1;
 IF p_status='published' THEN
  IF private.iberfit_gx_followup_shape_v1(p_pair,ARRAY['previous','current']) IS DISTINCT FROM true OR private.iberfit_gx_followup_shape_v1(p_pair->'previous',ARRAY['id','revision','measuredMicros','value','unit','protocol']) IS DISTINCT FROM true OR private.iberfit_gx_followup_shape_v1(p_pair->'current',ARRAY['id','revision','measuredMicros','value','unit','protocol']) IS DISTINCT FROM true OR octet_length(p_pair::text)>16000 THEN RAISE EXCEPTION 'GX_PUBLICATION_INVALID' USING ERRCODE='22023'; END IF;
  a:=(p_pair->'previous'->>'id')::uuid; b:=(p_pair->'current'->>'id')::uuid;
  IF latest.revision IS NOT NULL AND (latest.previous_id IS DISTINCT FROM a OR latest.current_id IS DISTINCT FROM b) THEN RAISE EXCEPTION 'GX_PUBLICATION_PAIR_IMMUTABLE' USING ERRCODE='40001'; END IF;
  IF EXISTS (SELECT 1 FROM private.iberfit_gx_publication_event_v1 e WHERE e.client_id=p_client AND e.revision=1 AND e.previous_id=a AND e.current_id=b AND e.publication_id<>p_publication) THEN RAISE EXCEPTION 'GX_PUBLICATION_PAIR_EXISTS' USING ERRCODE='40001'; END IF;
  pair:=private.iberfit_gx_publication_pair_v1(p_client,a,b);
  IF pair IS NULL OR pair IS DISTINCT FROM p_pair THEN RAISE EXCEPTION 'GX_PUBLICATION_PAIR_CHANGED' USING ERRCODE='40001'; END IF;
  h:=pg_catalog.sha256(pg_catalog.convert_to(private.iberfit_gx_publication_normalize_v1(pair)::text,'UTF8'));
 ELSE
  IF p_pair IS NOT NULL OR latest.revision IS NULL THEN RAISE EXCEPTION 'GX_PUBLICATION_INVALID' USING ERRCODE='22023'; END IF;
  a:=latest.previous_id; b:=latest.current_id; h:=latest.pair_hash;
 END IF;
 SELECT * INTO event FROM private.iberfit_gx_publication_event_v1 WHERE operation_id=p_operation;
 IF FOUND THEN
  IF event.client_id IS DISTINCT FROM p_client OR event.publication_id IS DISTINCT FROM p_publication OR event.actor_id IS DISTINCT FROM actor OR event.revision IS DISTINCT FROM p_expected+1 OR event.status IS DISTINCT FROM p_status OR event.previous_id IS DISTINCT FROM a OR event.current_id IS DISTINCT FROM b OR event.pair_hash IS DISTINCT FROM h OR latest.revision IS DISTINCT FROM event.revision THEN RAISE EXCEPTION 'GX_PUBLICATION_CONFLICT' USING ERRCODE='40001'; END IF;
 ELSE
  IF coalesce(latest.revision,0)<>p_expected OR (p_status='withdrawn' AND latest.status IS DISTINCT FROM 'published') OR (p_status='published' AND latest.status='published') THEN RAISE EXCEPTION 'GX_PUBLICATION_CONFLICT' USING ERRCODE='40001'; END IF;
  ts:=clock_timestamp();
  INSERT INTO private.iberfit_gx_publication_event_v1(client_id,publication_id,revision,operation_id,actor_id,status,previous_id,current_id,pair_hash,event_at)
  VALUES(p_client,p_publication,p_expected+1,p_operation,actor,p_status,a,b,h,ts) RETURNING * INTO event;
 END IF;
 IF private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('ok',true,'id',event.publication_id,'clientId',event.client_id,'revision',event.revision,'status',event.status,'reviewedAt',event.event_at,'publishedAt',CASE WHEN event.status='published' THEN event.event_at ELSE NULL END,'pair',pair);
END $f$;
CREATE FUNCTION public.iberfit_gx_publication_write_v1(p_client uuid,p_publication uuid,p_operation uuid,p_expected integer,p_status text,p_pair jsonb)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT private.iberfit_gx_publication_write_v1(p_client,p_publication,p_operation,p_expected,p_status,p_pair);
$f$;
-- Read current head and revalidate source, never return a historical ACK as current evidence.
CREATE FUNCTION private.iberfit_gx_publication_read_v1(p_client uuid,p_publication uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE e private.iberfit_gx_publication_event_v1%ROWTYPE; pair jsonb; s text;
BEGIN
 IF auth.uid() IS NULL OR private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM private.iberfit_gx_publication_event_v1 WHERE client_id=p_client AND publication_id=p_publication ORDER BY revision DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 s:=e.status;
 IF s='published' AND (e.invalidated_previous_at IS NOT NULL OR e.invalidated_current_at IS NOT NULL) THEN s:='invalidated';
 ELSIF s='published' THEN
  pair:=private.iberfit_gx_publication_pair_v1(p_client,e.previous_id,e.current_id);
  IF pair IS NULL OR pg_catalog.sha256(pg_catalog.convert_to(private.iberfit_gx_publication_normalize_v1(pair)::text,'UTF8')) IS DISTINCT FROM e.pair_hash THEN s:='invalidated';pair:=NULL; END IF;
 END IF;
 RETURN jsonb_build_object('id',e.publication_id,'clientId',e.client_id,'revision',e.revision,'status',s,'reviewedAt',e.event_at,'publishedAt',CASE WHEN e.status='published' THEN e.event_at ELSE NULL END,'pair',pair);
END $f$;
CREATE FUNCTION public.iberfit_gx_publication_read_v1(p_client uuid,p_publication uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT private.iberfit_gx_publication_read_v1(p_client,p_publication);
$f$;

-- Exact pair resolution uses the immutable first revision, including withdrawn heads.
CREATE FUNCTION private.iberfit_gx_publication_find_v1(p_client uuid,p_previous uuid,p_current uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE pub uuid;
BEGIN
 IF auth.uid() IS NULL OR private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_previous IS NULL OR p_current IS NULL OR p_previous=p_current OR p_previous=p_client OR p_current=p_client THEN RAISE EXCEPTION 'GX_PUBLICATION_INVALID' USING ERRCODE='22023'; END IF;
 SELECT publication_id INTO pub FROM private.iberfit_gx_publication_event_v1 WHERE client_id=p_client AND revision=1 AND previous_id=p_previous AND current_id=p_current;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('previousId',p_previous,'currentId',p_current,'publication',private.iberfit_gx_publication_read_v1(p_client,pub));
END $f$;
CREATE FUNCTION public.iberfit_gx_publication_find_v1(p_client uuid,p_previous uuid,p_current uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT private.iberfit_gx_publication_find_v1(p_client,p_previous,p_current);
$f$;
-- Stable keyset by immutable publication UUID. Return only heads and their
-- current effective status; never the raw pair or previous private history.
CREATE FUNCTION private.iberfit_gx_publication_list_v1(p_client uuid,p_after uuid,p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE ids uuid[]; item uuid; h jsonb; result jsonb:='[]'::jsonb; i integer:=0; next_id uuid;
BEGIN
 IF auth.uid() IS NULL OR private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>20 THEN RAISE EXCEPTION 'GX_PUBLICATION_INVALID' USING ERRCODE='22023'; END IF;
 SELECT array_agg(q.publication_id ORDER BY q.publication_id) INTO ids FROM (SELECT publication_id FROM private.iberfit_gx_publication_event_v1 WHERE client_id=p_client AND revision=1 AND (p_after IS NULL OR publication_id>p_after) ORDER BY publication_id LIMIT p_limit+1) q;
 FOREACH item IN ARRAY coalesce(ids,ARRAY[]::uuid[]) LOOP
  i:=i+1; IF i>p_limit THEN next_id:=ids[p_limit]; EXIT; END IF;
  h:=private.iberfit_gx_publication_read_v1(p_client,item);
  IF h IS NULL THEN RAISE EXCEPTION 'GX_PUBLICATION_LIST_CHANGED' USING ERRCODE='40001'; END IF;
  result:=result||jsonb_build_array(h-'pair');
 END LOOP;
 RETURN jsonb_build_object('clientId',p_client,'items',result,'nextCursor',next_id);
END $f$;
CREATE FUNCTION public.iberfit_gx_publication_list_v1(p_client uuid,p_after uuid,p_limit integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT private.iberfit_gx_publication_list_v1(p_client,p_after,p_limit);
$f$;
-- Exact operation receipt (including operations no longer current). No raw pair
-- is returned. An absent operation is not a proof of failure of a pending request.
CREATE FUNCTION private.iberfit_gx_publication_recover_v1(p_client uuid,p_publication uuid,p_operation uuid,p_expected integer,p_status text,p_pair jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO '' AS $f$
DECLARE e private.iberfit_gx_publication_event_v1%ROWTYPE; head jsonb;
BEGIN
 IF auth.uid() IS NULL OR private.iberfit_gx_followup_can_coach_v1(p_client) IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_PUBLICATION_COACH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_publication IS NULL OR p_operation IS NULL OR p_expected IS NULL OR p_expected<0 OR p_expected>=2147483647 OR p_status IS NULL OR p_status NOT IN ('published','withdrawn') OR (p_status='withdrawn' AND p_pair IS NOT NULL) OR (p_status='published' AND (p_pair IS NULL OR octet_length(p_pair::text)>16000)) THEN RAISE EXCEPTION 'GX_PUBLICATION_INVALID' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM private.iberfit_gx_publication_event_v1 WHERE operation_id=p_operation AND client_id=p_client AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF e.publication_id IS DISTINCT FROM p_publication OR e.revision IS DISTINCT FROM p_expected+1 OR e.status IS DISTINCT FROM p_status OR (p_status='published' AND pg_catalog.sha256(pg_catalog.convert_to(private.iberfit_gx_publication_normalize_v1(p_pair)::text,'UTF8')) IS DISTINCT FROM e.pair_hash) THEN RAISE EXCEPTION 'GX_PUBLICATION_CONFLICT' USING ERRCODE='40001'; END IF;
 head:=private.iberfit_gx_publication_read_v1(p_client,p_publication);
 IF head IS NULL THEN RAISE EXCEPTION 'GX_PUBLICATION_LIST_CHANGED' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('clientId',p_client,'publicationId',p_publication,'operationId',p_operation,'revision',e.revision,'status',e.status,'currentRevision',(head->>'revision')::integer,'currentStatus',head->>'status');
END $f$;
CREATE FUNCTION public.iberfit_gx_publication_recover_v1(p_client uuid,p_publication uuid,p_operation uuid,p_expected integer,p_status text,p_pair jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $f$
 SELECT private.iberfit_gx_publication_recover_v1(p_client,p_publication,p_operation,p_expected,p_status,p_pair);
$f$;

REVOKE ALL ON FUNCTION private.iberfit_gx_publication_lock_v1(uuid),private.iberfit_gx_publication_void_lock_v1(),private.iberfit_gx_publication_pair_v1(uuid,uuid,uuid),private.iberfit_gx_publication_write_v1(uuid,uuid,uuid,integer,text,jsonb),private.iberfit_gx_publication_read_v1(uuid,uuid),public.iberfit_gx_publication_write_v1(uuid,uuid,uuid,integer,text,jsonb),public.iberfit_gx_publication_read_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.iberfit_gx_publication_lock_v1(uuid),private.iberfit_gx_publication_write_v1(uuid,uuid,uuid,integer,text,jsonb),private.iberfit_gx_publication_read_v1(uuid,uuid),public.iberfit_gx_publication_write_v1(uuid,uuid,uuid,integer,text,jsonb),public.iberfit_gx_publication_read_v1(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.iberfit_gx_publication_find_v1(uuid,uuid,uuid),private.iberfit_gx_publication_list_v1(uuid,uuid,integer),private.iberfit_gx_publication_recover_v1(uuid,uuid,uuid,integer,text,jsonb),public.iberfit_gx_publication_find_v1(uuid,uuid,uuid),public.iberfit_gx_publication_list_v1(uuid,uuid,integer),public.iberfit_gx_publication_recover_v1(uuid,uuid,uuid,integer,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.iberfit_gx_publication_find_v1(uuid,uuid,uuid),private.iberfit_gx_publication_list_v1(uuid,uuid,integer),private.iberfit_gx_publication_recover_v1(uuid,uuid,uuid,integer,text,jsonb),public.iberfit_gx_publication_find_v1(uuid,uuid,uuid),public.iberfit_gx_publication_list_v1(uuid,uuid,integer),public.iberfit_gx_publication_recover_v1(uuid,uuid,uuid,integer,text,jsonb) TO authenticated;
COMMIT;
