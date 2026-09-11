-- IBERFIT P0 · privileged email OTP assurance fallback
-- Additive fallback: preserves WebAuthn and existing server-side privileged enforcement.

create table if not exists public.iberfit_email_privileged_assurance_v1 (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  otp_session_id uuid not null unique,
  origin text not null check (origin in (
    'https://m26-canary.iberfit.cl',
    'https://app.iberfit.cl',
    'https://coach.iberfit.cl'
  )),
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  primary key (user_id, session_id),
  check (expires_at > verified_at)
);

create index if not exists iberfit_email_privileged_assurance_v1_active_idx
  on public.iberfit_email_privileged_assurance_v1(user_id,session_id,origin,expires_at)
  where revoked_at is null;

alter table public.iberfit_email_privileged_assurance_v1 enable row level security;
revoke all on table public.iberfit_email_privileged_assurance_v1 from public,anon,authenticated;
grant select,insert,update,delete on table public.iberfit_email_privileged_assurance_v1 to service_role;

create or replace function public.iberfit_privileged_assurance_context_v65d()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user uuid:=auth.uid();
  v_context jsonb;
  v_roles jsonb;
  v_privileged_role text;
  v_session_text text:=nullif(auth.jwt()->>'session_id','');
  v_session uuid;
  v_session_active boolean:=false;
  v_enrolled boolean:=false;
  v_verified boolean:=false;
  v_verified_at timestamptz;
  v_expires_at timestamptz;
  v_assurance_method text;
  v_webauthn_verified_at timestamptz;
  v_webauthn_expires_at timestamptz;
  v_email_verified_at timestamptz;
  v_email_expires_at timestamptz;
  v_supabase_aal text;
  v_request_headers jsonb:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_origin text;
  v_rp_id text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

  v_origin:=lower(trim(coalesce(v_request_headers->>'origin','')));
  v_rp_id:=case v_origin
    when 'https://m26-canary.iberfit.cl' then 'm26-canary.iberfit.cl'
    when 'https://app.iberfit.cl' then 'app.iberfit.cl'
    when 'https://coach.iberfit.cl' then 'coach.iberfit.cl'
    else null
  end;

  if v_session_text is not null then
    begin
      v_session:=v_session_text::uuid;
    exception when others then
      v_session:=null;
    end;
  end if;

  v_context:=public.iberfit_application_context_v14();
  v_roles:=coalesce(v_context->'roles','[]'::jsonb);
  v_privileged_role:=case when v_roles ? 'admin' then 'admin' when v_roles ? 'coach' then 'coach' else null end;
  v_supabase_aal:=case coalesce(auth.jwt()->>'aal','aal1') when 'aal2' then 'aal2' else 'aal1' end;

  if v_privileged_role is not null and v_rp_id is not null then
    select exists(
      select 1
      from public.iberfit_webauthn_credentials_v1 c
      where c.user_id=v_user
        and c.rp_id=v_rp_id
        and c.revoked_at is null
    ) into v_enrolled;

    if v_session is not null then
      select exists(
        select 1 from auth.sessions s
        where s.id=v_session and s.user_id=v_user
      ) into v_session_active;

      if v_session_active then
        select a.verified_at,a.expires_at
        into v_webauthn_verified_at,v_webauthn_expires_at
        from public.iberfit_privileged_assurance_v1 a
        join public.iberfit_webauthn_credentials_v1 c
          on c.credential_id=a.credential_id
         and c.user_id=a.user_id
         and c.rp_id=v_rp_id
         and c.revoked_at is null
        where a.user_id=v_user
          and a.session_id=v_session
          and a.revoked_at is null
          and a.expires_at>now()
        order by a.verified_at desc
        limit 1;

        select a.verified_at,a.expires_at
        into v_email_verified_at,v_email_expires_at
        from public.iberfit_email_privileged_assurance_v1 a
        where a.user_id=v_user
          and a.session_id=v_session
          and a.origin=v_origin
          and a.revoked_at is null
          and a.expires_at>now()
        order by a.verified_at desc
        limit 1;

        if v_webauthn_verified_at is not null and
           (v_email_verified_at is null or v_webauthn_verified_at>=v_email_verified_at) then
          v_verified:=true;
          v_verified_at:=v_webauthn_verified_at;
          v_expires_at:=v_webauthn_expires_at;
          v_assurance_method:='webauthn';
        elsif v_email_verified_at is not null then
          v_verified:=true;
          v_verified_at:=v_email_verified_at;
          v_expires_at:=v_email_expires_at;
          v_assurance_method:='email_otp';
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'privileged',v_privileged_role is not null,
    'privilegedRole',v_privileged_role,
    'mfaRequired',v_privileged_role is not null,
    'webauthnRequired',v_privileged_role is not null,
    'emailOtpAvailable',v_privileged_role is not null and v_rp_id is not null,
    'credentialEnrolled',case when v_privileged_role is null then false else v_enrolled end,
    'iberfitAssurance',case
      when v_privileged_role is null then 'not-required'
      when v_verified then 'verified'
      else 'required'
    end,
    'assuranceMethod',case when v_verified then v_assurance_method else null end,
    'verifiedAt',case when v_verified then v_verified_at else null end,
    'expiresAt',case when v_verified then v_expires_at else null end,
    'supabaseAal',v_supabase_aal,
    'origin',case when v_rp_id is null then null else v_origin end,
    'rpId',v_rp_id
  );
end
$function$;

revoke all on function public.iberfit_privileged_assurance_context_v65d() from public;
revoke all on function public.iberfit_privileged_assurance_context_v65d() from anon;
grant execute on function public.iberfit_privileged_assurance_context_v65d() to authenticated;

comment on table public.iberfit_email_privileged_assurance_v1 is
'IBERFIT privileged fallback assurance. Requires a distinct recent password session plus a distinct email OTP session verified server-side.';
comment on function public.iberfit_privileged_assurance_context_v65d() is
'IBERFIT privileged assurance: WebAuthn preferred, email OTP fallback accepted only when bound server-side to the same user, password session and origin.';
