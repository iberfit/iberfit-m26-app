-- IBERFIT M44: atomic, authorization-checked private training report draft bootstrap.
-- Deployment gate: pair with the front-end SHA, check the current command bus
-- and validate both Coach/Admin and Client negative roles on synthetic data.
-- This function never approves, publishes or sends a report.
create or replace function public.iberfit_m44_create_report_draft_v1(
  p_client_id uuid, p_report_id uuid, p_draft jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text := public.iberfit_current_role_v26();
  v_type text;
  v_start date;
  v_end date;
  v_source_id uuid;
  v_source_type text;
  v_confirmed integer := 0;
  v_prior public.reports%rowtype;
  v_text text;
  v_item jsonb;
  v_series jsonb;
  v_segment_start date;
  v_segment_end date;
  v_last date;
  v_bucket_count integer;
  v_body jsonb;
  v_fingerprint text;
begin
  if v_actor is null or coalesce(v_role,'') not in ('coach','admin')
     or not coalesce(public.iberfit_can_access_client_v26(p_client_id),false)
     or not coalesce(public.iberfit_canary_enabled_v26(p_client_id),false)
     or (v_role='coach' and not coalesce(public.is_assigned_coach(p_client_id),false))
  then
    raise exception 'M44_REPORT_ACCESS_DENIED' using errcode='42501';
  end if;
  if p_client_id is null or p_report_id is null or jsonb_typeof(p_draft) is distinct from 'object'
     or p_draft->>'clientId' is distinct from p_client_id::text
     or p_draft->>'id' is distinct from p_report_id::text
  then
    raise exception 'M44_REPORT_IDENTITY_INVALID' using errcode='22023';
  end if;
  -- Explicit document schema and bounded payload. Never persist arbitrary
  -- keys from a browser even if its authenticated actor is a Coach.
  if octet_length(p_draft::text)>32768
     or (p_draft - array[
       'id','clientId','assessmentId','title','periodStart','periodEnd',
       'summary','conclusions','recommendations','format','visibility',
       'singleReport','status','visibleToClient','reportType','coachComment',
       'evidence','dataPolicy','reviewAccepted','reportModelVersion',
       'sourceType','sourceId','evidenceSignature','activitySeries'
     ]::text[])<>'{}'::jsonb
  then
    raise exception 'M44_REPORT_PAYLOAD_SCHEMA_OR_SIZE_INVALID' using errcode='22023';
  end if;
  v_type := p_draft->>'reportType';
  if coalesce(v_type,'') not in ('post-session','weekly','monthly','quarterly','year-in-iberfit') then
    raise exception 'M44_REPORT_TYPE_NOT_SUPPORTED' using errcode='22023';
  end if;
  if coalesce(p_draft->>'periodStart','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or coalesce(p_draft->>'periodEnd','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'M44_REPORT_PERIOD_INVALID' using errcode='22023';
  end if;
  v_start := (p_draft->>'periodStart')::date;
  v_end := (p_draft->>'periodEnd')::date;
  if v_start>v_end or v_end>current_date+1 or v_end-v_start>366 then
    raise exception 'M44_REPORT_PERIOD_INVALID' using errcode='22023';
  end if;
  if (v_type='weekly' and v_end-v_start>7)
     or (v_type='monthly' and v_end-v_start>31)
     or (v_type='quarterly' and v_end-v_start>93) then
    raise exception 'M44_REPORT_PERIOD_TYPE_INVALID' using errcode='22023';
  end if;
  foreach v_text in array array['title','summary','conclusions','recommendations'] loop
    if nullif(btrim(coalesce(p_draft->>v_text,'')),'') is null
      or length(p_draft->>v_text) > (case when v_text='title' then 140 else 2500 end)
    then
      raise exception 'M44_REPORT_REQUIRED_CONTENT_INVALID: %', v_text using errcode='22023';
    end if;
  end loop;
  if coalesce((p_draft->>'reviewAccepted')::boolean,false) is not true
     or coalesce((p_draft->>'visibleToClient')::boolean,true) is not false
     or p_draft->>'dataPolicy' is distinct from 'canonical-only'
     or length(coalesce(p_draft->>'coachComment',''))>2500
     or nullif(coalesce(p_draft->>'assessmentId',''),'') is not null
     -- Training evolution must never borrow the IRI's diagnostic identity,
     -- including hidden lineage keys from a custom RPC payload.
     or nullif(coalesce(p_draft->>'sourceAssessmentId',''),'') is not null
     or nullif(coalesce(p_draft->>'sourceAssessmentRevision',''),'') is not null
     or p_draft->>'reportModelVersion' is distinct from 'iri2-premium-report-v1'
  then
    raise exception 'M44_REPORT_REVIEW_OR_PROVENANCE_INVALID' using errcode='22023';
  end if;
  if jsonb_typeof(p_draft->'evidence') is distinct from 'array'
     or jsonb_array_length(p_draft->'evidence') not between 1 and 12
     or nullif(p_draft->>'evidenceSignature','') is null then
    raise exception 'M44_REPORT_EVIDENCE_REQUIRED' using errcode='22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_draft->'evidence') as evidence(value) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or length(btrim(coalesce(v_item->>'label',''))) not between 1 and 120
      or length(btrim(coalesce(v_item->>'text',''))) not between 1 and 500
      or length(btrim(coalesce(v_item->>'source',''))) not between 1 and 120
      or v_item->>'source' in ('iriAssessments','wearableDailySummaries') then
      raise exception 'M44_REPORT_EVIDENCE_ROW_INVALID' using errcode='22023';
    end if;
  end loop;
  v_source_type := p_draft->>'sourceType';
  if v_type='post-session' then
    if v_source_type is distinct from 'session_execution'
       or nullif(p_draft->>'sourceId','') is null then
      raise exception 'M44_REPORT_SOURCE_INVALID' using errcode='22023';
    end if;
    v_source_id := (p_draft->>'sourceId')::uuid;
  elsif v_source_type is distinct from 'session_execution_period'
     or nullif(coalesce(p_draft->>'sourceId',''),'') is not null then
    raise exception 'M44_REPORT_SOURCE_INVALID' using errcode='22023';
  end if;

  -- Completion is authoritative only after the canonical execution reached
  -- cerrada_confirmada. Missing completion timestamps never count as a zero
  -- or as training activity based on a later updated_at value.
  select count(*) into v_confirmed
  from public.session_executions e
  where e.client_id=p_client_id
    and e.execution_status='cerrada_confirmada'
    and (v_source_id is null or e.id=v_source_id)
    and coalesce(
      case when coalesce(e.summary->>'completedAt',e.summary->>'completed_at','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        then left(coalesce(e.summary->>'completedAt',e.summary->>'completed_at'),10)::date end,
      e.remote_confirmed_at::date,
      e.local_closed_at::date
    ) between v_start and v_end;
  if v_confirmed=0 then
    raise exception 'M44_REPORT_CONFIRMED_TRAINING_REQUIRED' using errcode='22023';
  end if;
  -- Check full bucket coverage and every count against the same server truth.
  v_series := p_draft->'activitySeries';
  if v_type<>'post-session' then
    if jsonb_typeof(v_series) is distinct from 'array' or jsonb_array_length(v_series)<2
       or jsonb_array_length(v_series)>13 then
      raise exception 'M44_REPORT_ACTIVITY_SERIES_REQUIRED' using errcode='22023';
    end if;
    v_last:=v_start-1;
    for v_item in select value from jsonb_array_elements(v_series) as segments(value) loop
      if jsonb_typeof(v_item) is distinct from 'object'
         or coalesce(v_item->>'from','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         or coalesce(v_item->>'to','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         or jsonb_typeof(v_item->'count') is distinct from 'number' then
        raise exception 'M44_REPORT_ACTIVITY_SERIES_INVALID' using errcode='22023';
      end if;
      v_segment_start:=(v_item->>'from')::date;
      v_segment_end:=(v_item->>'to')::date;
      if v_segment_start<>v_last+1 or v_segment_end<v_segment_start or v_segment_end>v_end then
        raise exception 'M44_REPORT_ACTIVITY_SERIES_RANGE_INVALID' using errcode='22023';
      end if;
      select count(*) into v_bucket_count from public.session_executions e
      where e.client_id=p_client_id and e.execution_status='cerrada_confirmada'
        and coalesce(
          case when coalesce(e.summary->>'completedAt',e.summary->>'completed_at','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
            then left(coalesce(e.summary->>'completedAt',e.summary->>'completed_at'),10)::date end,
          e.remote_confirmed_at::date,e.local_closed_at::date
        ) between v_segment_start and v_segment_end;
      if (v_item->>'count')::integer<>v_bucket_count then
        raise exception 'M44_REPORT_ACTIVITY_SERIES_STALE' using errcode='22023';
      end if;
      v_last:=v_segment_end;
    end loop;
    if v_last<>v_end then
      raise exception 'M44_REPORT_ACTIVITY_SERIES_INCOMPLETE' using errcode='22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('m44:report:'||p_report_id::text,0));
  select * into v_prior from public.reports where id=p_report_id for update;
  v_fingerprint:=md5(p_draft::text);
  if found then
    if v_prior.client_id<>p_client_id then
      raise exception 'M44_REPORT_IDENTITY_CONFLICT' using errcode='42501';
    end if;
    if v_prior.status='borrador'
       and v_prior.content->>'m44DraftFingerprint'=v_fingerprint then
      return jsonb_build_object('ok',true,'kind','already-created',
        'entityId',p_report_id,'remoteRevision',v_prior.revision);
    end if;
    raise exception 'M44_REPORT_VERSION_CONFLICT' using errcode='23505';
  end if;
  if exists(select 1 from public.domain_entities_v26 d
            where d.entity_type='report' and d.entity_id=p_report_id) then
    raise exception 'M44_REPORT_EXISTING_CANONICAL_ENTITY' using errcode='23505';
  end if;
  v_body:=p_draft||jsonb_build_object('status','borrador','revision',1,'visibleToClient',false,
    'format','a4-premium','createdBy',v_actor,'createdAt',now(),
    'm44DraftFingerprint',v_fingerprint);
  insert into public.reports (
    id,client_id,source_type,source_id,title,report_type,audience,
    summary,content,status,revision,created_by
  ) values (
    p_report_id,p_client_id,v_source_type,v_source_id,
    p_draft->>'title',v_type,'coach',p_draft->>'summary',
    v_body,'borrador',1,v_actor
  );
  perform public.iberfit_persist_entity_v26('report',p_report_id,p_client_id,'borrador',1,v_body);
  -- Durable provenance for each first creation, linked to the actor and client.
  -- Publishing still requires the original canonical INFORME_APROBAR/PUBLICAR commands.
  insert into public.domain_events_v26(
    operation_id,command_type,entity_type,entity_id,client_id,
    actor_user_id,actor_role,phase,from_status,to_status,
    base_revision,remote_revision,details
  ) values (
    gen_random_uuid(),'INFORME_CREAR_BORRADOR_M44','report',p_report_id,p_client_id,
    v_actor,v_role,'applied',null,'borrador',
    0,1,jsonb_build_object('reportType',v_type,'sourceType',v_source_type,
      'evidenceSignature',p_draft->>'evidenceSignature','private',true)
  );
  return jsonb_build_object('ok',true,'kind','created','entityId',p_report_id,'remoteRevision',1);
end
$function$;
revoke all on function public.iberfit_m44_create_report_draft_v1(uuid,uuid,jsonb) from public,anon;
grant execute on function public.iberfit_m44_create_report_draft_v1(uuid,uuid,jsonb) to authenticated;
