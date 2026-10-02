-- IBERFIT IRI v4 · initial diagnostic + private photogrammetry foundation
-- Additive security-first migration. No production data is rewritten.

alter table public.iri_assessments
  add constraint iri_assessments_initial_only_v4
  check (assessment_type = 'inicial');

alter table public.iri_assessments
  alter column assessment_type set default 'inicial',
  alter column protocol_version set default '4.0.0';

alter table public.iri_assessments
  add constraint iri_assessments_step_v4
  check (current_step = any(array[
    'contexto','composicion','fotografia','movilidad','fuerza','capacidad','interpretacion','planAccion'
  ]::text[]));

create unique index if not exists iri_one_initial_per_client_v1
  on public.iri_assessments(client_id);

revoke delete on public.iri_assessments from authenticated, anon;

-- IBERFIT-TABLE-ACCESS: public.iri_consents_v1 :: Coach/Admin may read consent history through client-scoped RLS; all writes use audited guarded RPCs.
-- IBERFIT-POLICY: public.iri_consents_v1 = rls-client
create table if not exists public.iri_consents_v1 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  assessment_id uuid not null references public.iri_assessments(id) on delete cascade,
  consent_type text not null check (consent_type in ('physical_assessment','photography')),
  status text not null check (status in ('granted','declined','revoked')),
  document_version text not null check (document_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default clock_timestamp(),
  note text,
  constraint iri_consents_note_v1 check (note is null or char_length(note) <= 600)
);
alter table public.iri_consents_v1 enable row level security;
create index if not exists iri_consents_assessment_type_time_v1
  on public.iri_consents_v1(assessment_id,consent_type,recorded_at desc);
create index if not exists iri_consents_client_v1 on public.iri_consents_v1(client_id);

create or replace function public.iberfit_can_manage_iri_private_v1(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select public.iberfit_can_manage_iri_external_report_v12(p_client_id);
$$;

create or replace function public.iberfit_iri_consent_active_v1(
  p_assessment_id uuid,
  p_consent_type text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select c.status='granted'
      and public.iberfit_can_manage_iri_private_v1(c.client_id)
    from public.iri_consents_v1 c
    where c.assessment_id=p_assessment_id
      and c.consent_type=p_consent_type
    order by c.recorded_at desc,c.id desc
    limit 1
  ),false);
$$;

create policy iri_consents_read_manage_v1
on public.iri_consents_v1
for select to authenticated
using (public.iberfit_can_manage_iri_private_v1(client_id));

revoke all on public.iri_consents_v1 from public,anon,authenticated;
grant select on public.iri_consents_v1 to authenticated;
grant all on public.iri_consents_v1 to service_role;

create or replace function public.iberfit_record_iri_consent_v1(
  p_client_id uuid,
  p_assessment_id uuid,
  p_consent_type text,
  p_status text,
  p_document_version text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_row public.iri_consents_v1%rowtype;
begin
  if v_actor is null then raise exception 'IRI_V4_AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.iberfit_can_manage_iri_private_v1(p_client_id) then
    raise exception 'IRI_V4_COACH_OR_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_consent_type not in ('physical_assessment','photography')
    or p_status not in ('granted','declined','revoked')
    or coalesce(p_document_version,'') !~ '^[A-Za-z0-9._-]{1,40}$'
    or char_length(coalesce(p_note,''))>600 then
    raise exception 'IRI_V4_CONSENT_INVALID' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.iri_assessments i
    where i.id=p_assessment_id and i.client_id=p_client_id and i.assessment_type='inicial'
  ) then
    raise exception 'IRI_V4_INITIAL_ASSESSMENT_REQUIRED' using errcode='22023';
  end if;

  insert into public.iri_consents_v1(
    client_id,assessment_id,consent_type,status,document_version,recorded_by,note
  ) values(
    p_client_id,p_assessment_id,p_consent_type,p_status,p_document_version,v_actor,
    nullif(btrim(coalesce(p_note,'')),'')
  ) returning * into v_row;

  return jsonb_build_object(
    'ok',true,'id',v_row.id,'clientId',v_row.client_id,'assessmentId',v_row.assessment_id,
    'consentType',v_row.consent_type,'status',v_row.status,
    'documentVersion',v_row.document_version,'recordedAt',v_row.recorded_at
  );
end
$$;

create or replace function public.iberfit_require_physical_consent_before_iri_confirm_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if old.status='borrador'
     and new.status in ('revisión','aprobado','publicado')
     and not public.iberfit_iri_consent_active_v1(new.id,'physical_assessment') then
    raise exception 'IRI_V4_PHYSICAL_CONSENT_REQUIRED' using errcode='42501';
  end if;
  return new;
end
$$;

create trigger iri_require_physical_consent_v1
before update of status on public.iri_assessments
for each row execute function public.iberfit_require_physical_consent_before_iri_confirm_v1();

-- IBERFIT-TABLE-ACCESS: public.iri_photogrammetry_captures_v1 :: Coach/Admin may read capture metadata through client-scoped RLS; lifecycle writes use guarded RPCs and private Storage policies.
-- IBERFIT-POLICY: public.iri_photogrammetry_captures_v1 = rls-client
create table if not exists public.iri_photogrammetry_captures_v1 (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  assessment_id uuid not null references public.iri_assessments(id) on delete cascade,
  consent_id uuid not null references public.iri_consents_v1(id) on delete restrict,
  view text not null check (view in ('front','back','left','right')),
  bucket_id text not null default 'iberfit-iri-photogrammetry'
    check (bucket_id='iberfit-iri-photogrammetry'),
  object_path text not null unique,
  original_file_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 15000000),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  width_px integer check (width_px between 1 and 20000),
  height_px integer check (height_px between 1 and 20000),
  source text not null check (source in ('camera','upload')),
  protocol_version text not null default 'iri-photo-2026.10-v1',
  captured_at timestamptz not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending_upload' check (status in ('pending_upload','active','revoked')),
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint iri_photo_name_v1 check (
    char_length(btrim(original_file_name)) between 1 and 240
    and original_file_name !~ '[[:cntrl:]]'
  ),
  constraint iri_photo_revoked_v1 check (
    (status in ('pending_upload','active') and revoked_at is null) or
    (status='revoked' and revoked_at is not null)
  )
);
alter table public.iri_photogrammetry_captures_v1 enable row level security;
create index if not exists iri_photo_assessment_view_time_v1
  on public.iri_photogrammetry_captures_v1(assessment_id,view,captured_at desc);
create index if not exists iri_photo_client_v1
  on public.iri_photogrammetry_captures_v1(client_id);

create policy iri_photo_capture_read_manage_v1
on public.iri_photogrammetry_captures_v1
for select to authenticated
using (public.iberfit_can_manage_iri_private_v1(client_id));

revoke all on public.iri_photogrammetry_captures_v1 from public,anon,authenticated;
grant select on public.iri_photogrammetry_captures_v1 to authenticated;
grant all on public.iri_photogrammetry_captures_v1 to service_role;

-- IBERFIT-TABLE-ACCESS: public.iri_photogrammetry_analyses_v1 :: Coach/Admin may read derived analysis through client-scoped RLS; revisions and validation write only through guarded RPCs.
-- IBERFIT-POLICY: public.iri_photogrammetry_analyses_v1 = rls-client
create table if not exists public.iri_photogrammetry_analyses_v1 (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  assessment_id uuid not null unique references public.iri_assessments(id) on delete cascade,
  front_capture_id uuid references public.iri_photogrammetry_captures_v1(id) on delete restrict,
  back_capture_id uuid references public.iri_photogrammetry_captures_v1(id) on delete restrict,
  left_capture_id uuid references public.iri_photogrammetry_captures_v1(id) on delete restrict,
  right_capture_id uuid references public.iri_photogrammetry_captures_v1(id) on delete restrict,
  protocol_version text not null default 'iri-photogrammetry-2026.10-v1',
  landmark_schema_version text not null default 'manual-4-point-v1',
  auto_landmarks jsonb not null default '{}'::jsonb,
  validated_landmarks jsonb not null default '{}'::jsonb,
  measurements jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','validated')),
  revision bigint not null default 1 check (revision>0),
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint iri_photo_analysis_validation_v1 check (
    (status='draft' and validated_at is null) or
    (status='validated' and validated_at is not null)
  ),
  constraint iri_photo_analysis_json_v1 check (
    public.m26_json_safe_v43(auto_landmarks)
    and public.m26_json_safe_v43(validated_landmarks)
    and public.m26_json_safe_v43(measurements)
  )
);
alter table public.iri_photogrammetry_analyses_v1 enable row level security;
create index if not exists iri_photo_analysis_client_v1
  on public.iri_photogrammetry_analyses_v1(client_id);

create policy iri_photo_analysis_read_manage_v1
on public.iri_photogrammetry_analyses_v1
for select to authenticated
using (public.iberfit_can_manage_iri_private_v1(client_id));

revoke all on public.iri_photogrammetry_analyses_v1 from public,anon,authenticated;
grant select on public.iri_photogrammetry_analyses_v1 to authenticated;
grant all on public.iri_photogrammetry_analyses_v1 to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'iberfit-iri-photogrammetry','iberfit-iri-photogrammetry',false,15000000,
  array['image/jpeg','image/png']::text[]
)
on conflict(id) do nothing;

create or replace function public.iberfit_photo_path_uuid_part_v1(p_path text,p_part integer)
returns uuid
language plpgsql
immutable
set search_path=''
as $$
declare v text;
begin
  v:=split_part(coalesce(p_path,''),'/',p_part);
  if v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return v::uuid;
exception when others then
  return null;
end
$$;

create or replace function public.iberfit_photo_path_view_v1(p_path text)
returns text
language sql
immutable
set search_path=''
as $$
  select case split_part(coalesce(p_path,''),'/',3)
    when 'front' then 'front' when 'back' then 'back'
    when 'left' then 'left' when 'right' then 'right' else null end;
$$;

create or replace function public.iberfit_photo_path_is_canonical_v1(p_path text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select public.iberfit_photo_path_uuid_part_v1(p_path,1) is not null
    and public.iberfit_photo_path_uuid_part_v1(p_path,2) is not null
    and public.iberfit_photo_path_view_v1(p_path) is not null
    and public.iberfit_photo_path_uuid_part_v1(p_path,4) is not null
    and split_part(coalesce(p_path,''),'/',5) in ('original.jpg','original.png')
    and split_part(coalesce(p_path,''),'/',6)='';
$$;

create policy iri_photo_object_insert_v1
on storage.objects
for insert to authenticated
with check (
  bucket_id='iberfit-iri-photogrammetry'
  and public.iberfit_photo_path_is_canonical_v1(name)
  and public.iberfit_can_manage_iri_private_v1(public.iberfit_photo_path_uuid_part_v1(name,1))
  and exists(
    select 1 from public.iri_assessments i
    where i.id=public.iberfit_photo_path_uuid_part_v1(name,2)
      and i.client_id=public.iberfit_photo_path_uuid_part_v1(name,1)
      and i.assessment_type='inicial'
  )
  and public.iberfit_iri_consent_active_v1(
    public.iberfit_photo_path_uuid_part_v1(name,2),'photography'
  )
  and exists(
    select 1 from public.iri_photogrammetry_captures_v1 c
    where c.id=public.iberfit_photo_path_uuid_part_v1(name,4)
      and c.client_id=public.iberfit_photo_path_uuid_part_v1(name,1)
      and c.assessment_id=public.iberfit_photo_path_uuid_part_v1(name,2)
      and c.view=public.iberfit_photo_path_view_v1(name)
      and c.object_path=storage.objects.name
      and c.status='pending_upload'
  )
);

create policy iri_photo_object_read_v1
on storage.objects
for select to authenticated
using (
  bucket_id='iberfit-iri-photogrammetry'
  and public.iberfit_photo_path_is_canonical_v1(name)
  and public.iberfit_can_manage_iri_private_v1(public.iberfit_photo_path_uuid_part_v1(name,1))
  and public.iberfit_iri_consent_active_v1(
    public.iberfit_photo_path_uuid_part_v1(name,2),'photography'
  )
  and exists(
    select 1 from public.iri_photogrammetry_captures_v1 c
    where c.object_path=storage.objects.name
      and c.status='active'
  )
);

-- Deliberately no UPDATE or DELETE policy on the bucket:
-- original captures are immutable. Privacy deletion is a privileged retention operation.

create or replace function public.iberfit_prepare_iri_photo_v1(
  p_capture_id uuid,
  p_client_id uuid,
  p_assessment_id uuid,
  p_view text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_sha256 text,
  p_width_px integer,
  p_height_px integer,
  p_source text,
  p_captured_at timestamptz,
  p_object_path text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_consent public.iri_consents_v1%rowtype;
  v_existing public.iri_photogrammetry_captures_v1%rowtype;
  v_expected text;
  v_ext text;
begin
  if v_actor is null then raise exception 'IRI_V4_AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.iberfit_can_manage_iri_private_v1(p_client_id) then
    raise exception 'IRI_V4_COACH_OR_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_capture_id is null
     or p_view not in ('front','back','left','right')
     or p_mime_type not in ('image/jpeg','image/png')
     or p_size_bytes is null or p_size_bytes<1 or p_size_bytes>15000000
     or lower(coalesce(p_sha256,'')) !~ '^[0-9a-f]{64}$'
     or p_source not in ('camera','upload')
     or p_width_px is null or p_width_px<1 or p_width_px>20000
     or p_height_px is null or p_height_px<1 or p_height_px>20000
     or char_length(btrim(coalesce(p_file_name,''))) not between 1 and 240 then
    raise exception 'IRI_V4_PHOTO_METADATA_INVALID' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.iri_assessments i
    where i.id=p_assessment_id and i.client_id=p_client_id and i.assessment_type='inicial'
  ) then
    raise exception 'IRI_V4_INITIAL_ASSESSMENT_REQUIRED' using errcode='22023';
  end if;

  select * into v_consent
  from public.iri_consents_v1 c
  where c.assessment_id=p_assessment_id and c.client_id=p_client_id
    and c.consent_type='photography'
  order by c.recorded_at desc,c.id desc
  limit 1;
  if v_consent.id is null or v_consent.status<>'granted' then
    raise exception 'IRI_V4_PHOTOGRAPHY_CONSENT_REQUIRED' using errcode='42501';
  end if;

  v_ext:=case p_mime_type when 'image/jpeg' then 'jpg' else 'png' end;
  v_expected:=p_client_id::text||'/'||p_assessment_id::text||'/'||p_view||'/'||
    p_capture_id::text||'/original.'||v_ext;
  if p_object_path is distinct from v_expected then
    raise exception 'IRI_V4_PHOTO_PATH_INVALID' using errcode='22023';
  end if;

  select * into v_existing
  from public.iri_photogrammetry_captures_v1 c
  where c.id=p_capture_id;
  if v_existing.id is not null then
    if v_existing.client_id=p_client_id
       and v_existing.assessment_id=p_assessment_id
       and v_existing.view=p_view
       and v_existing.object_path=v_expected
       and v_existing.sha256=lower(p_sha256)
       and v_existing.size_bytes=p_size_bytes
       and v_existing.mime_type=p_mime_type
       and v_existing.width_px=p_width_px
       and v_existing.height_px=p_height_px
       and v_existing.status in ('pending_upload','active') then
      return jsonb_build_object(
        'ok',true,'kind','duplicate','id',v_existing.id,'status',v_existing.status,
        'objectPath',v_existing.object_path,'sha256',v_existing.sha256
      );
    end if;
    raise exception 'IRI_V4_PHOTO_ID_COLLISION' using errcode='23505';
  end if;

  if exists(
    select 1 from storage.objects o
    where o.bucket_id='iberfit-iri-photogrammetry' and o.name=v_expected
  ) then
    raise exception 'IRI_V4_PHOTO_OBJECT_UNEXPECTED' using errcode='23505';
  end if;

  insert into public.iri_photogrammetry_captures_v1(
    id,client_id,assessment_id,consent_id,view,object_path,original_file_name,
    mime_type,size_bytes,sha256,width_px,height_px,source,captured_at,uploaded_by,status
  ) values(
    p_capture_id,p_client_id,p_assessment_id,v_consent.id,p_view,v_expected,
    btrim(p_file_name),p_mime_type,p_size_bytes,lower(p_sha256),
    p_width_px,p_height_px,p_source,p_captured_at,v_actor,'pending_upload'
  );

  return jsonb_build_object(
    'ok',true,'kind','prepared','id',p_capture_id,'clientId',p_client_id,
    'assessmentId',p_assessment_id,'view',p_view,'status','pending_upload',
    'objectPath',v_expected,'sha256',lower(p_sha256),'capturedAt',p_captured_at
  );
end
$$;

create or replace function public.iberfit_finalize_iri_photo_v1(
  p_capture_id uuid,
  p_client_id uuid,
  p_assessment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_row public.iri_photogrammetry_captures_v1%rowtype;
begin
  if v_actor is null then raise exception 'IRI_V4_AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.iberfit_can_manage_iri_private_v1(p_client_id) then
    raise exception 'IRI_V4_COACH_OR_ADMIN_REQUIRED' using errcode='42501';
  end if;

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

  update public.iri_photogrammetry_captures_v1
  set status='active'
  where id=v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'ok',true,'kind','ack','id',v_row.id,'clientId',v_row.client_id,
    'assessmentId',v_row.assessment_id,'view',v_row.view,'status',v_row.status,
    'objectPath',v_row.object_path,'sha256',v_row.sha256,'capturedAt',v_row.captured_at
  );
end
$$;

create or replace function public.iberfit_photo_point_valid_v1(p_point jsonb)
returns boolean
language plpgsql
immutable
set search_path=''
as $$
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
$$;

create or replace function public.iberfit_photo_landmarks_complete_v1(p_landmarks jsonb)
returns boolean
language sql
immutable
set search_path=''
as $$
  select jsonb_typeof(p_landmarks)='object'
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{front,shoulderLeft}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{front,shoulderRight}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{front,pelvisLeft}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{front,pelvisRight}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{back,shoulderLeft}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{back,shoulderRight}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{back,pelvisLeft}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{back,pelvisRight}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{left,ear}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{left,shoulder}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{left,hip}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{left,ankle}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{right,ear}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{right,shoulder}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{right,hip}')
    and public.iberfit_photo_point_valid_v1(p_landmarks#>'{right,ankle}');
$$;

create or replace function public.iberfit_photo_measurements_valid_v1(p_measurements jsonb)
returns boolean
language sql
immutable
set search_path=''
as $$
  select jsonb_typeof(p_measurements)='object'
    and p_measurements->>'schema'='iri-photogrammetry-measurements-v1'
    and jsonb_typeof(p_measurements->'metrics')='array'
    and jsonb_typeof(p_measurements->'summaries')='object'
    and jsonb_typeof(p_measurements->'geometryBasis')='object'
    and (
      not (p_measurements ? 'medicalDiagnosis')
      or p_measurements->'medicalDiagnosis'='null'::jsonb
    )
    and (
      not (p_measurements ? 'interpretation')
      or p_measurements->'interpretation'='null'::jsonb
    );
$$;

create or replace function public.iberfit_save_iri_photogrammetry_analysis_v1(
  p_client_id uuid,
  p_assessment_id uuid,
  p_base_revision bigint,
  p_front_capture_id uuid,
  p_back_capture_id uuid,
  p_left_capture_id uuid,
  p_right_capture_id uuid,
  p_validated_landmarks jsonb,
  p_measurements jsonb,
  p_validate boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=auth.uid();
  v_row public.iri_photogrammetry_analyses_v1%rowtype;
  v_next bigint;
begin
  if v_actor is null then raise exception 'IRI_V4_AUTH_REQUIRED' using errcode='28000'; end if;
  if not public.iberfit_can_manage_iri_private_v1(p_client_id) then
    raise exception 'IRI_V4_COACH_OR_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_base_revision is null or p_base_revision<0
     or jsonb_typeof(coalesce(p_validated_landmarks,'{}'::jsonb))<>'object'
     or not public.iberfit_photo_measurements_valid_v1(coalesce(p_measurements,'{}'::jsonb))
     or not public.m26_json_safe_v43(coalesce(p_validated_landmarks,'{}'::jsonb))
     or not public.m26_json_safe_v43(coalesce(p_measurements,'{}'::jsonb)) then
    raise exception 'IRI_V4_PHOTOGRAMMETRY_ANALYSIS_INVALID' using errcode='22023';
  end if;
  if p_validate and (
       p_front_capture_id is null
       or p_back_capture_id is null
       or p_left_capture_id is null
       or p_right_capture_id is null
       or not public.iberfit_photo_landmarks_complete_v1(coalesce(p_validated_landmarks,'{}'::jsonb))
     ) then
    raise exception 'IRI_V4_PHOTOGRAMMETRY_VALIDATION_INCOMPLETE' using errcode='22023';
  end if;
  if not public.iberfit_iri_consent_active_v1(p_assessment_id,'photography') then
    raise exception 'IRI_V4_PHOTOGRAPHY_CONSENT_REQUIRED' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.iri_assessments i
    where i.id=p_assessment_id and i.client_id=p_client_id and i.assessment_type='inicial'
  ) then
    raise exception 'IRI_V4_INITIAL_ASSESSMENT_REQUIRED' using errcode='22023';
  end if;

  if p_front_capture_id is not null and not exists(
    select 1 from public.iri_photogrammetry_captures_v1 c
    where c.id=p_front_capture_id and c.client_id=p_client_id and c.assessment_id=p_assessment_id
      and c.view='front' and c.status='active'
  ) then raise exception 'IRI_V4_FRONT_CAPTURE_INVALID' using errcode='22023'; end if;
  if p_back_capture_id is not null and not exists(
    select 1 from public.iri_photogrammetry_captures_v1 c
    where c.id=p_back_capture_id and c.client_id=p_client_id and c.assessment_id=p_assessment_id
      and c.view='back' and c.status='active'
  ) then raise exception 'IRI_V4_BACK_CAPTURE_INVALID' using errcode='22023'; end if;
  if p_left_capture_id is not null and not exists(
    select 1 from public.iri_photogrammetry_captures_v1 c
    where c.id=p_left_capture_id and c.client_id=p_client_id and c.assessment_id=p_assessment_id
      and c.view='left' and c.status='active'
  ) then raise exception 'IRI_V4_LEFT_CAPTURE_INVALID' using errcode='22023'; end if;
  if p_right_capture_id is not null and not exists(
    select 1 from public.iri_photogrammetry_captures_v1 c
    where c.id=p_right_capture_id and c.client_id=p_client_id and c.assessment_id=p_assessment_id
      and c.view='right' and c.status='active'
  ) then raise exception 'IRI_V4_RIGHT_CAPTURE_INVALID' using errcode='22023'; end if;

  select * into v_row
  from public.iri_photogrammetry_analyses_v1 a
  where a.assessment_id=p_assessment_id
  for update;

  if v_row.id is null then
    if p_base_revision<>0 then
      raise exception 'IRI_V4_PHOTOGRAMMETRY_REVISION_CONFLICT' using errcode='40001';
    end if;
    insert into public.iri_photogrammetry_analyses_v1(
      client_id,assessment_id,front_capture_id,back_capture_id,left_capture_id,right_capture_id,
      validated_landmarks,measurements,status,revision,validated_by,validated_at,created_by
    ) values(
      p_client_id,p_assessment_id,p_front_capture_id,p_back_capture_id,p_left_capture_id,p_right_capture_id,
      coalesce(p_validated_landmarks,'{}'::jsonb),coalesce(p_measurements,'{}'::jsonb),
      case when p_validate then 'validated' else 'draft' end,1,
      case when p_validate then v_actor else null end,
      case when p_validate then clock_timestamp() else null end,v_actor
    ) returning * into v_row;
  else
    if v_row.client_id<>p_client_id or v_row.revision<>p_base_revision then
      raise exception 'IRI_V4_PHOTOGRAMMETRY_REVISION_CONFLICT' using errcode='40001';
    end if;
    v_next:=v_row.revision+1;
    update public.iri_photogrammetry_analyses_v1 set
      front_capture_id=p_front_capture_id,
      back_capture_id=p_back_capture_id,
      left_capture_id=p_left_capture_id,
      right_capture_id=p_right_capture_id,
      validated_landmarks=coalesce(p_validated_landmarks,'{}'::jsonb),
      measurements=coalesce(p_measurements,'{}'::jsonb),
      status=case when p_validate then 'validated' else 'draft' end,
      revision=v_next,
      validated_by=case when p_validate then v_actor else null end,
      validated_at=case when p_validate then clock_timestamp() else null end,
      updated_at=clock_timestamp()
    where id=v_row.id
    returning * into v_row;
  end if;

  return jsonb_build_object(
    'ok',true,'id',v_row.id,'clientId',v_row.client_id,'assessmentId',v_row.assessment_id,
    'status',v_row.status,'revision',v_row.revision,'validatedAt',v_row.validated_at
  );
end
$$;

revoke all on function public.iberfit_photo_point_valid_v1(jsonb) from public;
revoke all on function public.iberfit_photo_landmarks_complete_v1(jsonb) from public;
revoke all on function public.iberfit_photo_measurements_valid_v1(jsonb) from public;
grant execute on function public.iberfit_photo_point_valid_v1(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_photo_landmarks_complete_v1(jsonb) to authenticated,service_role;
grant execute on function public.iberfit_photo_measurements_valid_v1(jsonb) to authenticated,service_role;

revoke all on function public.iberfit_require_physical_consent_before_iri_confirm_v1() from public;
revoke all on function public.iberfit_can_manage_iri_private_v1(uuid) from public;
revoke all on function public.iberfit_iri_consent_active_v1(uuid,text) from public;
revoke all on function public.iberfit_record_iri_consent_v1(uuid,uuid,text,text,text,text) from public;
revoke all on function public.iberfit_prepare_iri_photo_v1(uuid,uuid,uuid,text,text,text,bigint,text,integer,integer,text,timestamptz,text) from public;
revoke all on function public.iberfit_finalize_iri_photo_v1(uuid,uuid,uuid) from public;
revoke all on function public.iberfit_save_iri_photogrammetry_analysis_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,jsonb,jsonb,boolean) from public;

grant execute on function public.iberfit_can_manage_iri_private_v1(uuid) to authenticated,service_role;
grant execute on function public.iberfit_iri_consent_active_v1(uuid,text) to authenticated,service_role;
grant execute on function public.iberfit_record_iri_consent_v1(uuid,uuid,text,text,text,text) to authenticated,service_role;
grant execute on function public.iberfit_prepare_iri_photo_v1(uuid,uuid,uuid,text,text,text,bigint,text,integer,integer,text,timestamptz,text) to authenticated,service_role;
grant execute on function public.iberfit_finalize_iri_photo_v1(uuid,uuid,uuid) to authenticated,service_role;
grant execute on function public.iberfit_save_iri_photogrammetry_analysis_v1(uuid,uuid,bigint,uuid,uuid,uuid,uuid,jsonb,jsonb,boolean) to authenticated,service_role;

-- Path helpers are needed by Storage RLS but disclose no data.
revoke all on function public.iberfit_photo_path_uuid_part_v1(text,integer) from public;
revoke all on function public.iberfit_photo_path_view_v1(text) from public;
revoke all on function public.iberfit_photo_path_is_canonical_v1(text) from public;
grant execute on function public.iberfit_photo_path_uuid_part_v1(text,integer) to authenticated,service_role;
grant execute on function public.iberfit_photo_path_view_v1(text) to authenticated,service_role;
grant execute on function public.iberfit_photo_path_is_canonical_v1(text) to authenticated,service_role;
