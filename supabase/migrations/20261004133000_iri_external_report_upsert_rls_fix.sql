-- Allow the private IRI bioimpedance upsert preflight without broadening normal reads.
-- Supabase Storage requires SELECT + INSERT + UPDATE for upsert. The original
-- SELECT policy required the public registry row to exist, which made the first
-- upload impossible because registration happens only after the object reaches Storage.
--
-- This keeps ordinary reads registry-gated and grants SELECT only while Storage
-- is executing object.upload, for the exact canonical path of an existing IRI
-- and only to an authorized Admin/Coach.

alter policy iri_external_object_read_v12
on storage.objects
using (
  bucket_id = 'iberfit-iri-external-reports'
  and name = (
    public.iberfit_external_report_path_client_v12(name)::text
    || '/'
    || public.iberfit_external_report_path_assessment_v12(name)::text
    || '/bioimpedancia'
  )
  and (
    (
      storage.allow_only_operation('object.upload')
      and public.iberfit_can_manage_iri_external_report_v12(
        public.iberfit_external_report_path_client_v12(name)
      )
      and exists (
        select 1
        from public.iri_assessments i
        where i.id = public.iberfit_external_report_path_assessment_v12(storage.objects.name)
          and i.client_id = public.iberfit_external_report_path_client_v12(storage.objects.name)
          and i.assessment_type = 'inicial'
      )
    )
    or (
      public.iberfit_can_read_iri_external_report_v12(
        public.iberfit_external_report_path_client_v12(name)
      )
      and exists (
        select 1
        from public.iri_external_reports_v26 r
        where r.client_id = public.iberfit_external_report_path_client_v12(storage.objects.name)
          and r.assessment_id = public.iberfit_external_report_path_assessment_v12(storage.objects.name)
          and r.object_path = storage.objects.name
          and (
            r.visible_to_client
            or public.iberfit_can_manage_iri_external_report_v12(r.client_id)
          )
      )
    )
  )
);

comment on policy iri_external_object_read_v12 on storage.objects
is 'Private IRI external-report read policy. Normal reads require a registered report; object.upload additionally permits the Storage upsert preflight for an existing initial IRI and an authorized manager.';
