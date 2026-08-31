import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migrationsDir=path.join(root,'supabase','migrations');
const backendDir=path.join(root,'backend');

export const SOURCE_MIGRATIONS=Object.freeze([
  '20260824171100_iberfit_rc74_4_least_privilege_qa.sql',
  '20260825005258_iberfit_rc74_4h_operation_identity_qa.sql',
  '20260825011031_iberfit_rc74_4i_server_conflict_policy_qa.sql',
  '20260825011758_iberfit_rc74_4j_internal_command_rpc_permissions_qa.sql',
  '20260825022525_iberfit_rc74_4m_execution_lock_release_qa.sql',
  '20260825023803_iberfit_rc74_4n_execution_cancel_cascade_qa.sql',
  '20260825024902_iberfit_rc74_4o_active_execution_command_guard_qa.sql',
  '20260825035725_iberfit_rc74_4p_environment_rpc_rls_qa.sql',
  '20260825132326_iberfit_rc74_4k_progress_conflict_qa.sql',
  '20260825162000_iberfit_rc74_4r_reproducibility_qa.sql',
  '20260825202200_iberfit_rc74_4s_wellbeing_context_qa.sql',
]);

export const EXCLUDED_QA_MIGRATIONS=Object.freeze([
  '20260824171000_iberfit_rc74_4_qa_environment.sql',
  '20260824174500_iberfit_rc74_4_engagement_52.sql',
  '20260825020434_iberfit_rc74_4l_qa_health_environment_truth.sql',
  '20260825043500_iberfit_rc74_4q_v14_qa_membership_fixture.sql',
  '20260828143000_rc65c1_auth_assurance_context.sql',
]);

const WEBAUTHN_SOURCE='20260830033156_rc65c1_free_webauthn_assurance.sql';
const SERVER_ENFORCEMENT_SOURCE='20260830044500_rc65_c2_c3_privileged_server_enforcement.sql';
const INVOKER_COMPAT_SOURCE='20260831025746_rc65_c2_c3_invoker_assurance_compat.sql';
const FINAL_P0_SOURCE='20260831042719_final_launch_p0_revoke_legacy_client_create.sql';

const PROD_ORIGINS=Object.freeze([
  'https://app.iberfit.cl',
  'https://coach.iberfit.cl',
]);

function readMigration(name){
  const file=path.join(migrationsDir,name);
  if(!fs.existsSync(file))throw new Error(`FINAL_PROD_SOURCE_MISSING:${name}`);
  return fs.readFileSync(file,'utf8').replace(/\r\n/gu,'\n');
}

function productionizeQaEnvironmentGuards(input){
  let sql=String(input).replace(/\r\n/gu,'\n');

  sql=sql
    .replace(/lower\(coalesce\(v_env->>'environment',''\)\)\s*<>\s*'qa'/giu,
      "lower(coalesce(v_env->>'environment',''))<>'production'")
    .replace(/coalesce\(v_env->>'environment',''\)\s*<>\s*'QA'/giu,
      "coalesce(v_env->>'environment','') <> 'PRODUCTION'")
    .replace(/coalesce\(\(v_env->>'realDataAllowed'\)::boolean\s*,\s*true\)\s+is\s+not\s+false/giu,
      "coalesce((v_env->>'realDataAllowed')::boolean,false) is not true")
    .replace(/coalesce\(\(v_env->>'productionBlocked'\)::boolean\s*,\s*false\)\s+is\s+not\s+true/giu,
      "coalesce((v_env->>'productionBlocked')::boolean,true) is not false")
    .replace(/coalesce\(\(v_env->>'realDataAllowed'\)::boolean\s*,\s*true\)\s*<>\s*false/giu,
      "coalesce((v_env->>'realDataAllowed')::boolean,false)<>true")
    .replace(/coalesce\(\(v_env->>'productionBlocked'\)::boolean\s*,\s*false\)\s*<>\s*true/giu,
      "coalesce((v_env->>'productionBlocked')::boolean,true)<>false")
    .replace(/QA-ONLY/giu,'PRODUCTION PORT')
    .replace(/QA ONLY/giu,'PRODUCTION PORT')
    .replace(/QA only/gu,'production port')
    .replace(/isolated QA/giu,'production')
    .replace(/live QA/giu,'validated QA')
    .replace(/apply to QA only/giu,'ported from the QA-validated source');

  return sql;
}

function productionizeWebAuthn(input){
  let sql=String(input).replace(/\r\n/gu,'\n');
  const single="check (origin = 'https://m26-canary.iberfit.cl')";
  const multi=`check (origin in ('${PROD_ORIGINS[0]}','${PROD_ORIGINS[1]}'))`;
  if(!sql.includes(single))throw new Error('FINAL_PROD_WEBAUTHN_ORIGIN_CONTRACT_NOT_FOUND');
  sql=sql.replace(single,multi);
  if(sql.includes('m26-canary.iberfit.cl'))throw new Error('FINAL_PROD_WEBAUTHN_CANARY_ORIGIN_REMAINS');
  return sql;
}

function finalLiveAuthorizationSql(){
  return `-- FINAL PRODUCTION PORT · RC74.4T/T2 end-state authorization\n`+
`-- Source of truth: the live QA end-state. Do not trust mutable JWT app_metadata\n`+
`-- for the effective IBERFIT role; resolve it from user_profiles for auth.uid().\n`+
`create or replace function private.iberfit_role()\n`+
`returns public.iberfit_role\n`+
`language sql\n`+
`stable\n`+
`security definer\n`+
`set search_path to ''\n`+
`as $function$\n`+
`  select p.role\n`+
`  from public.user_profiles p\n`+
`  where p.user_id = auth.uid()\n`+
`  limit 1\n`+
`$function$;\n\n`+
`revoke all on function private.iberfit_role() from public,anon,authenticated,service_role;\n`+
`grant execute on function private.iberfit_role() to authenticated;\n`;
}

function finalPostcheckSql(){
  return `-- FINAL PRODUCTION POSTCHECK · fail closed\n`+
`do $final_prod_postcheck$\n`+
`declare\n`+
`  v_env jsonb;\n`+
`  v_count bigint;\n`+
`  v_flag boolean;\n`+
`  v_source text;\n`+
`  v_definer boolean;\n`+
`  v_constraint text;\n`+
`begin\n`+
`  v_env:=public.iberfit_environment();\n`+
`  if coalesce(v_env->>'environment','')<>'PRODUCTION'\n`+
`     or coalesce((v_env->>'realDataAllowed')::boolean,false) is not true\n`+
`     or coalesce((v_env->>'productionBlocked')::boolean,true) is not false then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_ENVIRONMENT_DRIFT';\n`+
`  end if;\n\n`+
`  select count(*) into v_count from public.domain_command_registry_v26 where enabled=true;\n`+
`  if v_count<>52 then raise exception 'FINAL_PROD_POSTCHECK_COMMAND_COUNT:%',v_count; end if;\n`+
`  select conflict_sensitive into v_flag from public.domain_command_registry_v26\n`+
`   where command_type='EJECUCION_GUARDAR_PROGRESO' and entity_type='session_execution' and enabled=true;\n`+
`  if v_flag is distinct from true then raise exception 'FINAL_PROD_POSTCHECK_PROGRESS_POLICY'; end if;\n\n`+
`  if to_regclass('public.command_operation_identities_v26') is null\n`+
`     or to_regprocedure('public.iberfit_operation_identity_guard_v26(jsonb,boolean)') is null\n`+
`     or to_regprocedure('private.iberfit_apply_registry_conflict_policy_v26(jsonb)') is null\n`+
`     or to_regprocedure('private.iberfit_finalize_execution_cancel_v26(jsonb)') is null\n`+
`     or to_regprocedure('private.iberfit_active_execution_command_guard_v26(jsonb)') is null\n`+
`     or to_regprocedure('public.iberfit_validate_execution_completion_v26(jsonb)') is null then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_RC74_HARDENING_MISSING';\n`+
`  end if;\n`+
`  if has_table_privilege('authenticated','public.command_operation_identities_v26','SELECT')\n`+
`     or has_table_privilege('anon','public.command_operation_identities_v26','SELECT') then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_OPERATION_IDENTITY_EXPOSED';\n`+
`  end if;\n\n`+
`  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='client_checkins_v26' and column_name='fatigue')\n`+
`     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='client_checkins_v26' and column_name='motivation') then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_WELLBEING_COLUMNS_MISSING';\n`+
`  end if;\n\n`+
`  select pg_get_functiondef('private.iberfit_role()'::regprocedure) into v_source;\n`+
`  if position('auth.jwt' in lower(v_source))<>0 or position('user_profiles' in lower(v_source))=0 then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_ROLE_RESOLVER_UNSAFE';\n`+
`  end if;\n`+
`  if has_function_privilege('anon','private.iberfit_role()','EXECUTE')\n`+
`     or has_function_privilege('public','private.iberfit_role()','EXECUTE')\n`+
`     or has_function_privilege('service_role','private.iberfit_role()','EXECUTE')\n`+
`     or not has_function_privilege('authenticated','private.iberfit_role()','EXECUTE') then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_PRIVATE_ROLE_ACL';\n`+
`  end if;\n\n`+
`  select p.prosecdef into v_definer from pg_proc p where p.oid='public.iberfit_environment()'::regprocedure;\n`+
`  if v_definer is not true\n`+
`     or has_function_privilege('anon','public.iberfit_environment()','EXECUTE')\n`+
`     or has_function_privilege('public','public.iberfit_environment()','EXECUTE')\n`+
`     or not has_function_privilege('authenticated','public.iberfit_environment()','EXECUTE') then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_ENVIRONMENT_RPC';\n`+
`  end if;\n\n`+
`  if to_regclass('public.iberfit_webauthn_credentials_v1') is null\n`+
`     or to_regclass('public.iberfit_webauthn_challenges_v1') is null\n`+
`     or to_regclass('public.iberfit_privileged_assurance_v1') is null\n`+
`     or to_regprocedure('public.iberfit_privileged_assurance_context_v65d()') is null\n`+
`     or to_regprocedure('public.iberfit_require_privileged_assurance_v65d()') is null then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_WEBAUTHN_MISSING';\n`+
`  end if;\n`+
`  select pg_get_constraintdef(c.oid) into v_constraint\n`+
`  from pg_constraint c\n`+
`  where c.conrelid='public.iberfit_webauthn_challenges_v1'::regclass\n`+
`    and pg_get_constraintdef(c.oid) ilike '%origin%';\n`+
`  if v_constraint is null\n`+
`     or position('https://app.iberfit.cl' in v_constraint)=0\n`+
`     or position('https://coach.iberfit.cl' in v_constraint)=0\n`+
`     or position('m26-canary.iberfit.cl' in v_constraint)<>0 then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_WEBAUTHN_ORIGIN_CONSTRAINT';\n`+
`  end if;\n\n`+
`  if to_regprocedure('public.iberfit_create_client_draft_v12_pre_v65e(jsonb)') is null\n`+
`     or not has_function_privilege('authenticated','public.iberfit_create_client_draft_v12(jsonb)','EXECUTE')\n`+
`     or has_function_privilege('authenticated','public.iberfit_create_client_draft_v12_pre_v65e(jsonb)','EXECUTE')\n`+
`     or has_function_privilege('authenticated','public.iberfit_create_client_draft(jsonb)','EXECUTE')\n`+
`     or has_function_privilege('anon','public.iberfit_create_client_draft(jsonb)','EXECUTE') then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_CLIENT_CREATE_SURFACE';\n`+
`  end if;\n\n`+
`  select prosecdef,prosrc into v_definer,v_source from pg_proc where oid='public.m26_backend_bootstrap_v43()'::regprocedure;\n`+
`  if v_definer or position('iberfit_require_privileged_assurance_v65d' in v_source)=0 then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_BACKEND_INVOKER_GUARD';\n`+
`  end if;\n`+
`  select prosecdef,prosrc into v_definer,v_source from pg_proc where oid='public.m26_wearable_bootstrap_v44()'::regprocedure;\n`+
`  if v_definer or position('iberfit_require_privileged_assurance_v65d' in v_source)=0 then\n`+
`    raise exception 'FINAL_PROD_POSTCHECK_WEARABLE_INVOKER_GUARD';\n`+
`  end if;\n`+
`end\n`+
`$final_prod_postcheck$;\n`;
}

function section(title,content){
  return `\n-- ============================================================================\n-- ${title}\n-- ============================================================================\n${String(content).trim()}\n`;
}

export function buildFinalProductionPromotion(){
  const parts=[];
  const preflight=fs.readFileSync(path.join(backendDir,'FINAL_PRODUCTION_PREFLIGHT_READONLY.sql'),'utf8').replace(/\r\n/gu,'\n');
  parts.push('-- IBERFIT M26 · FINAL PRODUCTION PROMOTION · GENERATED / DO NOT EDIT\n');
  parts.push('-- Built from the exact Canary-validated SQL end-state, with QA fixtures excluded.\n');
  parts.push('-- This artifact is inert until explicitly executed against the PRODUCTION project.\n');
  parts.push(section('00 · FAIL-CLOSED PRODUCTION PREFLIGHT',preflight));

  for(const name of SOURCE_MIGRATIONS){
    parts.push(section(`PORT · ${name}`,productionizeQaEnvironmentGuards(readMigration(name))));
  }

  parts.push(section('PORT · RC74.4T/T2 FINAL LIVE AUTHORIZATION',finalLiveAuthorizationSql()));
  parts.push(section(`PORT · ${WEBAUTHN_SOURCE} · PRODUCTION ORIGINS`,productionizeWebAuthn(readMigration(WEBAUTHN_SOURCE))));
  parts.push(section(`PORT · ${SERVER_ENFORCEMENT_SOURCE}`,readMigration(SERVER_ENFORCEMENT_SOURCE)));
  parts.push(section(`PORT · ${INVOKER_COMPAT_SOURCE}`,readMigration(INVOKER_COMPAT_SOURCE)));
  parts.push(section(`PORT · ${FINAL_P0_SOURCE}`,readMigration(FINAL_P0_SOURCE)));
  parts.push(section('99 · FINAL PRODUCTION POSTCHECK',finalPostcheckSql()));

  const sql=parts.join('\n').replace(/\r\n/gu,'\n');

  for(const forbidden of [
    'qa.rc74.',
    '74040000-0000-4000-8000-000000000001',
    'm26-canary.iberfit.cl',
  ]){
    if(sql.toLowerCase().includes(forbidden.toLowerCase()))throw new Error(`FINAL_PROD_FORBIDDEN_CONTENT:${forbidden}`);
  }

  if(/create\s+(?:or\s+replace\s+)?function\s+public\.iberfit_auth_assurance_context_v65c\s*\(/iu.test(sql)){
    throw new Error('FINAL_PROD_OBSOLETE_ASSURANCE_HELPER_CREATED');
  }
  if(/grant\s+execute\s+on\s+function\s+public\.iberfit_auth_assurance_context_v65c\(\)\s+to\s+(?:public|anon|authenticated|service_role)/iu.test(sql)){
    throw new Error('FINAL_PROD_OBSOLETE_ASSURANCE_HELPER_GRANTED');
  }
  if(!/revoke\s+all\s+on\s+function\s+public\.iberfit_auth_assurance_context_v65c\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/iu.test(sql)
     || !/has_function_privilege\('authenticated','public\.iberfit_auth_assurance_context_v65c\(\)','EXECUTE'\)/iu.test(sql)){
    throw new Error('FINAL_PROD_OBSOLETE_ASSURANCE_HELPER_NOT_RETIRED');
  }

  for(const excluded of EXCLUDED_QA_MIGRATIONS){
    if(sql.includes(excluded))throw new Error(`FINAL_PROD_EXCLUDED_MIGRATION_LEAK:${excluded}`);
  }

  if(!sql.includes("'PRODUCTION'")||!sql.includes('https://app.iberfit.cl')||!sql.includes('https://coach.iberfit.cl')){
    throw new Error('FINAL_PROD_REQUIRED_PRODUCTION_MARKERS_MISSING');
  }
  if(!sql.includes('revoke execute\non function public.iberfit_create_client_draft(jsonb)')
     && !/revoke\s+execute\s+on\s+function\s+public\.iberfit_create_client_draft\(jsonb\)/iu.test(sql)){
    throw new Error('FINAL_PROD_P0_REVOKE_MISSING');
  }
  return sql;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const sql=buildFinalProductionPromotion();
  const write=process.argv.includes('--write');
  if(write){
    const out=path.join(backendDir,'production','generated','FINAL_PRODUCTION_PROMOTION.sql');
    fs.mkdirSync(path.dirname(out),{recursive:true});
    fs.writeFileSync(out,sql,'utf8');
    console.log(out);
  }else{
    process.stdout.write(sql);
  }
}