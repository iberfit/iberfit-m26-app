-- M44 PDF artifact ledger: append-only evidence; withdrawal changes only status
-- and its audit metadata. No UPDATE may replace a signed source or hash.
CREATE OR REPLACE FUNCTION public.iberfit_m44_issued_pdf_immutability_guard_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path=''
AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'M44_PDF_ISSUED_LEDGER_DELETE_FORBIDDEN' USING errcode='42501';
 END IF;
 IF TG_OP<>'UPDATE' OR OLD.status<>'issued' OR NEW.status<>'withdrawn'
    OR NEW.withdrawn_at IS NULL OR NEW.withdrawn_by IS NULL
    OR length(btrim(coalesce(NEW.withdrawn_reason,''))) NOT BETWEEN 3 AND 500
 THEN
   RAISE EXCEPTION 'M44_PDF_ISSUED_LEDGER_UPDATE_FORBIDDEN' USING errcode='42501';
 END IF;
 IF (to_jsonb(NEW)-'status'-'withdrawn_at'-'withdrawn_by'-'withdrawn_reason')
    IS DISTINCT FROM
    (to_jsonb(OLD)-'status'-'withdrawn_at'-'withdrawn_by'-'withdrawn_reason')
 THEN
   RAISE EXCEPTION 'M44_PDF_ISSUED_LEDGER_ARTIFACT_MUTATION_FORBIDDEN' USING errcode='42501';
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.iberfit_m44_issued_pdf_immutability_guard_v1() FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE TRIGGER trg_m44_issued_pdf_immutable
BEFORE UPDATE OR DELETE ON public.iberfit_evolution_report_issuances_v1
FOR EACH ROW EXECUTE FUNCTION public.iberfit_m44_issued_pdf_immutability_guard_v1();
