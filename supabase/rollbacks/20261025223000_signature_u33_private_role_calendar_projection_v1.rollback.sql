-- Safe rollback: this staging-only read function has no data side effects.
DROP FUNCTION IF EXISTS private.iberfit_u33_occurrence_calendar_v1(uuid,date,date,date,uuid,integer);
