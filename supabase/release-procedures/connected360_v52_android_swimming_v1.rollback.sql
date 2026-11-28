-- CANDIDATE ONLY. Disable the independent gate before rollback.
-- Refuse if any classified Android swimming rows would become incompatible.
BEGIN;
SET LOCAL lock_timeout='3s';
LOCK TABLE public.m26_wearable_v46_release_control_prod IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.m26_wearable_exercise_evidence_v46 IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF md5(pg_get_functiondef('public.m26_wearable_v46_import_prod_v1(uuid,jsonb)'::regprocedure)) <> '15fad17ae91a010ee73c047799eff06d'
     OR md5(pg_get_functiondef('public.m26_wearable_v46_capabilities_prod_v1()'::regprocedure)) <> 'a95c99f476794218c5da2b1356b5a1e6' THEN
    RAISE EXCEPTION 'M26_V52_RPC_DEFINITION_DRIFT';
  END IF;
  IF EXISTS(SELECT 1 FROM public.m26_wearable_v46_release_control_prod WHERE swimming_enabled)
     OR EXISTS(SELECT 1 FROM public.m26_wearable_exercise_evidence_v46 WHERE provider='health_connect' AND sport='swimming') THEN
    RAISE EXCEPTION 'M26_V52_ROLLBACK_REQUIRES_DATA_PRESERVATION';
  END IF;
END $guard$;
-- Transform the fingerprint-pinned existing definitions; no duplicate full RPC body.
-- Both directions preserve the exact original/candidate pg_get_functiondef hashes.
DO $patch$
DECLARE d text;
BEGIN
  d:=pg_get_functiondef('public.m26_wearable_v46_import_prod_v1(uuid,jsonb)'::regprocedure);
  d:=replace(d,$before$  v_sport text;
  v_swimming_enabled boolean := false;
  v_release_enabled boolean := false;
  v_samples integer;$before$,$after$  v_sport text;
  v_samples integer;$after$);
  d:=replace(d,$before$  select enabled,swimming_enabled into v_release_enabled,v_swimming_enabled
    from public.m26_wearable_v46_release_control_prod where id=true for share;
  if v_release_enabled is distinct from true then$before$,$after$  if not exists (select 1 from public.m26_wearable_v46_release_control_prod where id=true and enabled=true) then$after$);
  d:=replace(d,$before$      or v_sport is null
      or (v_sport not in ('running','interval_running','hiit','cycling','walking','strength','other')
        and not (v_sport='swimming' and v_swimming_enabled is true))$before$,$after$      or v_sport not in ('running','interval_running','hiit','cycling','walking','strength','other')$after$);
  d:=replace(d,$before$provider='health_connect'
        and source_record_key=v_source for update;
    -- Older hosts can only emit other for a swim. Preserve an established
    -- classification for this same provider-scoped observation key.
    if found and v_old_ex.sport='swimming' and v_sport='other' then
      v_sport:='swimming';
    end if;
    if found and v_old_ex.acquired_at>=v_acquired then$before$,$after$provider='health_connect'
        and source_record_key=v_source for update;
    if found and v_old_ex.acquired_at>=v_acquired then$after$);
  IF md5(d) IS DISTINCT FROM '01e380756bb0bb584b95459e16bad689' THEN RAISE EXCEPTION 'M26_V52_RPC_DEFINITION_DRIFT'; END IF;
  EXECUTE d;
  d:=pg_get_functiondef('public.m26_wearable_v46_capabilities_prod_v1()'::regprocedure);
  d:=replace(d,$before$  v_enabled boolean := false;
  v_swimming_enabled boolean := false;
BEGIN$before$,$after$  v_enabled boolean := false;
BEGIN$after$);
  d:=replace(d,$before$  SELECT enabled,swimming_enabled INTO v_enabled,v_swimming_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id=true;$before$,$after$  SELECT enabled INTO v_enabled FROM public.m26_wearable_v46_release_control_prod WHERE id=true;$after$);
  d:=replace(d,$before$    'serverEnabled',COALESCE(v_enabled,false),
    'swimmingEnabled',COALESCE(v_enabled AND v_swimming_enabled,false),'schema','iberfit.connected360.v46.ingest.v1'$before$,$after$    'serverEnabled',COALESCE(v_enabled,false),'schema','iberfit.connected360.v46.ingest.v1'$after$);
  IF md5(d) IS DISTINCT FROM '0049ade9c829d330ba8db94381a35666' THEN RAISE EXCEPTION 'M26_V52_RPC_DEFINITION_DRIFT'; END IF;
  EXECUTE d;
END $patch$;
ALTER TABLE public.m26_wearable_exercise_evidence_v46 DROP CONSTRAINT m26_wearable_exercise_evidence_v46_sport_check,
  ADD CONSTRAINT m26_wearable_exercise_evidence_v46_sport_check CHECK (sport IN ('running','interval_running','hiit','cycling','walking','strength','other') OR (provider='apple_health' AND sport='swimming'));
ALTER TABLE public.m26_wearable_v46_release_control_prod DROP COLUMN swimming_enabled;
DO $verify$
BEGIN
  IF md5(pg_get_functiondef('public.m26_wearable_v46_import_prod_v1(uuid,jsonb)'::regprocedure)) <> '01e380756bb0bb584b95459e16bad689'
     OR md5(pg_get_functiondef('public.m26_wearable_v46_capabilities_prod_v1()'::regprocedure)) <> '0049ade9c829d330ba8db94381a35666' THEN
    RAISE EXCEPTION 'M26_V52_RPC_DEFINITION_DRIFT';
  END IF;
END $verify$;
COMMIT;
