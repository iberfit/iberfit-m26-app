-- IBERFIT IRI photogrammetry · explicit anon EXECUTE hardening
-- QA certification showed project default ACLs grant anon EXECUTE directly on new public functions.
-- Keep browser access authenticated-only even when PUBLIC has already been revoked.

revoke all on function public.iberfit_require_physical_consent_before_iri_confirm_v1() from anon;
revoke all on function public.iberfit_can_manage_iri_private_v1(uuid) from anon;
revoke all on function public.iberfit_iri_consent_active_v1(uuid,text) from anon;
revoke all on function public.iberfit_record_iri_consent_v1(uuid,uuid,text,text,text,text) from anon;
revoke all on function public.iberfit_prepare_iri_photo_v1(uuid,uuid,uuid,text,text,text,bigint,text,integer,integer,text,timestamptz,text) from anon;
revoke all on function public.iberfit_finalize_iri_photo_v1(uuid,uuid,uuid) from anon;
revoke all on function public.iberfit_save_iri_photogrammetry_analysis_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,jsonb,jsonb,boolean) from anon;
revoke all on function public.iberfit_photo_point_valid_v1(jsonb) from anon;
revoke all on function public.iberfit_photo_landmarks_complete_v1(jsonb) from anon;
revoke all on function public.iberfit_photo_measurements_valid_v1(jsonb) from anon;
revoke all on function public.iberfit_photo_path_uuid_part_v1(text,integer) from anon;
revoke all on function public.iberfit_photo_path_view_v1(text) from anon;
revoke all on function public.iberfit_photo_path_is_canonical_v1(text) from anon;
