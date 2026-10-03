-- IBERFIT M26 · IRI Photogrammetry & Decision Engine v2
-- Strictly additive: v1 captures/analyses/consents remain untouched and readable.
begin;

-- Explicit, independent permission to place private IRI photographs in a client-facing report.
-- IBERFIT-POLICY: public.iri_photo_report_permissions_v1 = service-role-only
create table if not exists public.iri_photo_report_permissions_v1 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  assessment_id uuid not null references public.iri_assessments(id) on delete cascade,
  status text not null check (status in ('granted','declined','revoked')),
  document_version text not null check (document_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default clock_timestamp(),
  note text,
  constraint iri_photo_report_permission_note_v1 check (note is null or char_length(note) <= 600)
);

alter table public.iri_photo_report_permissions_v1 enable row level security;

create index if not exists iri_photo_report_permission_assessment_time_v1
  on public.iri_photo_report_permissions_v1(assessment_id,recorded_at desc);

create index if not exists iri_photo_report_permission_client_v1
  on public.iri_photo_report_permissions_v1(client_id);

create policy iri_photo_report_permission_read_manage_v1
on public.iri_photo_report_permissions_v1
for select to authenticated
using (public.iberfit_can_manage_iri_private_v1(client_id));

revoke all on public.iri_photo_report_permissions_v1 from public,anon,authenticated;
grant select on public.iri_photo_report_permissions_v1 to authenticated;
grant all on public.iri_photo_report_permissions_v1 to service_role;

-- v2 is immutable by revision: saves append; old v1 analysis rows are never rewritten.
-- IBERFIT-POLICY: public.iri_photogrammetry_analyses_v2 = service-role-only
create table if not exists public.iri_photogrammetry_analyses_v2 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  assessment_id uuid not null references public.iri_assessments(id) on delete cascade,
  revision bigint not null check (revision > 0),
  front_capture_id uuid references public.iri_photogrammetry_captures_v1(id) on delete restrict,
  back_capture_id uuid references public.iri_photogrammetry_captures_v1(id) on delete restrict,
  left_capture_id uuid references public.iri_photogrammetry_captures_v1(id) on delete restrict,
  right_capture_id uuid references public.iri_photogrammetry_captures_v1(id) on delete restrict,
  protocol_version text not null default 'iri-photogrammetry-2026.10-v2',
  landmark_schema_version text not null default 'manual-calibrated-4-point-v2',
  validated_landmarks jsonb not null default '{}'::jsonb,
  calibration jsonb not null default '{}'::jsonb,
  measurements jsonb not null default '{}'::jsonb,
  decision_support jsonb not null default '{}'::jsonb,
  status text not null check (status in ('draft','validated')),
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  unique (assessment_id,revision),
  constraint iri_photo_analysis_v2_validation check (
    (status='draft' and validated_at is null) or
    (status='validated' and validated_at is not null)
  ),
  constraint iri_photo_analysis_v2_json check (
    public.m26_json_safe_v43(validated_landmarks)
    and public.m26_json_safe_v43(calibration)
    and public.m26_json_safe_v43(measurements)
    and public.m26_json_safe_v43(decision_support)
  )
);

alter table public.iri_photogrammetry_analyses_v2 enable row level security;

create index if not exists iri_photo_analysis_v2_assessment_revision_idx
  on public.iri_photogrammetry_analyses_v2(assessment_id,revision desc);

create index if not exists iri_photo_analysis_v2_client_idx
  on public.iri_photogrammetry_analyses_v2(client_id);

create policy iri_photo_analysis_v2_read_manage
on public.iri_photogrammetry_analyses_v2
for select to authenticated
using (public.iberfit_can_manage_iri_private_v1(client_id));

revoke all on public.iri_photogrammetry_analyses_v2 from public,anon,authenticated;
grant select on public.iri_photogrammetry_analyses_v2 to authenticated;
grant all on public.iri_photogrammetry_analyses_v2 to service_role;

create or replace function public.iberfit_photo_point_valid_v2(p_point jsonb)
returns boolean
language plpgsql
immutable
set search_path=''
as $function$
declare
  v_x numeric;
  v_y numeric;
begin
  if jsonb_typeof(p_point)<>'object'
     or jsonb_typeof(p_point->'x')<>'number'
     or jsonb_typeof(p_point->'y')<>'number' then
    return false;
  end if;
  v_x:=(p_point->>'x')::numeric;
  v_y:=(p_point->>'y')::numeric;
  return v_x between 0 and 1 and v_y between 0 and 1;
exception when others then
  return false;
end
$function$;

create or replace function public.iberfit_photo_landmarks_complete_v2(p_landmarks jsonb)
returns boolean
language sql
immutable
set search_path=''
as $function$
  select jsonb_typeof(p_landmarks)='object'
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{front,shoulderLeft}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{front,shoulderRight}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{front,pelvisLeft}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{front,pelvisRight}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{back,shoulderLeft}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{back,shoulderRight}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{back,pelvisLeft}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{back,pelvisRight}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{left,ear}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{left,shoulder}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{left,hip}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{left,ankle}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{right,ear}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{right,shoulder}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{right,hip}')
    and public.iberfit_photo_point_valid_v2(p_landmarks#>'{right,ankle}');
$function$;

create or replace function public.iberfit_photo_calibration_entry_valid_v2(p_entry jsonb)
returns boolean
language plpgsql
immutable
set search_path=''
as $function$
declare
  v_cm numeric;
  v_ax numeric;
  v_ay numeric;
  v_bx numeric;
  v_by numeric;
begin
  if jsonb_typeof(p_entry)<>'object'
     or jsonb_typeof(p_entry->'knownLengthCm')<>'number'
     or not public.iberfit_photo_point_valid_v2(p_entry->'pointA')
     or not public.iberfit_photo_point_valid_v2(p_entry->'pointB') then
    return false;
  end if;
  v_cm:=(p_entry->>'knownLengthCm')::numeric;
  v_ax:=(p_entry#>>'{pointA,x}')::numeric;
  v_ay:=(p_entry#>>'{pointA,y}')::numeric;
  v_bx:=(p_entry#>>'{pointB,x}')::numeric;
  v_by:=(p_entry#>>'{pointB,y}')::numeric;
  return v_cm between 1 and 300
    and (v_ax<>v_bx or v_ay<>v_by);
exception when others then
  return false;
end
$function$;

create or replace function public.iberfit_photo_calibration_valid_v2(p_calibration jsonb)
returns boolean
language plpgsql
immutable
set search_path=''
as $function$
declare
  v_key text;
  v_value jsonb;
begin
  if jsonb_typeof(p_calibration)<>'object' then return false; end if;
  for v_key,v_value in select key,value from jsonb_each(p_calibration)
  loop
    if v_key not in ('front','back','left','right')
       or not public.iberfit_photo_calibration_entry_valid_v2(v_value) then
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end
$function$;

create or replace function public.iberfit_photo_measurements_valid_v2(p_measurements jsonb)
returns boolean
language sql
immutable
set search_path=''
as $function$
  select jsonb_typeof(p_measurements)='object'
    and p_measurements->>'schema'='iri-photogrammetry-measurements-v2'
    and jsonb_typeof(p_measurements->'metrics')='array'
    and jsonb_typeof(p_measurements->'summaries')='object'
    and jsonb_typeof(p_measurements->'geometryBasis')='object'
    and jsonb_typeof(p_measurements->'calibration')='object'
    and (
      not (p_measurements ? 'medicalDiagnosis')
      or p_measurements->'medicalDiagnosis'='null'::jsonb
    );
$function$;

create or replace function public.iberfit_photo_decision_support_valid_v2(p_support jsonb)
returns boolean
language sql
immutable
set search_path=''
as $function$
  select jsonb_typeof(p_support)='object'
    and (
      p_support='{}'::jsonb
      or (
        p_support->>'schema'='iri-photogrammetry-decision-support-v2'
        and jsonb_typeof(p_support->'findings')='array'
        and jsonb_typeof(p_support->'trainingConsiderations')='array'
        and jsonb_typeof(p_support->'limitations')='array'
        and (
          not (p_support ? 'medicalDiagnosis')
          or p_support->'medicalDiagnosis'='null'::jsonb
        )
      )
    );
$function$;

create or replace function public.iberfit_iri_photo_report_permission_active_v1(p_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select coalesce((
    select p.status='granted'
      and public.iberfit_can_manage_iri_private_v1(p.client_id)
    from public.iri_photo_report_permissions_v1 p
    where p.assessment_id=p_assessment_id
    order by p.recorded_at desc,p.id desc
    limit 1
  ),false);
$function$;

create or replace function public.iberfit_record_iri_photo_report_permission_v1(
  p_client_id uuid,
  p_assessment_id uuid,
  p_status text,
  p_document_version text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_row public.iri_photo_report_permissions_v1%rowtype;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_actor is null then raise exception 'IRI_V2_AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.iberfit_can_manage_iri_private_v1(p_client_id) then
    raise exception 'IRI_V2_COACH_OR_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_status not in ('granted','declined','revoked')
     or coalesce(p_document_version,'') !~ '^[A-Za-z0-9._-]{1,40}$'
     or char_length(coalesce(p_note,''))>600 then
    raise exception 'IRI_V2_REPORT_PERMISSION_INVALID' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.iri_assessments i
    where i.id=p_assessment_id and i.client_id=p_client_id and i.assessment_type='inicial'
  ) then
    raise exception 'IRI_V2_INITIAL_ASSESSMENT_REQUIRED' using errcode='22023';
  end if;
  insert into public.iri_photo_report_permissions_v1(
    client_id,assessment_id,status,document_version,recorded_by,note
  ) values(
    p_client_id,p_assessment_id,p_status,p_document_version,v_actor,
    nullif(btrim(coalesce(p_note,'')),'')
  ) returning * into v_row;
  return jsonb_build_object(
    'ok',true,'id',v_row.id,'clientId',v_row.client_id,'assessmentId',v_row.assessment_id,
    'status',v_row.status,'documentVersion',v_row.document_version,'recordedAt',v_row.recorded_at
  );
end
$function$;

create or replace function public.iberfit_save_iri_photogrammetry_analysis_v2(
  p_client_id uuid,
  p_assessment_id uuid,
  p_base_revision bigint,
  p_front_capture_id uuid,
  p_back_capture_id uuid,
  p_left_capture_id uuid,
  p_right_capture_id uuid,
  p_validated_landmarks jsonb,
  p_calibration jsonb,
  p_measurements jsonb,
  p_decision_support jsonb,
  p_validate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_latest_revision bigint;
  v_next_revision bigint;
  v_row public.iri_photogrammetry_analyses_v2%rowtype;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_actor is null then raise exception 'IRI_V2_AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.iberfit_can_manage_iri_private_v1(p_client_id) then
    raise exception 'IRI_V2_COACH_OR_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_base_revision is null or p_base_revision<0
     or jsonb_typeof(coalesce(p_validated_landmarks,'{}'::jsonb))<>'object'
     or not public.iberfit_photo_calibration_valid_v2(coalesce(p_calibration,'{}'::jsonb))
     or not public.iberfit_photo_measurements_valid_v2(coalesce(p_measurements,'{}'::jsonb))
     or not public.iberfit_photo_decision_support_valid_v2(coalesce(p_decision_support,'{}'::jsonb))
     or not public.m26_json_safe_v43(coalesce(p_validated_landmarks,'{}'::jsonb))
     or not public.m26_json_safe_v43(coalesce(p_calibration,'{}'::jsonb))
     or not public.m26_json_safe_v43(coalesce(p_measurements,'{}'::jsonb))
     or not public.m26_json_safe_v43(coalesce(p_decision_support,'{}'::jsonb)) then
    raise exception 'IRI_V2_PHOTOGRAMMETRY_ANALYSIS_INVALID' using errcode='22023';
  end if;
  if p_validate and (
       p_front_capture_id is null or p_back_capture_id is null
       or p_left_capture_id is null or p_right_capture_id is null
       or not public.iberfit_photo_landmarks_complete_v2(coalesce(p_validated_landmarks,'{}'::jsonb))
     ) then
    raise exception 'IRI_V2_PHOTOGRAMMETRY_VALIDATION_INCOMPLETE' using errcode='22023';
  end if;
  if not public.iberfit_iri_consent_active_v1(p_assessment_id,'photography') then
    raise exception 'IRI_V2_PHOTOGRAPHY_CONSENT_REQUIRED' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.iri_assessments i
    where i.id=p_assessment_id and i.client_id=p_client_id and i.assessment_type='inicial'
  ) then
    raise exception 'IRI_V2_INITIAL_ASSESSMENT_REQUIRED' using errcode='22023';
  end if;

  if p_front_capture_id is not null and not exists(
    select 1 from public.iri_photogrammetry_captures_v1 c
    where c.id=p_front_capture_id and c.client_id=p_client_id
      and c.assessment_id=p_assessment_id and c.view='front' and c.status='active'
  ) then raise exception 'IRI_V2_FRONT_CAPTURE_INVALID' using errcode='22023'; end if;
  if p_back_capture_id is not null and not exists(
    select 1 from public.iri_photogrammetry_captures_v1 c
    where c.id=p_back_capture_id and c.client_id=p_client_id
      and c.assessment_id=p_assessment_id and c.view='back' and c.status='active'
  ) then raise exception 'IRI_V2_BACK_CAPTURE_INVALID' using errcode='22023'; end if;
  if p_left_capture_id is not null and not exists(
    select 1 from public.iri_photogrammetry_captures_v1 c
    where c.id=p_left_capture_id and c.client_id=p_client_id
      and c.assessment_id=p_assessment_id and c.view='left' and c.status='active'
  ) then raise exception 'IRI_V2_LEFT_CAPTURE_INVALID' using errcode='22023'; end if;
  if p_right_capture_id is not null and not exists(
    select 1 from public.iri_photogrammetry_captures_v1 c
    where c.id=p_right_capture_id and c.client_id=p_client_id
      and c.assessment_id=p_assessment_id and c.view='right' and c.status='active'
  ) then raise exception 'IRI_V2_RIGHT_CAPTURE_INVALID' using errcode='22023'; end if;

  select coalesce(max(a.revision),0)
  into v_latest_revision
  from public.iri_photogrammetry_analyses_v2 a
  where a.assessment_id=p_assessment_id;

  if v_latest_revision<>p_base_revision then
    raise exception 'IRI_V2_PHOTOGRAMMETRY_REVISION_CONFLICT' using errcode='40001';
  end if;

  v_next_revision:=v_latest_revision+1;

  insert into public.iri_photogrammetry_analyses_v2(
    client_id,assessment_id,revision,
    front_capture_id,back_capture_id,left_capture_id,right_capture_id,
    protocol_version,landmark_schema_version,
    validated_landmarks,calibration,measurements,decision_support,
    status,validated_by,validated_at,created_by
  ) values(
    p_client_id,p_assessment_id,v_next_revision,
    p_front_capture_id,p_back_capture_id,p_left_capture_id,p_right_capture_id,
    'iri-photogrammetry-2026.10-v2','manual-calibrated-4-point-v2',
    coalesce(p_validated_landmarks,'{}'::jsonb),
    coalesce(p_calibration,'{}'::jsonb),
    coalesce(p_measurements,'{}'::jsonb),
    coalesce(p_decision_support,'{}'::jsonb),
    case when p_validate then 'validated' else 'draft' end,
    case when p_validate then v_actor else null end,
    case when p_validate then clock_timestamp() else null end,
    v_actor
  ) returning * into v_row;

  return jsonb_build_object(
    'ok',true,'id',v_row.id,'clientId',v_row.client_id,'assessmentId',v_row.assessment_id,
    'status',v_row.status,'revision',v_row.revision,'validatedAt',v_row.validated_at,
    'protocolVersion',v_row.protocol_version,'landmarkSchemaVersion',v_row.landmark_schema_version
  );
end
$function$;

revoke all on function public.iberfit_photo_point_valid_v2(jsonb) from public,anon;
revoke all on function public.iberfit_photo_landmarks_complete_v2(jsonb) from public,anon;
revoke all on function public.iberfit_photo_calibration_entry_valid_v2(jsonb) from public,anon;
revoke all on function public.iberfit_photo_calibration_valid_v2(jsonb) from public,anon;
revoke all on function public.iberfit_photo_measurements_valid_v2(jsonb) from public,anon;
revoke all on function public.iberfit_photo_decision_support_valid_v2(jsonb) from public,anon;
revoke all on function public.iberfit_iri_photo_report_permission_active_v1(uuid) from public,anon;
revoke all on function public.iberfit_record_iri_photo_report_permission_v1(uuid,uuid,text,text,text) from public,anon;
revoke all on function public.iberfit_save_iri_photogrammetry_analysis_v2(uuid,uuid,bigint,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean) from public,anon;

grant execute on function public.iberfit_photo_point_valid_v2(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_photo_landmarks_complete_v2(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_photo_calibration_entry_valid_v2(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_photo_calibration_valid_v2(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_photo_measurements_valid_v2(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_photo_decision_support_valid_v2(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_iri_photo_report_permission_active_v1(uuid) to authenticated,service_role;
grant execute on function public.iberfit_record_iri_photo_report_permission_v1(uuid,uuid,text,text,text) to authenticated,service_role;
grant execute on function public.iberfit_save_iri_photogrammetry_analysis_v2(uuid,uuid,bigint,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean) to authenticated,service_role;

commit;
