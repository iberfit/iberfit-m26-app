-- GX350 supplemental deferred IRI identity: install only after GX333.
-- No historical data mutation or new RPC/grant. Exact function replacement.
DO $gx350_iri$
DECLARE
  direction constant text:='__GX350_READBACK_DIRECTION__';
  step record;
  prior text;
  revised text;
  source_anchor text;
  dest_anchor text;
  source_md5 text;
  dest_md5 text;
  prior_meta jsonb;
  revised_meta jsonb;
BEGIN
  IF direction NOT IN ('install','rollback') THEN RAISE EXCEPTION 'GX350_IRI_DIRECTION_INVALID'; END IF;
  IF md5(pg_get_functiondef('public.iberfit_create_client_draft_v12_pre_v65e(jsonb)'::regprocedure))<>'5eca7c696f69e01a25d1d56f053974ce' THEN RAISE EXCEPTION 'GX350_IRI_READBACK_DEPENDENCY_MISSING'; END IF;
  FOR step IN SELECT * FROM (VALUES
    ('public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb)'::regprocedure,'0e37c22b36d6686b308d228f3c476216','2b7a061f95cc93dd74a582f141526ab6',$old1$  return v_result;
end
$function$$old1$,$new1$  -- Preserve the exact new-client placeholder identity for the outer
  -- deferred-IRI cleanup only; never infer it from another client or old IRI.
  if v_payload->>'entryIntent'='training'
     and v_payload->>'initialAssessmentMode'='deferred'
     and v_created->>'reused'='false' then
    if coalesce(v_created->>'iri_entity_available','false')<>'true'
       or nullif(v_created->>'iri_id','') is null then
      raise exception 'GX350_NEW_IRI_PLACEHOLDER_ID_MISSING';
    end if;
    return v_result||jsonb_build_object('iri_id',v_created->'iri_id','iri_entity_available',true);
  end if;
  return v_result;
end
$function$$new1$,1),
    ('public.iberfit_admin_create_client_v26(jsonb,jsonb)'::regprocedure,'58dbd5687c5547e8c4ba2cbad9974f75','69152651ed9681ad4833ceba759a11a3',$old2$  v_result:=v_result-'relationshipType'-'initialLifecycleStatus';
  if v_assessment='deferred' and v_cleaned_placeholder then$old2$,$new2$  -- A newly created deferred-IRI expediente must not report success
  -- while its unrequested draft survives. Abort atomically on uncertainty.
  if v_entry='training' and v_assessment='deferred' and not v_had_iri
     and (v_existing_person is null or v_created_iri is not null)
     and not v_cleaned_placeholder then
    raise exception 'GX350_DEFERRED_IRI_CLEANUP_UNCONFIRMED';
  end if;
  v_result:=v_result-'relationshipType'-'initialLifecycleStatus';
  if v_assessment='deferred' and v_cleaned_placeholder then$new2$,2)
  ) s(signature,old_md5,new_md5,old_body,new_body,ordinal)
    ORDER BY CASE WHEN direction='install' THEN ordinal ELSE -ordinal END
  LOOP
    source_anchor:=CASE WHEN direction='install' THEN step.old_body ELSE step.new_body END;
    dest_anchor:=CASE WHEN direction='install' THEN step.new_body ELSE step.old_body END;
    source_md5:=CASE WHEN direction='install' THEN step.old_md5 ELSE step.new_md5 END;
    dest_md5:=CASE WHEN direction='install' THEN step.new_md5 ELSE step.old_md5 END;
    prior:=pg_get_functiondef(step.signature);
    IF md5(prior) IS DISTINCT FROM source_md5 OR (length(prior)-length(replace(prior,source_anchor,'')))/length(source_anchor)<>1 THEN
      RAISE EXCEPTION 'GX350_IRI_SOURCE_DRIFT';
    END IF;
    IF has_function_privilege('anon',step.signature,'EXECUTE') OR has_function_privilege('authenticated',step.signature,'EXECUTE') THEN
      RAISE EXCEPTION 'GX350_IRI_INTERNAL_ACL_DRIFT';
    END IF;
    SELECT to_jsonb(p)-'prosrc' INTO prior_meta FROM pg_proc p WHERE p.oid=step.signature::oid;
    revised:=replace(prior,source_anchor,dest_anchor);
    IF md5(revised) IS DISTINCT FROM dest_md5 THEN RAISE EXCEPTION 'GX350_IRI_TARGET_DRIFT'; END IF;
    EXECUTE revised;
    SELECT to_jsonb(p)-'prosrc' INTO revised_meta FROM pg_proc p WHERE p.oid=step.signature::oid;
    IF md5(pg_get_functiondef(step.signature)) IS DISTINCT FROM dest_md5 OR prior_meta IS DISTINCT FROM revised_meta THEN
      RAISE EXCEPTION 'GX350_IRI_CATALOG_DRIFT';
    END IF;
  END LOOP;
END $gx350_iri$;
