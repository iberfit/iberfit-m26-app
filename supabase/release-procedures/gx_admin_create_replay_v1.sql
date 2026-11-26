-- GX333: atomic admin creation replay guard; retain original function owner and ACL.
DO $gx333$
DECLARE d text:=pg_get_functiondef('public.iberfit_admin_create_client_v26(jsonb,jsonb)'::regprocedure); a text; b text;
BEGIN
 IF md5(d)<>'ef5bb3aa0f438ec79158805b272c68f4' THEN RAISE EXCEPTION 'GX333_BASE_DRIFT'; END IF;
 a:=$gx_a0$  v_current_lifecycle text;
begin$gx_a0$;
 b:=$gx_b0$  v_current_lifecycle text;
  gx_op text:=btrim(coalesce(p_command->>'operationId',''));
  gx_receipt public.iberfit_admin_mutation_receipts%rowtype;
  gx_context jsonb;
  gx_hash text;
begin$gx_b0$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'GX333_ANCHOR_0'; END IF;
 d:=replace(d,a,b);
 a:=$gx_a1$  if v_org is null then raise exception 'V26_ADMIN_CLIENT_CREATE_ORGANIZATION_REQUIRED' using errcode='42501'; end if;

  select i.client_id into v_existing_person$gx_a1$;
 b:=$gx_b1$  if v_org is null then raise exception 'V26_ADMIN_CLIENT_CREATE_ORGANIZATION_REQUIRED' using errcode='42501'; end if;
  -- Recover before calling any legacy mutating helper. The current actor's
  -- organization/role must match the trusted application context.
  gx_context:=public.iberfit_application_context_v14();
  if not coalesce(gx_context->'roles','[]'::jsonb)?'admin'
     or nullif(gx_context->>'organizationId','')::uuid is distinct from v_org
     or not coalesce(v_context->'roles','[]'::jsonb)?'admin' then
    raise exception 'GX333_ADMIN_SCOPE_REQUIRED' using errcode='42501';
  end if;
  if upper(btrim(coalesce(p_command->>'type',''))) <> 'ADMIN_CLIENTE_CREAR'
     or char_length(gx_op) not between 3 and 200 or jsonb_typeof(p_command->'payload') is distinct from 'object' then
    raise exception 'GX333_CREATE_COMMAND_INVALID' using errcode='22023';
  end if;
  -- Exact retries are serialized before receipt lookup. No new index or table.
  perform pg_catalog.pg_advisory_xact_lock(1781042602,pg_catalog.hashtext(gx_op));
  gx_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to((p_command-'createdAt')::text,'UTF8')),'hex');
  select * into gx_receipt from public.iberfit_admin_mutation_receipts where operation_id=gx_op;
  if found then
    if gx_receipt.actor_user_id is distinct from v_actor or gx_receipt.organization_id is distinct from v_org
       or gx_receipt.command_type is distinct from 'ADMIN_CLIENTE_CREAR' then
      raise exception 'GX333_OPERATION_COLLISION' using errcode='42501';
    end if;
    if gx_receipt.result->>'gx333CommandHash' is not null then
      if gx_receipt.result->>'gx333CommandHash' is distinct from gx_hash then
        raise exception 'GX333_OPERATION_PAYLOAD_CHANGED' using errcode='22023';
      end if;
    else
      -- Historical receipts lack full request identity. Never execute them again.
      if lower(btrim(coalesce(gx_receipt.result->>'email',''))) is distinct from v_email
         or gx_receipt.result->>'accessMode' is distinct from v_access then
        raise exception 'GX333_OPERATION_PAYLOAD_CHANGED' using errcode='22023';
      end if;
    end if;
    if gx_receipt.result->>'operationId' is distinct from gx_op or gx_receipt.result->>'clientId' is null then
      raise exception 'GX333_RECEIPT_INVALID' using errcode='22023';
    end if;
    perform public.iberfit_assert_client_org_scope_v65e(v_org,gx_receipt.result->>'clientId');
    -- This is historical acknowledgement, NOT current service/access state.
    return (gx_receipt.result-'gx333CommandHash'-'invitation'-'trainingServiceStatus'-'coachAssignment')||
      jsonb_build_object('kind','duplicate','recoveryOnly',true);
  end if;

  select i.client_id into v_existing_person$gx_b1$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'GX333_ANCHOR_1'; END IF;
 d:=replace(d,a,b);
 a:=$gx_a2$  return v_result||jsonb_build_object(
    'entryIntent',v_entry,
    'trainingServiceStatus',coalesce(v_current_service,'none'),
    'initialAssessmentMode',v_assessment,
    'iriCreated',case when v_assessment='iri' then true else not v_cleaned_placeholder and v_had_iri end
  );$gx_a2$;
 b:=$gx_b2$  v_result:=v_result||jsonb_build_object(
    'entryIntent',v_entry,
    'trainingServiceStatus',coalesce(v_current_service,'none'),
    'initialAssessmentMode',v_assessment,
    'iriCreated',case when v_assessment='iri' then true else not v_cleaned_placeholder and v_had_iri end
  );
  update public.iberfit_admin_mutation_receipts set result=v_result||jsonb_build_object('gx333CommandHash',gx_hash)
    where operation_id=gx_op and actor_user_id=v_actor and organization_id=v_org and command_type='ADMIN_CLIENTE_CREAR';
  if not found then raise exception 'GX333_RECEIPT_MISSING' using errcode='P0001'; end if;
  return v_result;$gx_b2$;
 IF (length(d)-length(replace(d,a,'')))/length(a)<>1 THEN RAISE EXCEPTION 'GX333_ANCHOR_2'; END IF;
 d:=replace(d,a,b);
 EXECUTE d;
END $gx333$;
