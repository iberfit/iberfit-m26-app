create or replace function public.iberfit_auth_assurance_context_v65c()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_context jsonb;
  v_roles jsonb;
  v_aal text;
  v_privileged_role text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_context:=public.iberfit_application_context_v14();
  v_roles:=coalesce(v_context->'roles','[]'::jsonb);
  v_aal:=case coalesce(auth.jwt()->>'aal','aal1') when 'aal2' then 'aal2' else 'aal1' end;
  v_privileged_role:=case when v_roles ? 'admin' then 'admin' when v_roles ? 'coach' then 'coach' else null end;

  return jsonb_build_object(
    'ok',true,
    'privileged',v_privileged_role is not null,
    'privilegedRole',v_privileged_role,
    'mfaRequired',v_privileged_role is not null,
    'aal',v_aal
  );
end
$function$;

revoke all on function public.iberfit_auth_assurance_context_v65c() from public;
revoke all on function public.iberfit_auth_assurance_context_v65c() from anon;
grant execute on function public.iberfit_auth_assurance_context_v65c() to authenticated;

comment on function public.iberfit_auth_assurance_context_v65c() is
'RC65-C1 minimal auth assurance projection. Returns no client IDs or profile payloads; used before full bootstrap to route privileged users through MFA.';
