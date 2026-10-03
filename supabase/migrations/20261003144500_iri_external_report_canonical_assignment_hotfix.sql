-- IRI external report authorization hotfix
-- Keep legacy assignment compatibility while accepting the canonical Coach↔person assignment model
-- used by lifecycle iri_only and current IBERFIT operations.

create or replace function public.iberfit_can_manage_iri_external_report_v12(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when auth.uid() is null or p_client_id is null then false
    when exists (
      select 1
      from public.user_profiles u
      where u.user_id=auth.uid()
        and lower(u.role::text)='admin'
    ) then true
    when exists (
      select 1
      from public.user_profiles u
      where u.user_id=auth.uid()
        and lower(u.role::text)='coach'
    ) and (
      public.is_assigned_coach(p_client_id)
      or exists (
        select 1
        from public.iberfit_coach_client_assignments a
        where a.coach_user_id=auth.uid()
          and a.client_id=p_client_id::text
          and a.status='active'
          and a.starts_at<=current_date
          and (a.ends_at is null or a.ends_at>=current_date)
      )
    ) then true
    else false
  end;
$function$;

comment on function public.iberfit_can_manage_iri_external_report_v12(uuid)
is 'Authorizes IRI external report management for Admin or the actively assigned Coach using legacy or canonical assignment records.';
