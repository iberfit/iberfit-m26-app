import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFinalProductionPromotion} from './build_final_production_promotion.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputPath=path.join(root,'backend','production','generated','FINAL_PRODUCTION_PROMOTION.sql');
const bootstrapScopeSource='20260901010500_final_launch_p0_bootstrap_production_scope.sql';
const bootstrapScopePath=path.join(root,'supabase','migrations',bootstrapScopeSource);

const legacyCleanup=`do $legacy_helper_cleanup$
begin
  if to_regprocedure('public.iberfit_auth_assurance_context_v65c()') is not null then
    execute 'revoke all on function public.iberfit_auth_assurance_context_v65c() from public,anon,authenticated';
  end if;
  if to_regprocedure('public.iberfit_admin_require_v14()') is not null then
    execute 'revoke all on function public.iberfit_admin_require_v14() from public,anon,authenticated';
  end if;
end
$legacy_helper_cleanup$;`;

const oldCleanup=`revoke all on function public.iberfit_auth_assurance_context_v65c() from public,anon,authenticated;
revoke all on function public.iberfit_admin_require_v14() from public,anon,authenticated;`;

const oldPostcheck=`  if has_function_privilege('authenticated','public.iberfit_auth_assurance_context_v65c()','EXECUTE') then
    raise exception 'V65E_POSTCHECK_LEGACY_ASSURANCE_STILL_EXECUTABLE';
  end if;
  if has_function_privilege('authenticated','public.iberfit_admin_require_v14()','EXECUTE') then
    raise exception 'V65E_POSTCHECK_ADMIN_REQUIRE_STILL_EXECUTABLE';
  end if;`;

const safePostcheck=`  if to_regprocedure('public.iberfit_auth_assurance_context_v65c()') is not null
     and has_function_privilege('authenticated','public.iberfit_auth_assurance_context_v65c()','EXECUTE') then
    raise exception 'V65E_POSTCHECK_LEGACY_ASSURANCE_STILL_EXECUTABLE';
  end if;
  if to_regprocedure('public.iberfit_admin_require_v14()') is not null
     and has_function_privilege('authenticated','public.iberfit_admin_require_v14()','EXECUTE') then
    raise exception 'V65E_POSTCHECK_ADMIN_REQUIRE_STILL_EXECUTABLE';
  end if;`;

const bootstrapPostcheck=`  select pg_get_functiondef('public.iberfit_bootstrap_v26_rc29()'::regprocedure) into v_source;
  if position('m26_canary_clients_v26' in lower(v_source))<>0
     or position('m26_canary_not_enabled' in lower(v_source))<>0
     or position('iberfit_can_access_client_v26' in lower(v_source))=0 then
    raise exception 'FINAL_PROD_POSTCHECK_BOOTSTRAP_SCOPE_RC29';
  end if;

  select pg_get_functiondef('public.iberfit_bootstrap_v26_pre_v65e()'::regprocedure) into v_source;
  if position('m26_canary_clients_v26' in lower(v_source))<>0
     or position('m26_canary_not_enabled' in lower(v_source))<>0
     or position('iberfit_can_access_client_v26' in lower(v_source))=0 then
    raise exception 'FINAL_PROD_POSTCHECK_BOOTSTRAP_SCOPE_V65E';
  end if;

  select pg_get_functiondef('public.iberfit_bootstrap_v26()'::regprocedure) into v_source;
  if position('iberfit_require_privileged_assurance_v65d' in lower(v_source))=0
     or position('iberfit_bootstrap_v26_pre_v65e' in lower(v_source))=0 then
    raise exception 'FINAL_PROD_POSTCHECK_BOOTSTRAP_ASSURANCE';
  end if;`;

function insertBootstrapScopeHotfix(sql){
  if(!fs.existsSync(bootstrapScopePath))throw new Error(`FINAL_PROD_SOURCE_MISSING:${bootstrapScopeSource}`);
  const source=fs.readFileSync(bootstrapScopePath,'utf8').replace(/\r\n/gu,'\n').trim();
  const marker='\n-- ============================================================================\n-- 99 · FINAL PRODUCTION POSTCHECK';
  const index=sql.indexOf(marker);
  if(index<0)throw new Error('FINAL_PROD_POSTCHECK_MARKER_NOT_FOUND');
  const section=`\n-- ============================================================================\n-- POST-LAUNCH P0 · ${bootstrapScopeSource}\n-- ============================================================================\n${source}\n`;
  return `${sql.slice(0,index)}${section}${sql.slice(index)}`;
}

function hardenBootstrapPostcheck(sql){
  const close='end\n$final_prod_postcheck$;';
  if(!sql.includes(close))throw new Error('FINAL_PROD_POSTCHECK_CLOSE_NOT_FOUND');
  return sql.replace(close,`${bootstrapPostcheck}\nend\n$final_prod_postcheck$;`);
}

export function buildFinalProductionPromotionProdCompat(){
  let sql=buildFinalProductionPromotion();
  if(!sql.includes(oldCleanup))throw new Error('FINAL_PROD_LEGACY_CLEANUP_CONTRACT_NOT_FOUND');
  if(!sql.includes(oldPostcheck))throw new Error('FINAL_PROD_LEGACY_POSTCHECK_CONTRACT_NOT_FOUND');
  sql=sql.replace(oldCleanup,legacyCleanup).replace(oldPostcheck,safePostcheck);
  sql=insertBootstrapScopeHotfix(sql);
  sql=hardenBootstrapPostcheck(sql);
  if(/create\s+(?:or\s+replace\s+)?function\s+public\.iberfit_auth_assurance_context_v65c\s*\(/iu.test(sql)){
    throw new Error('FINAL_PROD_OBSOLETE_V65C_RECREATED');
  }
  if(!sql.includes(bootstrapScopeSource)
     || !sql.includes('FINAL_PROD_POSTCHECK_BOOTSTRAP_SCOPE_RC29')
     || !sql.includes('FINAL_PROD_POSTCHECK_BOOTSTRAP_ASSURANCE')){
    throw new Error('FINAL_PROD_BOOTSTRAP_SCOPE_HOTFIX_MISSING');
  }
  return sql;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const sql=buildFinalProductionPromotionProdCompat();
  if(process.argv.includes('--write')){
    fs.mkdirSync(path.dirname(outputPath),{recursive:true});
    fs.writeFileSync(outputPath,sql,'utf8');
    console.log(JSON.stringify({ok:true,output:path.relative(root,outputPath),bytes:Buffer.byteLength(sql)}));
  }else{
    process.stdout.write(sql);
  }
}
