-- U36 wrapper does not write independently, and may be removed without
-- touching protected receipts, occurrences or canonical appointments.
DROP FUNCTION IF EXISTS public.iberfit_occurrence_api_v1(text,jsonb);
