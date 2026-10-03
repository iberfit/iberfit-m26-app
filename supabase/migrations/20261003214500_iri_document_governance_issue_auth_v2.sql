-- IBERFIT · IRI report issuance authorization v2
-- Issuing is a non-destructive Coach/Admin action. Strong assurance remains mandatory for withdrawal.
begin;

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

revoke all on function public.iberfit_authorize_iri_report_issue_v1(uuid,text) from public,anon;
grant execute on function public.iberfit_authorize_iri_report_issue_v1(uuid,text) to authenticated,service_role;
comment on function public.iberfit_authorize_iri_report_issue_v1(uuid,text)
is 'Authorizes immutable IRI issuance for an authenticated Coach/Admin in scope. Withdrawal remains privileged-assurance protected.';

commit;
