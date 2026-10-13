-- M37: targeted, fail-closed V26 RC29 rewrite on the exact approved base.
-- Preserve all existing auth, guards, commands and audit behavior.
-- The assertive replacements below fail if the deployed function has drifted.
DO $m37$
DECLARE
  source_sql text:=pg_get_functiondef('public.iberfit_execute_command_v26_rc29(jsonb)'::regprocedure);
  edited text;
  old_piece text;
  new_piece text;
BEGIN
  IF md5(source_sql)<>'52bd09380e8a19eb0ee1f034b9177ba6' THEN
    RAISE EXCEPTION 'M37_RC29_SOURCE_DRIFT';
  END IF;
  edited:=source_sql;
  old_piece:=$old$    if v_execution_id is null or v_appointment_id is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','EXECUTION_AND_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;
    if exists(select 1 from public.active_execution_locks_v26 where client_id=v_client_id) then$old$;
  new_piece:=$new$    if v_execution_id is null then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','EXECUTION_ID_REQUIRED','serverAt',v_now);
    end if;
    -- No appointment only for a trusted, already-enabled, fully visible
    -- guided prescription. Never trust the requested delivery in the command.
    if v_appointment_id is null and not (
      v_role in ('coach','cliente') and v_status='disponible'
      and v_body->>'deliveryModality'='guiada_en_app'
      and v_body->>'deliveryOwnership' in ('guided_in_app','client_autonomous')
      and v_body->>'clientVisibilityLevel'='full'
      and v_body->>'visibleToClient'='true'
      and jsonb_typeof(v_body->'blocks')='array'
      and jsonb_array_length(v_body->'blocks')>0
    ) then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','CONFIRMED_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;
    -- Different sessions of one client cannot race for the active lock.
    perform pg_advisory_xact_lock(hashtextextended('active_execution_client:'||v_client_id::text,0));
    if exists(select 1 from public.active_execution_locks_v26 where client_id=v_client_id) then$new$;
  IF position(old_piece in edited)=0 THEN RAISE EXCEPTION 'M37_START_ANCHOR_DRIFT'; END IF;
  edited:=replace(edited,old_piece,new_piece);

  old_piece:=$old$    v_appointment:=public.iberfit_base_entity_v26('appointment',v_appointment_id,v_client_id);
    if v_appointment is null or v_appointment->>'status'<>'confirmada'
       or nullif(v_appointment->>'sessionId','')::uuid is distinct from v_entity_id then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','CONFIRMED_APPOINTMENT_REQUIRED','serverAt',v_now);
    end if;$old$;
  new_piece:=$new$    if v_appointment_id is not null then
      v_appointment:=public.iberfit_base_entity_v26('appointment',v_appointment_id,v_client_id);
      if v_appointment is null or v_appointment->>'status'<>'confirmada'
         or nullif(v_appointment->>'sessionId','')::uuid is distinct from v_entity_id then
        return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','CONFIRMED_APPOINTMENT_REQUIRED','serverAt',v_now);
      end if;
    end if;$new$;
  IF position(old_piece in edited)=0 THEN RAISE EXCEPTION 'M37_APPOINTMENT_ANCHOR_DRIFT'; END IF;
  edited:=replace(edited,old_piece,new_piece);

  old_piece:=$old$  perform public.iberfit_persist_entity_v26(v_entity_type,v_entity_id,v_client_id,v_to_status,v_next_revision,v_next_body);

  insert into public.command_events_v26$old$;
  new_piece:=$new$  -- Canonical-first sessions need a legacy FK anchor for active_execution_locks.
  -- Existing mirrored sessions are not overwritten, only updated by the
  -- canonical persistence writer. All changes are in the command transaction.
  if v_command_type='SESION_PUBLICAR' and v_to_status='publicada' then
    if v_next_body->>'deliveryModality' not in ('guiada_en_app','presencial')
      or v_next_body->>'deliveryOwnership' is distinct from
         (case when v_next_body->>'deliveryModality'='presencial' then 'coach_led' else 'guided_in_app' end)
      or nullif(trim(v_next_body->>'title'),'') is null
      or jsonb_typeof(v_next_body->'blocks')<>'array'
      or jsonb_array_length(v_next_body->'blocks')=0 then
      return jsonb_build_object('kind','rejected','operationId',v_operation_id,'remoteRevision',v_revision,'reason','M37_PRESCRIPTION_INCOMPLETE','serverAt',v_now);
    end if;
    insert into public.sessions(id,client_id,title,execution_type,prescription,status,revision,published_at,created_by)
    values(v_entity_id,v_client_id,left(v_next_body->>'title',120),v_next_body->>'deliveryModality',
      v_next_body,'publicado',v_next_revision,v_now,auth.uid())
    on conflict(id) do nothing;
    if not exists(select 1 from public.sessions where id=v_entity_id and client_id=v_client_id) then
      raise exception 'M37_LEGACY_ID_SCOPE_CONFLICT' using errcode='23505';
    end if;
  end if;
  perform public.iberfit_persist_entity_v26(v_entity_type,v_entity_id,v_client_id,v_to_status,v_next_revision,v_next_body);

  -- One atomic coach operation means no visible "published but cannot start".
  -- Preserve the canonical published->available transition and its audit event.
  if v_command_type='SESION_PUBLICAR' and v_to_status='publicada'
     and v_next_body->>'deliveryModality'='guiada_en_app'
     and v_next_body->>'deliveryOwnership'='guided_in_app'
     and v_next_body->>'clientVisibilityLevel'='full'
     and v_next_body->>'visibleToClient'='true' then
    if not exists(select 1 from public.domain_transitions_v26
      where entity_type='session' and from_status='publicada' and event_name='HABILITAR' and to_status='disponible')
      or not exists(select 1 from public.domain_command_registry_v26
        where command_type='SESION_HABILITAR' and enabled and v_role=any(allowed_roles)) then
      raise exception 'M37_GUIDED_ENABLE_NOT_AUTHORIZED' using errcode='23514';
    end if;
    v_next_revision:=v_next_revision+1;
    v_next_body:=v_next_body||jsonb_build_object(
      'status','disponible','revision',v_next_revision,'enabledAt',v_now,
      'enabledBy',auth.uid(),'autoEnabledAfterPublish',true);
    perform public.iberfit_persist_entity_v26('session',v_entity_id,v_client_id,'disponible',v_next_revision,v_next_body);
    insert into public.domain_events_v26(operation_id,command_type,entity_type,entity_id,client_id,actor_user_id,actor_role,phase,from_status,to_status,base_revision,remote_revision,details)
    values(v_operation_id,'SESION_HABILITAR','session',v_entity_id,v_client_id,auth.uid(),v_role,
      'related_applied','publicada','disponible',v_next_revision-1,v_next_revision,
      jsonb_build_object('atomicWith','SESION_PUBLICAR'));
    v_to_status:='disponible';
  end if;

  insert into public.command_events_v26$new$;
  IF position(old_piece in edited)=0 THEN RAISE EXCEPTION 'M37_PUBLISH_ANCHOR_DRIFT'; END IF;
  edited:=replace(edited,old_piece,new_piece);
  EXECUTE edited;
END
$m37$;
