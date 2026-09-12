-- P0: one-time privileged WebAuthn recovery authorized only by a fresh
-- Supabase password-recovery session (JWT amr.method = recovery).

create table if not exists public.iberfit_webauthn_recovery_receipts_v1 (
  session_id uuid primary key,
  user_id uuid not null,
  consumed_at timestamptz not null default now(),
  credentials_revoked integer not null default 0 check (credentials_revoked >= 0),
  assurance_revoked integer not null default 0 check (assurance_revoked >= 0)
);

alter table public.iberfit_webauthn_recovery_receipts_v1 enable row level security;
revoke all on table public.iberfit_webauthn_recovery_receipts_v1 from public,anon,authenticated;

create or replace function public.iberfit_recover_privileged_device_v1()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_claims jsonb:=coalesce(auth.jwt(),'{}'::jsonb);
  v_session_id uuid;
  v_context jsonb;
  v_roles jsonb;
  v_required boolean:=false;
  v_recovery_ts bigint;
  v_now bigint:=floor(extract(epoch from now()))::bigint;
  v_inserted integer:=0;
  v_credentials integer:=0;
  v_assurance integer:=0;
  v_rows integer:=0;
begin
  if v_user_id is null then
    raise exception 'M26_WEBAUTHN_RECOVERY_AUTH_REQUIRED' using errcode='42501';
  end if;

  begin
    v_session_id:=nullif(v_claims->>'session_id','')::uuid;
  exception when others then
    raise exception 'M26_WEBAUTHN_RECOVERY_SESSION_INVALID' using errcode='42501';
  end;
  if v_session_id is null then
    raise exception 'M26_WEBAUTHN_RECOVERY_SESSION_INVALID' using errcode='42501';
  end if;

  select max((item->>'timestamp')::bigint)
    into v_recovery_ts
  from jsonb_array_elements(
    case
      when jsonb_typeof(v_claims->'amr')='array' then v_claims->'amr'
      else '[]'::jsonb
    end
  ) item
  where item->>'method'='recovery'
    and coalesce(item->>'timestamp','') ~ '^[0-9]{1,20}$';

  if v_recovery_ts is null
     or v_recovery_ts > v_now + 60
     or v_now - v_recovery_ts > 900 then
    raise exception 'M26_WEBAUTHN_RECOVERY_PROOF_REQUIRED' using errcode='42501';
  end if;

  v_context:=public.iberfit_application_context_v14();
  if not coalesce((v_context->>'ok')::boolean,false) then
    raise exception 'M26_WEBAUTHN_RECOVERY_CONTEXT_REQUIRED' using errcode='42501';
  end if;
  v_roles:=coalesce(v_context->'roles','[]'::jsonb);
  v_required:=v_roles?'admin' or v_roles?'coach';

  if not v_required then
    return jsonb_build_object(
      'ok',true,
      'required',false,
      'reset',false,
      'kind','not-required'
    );
  end if;

  insert into public.iberfit_webauthn_recovery_receipts_v1(session_id,user_id)
  values(v_session_id,v_user_id)
  on conflict (session_id) do nothing;
  get diagnostics v_inserted=row_count;

  if v_inserted=0 then
    return jsonb_build_object(
      'ok',true,
      'required',true,
      'reset',true,
      'kind','duplicate'
    );
  end if;

  update public.iberfit_webauthn_credentials_v1
  set revoked_at=coalesce(revoked_at,now())
  where user_id=v_user_id and revoked_at is null;
  get diagnostics v_credentials=row_count;

  delete from public.iberfit_webauthn_challenges_v1
  where user_id=v_user_id;

  update public.iberfit_privileged_assurance_v1
  set revoked_at=coalesce(revoked_at,now())
  where user_id=v_user_id and revoked_at is null;
  get diagnostics v_rows=row_count;
  v_assurance:=v_assurance+coalesce(v_rows,0);

  update public.iberfit_email_privileged_assurance_v1
  set revoked_at=coalesce(revoked_at,now())
  where user_id=v_user_id and revoked_at is null;
  get diagnostics v_rows=row_count;
  v_assurance:=v_assurance+coalesce(v_rows,0);

  update public.iberfit_webauthn_recovery_receipts_v1
  set credentials_revoked=v_credentials,
      assurance_revoked=v_assurance
  where session_id=v_session_id and user_id=v_user_id;

  return jsonb_build_object(
    'ok',true,
    'required',true,
    'reset',true,
    'kind','ack',
    'credentialsRevoked',v_credentials,
    'assuranceRevoked',v_assurance
  );
end
$function$;

revoke all on function public.iberfit_recover_privileged_device_v1() from public,anon;
grant execute on function public.iberfit_recover_privileged_device_v1() to authenticated;
