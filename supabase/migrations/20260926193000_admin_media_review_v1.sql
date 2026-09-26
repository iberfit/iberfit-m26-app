begin;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'iberfit-exercise-media-review',
  'iberfit-exercise-media-review',
  false,
  12582912,
  array['image/webp','image/png','image/jpeg']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

-- IBERFIT-TABLE-ACCESS: public.exercise_media_review_events :: service-role-only audit ledger for human media-review decisions and publication lineage; never exposed to browser roles.
-- IBERFIT-POLICY: public.exercise_media_review_events = service-role-only
create table if not exists public.exercise_media_review_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.exercise_media_jobs(id) on delete restrict,
  exercise_id text not null,
  action text not null check (action in ('publish_requested','publish_claimed','publish_succeeded','publish_failed','rejected','regenerated')),
  operation_id text not null check (char_length(operation_id) between 3 and 200),
  actor_user_id uuid not null references auth.users(id),
  candidate_sha256 text,
  reason text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint exercise_media_review_events_sha256_check check (candidate_sha256 is null or candidate_sha256 ~ '^[0-9a-f]{64}$'),
  constraint exercise_media_review_events_reason_check check (reason is null or char_length(reason) <= 500),
  constraint exercise_media_review_events_action_operation_key unique(action,operation_id)
);

create index if not exists exercise_media_review_events_job_idx
  on public.exercise_media_review_events(job_id,occurred_at desc);
create index if not exists exercise_media_review_events_exercise_idx
  on public.exercise_media_review_events(exercise_id,occurred_at desc);

alter table public.exercise_media_review_events enable row level security;
revoke all on table public.exercise_media_review_events from public,anon,authenticated;
grant select,insert,update on table public.exercise_media_review_events to service_role;

create or replace function public.iberfit_admin_media_review_claim_v1(
  p_job_id uuid,
  p_operation_id text,
  p_actor uuid,
  p_action text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_job public.exercise_media_jobs%rowtype;
  v_review jsonb;
  v_sha text;
  v_now timestamptz:=now();
  v_child uuid;
  v_existing public.exercise_media_review_events%rowtype;
begin
  if p_actor is null or not exists(select 1 from auth.users u where u.id=p_actor) then
    raise exception using errcode='42501',message='IBERFIT_MEDIA_REVIEW_ACTOR_INVALID';
  end if;
  if coalesce(char_length(trim(p_operation_id)),0) not between 3 and 200 then
    raise exception using errcode='22023',message='IBERFIT_MEDIA_REVIEW_OPERATION_INVALID';
  end if;
  if p_action not in ('approve','reject','regenerate') then
    raise exception using errcode='22023',message='IBERFIT_MEDIA_REVIEW_ACTION_INVALID';
  end if;
  if p_action in ('reject','regenerate') and coalesce(char_length(trim(p_reason)),0) < 3 then
    raise exception using errcode='22023',message='IBERFIT_MEDIA_REVIEW_REASON_REQUIRED';
  end if;

  select * into v_existing
  from public.exercise_media_review_events
  where operation_id=p_operation_id
    and action=case p_action when 'approve' then 'publish_requested' when 'reject' then 'rejected' else 'regenerated' end
  limit 1;
  if found then
    return jsonb_build_object('ok',true,'kind','duplicate','jobId',v_existing.job_id,'exerciseId',v_existing.exercise_id,'action',p_action,'detail',v_existing.detail);
  end if;

  select * into v_job
  from public.exercise_media_jobs
  where id=p_job_id
  for update;
  if not found then raise exception using errcode='P0002',message='IBERFIT_MEDIA_REVIEW_JOB_NOT_FOUND'; end if;

  v_review:=coalesce(v_job.visual_spec->'review','{}'::jsonb);
  v_sha:=lower(coalesce(v_review->>'sha256',v_job.output_manifest#>>'{proof,delivery_sha256}',''));
  if v_job.status<>'qa' then raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_JOB_NOT_ELIGIBLE'; end if;
  if coalesce(v_review->>'automatic_qa','')<>'passed' then raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_AUTOMATIC_QA_REQUIRED'; end if;
  if v_sha !~ '^[0-9a-f]{64}$' then raise exception using errcode='22023',message='IBERFIT_MEDIA_REVIEW_SHA_INVALID'; end if;

  if p_action='approve' then
    if coalesce(v_review->>'state','') not in ('awaiting_human_approval','publish_failed') then
      raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_STATE_CONFLICT';
    end if;
    v_review:=v_review || jsonb_build_object(
      'state','publish_requested','human_approved',true,'approved_by',p_actor,'approved_at',v_now,
      'operation_id',p_operation_id,'reason',nullif(trim(p_reason),''),'publish_error',null
    );
    update public.exercise_media_jobs
    set visual_spec=jsonb_set(v_job.visual_spec,'{review}',v_review,true),last_error=null,updated_at=v_now
    where id=p_job_id;
    insert into public.exercise_media_review_events(job_id,exercise_id,action,operation_id,actor_user_id,candidate_sha256,reason,detail)
    values(v_job.id,v_job.exercise_id,'publish_requested',p_operation_id,p_actor,v_sha,nullif(trim(p_reason),''),jsonb_build_object('state','publish_requested'));
    return jsonb_build_object('ok',true,'kind','ack','jobId',v_job.id,'exerciseId',v_job.exercise_id,'action',p_action,'status','qa','reviewState','publish_requested','sha256',v_sha,'publicationQueued',true);
  end if;

  if coalesce(v_review->>'state','') not in ('awaiting_human_approval','publish_failed') then
    raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_STATE_CONFLICT';
  end if;

  if p_action='reject' then
    v_review:=v_review || jsonb_build_object(
      'state','rejected','human_approved',false,'rejected_by',p_actor,'rejected_at',v_now,
      'operation_id',p_operation_id,'reason',trim(p_reason)
    );
    update public.exercise_media_jobs
    set status='blocked',visual_spec=jsonb_set(v_job.visual_spec,'{review}',v_review,true),last_error='HUMAN_REJECTED',completed_at=v_now,updated_at=v_now
    where id=p_job_id;
    insert into public.exercise_media_review_events(job_id,exercise_id,action,operation_id,actor_user_id,candidate_sha256,reason,detail)
    values(v_job.id,v_job.exercise_id,'rejected',p_operation_id,p_actor,v_sha,trim(p_reason),jsonb_build_object('state','rejected'));
    return jsonb_build_object('ok',true,'kind','ack','jobId',v_job.id,'exerciseId',v_job.exercise_id,'action',p_action,'status','blocked');
  end if;

  v_review:=v_review || jsonb_build_object(
    'state','regeneration_requested','human_approved',false,'regenerated_by',p_actor,'regenerated_at',v_now,
    'operation_id',p_operation_id,'reason',trim(p_reason)
  );
  update public.exercise_media_jobs
  set status='blocked',visual_spec=jsonb_set(v_job.visual_spec,'{review}',v_review,true),last_error='HUMAN_REGENERATE_REQUESTED',completed_at=v_now,updated_at=v_now
  where id=p_job_id;

  insert into public.exercise_media_jobs(exercise_id,status,attempts,visual_spec,output_manifest,last_error,created_by,created_at,updated_at)
  values(
    v_job.exercise_id,'queued',0,
    jsonb_build_object(
      'schema','iberfit.exercise.media.auto-job.v1','visualSystem','iberfit.exercise.media.system.v1',
      'lineage',jsonb_build_object('parent_job_id',v_job.id,'reason','human_regeneration','requested_by',p_actor,'requested_at',v_now)
    ),
    '{}'::jsonb,null,p_actor,v_now,v_now
  ) returning id into v_child;

  insert into public.exercise_media_review_events(job_id,exercise_id,action,operation_id,actor_user_id,candidate_sha256,reason,detail)
  values(v_job.id,v_job.exercise_id,'regenerated',p_operation_id,p_actor,v_sha,trim(p_reason),jsonb_build_object('state','regeneration_requested','child_job_id',v_child));

  return jsonb_build_object('ok',true,'kind','ack','jobId',v_job.id,'exerciseId',v_job.exercise_id,'action',p_action,'status','blocked','childJobId',v_child);
end
$fn$;

create or replace function public.iberfit_admin_media_review_publish_claim_v1(
  p_workflow_run_id text,
  p_workflow_sha text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_job public.exercise_media_jobs%rowtype;
  v_review jsonb;
  v_sha text;
  v_operation_id text;
  v_actor uuid;
  v_now timestamptz:=now();
begin
  if coalesce(char_length(trim(p_workflow_run_id)),0) not between 1 and 100
     or coalesce(char_length(trim(p_workflow_sha)),0)<>40
     or lower(trim(p_workflow_sha)) !~ '^[0-9a-f]{40}$' then
    raise exception using errcode='22023',message='IBERFIT_MEDIA_REVIEW_WORKFLOW_IDENTITY_INVALID';
  end if;

  select * into v_job
  from public.exercise_media_jobs j
  where j.status='qa'
    and coalesce(j.visual_spec#>>'{review,automatic_qa}','')='passed'
    and (
      coalesce(j.visual_spec#>>'{review,state}','')='publish_requested'
      or (
        coalesce(j.visual_spec#>>'{review,state}','')='publishing'
        and coalesce((j.visual_spec#>>'{review,publish_claimed_at}')::timestamptz,'epoch'::timestamptz) < v_now - interval '30 minutes'
      )
    )
  order by j.updated_at asc,j.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('ok',true,'done',true,'claim',null);
  end if;

  v_review:=coalesce(v_job.visual_spec->'review','{}'::jsonb);
  v_sha:=lower(coalesce(v_review->>'sha256',v_job.output_manifest#>>'{proof,delivery_sha256}',''));
  v_operation_id:=coalesce(v_review->>'operation_id','');
  begin
    v_actor:=(v_review->>'approved_by')::uuid;
  exception when others then
    raise exception using errcode='42501',message='IBERFIT_MEDIA_REVIEW_ACTOR_INVALID';
  end;

  if not exists(select 1 from auth.users u where u.id=v_actor) then
    raise exception using errcode='42501',message='IBERFIT_MEDIA_REVIEW_ACTOR_INVALID';
  end if;
  if coalesce(char_length(trim(v_operation_id)),0) not between 3 and 200 then
    raise exception using errcode='22023',message='IBERFIT_MEDIA_REVIEW_OPERATION_INVALID';
  end if;
  if v_sha !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='IBERFIT_MEDIA_REVIEW_SHA_INVALID';
  end if;
  if coalesce(v_review#>>'{staging,delivery_path}','')='' then
    raise exception using errcode='22023',message='IBERFIT_MEDIA_REVIEW_STAGING_INVALID';
  end if;

  v_review:=v_review || jsonb_build_object(
    'state','publishing','publish_claimed_at',v_now,
    'publish_workflow_run_id',trim(p_workflow_run_id),'publish_workflow_sha',lower(trim(p_workflow_sha))
  );
  update public.exercise_media_jobs
  set visual_spec=jsonb_set(v_job.visual_spec,'{review}',v_review,true),updated_at=v_now
  where id=v_job.id;

  insert into public.exercise_media_review_events(job_id,exercise_id,action,operation_id,actor_user_id,candidate_sha256,detail)
  values(v_job.id,v_job.exercise_id,'publish_claimed',v_operation_id,v_actor,v_sha,
    jsonb_build_object('state','publishing','workflow_run_id',trim(p_workflow_run_id),'workflow_sha',lower(trim(p_workflow_sha))))
  on conflict(action,operation_id) do update
  set detail=excluded.detail,occurred_at=excluded.occurred_at;

  return jsonb_build_object(
    'ok',true,'done',false,
    'claim',jsonb_build_object(
      'jobId',v_job.id,'exerciseId',v_job.exercise_id,'actorUserId',v_actor,
      'operationId',v_operation_id,'sha256',v_sha,'review',v_review,
      'outputManifest',coalesce(v_job.output_manifest,'{}'::jsonb)
    )
  );
end
$fn$;

create or replace function public.iberfit_admin_media_review_publish_result_v1(
  p_job_id uuid,
  p_operation_id text,
  p_actor uuid,
  p_success boolean,
  p_error text default null,
  p_detail jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $fn$
declare
  v_job public.exercise_media_jobs%rowtype;
  v_review jsonb;
  v_sha text;
  v_now timestamptz:=now();
  v_action text:=case when p_success then 'publish_succeeded' else 'publish_failed' end;
  v_existing public.exercise_media_review_events%rowtype;
begin
  if p_actor is null or not exists(select 1 from auth.users u where u.id=p_actor) then
    raise exception using errcode='42501',message='IBERFIT_MEDIA_REVIEW_ACTOR_INVALID';
  end if;
  select * into v_existing from public.exercise_media_review_events where action=v_action and operation_id=p_operation_id limit 1;
  if found then return jsonb_build_object('ok',true,'kind','duplicate','jobId',v_existing.job_id,'action',v_action); end if;

  select * into v_job from public.exercise_media_jobs where id=p_job_id for update;
  if not found then raise exception using errcode='P0002',message='IBERFIT_MEDIA_REVIEW_JOB_NOT_FOUND'; end if;
  v_review:=coalesce(v_job.visual_spec->'review','{}'::jsonb);
  v_sha:=lower(coalesce(v_review->>'sha256',v_job.output_manifest#>>'{proof,delivery_sha256}',''));
  if v_job.status<>'qa' or coalesce(v_review->>'state','')<>'publishing' or coalesce(v_review->>'operation_id','')<>p_operation_id or coalesce(v_review->>'approved_by','')<>p_actor::text then
    raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_PUBLISH_STATE_CONFLICT';
  end if;

  if p_success then
    v_review:=v_review || jsonb_build_object('state','published','published_at',v_now,'publish_error',null);
    update public.exercise_media_jobs
    set status='ready',visual_spec=jsonb_set(v_job.visual_spec,'{review}',v_review,true),last_error=null,completed_at=v_now,updated_at=v_now
    where id=p_job_id;
  else
    v_review:=v_review || jsonb_build_object('state','publish_failed','publish_failed_at',v_now,'publish_error',left(coalesce(p_error,'UNKNOWN'),800));
    update public.exercise_media_jobs
    set visual_spec=jsonb_set(v_job.visual_spec,'{review}',v_review,true),last_error=left(coalesce(p_error,'HUMAN_PUBLISH_FAILED'),800),updated_at=v_now
    where id=p_job_id;
  end if;

  insert into public.exercise_media_review_events(job_id,exercise_id,action,operation_id,actor_user_id,candidate_sha256,detail)
  values(v_job.id,v_job.exercise_id,v_action,p_operation_id,p_actor,v_sha,coalesce(p_detail,'{}'::jsonb));
  return jsonb_build_object('ok',true,'kind','ack','jobId',v_job.id,'exerciseId',v_job.exercise_id,'action',v_action,'status',case when p_success then 'ready' else 'qa' end);
end
$fn$;

revoke all on function public.iberfit_admin_media_review_claim_v1(uuid,text,uuid,text,text) from public,anon,authenticated;
revoke all on function public.iberfit_admin_media_review_publish_claim_v1(text,text) from public,anon,authenticated;
revoke all on function public.iberfit_admin_media_review_publish_result_v1(uuid,text,uuid,boolean,text,jsonb) from public,anon,authenticated;
grant execute on function public.iberfit_admin_media_review_claim_v1(uuid,text,uuid,text,text) to service_role;
grant execute on function public.iberfit_admin_media_review_publish_claim_v1(text,text) to service_role;
grant execute on function public.iberfit_admin_media_review_publish_result_v1(uuid,text,uuid,boolean,text,jsonb) to service_role;

commit;