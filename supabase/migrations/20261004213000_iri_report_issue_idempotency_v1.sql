-- IBERFIT M26 · IRI report issuance idempotency v1
-- Retries of the same logical issue request reuse the existing immutable issuance.
-- A later deliberate reissue uses a new request UUID and therefore creates a new version.
begin;

alter table public.iri_report_issuances_v1
  add column if not exists issue_request_id uuid;

create unique index if not exists iri_report_issue_request_unique_v1
  on public.iri_report_issuances_v1(assessment_id,audience,issue_request_id)
  where issue_request_id is not null;

create or replace function public.iberfit_finalize_iri_report_issue_v2(
  p_issue_request_id uuid,
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
  v_existing public.iri_report_issuances_v1%rowtype;
  v_version integer;
  v_lineage text;
  v_document_id uuid:=gen_random_uuid();
  v_title text;
  v_client_name text;
begin
  if auth.role()<>'service_role' then
    raise exception 'IRI_REPORT_FINALIZE_SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;
  if p_issue_request_id is null
     or p_issuance_id is null or p_client_id is null or p_assessment_id is null or p_actor_user_id is null
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

  perform pg_advisory_xact_lock(hashtextextended(p_assessment_id::text||':'||p_audience,0));

  select * into v_existing
  from public.iri_report_issuances_v1
  where assessment_id=p_assessment_id
    and audience=p_audience
    and issue_request_id=p_issue_request_id
  limit 1;

  if found then
    if v_existing.client_id<>p_client_id
       or v_existing.source_revision<>p_source_revision
       or v_existing.source_sha256<>p_source_sha256 then
      raise exception 'IRI_REPORT_IDEMPOTENCY_SOURCE_MISMATCH' using errcode='40001';
    end if;
    return jsonb_build_object(
      'ok',true,'reused',true,'issueRequestId',p_issue_request_id,
      'issuanceId',v_existing.id,'documentId',v_existing.document_id,'version',v_existing.version,
      'clientId',v_existing.client_id,'assessmentId',v_existing.assessment_id,'audience',v_existing.audience,
      'artifactPath',v_existing.artifact_path,'artifactSha256',v_existing.artifact_sha256
    );
  end if;

  if not exists(
    select 1 from storage.objects o
    where o.bucket_id='iberfit-iri-issued-reports' and o.name=p_artifact_path
  ) then
    raise exception 'IRI_REPORT_FINALIZE_OBJECT_MISSING' using errcode='22023';
  end if;

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
      'issueRequestId',p_issue_request_id,
      'issuanceId',p_issuance_id
    ),
    case when p_audience='cliente' then clock_timestamp() else null end,
    p_actor_user_id
  );

  insert into public.iri_report_issuances_v1(
    id,client_id,assessment_id,document_id,audience,lineage_id,version,
    template_version,engine_version,source_revision,source_snapshot,source_sha256,
    evidence_manifest,render_manifest,artifact_bucket,artifact_path,artifact_sha256,
    artifact_size_bytes,issued_by,issue_request_id
  ) values(
    p_issuance_id,p_client_id,p_assessment_id,v_document_id,p_audience,v_lineage,v_version,
    p_template_version,p_engine_version,p_source_revision,p_source_snapshot,p_source_sha256,
    coalesce(p_evidence_manifest,'{}'::jsonb),coalesce(p_render_manifest,'{}'::jsonb),
    'iberfit-iri-issued-reports',p_artifact_path,p_artifact_sha256,p_artifact_size_bytes,p_actor_user_id,
    p_issue_request_id
  );

  return jsonb_build_object(
    'ok',true,'reused',false,'issueRequestId',p_issue_request_id,
    'issuanceId',p_issuance_id,'documentId',v_document_id,'version',v_version,
    'clientId',p_client_id,'assessmentId',p_assessment_id,'audience',p_audience,
    'artifactPath',p_artifact_path,'artifactSha256',p_artifact_sha256
  );
end
$function$;

revoke all on function public.iberfit_finalize_iri_report_issue_v2(uuid,uuid,uuid,uuid,text,text,text,bigint,jsonb,text,jsonb,jsonb,text,text,bigint,uuid)
from public,anon,authenticated;
grant execute on function public.iberfit_finalize_iri_report_issue_v2(uuid,uuid,uuid,uuid,text,text,text,bigint,jsonb,text,jsonb,jsonb,text,text,bigint,uuid)
to service_role;

comment on function public.iberfit_finalize_iri_report_issue_v2(uuid,uuid,uuid,uuid,text,text,text,bigint,jsonb,text,jsonb,jsonb,text,text,bigint,uuid)
is 'IBERFIT-POLICY: idempotent immutable IRI finalization. The same issue request UUID reuses its canonical issuance; a new request UUID creates the next immutable version.';

commit;
