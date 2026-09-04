-- IBERFIT RC74.6 · Idempotencia real en la membrana ADMIN para eliminación de cliente
-- El comando destructivo se enruta primero al helper, que valida scope y receipt.
-- Esto permite que un reintento con el mismo operationId devuelva el mismo resultado
-- incluso después de que el cliente ya haya sido eliminado.

create or replace function public.iberfit_admin_execute_v14(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context jsonb;
  v_org uuid;
  v_type text:=upper(btrim(coalesce(p_command->>'type','')));
  v_payload jsonb:=coalesce(p_command->'payload','{}'::jsonb);
  v_target_user uuid;
  v_role text;
  v_client text;
  v_coach uuid;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  v_context:=public.iberfit_application_context_v14();
  if not coalesce(v_context->'roles','[]'::jsonb)?'admin' then
    raise exception 'V65E_ADMIN_REQUIRED' using errcode='42501';
  end if;
  v_org:=nullif(v_context->>'organizationId','')::uuid;
  if v_org is null then
    raise exception 'V65E_ORGANIZATION_REQUIRED' using errcode='42501';
  end if;

  if v_type in ('ADMIN_ROL_OTORGAR','ADMIN_ROL_REVOCAR') then
    begin
      v_target_user:=(v_payload->>'userId')::uuid;
    exception when others then
      raise exception 'V65E_TARGET_USER_INVALID' using errcode='22023';
    end;
    v_role:=lower(btrim(coalesce(v_payload->>'role','')));
    if v_role not in ('client','coach','admin') then
      raise exception 'V65E_ROLE_INVALID' using errcode='22023';
    end if;
    perform public.iberfit_assert_org_user_scope_v65e(
      v_org,
      v_target_user,
      v_type='ADMIN_ROL_OTORGAR',
      null
    );
    perform public.iberfit_assert_global_role_mutation_scope_v65e(v_org,v_target_user);
  elsif v_type='ADMIN_ASIGNACION_CREAR' then
    begin
      v_coach:=(v_payload->>'coachUserId')::uuid;
    exception when others then
      raise exception 'V65E_COACH_USER_INVALID' using errcode='22023';
    end;
    perform public.iberfit_assert_org_user_scope_v65e(v_org,v_coach,true,'coach');
    v_client:=btrim(coalesce(v_payload->>'clientId',''));
    perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);
  elsif v_type='ADMIN_CLIENTE_ELIMINAR' then
    -- El helper verifica receipt/idempotencia antes de consultar la existencia del cliente
    -- y vuelve a aplicar la validación de scope cuando es una operación nueva.
    return public.iberfit_admin_delete_client_v26(p_command,v_context);
  elsif v_type='ADMIN_CLIENTE_CAMBIAR_CICLO' then
    v_client:=btrim(coalesce(v_payload->>'clientId',''));
    perform public.iberfit_assert_client_org_scope_v65e(v_org,v_client);
  end if;

  return public.iberfit_admin_execute_v14_pre_v65e(p_command);
end
$function$;
