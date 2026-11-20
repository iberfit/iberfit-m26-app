-- IBERFIT P0 · Restore original client-create gateway only.
-- Any client already created remains intact, as do Coach assignments, service
-- events, access state and IRI records; no DELETE/REVOKE/role changes.
DO $guard$
BEGIN
  IF md5(pg_get_functiondef(to_regprocedure('public.iberfit_create_client_draft_v12(jsonb)')))
    IS DISTINCT FROM 'c9590e8089d04f7129a21e2c17e714da'
  THEN RAISE EXCEPTION 'M26_ONBOARDING_TRAINING_ROLLBACK_SOURCE_DRIFT'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.iberfit_create_client_draft_v12(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  return public.iberfit_create_client_draft_v12_pre_v65e(p_payload);
end
$function$;

DO $check$
BEGIN
  IF md5(pg_get_functiondef(to_regprocedure('public.iberfit_create_client_draft_v12(jsonb)')))
    IS DISTINCT FROM '906a923478573671ddc5532af9172356'
    OR has_function_privilege('anon','public.iberfit_create_client_draft_v12(jsonb)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.iberfit_create_client_draft_v12(jsonb)','EXECUTE')
  THEN RAISE EXCEPTION 'M26_ONBOARDING_TRAINING_ROLLBACK_NOT_VERIFIED'; END IF;
END $check$;
