-- Roll back only the certified M45 communication direct-scope patch.
SELECT 1 / (CASE WHEN
  md5(pg_get_functiondef(
    'public.iberfit_communication_execute_v14_pre_v65e(text,jsonb)'::regprocedure
  ))='d9ef7c578fa958886a0e937d93e9a013'
THEN 1 ELSE 0 END) AS m45_communication_rollback_guard;

CREATE OR REPLACE FUNCTION public.iberfit_communication_execute_v14_pre_v65e(p_application text, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_context jsonb;v_org uuid;v_user uuid:=auth.uid();v_app text:=lower(btrim(p_application));v_snapshot jsonb;v_client text;v_op text:=btrim(p_command->>'operationId');v_type text:=upper(btrim(p_command->>'type'));v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);v_existing jsonb;v_result jsonb;v_thread public.iberfit_conversation_threads;v_id uuid;v_body text;
begin
  select public.iberfit_application_context_v14()into v_context;if not coalesce(v_context->'roles','[]'::jsonb)?v_app or v_app not in('client','coach')then raise exception using errcode='42501',message='V14_COMMUNICATION_ROLE_FORBIDDEN';end if;v_org:=(v_context->>'organizationId')::uuid;select result into v_existing from public.iberfit_communication_receipts where operation_id=v_op and actor_user_id=v_user and command_type=v_type;if v_existing is not null then return v_existing||jsonb_build_object('kind','duplicate');end if;select public.iberfit_bootstrap_v26()into v_snapshot;v_client:=coalesce(v_snapshot#>>'{user,clientId}',v_snapshot#>>'{user,client_id}','');
  if v_type='MESSAGE_THREAD_OPEN' then if v_app<>'coach' then raise exception using errcode='42501',message='V14_THREAD_OPEN_FORBIDDEN';end if;if coalesce((v_context->>'assignmentScopeEnforced')::boolean,false)and not coalesce(v_context->'assignedClientIds','[]'::jsonb)?btrim(v_payload->>'clientId')then raise exception using errcode='42501',message='V14_CLIENT_NOT_ASSIGNED';end if;insert into public.iberfit_conversation_threads(organization_id,client_id,coach_user_id,subject,created_by)values(v_org,btrim(v_payload->>'clientId'),v_user,left(coalesce(nullif(btrim(v_payload->>'subject'),''),'Seguimiento IBERFIT'),160),v_user)on conflict(organization_id,coach_user_id,client_id)do update set status='active',subject=excluded.subject,revision=public.iberfit_conversation_threads.revision+1,updated_at=now()returning * into v_thread;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'revision',v_thread.revision,'serverTime',now());
  elsif v_type='MESSAGE_SEND' then select * into v_thread from public.iberfit_conversation_threads where id=(v_payload->>'threadId')::uuid and organization_id=v_org and status='active'and((v_app='coach'and coach_user_id=v_user)or(v_app='client'and client_id=v_client))for update;if not found then raise exception using errcode='42501',message='V14_THREAD_NOT_VISIBLE';end if;v_body:=btrim(v_payload->>'body');if char_length(v_body)not between 1 and 4000 then raise exception using errcode='22023',message='V14_MESSAGE_BODY_INVALID';end if;insert into public.iberfit_messages(organization_id,thread_id,sender_user_id,sender_role,body,read_by_client_at,read_by_coach_at)values(v_org,v_thread.id,v_user,v_app,v_body,case when v_app='client'then now()end,case when v_app='coach'then now()end)returning id into v_id;update public.iberfit_conversation_threads set updated_at=now(),revision=revision+1 where id=v_thread.id returning * into v_thread;if v_app='coach'then insert into public.iberfit_in_app_notifications(organization_id,recipient_client_id,title,body,action_area,action_entity_id)values(v_org,v_thread.client_id,'Nuevo mensaje de tu Coach',left(v_body,300),'mensajes',v_thread.id::text);else insert into public.iberfit_in_app_notifications(organization_id,recipient_user_id,title,body,action_area,action_entity_id)values(v_org,v_thread.coach_user_id,'Nuevo mensaje de un cliente',left(v_body,300),'mensajes',v_thread.id::text);end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'messageId',v_id,'revision',v_thread.revision,'serverTime',now());
  elsif v_type='MESSAGE_MARK_READ' then select * into v_thread from public.iberfit_conversation_threads where id=(v_payload->>'threadId')::uuid and organization_id=v_org and((v_app='coach'and coach_user_id=v_user)or(v_app='client'and client_id=v_client));if not found then raise exception using errcode='42501',message='V14_THREAD_NOT_VISIBLE';end if;if v_app='coach'then update public.iberfit_messages set read_by_coach_at=coalesce(read_by_coach_at,now()),revision=revision+1 where thread_id=v_thread.id and sender_role<>'coach';else update public.iberfit_messages set read_by_client_at=coalesce(read_by_client_at,now()),revision=revision+1 where thread_id=v_thread.id and sender_role<>'client';end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'threadId',v_thread.id,'serverTime',now());
  elsif v_type='NOTIFICATION_MARK_READ' then if v_app='coach'then update public.iberfit_in_app_notifications set status='read',read_at=now(),revision=revision+1 where id=(v_payload->>'notificationId')::uuid and recipient_user_id=v_user;else update public.iberfit_in_app_notifications set status='read',read_at=now(),revision=revision+1 where id=(v_payload->>'notificationId')::uuid and recipient_client_id=v_client;end if;if not found then raise exception using errcode='P0002',message='V14_NOTIFICATION_NOT_FOUND';end if;v_result:=jsonb_build_object('ok',true,'kind','ack','operationId',v_op,'serverTime',now());
  else raise exception using errcode='22023',message='V14_COMMUNICATION_COMMAND_INVALID';end if;
  insert into public.iberfit_communication_receipts(operation_id,organization_id,actor_user_id,command_type,result)values(v_op,v_org,v_user,v_type,v_result);return v_result;
end $function$
;

REVOKE ALL ON FUNCTION public.iberfit_communication_execute_v14_pre_v65e(text,jsonb)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.iberfit_communication_execute_v14_pre_v65e(text,jsonb)
TO service_role;

SELECT 1 / (CASE WHEN
  md5(pg_get_functiondef(
    'public.iberfit_communication_execute_v14_pre_v65e(text,jsonb)'::regprocedure
  ))='6707a3dad0ea2694bed9276fe4055ed0'
THEN 1 ELSE 0 END) AS m45_communication_rollback_hash_invalid;
