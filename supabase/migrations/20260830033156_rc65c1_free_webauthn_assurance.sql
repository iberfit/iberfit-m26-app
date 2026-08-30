create table if not exists public.iberfit_webauthn_credentials_v1 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique
    check (length(credential_id) between 1 and 4096 and credential_id ~ '^[A-Za-z0-9_-]+$'),
  public_key_b64 text not null
    check (length(public_key_b64) between 1 and 16384 and public_key_b64 ~ '^[A-Za-z0-9_-]+$'),
  counter bigint not null default 0 check (counter >= 0),
  transports text[] not null default '{}'::text[],
  device_type text null check (device_type is null or device_type in ('singleDevice','multiDevice')),
  backed_up boolean not null default false,
  friendly_name text null check (friendly_name is null or length(friendly_name) <= 120),
  created_at timestamptz not null default now(),
  last_used_at timestamptz null,
  revoked_at timestamptz null,
  unique (user_id, credential_id)
);

create index if not exists iberfit_webauthn_credentials_v1_user_active_idx
  on public.iberfit_webauthn_credentials_v1(user_id)
  where revoked_at is null;

create table if not exists public.iberfit_webauthn_challenges_v1 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  ceremony text not null check (ceremony in ('registration','authentication')),
  challenge text not null
    check (length(challenge) between 16 and 2048 and challenge ~ '^[A-Za-z0-9_-]+$'),
  origin text not null
    check (origin = 'https://m26-canary.iberfit.cl'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  check (expires_at > created_at)
);

create index if not exists iberfit_webauthn_challenges_v1_lookup_idx
  on public.iberfit_webauthn_challenges_v1(user_id, session_id, ceremony, expires_at)
  where consumed_at is null;

create table if not exists public.iberfit_privileged_assurance_v1 (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  credential_id text not null references public.iberfit_webauthn_credentials_v1(credential_id),
  verified_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  primary key (user_id, session_id),
  check (expires_at > verified_at)
);

create index if not exists iberfit_privileged_assurance_v1_active_idx
  on public.iberfit_privileged_assurance_v1(user_id, session_id, expires_at)
  where revoked_at is null;

alter table public.iberfit_webauthn_credentials_v1 enable row level security;
alter table public.iberfit_webauthn_challenges_v1 enable row level security;
alter table public.iberfit_privileged_assurance_v1 enable row level security;

revoke all on table public.iberfit_webauthn_credentials_v1 from public, anon, authenticated;
revoke all on table public.iberfit_webauthn_challenges_v1 from public, anon, authenticated;
revoke all on table public.iberfit_privileged_assurance_v1 from public, anon, authenticated;

grant select, insert, update, delete on table public.iberfit_webauthn_credentials_v1 to service_role;
grant select, insert, update, delete on table public.iberfit_webauthn_challenges_v1 to service_role;
grant select, insert, update, delete on table public.iberfit_privileged_assurance_v1 to service_role;

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
  v_supabase_aal text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;

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

  if v_privileged_role is not null then
    select exists(
      select 1
      from public.iberfit_webauthn_credentials_v1 c
      where c.user_id=v_user and c.revoked_at is null
    ) into v_enrolled;

    if v_session is not null then
      select exists(
        select 1 from auth.sessions s
        where s.id=v_session and s.user_id=v_user
      ) into v_session_active;

      if v_session_active then
        select a.verified_at,a.expires_at
        into v_verified_at,v_expires_at
        from public.iberfit_privileged_assurance_v1 a
        join public.iberfit_webauthn_credentials_v1 c
          on c.credential_id=a.credential_id
         and c.user_id=a.user_id
         and c.revoked_at is null
        where a.user_id=v_user
          and a.session_id=v_session
          and a.revoked_at is null
          and a.expires_at>now()
        limit 1;
        v_verified:=v_verified_at is not null;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'privileged',v_privileged_role is not null,
    'privilegedRole',v_privileged_role,
    'mfaRequired',v_privileged_role is not null,
    'webauthnRequired',v_privileged_role is not null,
    'credentialEnrolled',case when v_privileged_role is null then false else v_enrolled end,
    'iberfitAssurance',case
      when v_privileged_role is null then 'not-required'
      when v_verified then 'verified'
      else 'required'
    end,
    'verifiedAt',case when v_verified then v_verified_at else null end,
    'expiresAt',case when v_verified then v_expires_at else null end,
    'supabaseAal',v_supabase_aal
  );
end
$function$;

revoke all on function public.iberfit_privileged_assurance_context_v65d() from public;
revoke all on function public.iberfit_privileged_assurance_context_v65d() from anon;
grant execute on function public.iberfit_privileged_assurance_context_v65d() to authenticated;

comment on function public.iberfit_privileged_assurance_context_v65d() is
'RC65-C1 FREE. Server-side privileged assurance backed by IBERFIT-managed WebAuthn. Supabase aal is diagnostic only and is never promoted or spoofed.';

create or replace function public.iberfit_require_privileged_assurance_v65d()
returns void
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_context jsonb;
begin
  v_context:=public.iberfit_privileged_assurance_context_v65d();
  if coalesce((v_context->>'privileged')::boolean,false)
     and coalesce(v_context->>'iberfitAssurance','required')<>'verified' then
    raise exception 'IBERFIT_PRIVILEGED_WEBAUTHN_REQUIRED' using errcode='42501';
  end if;
end
$function$;

revoke all on function public.iberfit_require_privileged_assurance_v65d() from public;
revoke all on function public.iberfit_require_privileged_assurance_v65d() from anon;
revoke all on function public.iberfit_require_privileged_assurance_v65d() from authenticated;

comment on function public.iberfit_require_privileged_assurance_v65d() is
'RC65-C1 FREE helper for C2/C3 privileged RPC enforcement. Intended for server-side composition, not direct client execution.';
