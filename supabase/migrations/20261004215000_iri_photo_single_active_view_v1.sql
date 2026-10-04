-- IBERFIT · one active photogrammetry original per assessment/view v1
-- Historical originals remain immutable in Storage; replacement only revokes the previous active metadata row.
begin;

-- Fail closed if historical duplicates exist. Existing production anomalies are repaired explicitly
-- with auditable operational SQL before applying this migration; schema migration itself never rewrites user rows.

create unique index if not exists iri_photo_one_active_view_v1
  on public.iri_photogrammetry_captures_v1(assessment_id,view)
  where status='active';

create or replace function public.iberfit_finalize_iri_photo_v1(
  p_capture_id uuid,
  p_client_id uuid,
  p_assessment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_view text;
  v_row public.iri_photogrammetry_captures_v1%rowtype;
begin
  if v_actor is null then raise exception 'IRI_V4_AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.iberfit_can_manage_iri_private_v1(p_client_id) then
    raise exception 'IRI_V4_COACH_OR_ADMIN_REQUIRED' using errcode='42501';
  end if;

  select c.view into v_view
  from public.iri_photogrammetry_captures_v1 c
  where c.id=p_capture_id
    and c.client_id=p_client_id
    and c.assessment_id=p_assessment_id;

  if v_view is null then
    raise exception 'IRI_V4_PHOTO_PREPARE_REQUIRED' using errcode='P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_assessment_id::text||':'||v_view,0)
  );

  select * into v_row
  from public.iri_photogrammetry_captures_v1 c
  where c.id=p_capture_id
    and c.client_id=p_client_id
    and c.assessment_id=p_assessment_id
  for update;

  if v_row.id is null then
    raise exception 'IRI_V4_PHOTO_PREPARE_REQUIRED' using errcode='P0001';
  end if;

  if v_row.status='active' then
    update public.iri_photogrammetry_captures_v1 c
    set status='revoked',
        revoked_at=coalesce(c.revoked_at,clock_timestamp())
    where c.assessment_id=p_assessment_id
      and c.view=v_row.view
      and c.id<>v_row.id
      and c.status='active';

    return jsonb_build_object(
      'ok',true,'kind','duplicate','id',v_row.id,'status',v_row.status,
      'objectPath',v_row.object_path,'sha256',v_row.sha256
    );
  end if;

  if v_row.status<>'pending_upload' then
    raise exception 'IRI_V4_PHOTO_FINALIZE_STATE_INVALID' using errcode='22023';
  end if;
  if not public.iberfit_iri_consent_active_v1(p_assessment_id,'photography') then
    raise exception 'IRI_V4_PHOTOGRAPHY_CONSENT_REQUIRED' using errcode='42501';
  end if;
  if not exists(
    select 1 from storage.objects o
    where o.bucket_id='iberfit-iri-photogrammetry'
      and o.name=v_row.object_path
  ) then
    raise exception 'IRI_V4_PHOTO_OBJECT_NOT_FOUND' using errcode='P0001';
  end if;

  update public.iri_photogrammetry_captures_v1 c
  set status='revoked',
      revoked_at=coalesce(c.revoked_at,clock_timestamp())
  where c.assessment_id=p_assessment_id
    and c.view=v_row.view
    and c.id<>v_row.id
    and c.status='active';

  update public.iri_photogrammetry_captures_v1
  set status='active',
      revoked_at=null
  where id=v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,'kind','ack','id',v_row.id,'clientId',v_row.client_id,
    'assessmentId',v_row.assessment_id,'view',v_row.view,'status',v_row.status,
    'objectPath',v_row.object_path,'sha256',v_row.sha256,'capturedAt',v_row.captured_at
  );
end
$function$;

revoke all on function public.iberfit_finalize_iri_photo_v1(uuid,uuid,uuid)
from public,anon;
grant execute on function public.iberfit_finalize_iri_photo_v1(uuid,uuid,uuid)
to authenticated,service_role;

comment on index public.iri_photo_one_active_view_v1
is 'IBERFIT invariant: an IRI assessment can expose only one active immutable original per photographic view. Replaced originals remain retained as revoked history.';

commit;
