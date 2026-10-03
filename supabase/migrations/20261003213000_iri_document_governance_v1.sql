-- IBERFIT · IRI Document Governance & immutable emission v1
-- Final consolidated state for Canary/PROD. Additive, fail-closed and without destructive migration-time SQL.
-- QA certification verifies the bucket invariant after apply.
-- IBERFIT · IRI Document Governance & Emission v1
-- Draft local-first. Strictly additive over the existing IRI/document model.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'iberfit-iri-issued-reports',
  'iberfit-iri-issued-reports',
  false,
  78643200,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;


create table if not exists public.iri_report_issuances_v1 (
  id uuid primary key,
  client_id uuid not null references public.clients(id) on delete cascade,
  assessment_id uuid not null references public.iri_assessments(id) on delete cascade,
  document_id uuid not null unique references public.documents(id) on delete restrict,
  audience text not null check (audience in ('cliente','coach')),
  lineage_id text not null,
  version integer not null check (version > 0),
  template_version text not null check (template_version ~ '^[A-Za-z0-9._-]{1,80}$'),
  engine_version text not null check (engine_version ~ '^[A-Za-z0-9._-]{1,80}$'),
  source_revision bigint not null check (source_revision >= 0),
  source_snapshot jsonb not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_manifest jsonb not null default '{}'::jsonb,
  render_manifest jsonb not null default '{}'::jsonb,
  artifact_bucket text not null default 'iberfit-iri-issued-reports',
  artifact_path text not null unique,
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-f]{64}$'),
  artifact_size_bytes bigint not null check (artifact_size_bytes > 0 and artifact_size_bytes <= 78643200),
  issued_by uuid not null references auth.users(id) on delete restrict,
  issued_at timestamptz not null default clock_timestamp(),
  constraint iri_report_issuance_source_json_v1 check (
    public.m26_json_safe_v43(source_snapshot)
    and public.m26_json_safe_v43(evidence_manifest)
    and public.m26_json_safe_v43(render_manifest)
  ),
  constraint iri_report_issuance_lineage_v1 check (char_length(lineage_id) between 10 and 220),
  unique (assessment_id,audience,version)
);

create index if not exists iri_report_issuance_client_time_v1
  on public.iri_report_issuances_v1(client_id,issued_at desc);
create index if not exists iri_report_issuance_assessment_audience_v1
  on public.iri_report_issuances_v1(assessment_id,audience,version desc);

create table if not exists public.iri_report_withdrawals_v1 (
  id uuid primary key default gen_random_uuid(),
  issuance_id uuid not null unique references public.iri_report_issuances_v1(id) on delete restrict,
  reason text not null check (char_length(reason) between 3 and 1200),
  withdrawn_by uuid not null references auth.users(id) on delete restrict,
  withdrawn_at timestamptz not null default clock_timestamp()
);

create index if not exists iri_report_withdrawal_time_v1
  on public.iri_report_withdrawals_v1(withdrawn_at desc);

alter table public.iri_report_issuances_v1 enable row level security;
alter table public.iri_report_withdrawals_v1 enable row level security;

create policy iri_report_issuance_read_manager_v2
on public.iri_report_issuances_v1
for select to authenticated
using (public.iberfit_can_manage_iri_private_v1(client_id));


create policy iri_report_withdrawal_read_manager_v2
on public.iri_report_withdrawals_v1
for select to authenticated
using (
  exists(
    select 1 from public.iri_report_issuances_v1 i
    where i.id=issuance_id and public.iberfit_can_manage_iri_private_v1(i.client_id)
  )
);

revoke all on public.iri_report_issuances_v1 from public,anon,authenticated;
revoke all on public.iri_report_withdrawals_v1 from public,anon,authenticated;
grant select on public.iri_report_issuances_v1 to authenticated;
grant select on public.iri_report_withdrawals_v1 to authenticated;
grant all on public.iri_report_issuances_v1 to service_role;
grant all on public.iri_report_withdrawals_v1 to service_role;

create or replace function public.iberfit_iri_issued_path_valid_v1(p_name text)
returns boolean
language plpgsql
immutable
set search_path=''
as $function$
declare
  v_parts text[];
begin
  if p_name is null or char_length(p_name)>500 or p_name like '%..%' or left(p_name,1)='/' then return false; end if;
  v_parts:=string_to_array(p_name,'/');
  if array_length(v_parts,1)<>5 then return false; end if;
  if v_parts[1] !~* '^[0-9a-f-]{36}$' or v_parts[2] !~* '^[0-9a-f-]{36}$' then return false; end if;
  if v_parts[3] not in ('cliente','coach') then return false; end if;
  if v_parts[4] !~* '^[0-9a-f-]{36}$' or v_parts[5]<>'report.pdf' then return false; end if;
  return true;
exception when others then
  return false;
end
$function$;

create or replace function public.iberfit_iri_issued_path_uuid_v1(p_name text,p_index integer)
returns uuid
language plpgsql
immutable
set search_path=''
as $function$
declare v text;
begin
  if not public.iberfit_iri_issued_path_valid_v1(p_name) then return null; end if;
  v:=split_part(p_name,'/',p_index);
  return v::uuid;
exception when others then return null;
end
$function$;

create policy iri_issued_object_read_manager_v2
on storage.objects
for select to authenticated
using (
  bucket_id='iberfit-iri-issued-reports'
  and public.iberfit_iri_issued_path_valid_v1(name)
  and exists(
    select 1 from public.iri_report_issuances_v1 i
    where i.id=public.iberfit_iri_issued_path_uuid_v1(objects.name,4)
      and i.client_id=public.iberfit_iri_issued_path_uuid_v1(objects.name,1)
      and i.assessment_id=public.iberfit_iri_issued_path_uuid_v1(objects.name,2)
      and i.audience=split_part(objects.name,'/',3)
      and i.artifact_path=objects.name
      and public.iberfit_can_manage_iri_private_v1(i.client_id)
  )
);


create or replace function public.iberfit_authorize_iri_report_issue_v1(
  p_assessment_id uuid,
  p_audience text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_assessment public.iri_assessments%rowtype;
  v_client public.clients%rowtype;
  v_org uuid;
  v_lifecycle text;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_actor is null then raise exception 'IRI_REPORT_ISSUE_AUTH_REQUIRED' using errcode='28000'; end if;
  if p_assessment_id is null or p_audience not in ('cliente','coach') then
    raise exception 'IRI_REPORT_ISSUE_INPUT_INVALID' using errcode='22023';
  end if;
  select * into v_assessment from public.iri_assessments where id=p_assessment_id;
  if not found or v_assessment.assessment_type<>'inicial' then
    raise exception 'IRI_REPORT_ISSUE_INITIAL_ASSESSMENT_REQUIRED' using errcode='22023';
  end if;
  if not public.iberfit_can_manage_iri_private_v1(v_assessment.client_id) then
    raise exception 'IRI_REPORT_ISSUE_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  if v_assessment.completed_at is null
     and nullif(v_assessment.sections->>'firstSessionCompletedAt','') is null then
    raise exception 'IRI_REPORT_ISSUE_ASSESSMENT_NOT_CONFIRMED' using errcode='22023';
  end if;
  select * into v_client from public.clients where id=v_assessment.client_id;
  v_org:=nullif(public.iberfit_application_context_v14()->>'organizationId','')::uuid;
  select e.status into v_lifecycle
  from public.iberfit_client_lifecycle_events e
  where e.client_id=v_assessment.client_id::text
    and (v_org is null or e.organization_id=v_org)
  order by e.effective_at desc,e.created_at desc,e.id desc
  limit 1;
  return jsonb_build_object(
    'ok',true,
    'actorUserId',v_actor,
    'clientId',v_assessment.client_id,
    'clientName',v_client.name,
    'assessmentId',v_assessment.id,
    'assessmentRevision',v_assessment.revision,
    'protocolVersion',v_assessment.protocol_version,
    'lifecycleStatus',v_lifecycle,
    'iriOnly',coalesce(v_lifecycle='iri_only',false),
    'audience',p_audience
  );
end
$function$;

create or replace function public.iberfit_finalize_iri_report_issue_v1(
  p_issuance_id uuid,
  p_client_id uuid,
  p_assessment_id uuid,
  p_audience text,
  p_template_version text,
  p_engine_version text,
  p_source_revision bigint,
  p_source_snapshot jsonb,
  p_source_sha256 text,
  p_evidence_manifest jsonb,
  p_render_manifest jsonb,
  p_artifact_path text,
  p_artifact_sha256 text,
  p_artifact_size_bytes bigint,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_version integer;
  v_lineage text;
  v_document_id uuid:=gen_random_uuid();
  v_title text;
  v_client_name text;
begin
  if auth.role()<>'service_role' then
    raise exception 'IRI_REPORT_FINALIZE_SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if p_issuance_id is null or p_client_id is null or p_assessment_id is null or p_actor_user_id is null
     or p_audience not in ('cliente','coach')
     or coalesce(p_template_version,'') !~ '^[A-Za-z0-9._-]{1,80}$'
     or coalesce(p_engine_version,'') !~ '^[A-Za-z0-9._-]{1,80}$'
     or p_source_revision is null or p_source_revision<0
     or coalesce(p_source_sha256,'') !~ '^[0-9a-f]{64}$'
     or coalesce(p_artifact_sha256,'') !~ '^[0-9a-f]{64}$'
     or p_artifact_size_bytes is null or p_artifact_size_bytes<=0 or p_artifact_size_bytes>78643200
     or not public.iberfit_iri_issued_path_valid_v1(p_artifact_path)
     or public.iberfit_iri_issued_path_uuid_v1(p_artifact_path,1)<>p_client_id
     or public.iberfit_iri_issued_path_uuid_v1(p_artifact_path,2)<>p_assessment_id
     or public.iberfit_iri_issued_path_uuid_v1(p_artifact_path,4)<>p_issuance_id
     or split_part(p_artifact_path,'/',3)<>p_audience
     or not public.m26_json_safe_v43(coalesce(p_source_snapshot,'{}'::jsonb))
     or not public.m26_json_safe_v43(coalesce(p_evidence_manifest,'{}'::jsonb))
     or not public.m26_json_safe_v43(coalesce(p_render_manifest,'{}'::jsonb)) then
    raise exception 'IRI_REPORT_FINALIZE_INVALID' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.iri_assessments a
    where a.id=p_assessment_id and a.client_id=p_client_id and a.assessment_type='inicial'
      and a.revision=p_source_revision
  ) then
    raise exception 'IRI_REPORT_FINALIZE_SOURCE_MISMATCH' using errcode='40001';
  end if;
  if not exists(select 1 from auth.users u where u.id=p_actor_user_id) then
    raise exception 'IRI_REPORT_FINALIZE_ACTOR_INVALID' using errcode='22023';
  end if;
  if not exists(
    select 1 from storage.objects o
    where o.bucket_id='iberfit-iri-issued-reports' and o.name=p_artifact_path
  ) then
    raise exception 'IRI_REPORT_FINALIZE_OBJECT_MISSING' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_assessment_id::text||':'||p_audience,0));
  select coalesce(max(version),0)+1 into v_version
  from public.iri_report_issuances_v1
  where assessment_id=p_assessment_id and audience=p_audience;

  v_lineage:='iri:'||p_assessment_id::text||':'||p_audience;
  select name into v_client_name from public.clients where id=p_client_id;
  v_title:=case when p_audience='cliente' then 'Informe IRI · ' else 'Dossier técnico IRI · ' end||coalesce(v_client_name,'Cliente');

  insert into public.documents(
    id,lineage_id,client_id,iri_id,title,document_type,version,audience,status,
    file_name,mime_type,size_bytes,sha256,storage_path,measured_at,measurement_context,
    published_at,created_by
  ) values(
    v_document_id,v_lineage,p_client_id,p_assessment_id,v_title,'iri_emitido',v_version,p_audience,
    case when p_audience='cliente' then 'publicado'::public.publication_status else 'aprobado'::public.publication_status end,
    'Informe-IRI-v'||v_version||'.pdf','application/pdf',p_artifact_size_bytes,p_artifact_sha256,p_artifact_path,
    (select evaluated_at from public.iri_assessments where id=p_assessment_id),
    jsonb_build_object(
      'templateVersion',p_template_version,
      'engineVersion',p_engine_version,
      'sourceRevision',p_source_revision,
      'sourceSha256',p_source_sha256,
      'issuanceId',p_issuance_id
    ),
    case when p_audience='cliente' then clock_timestamp() else null end,
    p_actor_user_id
  );

  insert into public.iri_report_issuances_v1(
    id,client_id,assessment_id,document_id,audience,lineage_id,version,
    template_version,engine_version,source_revision,source_snapshot,source_sha256,
    evidence_manifest,render_manifest,artifact_bucket,artifact_path,artifact_sha256,
    artifact_size_bytes,issued_by
  ) values(
    p_issuance_id,p_client_id,p_assessment_id,v_document_id,p_audience,v_lineage,v_version,
    p_template_version,p_engine_version,p_source_revision,p_source_snapshot,p_source_sha256,
    coalesce(p_evidence_manifest,'{}'::jsonb),coalesce(p_render_manifest,'{}'::jsonb),
    'iberfit-iri-issued-reports',p_artifact_path,p_artifact_sha256,p_artifact_size_bytes,p_actor_user_id
  );

  return jsonb_build_object(
    'ok',true,'issuanceId',p_issuance_id,'documentId',v_document_id,'version',v_version,
    'clientId',p_client_id,'assessmentId',p_assessment_id,'audience',p_audience,
    'artifactPath',p_artifact_path,'artifactSha256',p_artifact_sha256
  );
end
$function$;

create or replace function public.iberfit_withdraw_iri_report_issue_v1(
  p_issuance_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_issuance public.iri_report_issuances_v1%rowtype;
begin
  perform public.iberfit_require_privileged_assurance_v65d();
  if v_actor is null then raise exception 'IRI_REPORT_WITHDRAW_AUTH_REQUIRED' using errcode='28000'; end if;
  select * into v_issuance from public.iri_report_issuances_v1 where id=p_issuance_id;
  if not found then raise exception 'IRI_REPORT_WITHDRAW_NOT_FOUND' using errcode='22023'; end if;
  if not public.iberfit_can_manage_iri_private_v1(v_issuance.client_id) then
    raise exception 'IRI_REPORT_WITHDRAW_SCOPE_FORBIDDEN' using errcode='42501';
  end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 or char_length(p_reason)>1200 then
    raise exception 'IRI_REPORT_WITHDRAW_REASON_INVALID' using errcode='22023';
  end if;
  insert into public.iri_report_withdrawals_v1(issuance_id,reason,withdrawn_by)
  values(p_issuance_id,btrim(p_reason),v_actor)
  on conflict(issuance_id) do nothing;
  update public.documents d
  set status='retirado'::public.publication_status
  where d.id=v_issuance.document_id and d.status<>'retirado'::public.publication_status;
  return jsonb_build_object('ok',true,'issuanceId',p_issuance_id,'withdrawn',true);
end
$function$;

create or replace function public.iberfit_guard_issued_document_v1()
returns trigger
language plpgsql
set search_path=''
as $function$
begin
  if exists(select 1 from public.iri_report_issuances_v1 i where i.document_id=old.id) then
    if tg_op='DELETE' then
      raise exception 'IRI_ISSUED_DOCUMENT_IMMUTABLE' using errcode='42501';
    end if;
    if tg_op='UPDATE' then
      if not (
        old.status<>'retirado'::public.publication_status
        and new.status='retirado'::public.publication_status
        and exists(select 1 from public.iri_report_issuances_v1 i join public.iri_report_withdrawals_v1 w on w.issuance_id=i.id where i.document_id=old.id)
        and new.id is not distinct from old.id
        and new.lineage_id is not distinct from old.lineage_id
        and new.client_id is not distinct from old.client_id
        and new.iri_id is not distinct from old.iri_id
        and new.title is not distinct from old.title
        and new.document_type is not distinct from old.document_type
        and new.version is not distinct from old.version
        and new.audience is not distinct from old.audience
        and new.file_name is not distinct from old.file_name
        and new.mime_type is not distinct from old.mime_type
        and new.size_bytes is not distinct from old.size_bytes
        and new.sha256 is not distinct from old.sha256
        and new.storage_path is not distinct from old.storage_path
        and new.measured_at is not distinct from old.measured_at
        and new.measurement_context is not distinct from old.measurement_context
        and new.published_at is not distinct from old.published_at
        and new.created_by is not distinct from old.created_by
        and new.created_at is not distinct from old.created_at
      ) then
        raise exception 'IRI_ISSUED_DOCUMENT_IMMUTABLE' using errcode='42501';
      end if;
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end
$function$;

create trigger iri_guard_issued_document_v2
before update or delete on public.documents
for each row execute function public.iberfit_guard_issued_document_v1();

revoke all on function public.iberfit_iri_issued_path_valid_v1(text) from public,anon;
revoke all on function public.iberfit_iri_issued_path_uuid_v1(text,integer) from public,anon;
revoke all on function public.iberfit_authorize_iri_report_issue_v1(uuid,text) from public,anon;
revoke all on function public.iberfit_finalize_iri_report_issue_v1(uuid,uuid,uuid,text,text,text,bigint,jsonb,text,jsonb,jsonb,text,text,bigint,uuid) from public,anon,authenticated;
revoke all on function public.iberfit_withdraw_iri_report_issue_v1(uuid,text) from public,anon;
revoke all on function public.iberfit_guard_issued_document_v1() from public,anon,authenticated;

grant execute on function public.iberfit_iri_issued_path_valid_v1(text) to authenticated,service_role;
grant execute on function public.iberfit_iri_issued_path_uuid_v1(text,integer) to authenticated,service_role;
grant execute on function public.iberfit_authorize_iri_report_issue_v1(uuid,text) to authenticated,service_role;
grant execute on function public.iberfit_finalize_iri_report_issue_v1(uuid,uuid,uuid,text,text,text,bigint,jsonb,text,jsonb,jsonb,text,text,bigint,uuid) to service_role;
grant execute on function public.iberfit_withdraw_iri_report_issue_v1(uuid,text) to authenticated,service_role;
grant execute on function public.iberfit_guard_issued_document_v1() to service_role;

-- IBERFIT · IRI Document Governance hardening v1
-- Security/correctness layer over iri_document_governance_emission_v1.
begin;

-- Client access must never expose source_snapshot/evidence_manifest/render_manifest.
-- Issuance and withdrawal ledgers are append-only. Withdrawal is represented by a new ledger row,
-- never by mutating or deleting the issuance itself.
create or replace function public.iberfit_guard_iri_report_ledger_append_only_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  raise exception 'IRI_REPORT_LEDGER_IMMUTABLE' using errcode='42501';
end
$function$;

create trigger iri_report_issuance_append_only_v2
before update or delete on public.iri_report_issuances_v1
for each row execute function public.iberfit_guard_iri_report_ledger_append_only_v1();

create trigger iri_report_withdrawal_append_only_v2
before update or delete on public.iri_report_withdrawals_v1
for each row execute function public.iberfit_guard_iri_report_ledger_append_only_v1();

-- Once an object has been finalized into the issuance ledger, its bytes/path are immutable.
-- Unfinalized uploads remain removable so the emission broker can clean up a failed attempt.
create or replace function public.iberfit_guard_iri_issued_storage_object_v1()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_name text:=case when tg_op='DELETE' then old.name else old.name end;
  v_bucket text:=case when tg_op='DELETE' then old.bucket_id else old.bucket_id end;
begin
  if v_bucket='iberfit-iri-issued-reports'
     and exists(
       select 1
       from public.iri_report_issuances_v1 i
       where i.artifact_bucket=v_bucket
         and i.artifact_path=v_name
     ) then
    raise exception 'IRI_ISSUED_ARTIFACT_IMMUTABLE' using errcode='42501';
  end if;
  return case when tg_op='DELETE' then old else new end;
end
$function$;

create trigger iri_guard_issued_storage_object_v2
before update or delete on storage.objects
for each row
when (old.bucket_id='iberfit-iri-issued-reports')
execute function public.iberfit_guard_iri_issued_storage_object_v1();

-- Safe projected history. This deliberately never returns source_snapshot,
-- evidence_manifest, render_manifest or storage path.
create or replace function public.iberfit_iri_report_history_v1(
  p_assessment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_assessment public.iri_assessments%rowtype;
  v_client_id uuid;
  v_manager boolean:=false;
  v_items jsonb;
begin
  if v_actor is null then
    raise exception 'IRI_REPORT_HISTORY_AUTH_REQUIRED' using errcode='28000';
  end if;
  if p_assessment_id is null then
    raise exception 'IRI_REPORT_HISTORY_INPUT_INVALID' using errcode='22023';
  end if;

  select * into v_assessment
  from public.iri_assessments
  where id=p_assessment_id;

  if not found or v_assessment.assessment_type<>'inicial' then
    raise exception 'IRI_REPORT_HISTORY_INITIAL_ASSESSMENT_REQUIRED' using errcode='22023';
  end if;

  v_manager:=public.iberfit_can_manage_iri_private_v1(v_assessment.client_id);
  v_client_id:=public.iberfit_client_id();

  if not v_manager and (v_client_id is null or v_client_id<>v_assessment.client_id) then
    raise exception 'IRI_REPORT_HISTORY_SCOPE_FORBIDDEN' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'issuanceId',i.id,
        'documentId',i.document_id,
        'assessmentId',i.assessment_id,
        'audience',i.audience,
        'version',i.version,
        'templateVersion',i.template_version,
        'engineVersion',i.engine_version,
        'sourceRevision',i.source_revision,
        'artifactSha256',case when v_manager then i.artifact_sha256 else null end,
        'artifactSizeBytes',i.artifact_size_bytes,
        'issuedBy',case when v_manager then i.issued_by else null end,
        'issuedAt',i.issued_at,
        'withdrawn',w.id is not null,
        'withdrawnAt',case when v_manager then w.withdrawn_at else null end,
        'withdrawnReason',case when v_manager then w.reason else null end
      )
      order by i.issued_at desc,i.version desc
    ),
    '[]'::jsonb
  )
  into v_items
  from public.iri_report_issuances_v1 i
  left join public.iri_report_withdrawals_v1 w on w.issuance_id=i.id
  where i.assessment_id=p_assessment_id
    and (
      v_manager
      or (i.audience='cliente' and w.id is null)
    );

  return jsonb_build_object(
    'ok',true,
    'assessmentId',p_assessment_id,
    'manager',v_manager,
    'items',v_items
  );
end
$function$;

-- Safe artifact authorization. The Edge Function uses this before creating a short-lived signed URL.
-- Clients can only authorize their own active Cliente artifact. Managers can inspect both audiences,
-- including withdrawn versions for traceability.
create or replace function public.iberfit_authorize_iri_report_artifact_v1(
  p_issuance_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_actor uuid:=auth.uid();
  v_issuance public.iri_report_issuances_v1%rowtype;
  v_client_id uuid;
  v_manager boolean:=false;
  v_withdrawal public.iri_report_withdrawals_v1%rowtype;
begin
  if v_actor is null then
    raise exception 'IRI_REPORT_ARTIFACT_AUTH_REQUIRED' using errcode='28000';
  end if;
  if p_issuance_id is null then
    raise exception 'IRI_REPORT_ARTIFACT_INPUT_INVALID' using errcode='22023';
  end if;

  select * into v_issuance
  from public.iri_report_issuances_v1
  where id=p_issuance_id;

  if not found then
    raise exception 'IRI_REPORT_ARTIFACT_NOT_FOUND' using errcode='22023';
  end if;

  v_manager:=public.iberfit_can_manage_iri_private_v1(v_issuance.client_id);
  v_client_id:=public.iberfit_client_id();

  select * into v_withdrawal
  from public.iri_report_withdrawals_v1
  where issuance_id=v_issuance.id;

  if not v_manager then
    if v_client_id is null
       or v_client_id<>v_issuance.client_id
       or v_issuance.audience<>'cliente'
       or v_withdrawal.id is not null then
      raise exception 'IRI_REPORT_ARTIFACT_SCOPE_FORBIDDEN' using errcode='42501';
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'issuanceId',v_issuance.id,
    'documentId',v_issuance.document_id,
    'clientId',v_issuance.client_id,
    'assessmentId',v_issuance.assessment_id,
    'audience',v_issuance.audience,
    'version',v_issuance.version,
    'artifactBucket',v_issuance.artifact_bucket,
    'artifactPath',v_issuance.artifact_path,
    'artifactSha256',v_issuance.artifact_sha256,
    'artifactSizeBytes',v_issuance.artifact_size_bytes,
    'issuedAt',v_issuance.issued_at,
    'withdrawn',v_withdrawal.id is not null
  );
end
$function$;

-- SECURITY DEFINER hygiene and explicit ACLs.
revoke all on function public.iberfit_guard_iri_report_ledger_append_only_v1() from public,anon,authenticated;
revoke all on function public.iberfit_guard_iri_issued_storage_object_v1() from public,anon,authenticated;
revoke all on function public.iberfit_iri_report_history_v1(uuid) from public,anon;
revoke all on function public.iberfit_authorize_iri_report_artifact_v1(uuid) from public,anon;

grant execute on function public.iberfit_guard_iri_report_ledger_append_only_v1() to service_role;
grant execute on function public.iberfit_guard_iri_issued_storage_object_v1() to service_role;
grant execute on function public.iberfit_iri_report_history_v1(uuid) to authenticated,service_role;
grant execute on function public.iberfit_authorize_iri_report_artifact_v1(uuid) to authenticated,service_role;

comment on function public.iberfit_guard_iri_report_ledger_append_only_v1()
is 'IBERFIT-POLICY: immutable IRI issuance/withdrawal ledger guard = service-role-only';
comment on function public.iberfit_guard_iri_issued_storage_object_v1()
is 'IBERFIT-POLICY: finalized IRI PDF bytes are immutable = service-role-only';
comment on function public.iberfit_iri_report_history_v1(uuid)
is 'Safe projected IRI issued-document history. Never exposes source snapshots or render/evidence manifests.';
comment on function public.iberfit_authorize_iri_report_artifact_v1(uuid)
is 'Authorizes access to an issued IRI artifact without exposing source snapshots or internal manifests.';

commit;

