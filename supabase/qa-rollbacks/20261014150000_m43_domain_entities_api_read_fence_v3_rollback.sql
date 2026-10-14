-- Restore exactly the previous QA table-level grants; training rows are untouched.
BEGIN;
GRANT SELECT ON TABLE public.domain_entities_v26 TO anon, authenticated;
COMMIT;
