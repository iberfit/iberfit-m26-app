import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildFinalProductionPromotion} from './build_final_production_promotion.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputPath=path.join(root,'backend','production','generated','FINAL_PRODUCTION_PROMOTION.sql');

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

export function buildFinalProductionPromotionProdCompat(){
  let sql=buildFinalProductionPromotion();
  if(!sql.includes(oldCleanup))throw new Error('FINAL_PROD_LEGACY_CLEANUP_CONTRACT_NOT_FOUND');
  if(!sql.includes(oldPostcheck))throw new Error('FINAL_PROD_LEGACY_POSTCHECK_CONTRACT_NOT_FOUND');
  sql=sql.replace(oldCleanup,legacyCleanup).replace(oldPostcheck,safePostcheck);
  if(/create\s+(?:or\s+replace\s+)?function\s+public\.iberfit_auth_assurance_context_v65c\s*\(/iu.test(sql)){
    throw new Error('FINAL_PROD_OBSOLETE_V65C_RECREATED');
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
