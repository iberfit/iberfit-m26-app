-- Disposable PG17 legacy context fixture. Identity/assurance adapters are
-- synthetic, not hosted Auth. V46/V47 storage and candidate installers run unmodified.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
CREATE SCHEMA gx_test;
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users,not_after timestamptz);
CREATE TABLE public.clients(id uuid PRIMARY KEY);
CREATE TABLE public.user_profiles(user_id uuid PRIMARY KEY REFERENCES auth.users,client_id uuid REFERENCES public.clients,role text NOT NULL,display_name text);
CREATE TABLE public.user_application_roles(user_id uuid,role text,active boolean);
CREATE TABLE public.iberfit_organization_memberships(user_id uuid,organization_id uuid,status text);
CREATE TABLE public.client_assignments(client_id uuid,coach_user_id uuid,active boolean,created_at timestamptz,PRIMARY KEY(client_id,coach_user_id));
CREATE TABLE public.iberfit_coach_client_assignments(id uuid PRIMARY KEY,client_id text,coach_user_id uuid,organization_id uuid,status text,revision int,starts_at date,ends_at date);
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('gx_test.jwt',true),''),'{}')::jsonb $$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(auth.jwt()->>'sub','')::uuid $$;
CREATE FUNCTION public.iberfit_client_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT client_id FROM public.user_profiles WHERE user_id=auth.uid() $$;
CREATE FUNCTION public.iberfit_current_role_v26() RETURNS text LANGUAGE sql STABLE AS $$ SELECT CASE role WHEN 'client' THEN 'cliente' ELSE role END FROM public.user_profiles WHERE user_id=auth.uid() $$;
CREATE FUNCTION public.iberfit_application_context_v14() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('organizationId',m.organization_id,'membershipStatus',m.status,'roles',jsonb_build_array(p.role)) FROM public.iberfit_organization_memberships m JOIN public.user_profiles p ON p.user_id=m.user_id WHERE m.user_id=auth.uid() $$;
CREATE FUNCTION public.iberfit_require_privileged_assurance_v65d() RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF current_setting('gx_test.assured',true) IS DISTINCT FROM 'yes' THEN RAISE EXCEPTION 'synthetic assurance required' USING ERRCODE='42501'; END IF; END $$;
CREATE FUNCTION public.is_assigned_coach(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.client_assignments a WHERE a.client_id=c AND a.coach_user_id=auth.uid() AND a.active) $$;
CREATE FUNCTION public.iberfit_can_access_client_v26(c uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.is_assigned_coach(c) OR c=public.iberfit_client_id() $$;
CREATE FUNCTION gx_test.actor(who uuid, assured boolean DEFAULT true) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('gx_test.jwt',jsonb_build_object('sub',who,'role','authenticated','session_id',(SELECT id FROM auth.sessions WHERE user_id=who))::text,false); PERFORM set_config('gx_test.assured',CASE WHEN assured THEN 'yes' ELSE 'no' END,false); END $$;
CREATE FUNCTION gx_test.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'GX_TEST_FAILED: %',label; END IF; END $$;
CREATE FUNCTION gx_test.expect_error(statement text,code text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=code THEN RETURN; END IF; RAISE; END; RAISE EXCEPTION 'GX_TEST_EXPECTED_DENIAL: %',label; END $$;
GRANT USAGE ON SCHEMA gx_test TO authenticated;
CREATE TABLE public.m26_wearable_daily_summaries_v44(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.m26_wearable_consents_v44(actor_user_id uuid,client_id uuid,provider text,action text);
CREATE TABLE public.m26_wearable_connections_v44(owner_user_id uuid,client_id uuid,provider text,status text,sync_enabled boolean);
CREATE TABLE public.m26_wearable_revocation_events_v2(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,owner_user_id uuid,client_id uuid,provider text);
-- The original V5 migration supplies the provider grant table and its RLS.
-- Only legacy status lookup is an adapter; the V46+ provider writers and gates are real.
CREATE FUNCTION public.m26_wearable_authorization_status_v2(p text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO '' AS $f$
DECLARE v_result jsonb;
BEGIN
 SELECT jsonb_build_object('authorized',a.revocation_cursor>=coalesce((SELECT max(e.id) FROM public.m26_wearable_revocation_events_v2 e WHERE e.owner_user_id=a.owner_user_id AND e.client_id=a.client_id AND e.provider IN (p,'*')),0),'grantId',a.grant_id,'revocationCursor',a.revocation_cursor,'scopes',a.scopes)
 INTO v_result FROM public.m26_wearable_authorization_sources_v3 a WHERE a.owner_user_id=auth.uid() AND a.client_id=public.iberfit_client_id() AND a.provider=p;
 RETURN coalesce(v_result,'{"authorized":false}'::jsonb);
END;
$f$;
INSERT INTO auth.users VALUES ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
INSERT INTO auth.sessions SELECT ('20000000-0000-4000-8000-00000000000'||right(id::text,1))::uuid,id,now()+interval '1 hour' FROM auth.users;
INSERT INTO clients VALUES ('30000000-0000-4000-8000-000000000001'),('30000000-0000-4000-8000-000000000002');
INSERT INTO user_profiles VALUES ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','client','Synthetic owner A'),('10000000-0000-4000-8000-000000000002',NULL,'coach','Synthetic Coach A'),('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','client','Synthetic owner B');
INSERT INTO user_application_roles SELECT user_id,role,true FROM user_profiles;
INSERT INTO iberfit_organization_memberships SELECT user_id,'40000000-0000-4000-8000-000000000001','active' FROM user_profiles;
INSERT INTO client_assignments VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',true,now()-interval '30 days');
INSERT INTO iberfit_coach_client_assignments VALUES ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','active',1,current_date-30,NULL);
