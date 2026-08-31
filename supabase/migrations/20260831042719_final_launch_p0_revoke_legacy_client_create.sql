-- IBERFIT FINAL LAUNCH P0
-- Close only the externally callable legacy client-create path.
-- The canonical v12 wrapper remains the public entrypoint and enforces
-- iberfit_require_privileged_assurance_v65d() for privileged roles.
-- This migration changes function EXECUTE privileges only.

do $$
begin
  if to_regprocedure('public.iberfit_create_client_draft(jsonb)') is null then
    raise exception 'FINAL_P0_LEGACY_CREATE_FUNCTION_MISSING';
  end if;

  if to_regprocedure('public.iberfit_create_client_draft_v12(jsonb)') is null then
    raise exception 'FINAL_P0_CANONICAL_V12_WRAPPER_MISSING';
  end if;

  if to_regprocedure('public.iberfit_create_client_draft_v12_pre_v65e(jsonb)') is null then
    raise exception 'FINAL_P0_INTERNAL_V12_IMPLEMENTATION_MISSING';
  end if;
end
$$;

revoke execute
on function public.iberfit_create_client_draft(jsonb)
from public, anon, authenticated;

comment on function public.iberfit_create_client_draft(jsonb)
is 'IBERFIT legacy internal client-create implementation. External EXECUTE revoked at final-launch P0; use iberfit_create_client_draft_v12(jsonb).';
