-- IBERFIT Media Review · allow explicit human regeneration from failed/blocked jobs.
-- Approval and rejection remain restricted to automatic-QA candidates.
-- The RPC remains service-role-only; browser roles cannot execute it directly.

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
    return jsonb_build_object(
      'ok',true,'kind','duplicate','jobId',v_existing.job_id,'exerciseId',v_existing.exercise_id,
      'action',p_action,'detail',v_existing.detail
    );
  end if;

  select * into v_job
  from public.exercise_media_jobs
  where id=p_job_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='IBERFIT_MEDIA_REVIEW_JOB_NOT_FOUND';
  end if;

  v_review:=coalesce(v_job.visual_spec->'review','{}'::jsonb);
  v_sha:=lower(coalesce(v_review->>'sha256',v_job.output_manifest#>>'{proof,delivery_sha256}',''));

  if p_action in ('approve','reject') then
    if v_job.status<>'qa' then
      raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_JOB_NOT_ELIGIBLE';
    end if;
    if coalesce(v_review->>'automatic_qa','')<>'passed' then
      raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_AUTOMATIC_QA_REQUIRED';
    end if;
    if v_sha !~ '^[0-9a-f]{64}$' then
      raise exception using errcode='22023',message='IBERFIT_MEDIA_REVIEW_SHA_INVALID';
    end if;
    if coalesce(v_review->>'state','') not in ('awaiting_human_approval','publish_failed') then
      raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_STATE_CONFLICT';
    end if;
  elsif p_action='regenerate' then
    if v_job.status='qa' then
      if coalesce(v_review->>'automatic_qa','')<>'passed' then
        raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_AUTOMATIC_QA_REQUIRED';
      end if;
      if v_sha !~ '^[0-9a-f]{64}$' then
        raise exception using errcode='22023',message='IBERFIT_MEDIA_REVIEW_SHA_INVALID';
      end if;
      if coalesce(v_review->>'state','') not in ('awaiting_human_approval','publish_failed') then
        raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_STATE_CONFLICT';
      end if;
    elsif v_job.status not in ('failed','blocked') then
      raise exception using errcode='40001',message='IBERFIT_MEDIA_REVIEW_JOB_NOT_ELIGIBLE';
    end if;
  end if;

  if p_action='approve' then
    v_review:=v_review || jsonb_build_object(
      'state','publish_requested','human_approved',true,'approved_by',p_actor,'approved_at',v_now,
      'operation_id',p_operation_id,'reason',nullif(trim(p_reason),''),'publish_error',null
    );
    update public.exercise_media_jobs
    set visual_spec=jsonb_set(v_job.visual_spec,'{review}',v_review,true),last_error=null,updated_at=v_now
    where id=p_job_id;

    insert into public.exercise_media_review_events(
      job_id,exercise_id,action,operation_id,actor_user_id,candidate_sha256,reason,detail
    )
    values(
      v_job.id,v_job.exercise_id,'publish_requested',p_operation_id,p_actor,v_sha,
      nullif(trim(p_reason),''),jsonb_build_object('state','publish_requested')
    );

    return jsonb_build_object(
      'ok',true,'kind','ack','jobId',v_job.id,'exerciseId',v_job.exercise_id,'action',p_action,
      'status','qa','reviewState','publish_requested','sha256',v_sha,'publicationQueued',true
    );
  end if;

  if p_action='reject' then
    v_review:=v_review || jsonb_build_object(
      'state','rejected','human_approved',false,'rejected_by',p_actor,'rejected_at',v_now,
      'operation_id',p_operation_id,'reason',trim(p_reason)
    );
    update public.exercise_media_jobs
    set status='blocked',
        visual_spec=jsonb_set(v_job.visual_spec,'{review}',v_review,true),
        last_error='HUMAN_REJECTED',
        completed_at=v_now,
        updated_at=v_now
    where id=p_job_id;

    insert into public.exercise_media_review_events(
      job_id,exercise_id,action,operation_id,actor_user_id,candidate_sha256,reason,detail
    )
    values(
      v_job.id,v_job.exercise_id,'rejected',p_operation_id,p_actor,v_sha,trim(p_reason),
      jsonb_build_object('state','rejected')
    );

    return jsonb_build_object(
      'ok',true,'kind','ack','jobId',v_job.id,'exerciseId',v_job.exercise_id,
      'action',p_action,'status','blocked'
    );
  end if;

  v_review:=v_review || jsonb_build_object(
    'state','regeneration_requested','human_approved',false,'regenerated_by',p_actor,'regenerated_at',v_now,
    'operation_id',p_operation_id,'reason',trim(p_reason)
  );

  update public.exercise_media_jobs
  set status='blocked',
      visual_spec=jsonb_set(v_job.visual_spec,'{review}',v_review,true),
      last_error='HUMAN_REGENERATE_REQUESTED',
      completed_at=v_now,
      updated_at=v_now
  where id=p_job_id;

  insert into public.exercise_media_jobs(
    exercise_id,status,attempts,visual_spec,output_manifest,last_error,created_by,created_at,updated_at
  )
  values(
    v_job.exercise_id,'queued',0,
    jsonb_build_object(
      'schema','iberfit.exercise.media.auto-job.v1',
      'visualSystem','iberfit.exercise.media.system.v1',
      'lineage',jsonb_build_object(
        'parent_job_id',v_job.id,
        'reason','human_regeneration',
        'requested_by',p_actor,
        'requested_at',v_now
      )
    ),
    '{}'::jsonb,null,p_actor,v_now,v_now
  )
  returning id into v_child;

  insert into public.exercise_media_review_events(
    job_id,exercise_id,action,operation_id,actor_user_id,candidate_sha256,reason,detail
  )
  values(
    v_job.id,v_job.exercise_id,'regenerated',p_operation_id,p_actor,nullif(v_sha,''),trim(p_reason),
    jsonb_build_object('state','regeneration_requested','child_job_id',v_child,'source_status',v_job.status)
  );

  return jsonb_build_object(
    'ok',true,'kind','ack','jobId',v_job.id,'exerciseId',v_job.exercise_id,
    'action',p_action,'status','blocked','childJobId',v_child
  );
end
$fn$;

revoke all on function public.iberfit_admin_media_review_claim_v1(uuid,text,uuid,text,text)
from public,anon,authenticated;
grant execute on function public.iberfit_admin_media_review_claim_v1(uuid,text,uuid,text,text)
to service_role;
