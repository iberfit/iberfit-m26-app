-- IBERFIT M1 U72 · rollback wrapper must be materialized from canonical install wrapper.
-- M1_U72_PROD_ROLLBACK_WRAPPER_REQUIRED · source-only; not executable.
DO $u72_materialization_required$ BEGIN RAISE EXCEPTION 'M1_U72_MATERIALIZATION_REQUIRED'; END $u72_materialization_required$;
