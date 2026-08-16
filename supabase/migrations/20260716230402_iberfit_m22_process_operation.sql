create or replace function public.iberfit_process_operation(op jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  op_id uuid := (op->>'operationId')::uuid;
  op_type text := nullif(op->>'type','');
  entity_type text := coalesce(nullif(op->>'entityType',''),'unknown');
  entity_id text := coalesce(nullif(op->>'entityId',''),'unknown');
  client_id uuid := nullif(op->>'clientId','')::uuid;
  base_revision bigint := coalesce((op->>'baseRevision')::bigint,0);
  payload jsonb := coalesce(op->'payload','{}'::jsonb);
  current_revision bigint;
  current_snapshot jsonb;
  next_revision bigint;
  append_only boolean;
  existing public.outbox_receipts%rowtype;
begin
  if op_type is null or not public.iberfit_operation_allowed(op_type,client_id) then
    return jsonb_build_object('kind','rejected','operationId',op->>'operationId','reason','Operación no autorizada');
  end if;
  select * into existing from public.outbox_receipts where operation_id=op_id;
  if found then
    return jsonb_build_object('kind','ack','operationId',op_id,'status','sincronizada','remoteRevision',existing.remote_revision,'appendOnly',existing.append_only,'duplicate',true,'serverAt',existing.processed_at);
  end if;
  append_only := op_type = any(array['SESION_INICIADA','SERIE_COMPLETADA','INCIDENCIA_REGISTRADA','CHECKIN_REGISTRADO','FEEDBACK_REGISTRADO','SESION_CERRADA','EJERCICIO_OMITIDO','EJERCICIO_REEMPLAZADO','EJERCICIO_AÑADIDO','DESCANSO_EDITADO','IRI_AUTOSAVE','INTELIGENCIA_APROBADA','INTELIGENCIA_DESCARTADA','CAMBIO_PLAN_APROBADO','CAMBIO_PLAN_DESCARTADO']);
  select revision,snapshot into current_revision,current_snapshot from public.sync_entities where entity_type=public.iberfit_process_operation.entity_type and entity_id=public.iberfit_process_operation.entity_id for update;
  current_revision := coalesce(current_revision,0);
  if append_only then
    insert into public.sync_events(operation_id,entity_type,entity_id,client_id,event_type,payload,actor_user_id,local_sequence,occurred_at)
    values(op_id,entity_type,entity_id,client_id,op_type,payload,auth.uid(),coalesce((op->>'localSequence')::bigint,0),coalesce((op->>'createdAt')::timestamptz,now()));
    next_revision := current_revision;
  elsif base_revision <> current_revision then
    return jsonb_build_object('kind','conflict','operationId',op_id,'status','conflicto','entityKey',entity_type||':'||entity_id,'localBaseRevision',base_revision,'remoteRevision',current_revision,'remoteSnapshot',current_snapshot,'localSnapshot',payload,'serverAt',now());
  else
    next_revision := current_revision+1;
    insert into public.sync_entities(entity_type,entity_id,client_id,revision,snapshot,updated_by)
    values(entity_type,entity_id,client_id,next_revision,payload,auth.uid())
    on conflict(entity_type,entity_id) do update set client_id=excluded.client_id,revision=excluded.revision,snapshot=excluded.snapshot,updated_by=excluded.updated_by,updated_at=now();
  end if;
  insert into public.outbox_receipts(operation_id,entity_type,entity_id,remote_revision,append_only,actor_user_id)
  values(op_id,entity_type,entity_id,next_revision,append_only,auth.uid());
  insert into public.audit_events(operation_id,event_type,entity_type,entity_id,actor_user_id,payload)
  values(op_id,op_type,entity_type,entity_id,auth.uid(),payload);
  return jsonb_build_object('kind','ack','operationId',op_id,'status','sincronizada','entityKey',entity_type||':'||entity_id,'remoteRevision',next_revision,'appendOnly',append_only,'serverAt',now());
exception when others then
  return jsonb_build_object('kind','rejected','operationId',op->>'operationId','reason',sqlerrm);
end
$$;
revoke all on function public.iberfit_process_operation(jsonb) from public,anon;
grant execute on function public.iberfit_process_operation(jsonb) to authenticated;;
