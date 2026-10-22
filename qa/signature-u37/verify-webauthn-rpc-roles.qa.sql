-- Run in QA SQL editor only, inside a single BEGIN ... ROLLBACK
-- after qa/signature-u37/webauthn-gated-core-and-history.qa.sql.
-- Never use synthetic SQL claim injection as positive WebAuthn proof.
DO $verify$
DECLARE
 v_client uuid;v_client_id uuid;v_denied boolean;
BEGIN
 if has_function_privilege('anon','public.iberfit_bootstrap_v26_core_u37_qa()','EXECUTE')
    or has_function_privilege('service_role','public.iberfit_bootstrap_v26_core_u37_qa()','EXECUTE')
    or not has_function_privilege('authenticated','public.iberfit_bootstrap_v26_core_u37_qa()','EXECUTE')
    or has_function_privilege('anon','public.iberfit_privileged_history_page_u37_qa(uuid,text,timestamptz,jsonb,bigint,integer)','EXECUTE')
    or has_function_privilege('service_role','public.iberfit_privileged_history_page_u37_qa(uuid,text,timestamptz,jsonb,bigint,integer)','EXECUTE')
    or not has_function_privilege('authenticated','public.iberfit_privileged_history_page_u37_qa(uuid,text,timestamptz,jsonb,bigint,integer)','EXECUTE')
 then raise exception 'U37_EXECUTE_ACL_MISMATCH';end if;

 select id into v_client from auth.users where email='qa.rc74.client-a@iberfit.cl';
 select id into v_client_id from public.clients order by id limit 1;
 if v_client is null or v_client_id is null then
   raise exception 'U37_QA_FIXTURE_MISSING';
 end if;
 perform set_config('request.jwt.claim.sub',v_client::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 if public.iberfit_current_role_v26()<>'cliente' then
   raise exception 'U37_CLIENT_ROLE_UNEXPECTED';
 end if;
 v_denied:=false;
 begin perform public.iberfit_bootstrap_v26_core_u37_qa();
 exception when insufficient_privilege then v_denied:=true;end;
 if not v_denied then raise exception 'U37_CLIENT_CORE_ALLOWED';end if;
 v_denied:=false;
 begin
   perform public.iberfit_privileged_history_page_u37_qa(v_client_id,'m26Entities');
 exception when insufficient_privilege then v_denied:=true;end;
 if not v_denied then raise exception 'U37_CLIENT_HISTORY_ALLOWED';end if;

 perform set_config('request.jwt.claim.sub','',true);
 v_denied:=false;
 begin perform public.iberfit_bootstrap_v26_core_u37_qa();
 exception when insufficient_privilege then v_denied:=true;end;
 if not v_denied then raise exception 'U37_ANON_CORE_ALLOWED';end if;
 v_denied:=false;
 begin
   perform public.iberfit_privileged_history_page_u37_qa(v_client_id,'m26Entities');
 exception when insufficient_privilege then v_denied:=true;end;
 if not v_denied then raise exception 'U37_ANON_HISTORY_ALLOWED';end if;
END
$verify$;
SELECT true AS qa_u37_sql_compiles_role_acl_and_privacy_pass;
