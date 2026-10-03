-- IBERFIT · IRI Document Governance hardening v1
-- Security/correctness layer over iri_document_governance_emission_v1.
begin;

-- Client access must never expose source_snapshot/evidence_manifest/render_manifest.
drop policy if exists iri_report_issuance_read_client_v1 on public.iri_report_issuances_v1;
drop policy if exists iri_issued_object_read_client_v1 on storage.objects;

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

drop trigger if exists iri_report_issuance_append_only_v1 on public.iri_report_issuances_v1;
create trigger iri_report_issuance_append_only_v1
before update or delete on public.iri_report_issuances_v1
for each row execute function public.iberfit_guard_iri_report_ledger_append_only_v1();

drop trigger if exists iri_report_withdrawal_append_only_v1 on public.iri_report_withdrawals_v1;
create trigger iri_report_withdrawal_append_only_v1
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

drop trigger if exists iri_guard_issued_storage_object_v1 on storage.objects;
create trigger iri_guard_issued_storage_object_v1
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
