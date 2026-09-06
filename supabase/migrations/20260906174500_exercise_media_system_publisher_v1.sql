-- IBERFIT exercise media system finalizer.
-- Production automation path for a service-role broker authenticated with GitHub OIDC.
-- The existing human-admin finalizer remains unchanged.

create or replace function public.iberfit_finalize_exercise_media_system_v1(
  p_exercise_id text,
  p_manifest jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_path text;
  v_mime text;
  v_sha text;
  v_width text;
  v_height text;
  v_current_media jsonb;
  v_current_status text;
  v_revision bigint;
  v_updated integer := 0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'IBERFIT_SERVICE_ROLE_REQUIRED' using errcode='42501';
  end if;

  if p_exercise_id is null
     or length(p_exercise_id) not between 1 and 160
     or p_exercise_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$' then
    raise exception 'IBERFIT_MEDIA_EXERCISE_ID_INVALID' using errcode='22023';
  end if;

  if p_manifest is null or jsonb_typeof(p_manifest) <> 'object' then
    raise exception 'IBERFIT_MEDIA_MANIFEST_INVALID' using errcode='22023';
  end if;

  v_path := p_manifest->'movement'->>'path';
  v_mime := p_manifest->'movement'->>'mime';
  v_sha := lower(coalesce(p_manifest->'movement'->>'sha256',''));
  v_width := coalesce(p_manifest->'movement'->>'width','');
  v_height := coalesce(p_manifest->'movement'->>'height','');

  if p_manifest->>'schema' <> 'iberfit.exercise.visual.v1'
     or p_manifest->>'style' <> 'iberfit-premium-movement-pair-v1'
     or p_manifest->>'bucket' <> 'iberfit-exercise-media'
     or p_manifest->>'published' <> 'true'
     or p_manifest->'qa'->>'biomechanics' <> 'approved'
     or p_manifest->'qa'->>'visual' <> 'approved'
     or not (
       coalesce(p_manifest->>'coachVisible'='true',false)
       or coalesce(p_manifest->>'clientVisible'='true',false)
     )
     or v_path is null
     or length(v_path) not between 3 and 260
     or v_path not like p_exercise_id||'/%'
     or position('..' in v_path) > 0
     or array_length(string_to_array(v_path,'/'),1) <> 2
     or v_mime not in ('image/webp','image/png','image/jpeg')
     or v_sha !~ '^[0-9a-f]{64}$'
     or v_width !~ '^[1-9][0-9]{0,4}$'
     or v_height !~ '^[1-9][0-9]{0,4}$' then
    raise exception 'IBERFIT_MEDIA_MANIFEST_NOT_APPROVED' using errcode='22023';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id='iberfit-exercise-media'
      and o.name=v_path
  ) then
    raise exception 'IBERFIT_MEDIA_STORAGE_OBJECT_MISSING' using errcode='P0002';
  end if;

  select e.media,e.media_status,e.revision
    into v_current_media,v_current_status,v_revision
  from public.exercise_catalog e
  where e.id=p_exercise_id and e.active=true
  for update;

  if not found then
    raise exception 'IBERFIT_EXERCISE_NOT_FOUND' using errcode='P0002';
  end if;

  if v_current_status='aprobado' and v_current_media=p_manifest then
    return jsonb_build_object(
      'ok',true,
      'exerciseId',p_exercise_id,
      'mediaStatus','aprobado',
      'revision',v_revision,
      'idempotent',true
    );
  end if;

  update public.exercise_catalog
     set media=p_manifest,
         media_status='aprobado',
         revision=revision+1,
         updated_at=now()
   where id=p_exercise_id and active=true;
  get diagnostics v_updated=row_count;

  if v_updated <> 1 then
    raise exception 'IBERFIT_EXERCISE_NOT_FOUND' using errcode='P0002';
  end if;

  update public.exercise_media_jobs
     set status='ready',
         output_manifest=p_manifest,
         last_error=null,
         completed_at=now(),
         updated_at=now()
   where exercise_id=p_exercise_id
     and status in ('queued','generating','qa');

  select revision into v_revision
  from public.exercise_catalog
  where id=p_exercise_id;

  return jsonb_build_object(
    'ok',true,
    'exerciseId',p_exercise_id,
    'mediaStatus','aprobado',
    'revision',v_revision,
    'idempotent',false
  );
end
$function$;

revoke all on function public.iberfit_finalize_exercise_media_system_v1(text,jsonb)
  from public, anon, authenticated;
grant execute on function public.iberfit_finalize_exercise_media_system_v1(text,jsonb)
  to service_role;

comment on function public.iberfit_finalize_exercise_media_system_v1(text,jsonb)
  is 'Fail-closed service-role finalizer used only by the GitHub-OIDC exercise-media publisher broker.';
