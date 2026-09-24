begin;

create or replace function public.iberfit_bootstrap_v26()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_payload jsonb;
  v_email text;
  v_membership_status text;
begin
  v_payload:=public.iberfit_bootstrap_v26_pre_v65e();

  select u.email
  into v_email
  from auth.users u
  where u.id=auth.uid();

  select m.status
  into v_membership_status
  from public.iberfit_organization_memberships m
  where m.organization_id='00000000-0000-4000-8000-000000000140'::uuid
    and m.user_id=auth.uid();

  v_payload:=jsonb_set(v_payload,'{user,email}',to_jsonb(coalesce(v_email,'')),true);
  v_payload:=jsonb_set(v_payload,'{user,status}',to_jsonb(coalesce(v_membership_status,'')),true);
  return v_payload;
end
$function$;

alter function public.iberfit_bootstrap_v26() owner to postgres;
revoke all on function public.iberfit_bootstrap_v26() from public;
revoke all on function public.iberfit_bootstrap_v26() from anon;
grant execute on function public.iberfit_bootstrap_v26() to authenticated;
grant execute on function public.iberfit_bootstrap_v26() to service_role;

comment on function public.iberfit_bootstrap_v26() is
'IBERFIT authenticated bootstrap; exposes only the current user own email and canonical membership status for Coach operational readiness.';

commit;
