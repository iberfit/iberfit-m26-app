-- QA ONLY: run on gjztkdwfmunnzhtvxrsu. Database-role certification,
-- not an HTTP login. Every fixture, role and assurance change rolls back.
begin;
do $test$
declare
  actor uuid;
  org uuid;
  coach uuid;
  session uuid:=gen_random_uuid();
  operation text:='qa-iri-only-'||gen_random_uuid()::text;
  command jsonb;
  result jsonb;
  client text;
  snapshot jsonb;
  iri_before jsonb;
  denied boolean;
  coach_before integer;
begin
  select m.user_id,m.organization_id into actor,org
  from public.iberfit_organization_memberships m
  join public.user_profiles p on p.user_id=m.user_id
  where m.status='active' and lower(p.role::text) in ('admin','coach') order by m.user_id limit 1;
  if actor is null then raise exception 'QA_ACTIVE_MEMBER_REQUIRED'; end if;
  select m.user_id into coach from public.iberfit_organization_memberships m
  join public.user_profiles p on p.user_id=m.user_id
  where m.organization_id=org and m.status='active' and lower(p.role::text) in ('coach','entrenador') limit 1;
  insert into public.user_application_roles(user_id,role,active,granted_by)
  values(actor,'admin',true,actor) on conflict(user_id,role) do update set active=true;
  if coach is not null then
    insert into public.user_application_roles(user_id,role,active,granted_by)
    values(coach,'coach',true,actor) on conflict(user_id,role) do update set active=true;
  end if;
  insert into auth.sessions(id,user_id) values(session,actor);
  insert into public.iberfit_email_privileged_assurance_v1(user_id,session_id,otp_session_id,origin,verified_at,expires_at)
  values(actor,session,gen_random_uuid(),'https://m26-canary.iberfit.cl',now(),now()+interval '5 minutes');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',session,'aal','aal1')::text,true);
  perform set_config('request.headers','{"origin":"https://m26-canary.iberfit.cl"}',true);
  command:=jsonb_build_object('operationId',operation,'type','ADMIN_CLIENTE_CREAR','payload',jsonb_build_object(
    'name','QA Solo IRI transaction','email',operation||'@example.invalid',
    'initialLifecycleStatus','iri_only','initialAssessmentMode','iri',
    'coachUserId',coach,'modality','Presencial','objective','Evaluación independiente'));
  select (e->>'clientCount')::integer into coach_before from jsonb_array_elements(public.iberfit_admin_bootstrap_v14()#>'{data,coachProfiles}') e where e->>'userId'=coach::text;
  result:=public.iberfit_admin_execute_v14(command);
  client:=result->>'clientId';
  if client is null or result->>'initialLifecycleStatus'<>'iri_only' then raise exception 'QA_IRI_ONLY_CREATE_FAILED'; end if;
  if (public.iberfit_admin_execute_v14(command)->>'kind')<>'duplicate' then raise exception 'QA_IRI_ONLY_REPLAY_FAILED'; end if;
  if not exists(select 1 from public.iberfit_client_lifecycle_events where client_id=client and status='iri_only') then raise exception 'QA_IRI_ONLY_LIFECYCLE_FAILED'; end if;
  snapshot:=public.iberfit_admin_bootstrap_v14();
  if coach is not null and (select (e->>'clientCount')::integer from jsonb_array_elements(snapshot#>'{data,coachProfiles}') e where e->>'userId'=coach::text) is distinct from coach_before then raise exception 'QA_IRI_ONLY_COACH_COUNT_POLLUTED'; end if;
  if not exists(select 1 from jsonb_array_elements(snapshot#>'{data,clientLifecycle}') e where e->>'client_id'=client and e->>'status'='iri_only') then raise exception 'QA_IRI_ONLY_ADMIN_PROJECTION_FAILED'; end if;
  if coach is not null and not exists(select 1 from public.iberfit_coach_client_assignments where client_id=client and coach_user_id=coach and status='active') then raise exception 'QA_IRI_ONLY_ASSIGNMENT_LOST'; end if;
  if not exists(select 1 from jsonb_array_elements(public.iberfit_bootstrap_v26()#>'{data,clients}') e where e->>'id'=client and e->>'lifecycleStatus'='iri_only') then raise exception 'QA_SCOPED_LIFECYCLE_PROJECTION_FAILED'; end if;
  select jsonb_agg(to_jsonb(i) order by i.id) into iri_before from public.iri_assessments i where client_id=client::uuid;
  if jsonb_array_length(iri_before)<>1 then raise exception 'QA_UNIQUE_INITIAL_IRI_REQUIRED'; end if;
  perform public.iberfit_admin_execute_v14(jsonb_build_object('operationId',operation||'-active','type','ADMIN_CLIENTE_CAMBIAR_CICLO','reason','QA conversion without new person','payload',jsonb_build_object('clientId',client,'status','active')));
  if (select count(*) from public.clients where id=client::uuid)<>1 then raise exception 'QA_CONVERSION_DUPLICATED_PERSON'; end if;
  if (public.iberfit_admin_bootstrap_v14()#>>'{analytics,activeClients}')::integer<>(snapshot#>>'{analytics,activeClients}')::integer+1 then raise exception 'QA_ACTIVE_METRICS_FAILED'; end if;
  if iri_before is distinct from (select jsonb_agg(to_jsonb(i) order by i.id) from public.iri_assessments i where client_id=client::uuid) then raise exception 'QA_CONVERSION_CHANGED_INITIAL_IRI'; end if;
  denied:=false;
  begin
    perform public.iberfit_admin_execute_v14(jsonb_set(jsonb_set(command,'{operationId}',to_jsonb(operation||'-real')),'{payload,email}',to_jsonb(operation||'@iberfit.cl')));
  exception when others then denied:=SQLERRM in ('V12_CLIENT_CREATE_ENVIRONMENT_BLOCKED','V12_PRODUCTION_ENVIRONMENT_REQUIRED','V12_REAL_DATA_NOT_ALLOWED','V12_PRODUCTION_BLOCKED','El entorno productivo no está autorizado para el alta'); end;
  if not denied then raise exception 'QA_REAL_EMAIL_GUARD_FAILED'; end if;
  perform set_config('request.headers','{"origin":"https://wrong.example.invalid"}',true);
  denied:=false;
  begin
    perform public.iberfit_admin_execute_v14(jsonb_set(command,'{operationId}',to_jsonb(operation||'-origin')));
  exception when others then denied:=true; end;
  if not denied then raise exception 'QA_ORIGIN_GUARD_FAILED'; end if;
  if has_function_privilege('anon','public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.iberfit_admin_create_client_v26_pre_privileged_assurance(jsonb,jsonb)','EXECUTE') then raise exception 'QA_INTERNAL_HELPER_EXPOSED'; end if;
end
$test$;
select 'iri_only create/replay/convert/metrics/assignment/unique IRI/scoped projection/QA guards/private helper: PASS; fixtures rolled back' as certification;
rollback;
