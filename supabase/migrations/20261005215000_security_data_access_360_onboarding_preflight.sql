-- Security & Data Access 360
-- Canary must be able to certify the authenticated client-create path without
-- ever enabling real-person writes in QA. The mutation RPC remains the final
-- authority for the synthetic .invalid + exact Canary-origin boundary.

create or replace function public.iberfit_client_onboarding_preflight_v12()
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_environment text;
  v_real_data_allowed boolean;
  v_production_blocked boolean;
  v_origin text;
  v_contract_ready boolean;
  v_qa_ready boolean;
begin
  perform public.iberfit_require_privileged_assurance_v65d();

  v_result:=public.iberfit_client_onboarding_preflight_v12_pre_v65e();
  v_environment:=coalesce(v_result->>'environment','');
  v_real_data_allowed:=coalesce((v_result->>'realDataAllowed')::boolean,false);
  v_production_blocked:=coalesce((v_result->>'productionBlocked')::boolean,true);
  v_origin:=coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'origin','');

  v_contract_ready:=
    exists(
      select 1
      from information_schema.columns
      where table_schema='public'
        and table_name='client_app_profiles'
        and column_name='profile'
        and udt_name='jsonb'
    )
    and to_regclass('public.iri_assessments') is not null
    and to_regclass('public.domain_entities_v26') is not null
    and to_regprocedure('public.iberfit_bootstrap_v26()') is not null
    and to_regprocedure('public.iberfit_create_client_draft(jsonb)') is not null;

  v_qa_ready:=
    v_contract_ready
    and v_environment='QA'
    and v_real_data_allowed=false
    and v_production_blocked=true
    and v_origin='https://m26-canary.iberfit.cl';

  if v_environment='QA' then
    return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
      'ready',v_qa_ready,
      'qaSyntheticOnly',true,
      'allowedOrigin','https://m26-canary.iberfit.cl'
    );
  end if;

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'qaSyntheticOnly',false
  );
end
$$;

revoke all on function public.iberfit_client_onboarding_preflight_v12() from public, anon, service_role;
grant execute on function public.iberfit_client_onboarding_preflight_v12() to authenticated;

notify pgrst, 'reload schema';
