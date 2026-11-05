-- U67 QA-only emergency privilege rollback. No data or schema removal.
REVOKE EXECUTE ON FUNCTION public.iberfit_occurrence_api_u60_v1(text,jsonb)
  FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.iberfit_occurrence_detail_v1(uuid,uuid)
  FROM authenticated;
NOTIFY pgrst, 'reload schema';
