-- IBERFIT · P0 · process_operation PL/pgSQL ambiguity hardening
-- Preserve the current API/security contract while removing variable/column name collisions.

create or replace function public.iberfit_process_operation(op jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_op_id uuid := (op->>'operationId')::uuid;
  v_op_type text := nullif(op->>'type','');
  v_entity_type text := coalesce(nullif(op->>'entityType',''),'unknown');
  v_entity_id text := coalesce(nullif(op->>'entityId',''),'unknown');
  v_client_id uuid := nullif(op->>'clientId','')::uuid;
  v_base_revision bigint := coalesce((op->>'baseRevision')::bigint,0);
  v_payload jsonb := coalesce(op->'payload','{}'::jsonb);
  v_current_revision bigint;
  v_current_snapshot jsonb;
  v_next_revision bigint;
  v_append_only boolean;
  v_existing public.outbox_receipts%rowtype;
begin
  perform public.iberfit_require_privileged_assurance_v65d();

  if v_op_type is null or not public.iberfit_operation_allowed(v_op_type,v_client_id) then
    return jsonb_build_object(
      'kind','rejected',
      'operationId',op->>'operationId',
      'reason','Operación no autorizada'
    );
  end if;

  select r.*
  into v_existing
  from public.outbox_receipts as r
  where r.operation_id=v_op_id;

  if found then
    return jsonb_build_object(
      'kind','ack',
      'operationId',v_op_id,
      'status','sincronizada',
      'remoteRevision',v_existing.remote_revision,
      'appendOnly',v_existing.append_only,
      'duplicate',true,
      'serverAt',v_existing.processed_at
    );
  end if;

  v_append_only := v_op_type = any(array[
    'SESION_INICIADA','SERIE_COMPLETADA','INCIDENCIA_REGISTRADA',
    'CHECKIN_REGISTRADO','FEEDBACK_REGISTRADO','SESION_CERRADA',
    'EJERCICIO_OMITIDO','EJERCICIO_REEMPLAZADO','EJERCICIO_AÑADIDO',
    'DESCANSO_EDITADO','IRI_AUTOSAVE','INTELIGENCIA_APROBADA',
    'INTELIGENCIA_DESCARTADA','CAMBIO_PLAN_APROBADO','CAMBIO_PLAN_DESCARTADO'
  ]);

  select se.revision,se.snapshot
  into v_current_revision,v_current_snapshot
  from public.sync_entities as se
  where se.entity_type=v_entity_type
    and se.entity_id=v_entity_id
  for update;

  v_current_revision := coalesce(v_current_revision,0);

  if v_append_only then
    insert into public.sync_events(
      operation_id,entity_type,entity_id,client_id,event_type,payload,
      actor_user_id,local_sequence,occurred_at
    )
    values(
      v_op_id,v_entity_type,v_entity_id,v_client_id,v_op_type,v_payload,
      auth.uid(),coalesce((op->>'localSequence')::bigint,0),
      coalesce((op->>'createdAt')::timestamptz,now())
    );
    v_next_revision := v_current_revision;
  elsif v_base_revision <> v_current_revision then
    return jsonb_build_object(
      'kind','conflict',
      'operationId',v_op_id,
      'status','conflicto',
      'entityKey',v_entity_type||':'||v_entity_id,
      'localBaseRevision',v_base_revision,
      'remoteRevision',v_current_revision,
      'remoteSnapshot',v_current_snapshot,
      'localSnapshot',v_payload,
      'serverAt',now()
    );
  else
    v_next_revision := v_current_revision+1;
    insert into public.sync_entities(
      entity_type,entity_id,client_id,revision,snapshot,updated_by
    )
    values(
      v_entity_type,v_entity_id,v_client_id,v_next_revision,v_payload,auth.uid()
    )
    on conflict(entity_type,entity_id) do update
    set client_id=excluded.client_id,
        revision=excluded.revision,
        snapshot=excluded.snapshot,
        updated_by=excluded.updated_by,
        updated_at=now();
  end if;

  insert into public.outbox_receipts(
    operation_id,entity_type,entity_id,remote_revision,append_only,actor_user_id
  )
  values(
    v_op_id,v_entity_type,v_entity_id,v_next_revision,v_append_only,auth.uid()
  );

  insert into public.audit_events(
    operation_id,event_type,entity_type,entity_id,actor_user_id,payload
  )
  values(
    v_op_id,v_op_type,v_entity_type,v_entity_id,auth.uid(),v_payload
  );

  return jsonb_build_object(
    'kind','ack',
    'operationId',v_op_id,
    'status','sincronizada',
    'entityKey',v_entity_type||':'||v_entity_id,
    'remoteRevision',v_next_revision,
    'appendOnly',v_append_only,
    'serverAt',now()
  );
exception when others then
  return jsonb_build_object(
    'kind','rejected',
    'operationId',op->>'operationId',
    'reason',sqlerrm
  );
end
$function$;

revoke all on function public.iberfit_process_operation(jsonb) from public,anon;
grant execute on function public.iberfit_process_operation(jsonb) to authenticated,service_role;

do $postcheck$
declare
  v_definition text;
  v_security_definer boolean;
begin
  select pg_get_functiondef(p.oid),p.prosecdef
  into v_definition,v_security_definer
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='iberfit_process_operation'
    and pg_get_function_identity_arguments(p.oid)='op jsonb';

  if v_definition is null then
    raise exception 'PROCESS_OPERATION_POSTCHECK_MISSING';
  end if;

  if v_security_definer then
    raise exception 'PROCESS_OPERATION_POSTCHECK_SECURITY_DEFINER';
  end if;

  if position('perform public.iberfit_require_privileged_assurance_v65d()' in lower(v_definition))=0 then
    raise exception 'PROCESS_OPERATION_POSTCHECK_ASSURANCE_MISSING';
  end if;

  if v_definition ~ '(?m)^\s*entity_type\s+text\s*:=' or
     v_definition ~ '(?m)^\s*entity_id\s+text\s*:=' then
    raise exception 'PROCESS_OPERATION_POSTCHECK_AMBIGUOUS_VARIABLES';
  end if;

  if position('se.entity_type=v_entity_type' in regexp_replace(lower(v_definition),'\s+','','g'))=0 or
     position('se.entity_id=v_entity_id' in regexp_replace(lower(v_definition),'\s+','','g'))=0 then
    raise exception 'PROCESS_OPERATION_POSTCHECK_ENTITY_ALIAS_MISSING';
  end if;

  if has_function_privilege('anon','public.iberfit_process_operation(jsonb)','EXECUTE') then
    raise exception 'PROCESS_OPERATION_POSTCHECK_ANON_EXECUTE';
  end if;

  if not has_function_privilege('authenticated','public.iberfit_process_operation(jsonb)','EXECUTE') or
     not has_function_privilege('service_role','public.iberfit_process_operation(jsonb)','EXECUTE') then
    raise exception 'PROCESS_OPERATION_POSTCHECK_REQUIRED_EXECUTE_MISSING';
  end if;
end
$postcheck$;
