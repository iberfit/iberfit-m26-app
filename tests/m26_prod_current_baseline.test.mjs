import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 PROD_REF,REQUIRED_VERSIONS,EXACT_LEDGER_SHA256,EXACT_LEDGER_TOTAL,EXACT_LEDGER_LATEST,
 QUERY,certifyCurrentProductionBaseline,inspectCurrentProduction,safeManagementErrorClass,
} from '../scripts/ops/verify_current_prod_baseline.mjs';
const SHA='e081c4cc0bb029e1694d6dd81dae69895158b179';
const valid=()=>({
 applied_migrations:14,migration_total:EXACT_LEDGER_TOTAL,
 migration_latest:EXACT_LEDGER_LATEST,migration_ledger_sha256:EXACT_LEDGER_SHA256,
 existing_webauthn:true,existing_rc74:true,staged_u60:true,
 existing_m44:true,existing_connected360:true,u72_not_installed:true,
 coach_guard_installed:true,coach_prepare_acl:true,coach_finalize_acl:true,
 coach_prepare_md5:'c6ce72f2333fbc369b66792b735dc8ef',
 coach_bind_md5:'c8bbd63ace0634a4b1ad5f444fdd0d98',
 coach_finalize_md5:'168dc6bd262169a58a6d9ff12558078d',
 u60_auth_execute:false,u60_anon_execute:false,u60_detail_auth_execute:false,
 u72_source_gateway_md5:'5914acf371015a6bbeeaf95f99e056e3',
 u72_source_detail_md5:'35862b8e4977fcf0c3d611937fe83126',
 u72_source_receipt_md5:'f97d7df4fdd510b63ac1249352273927',
 u60_fences:2,registry_rls:true,locks_rls:true,entities_rls:true,
 occurrences_rls:true,environment_rpc_acl:true,
});
test('catalog-only query has no business rows, RLS bypass, privilege mutation or app RPC call',()=>{
 assert.equal(PROD_REF,'pjhmrhejsoofmouedavw');
 assert.equal(REQUIRED_VERSIONS.length,14);
 assert.equal(EXACT_LEDGER_TOTAL,227);
 assert.equal(EXACT_LEDGER_LATEST,'20261120220043');
 assert.equal(EXACT_LEDGER_SHA256,'6b3ac9930f59ef4e5fb197dd0b7cbe1a81aea68294fd071c8947676bb00915de');
 assert.match(EXACT_LEDGER_SHA256,/^[a-f0-9]{64}$/u);
 assert.match(QUERY,/^SELECT\n/u);
 assert.match(QUERY,/FROM supabase_migrations\.schema_migrations/u);
 assert.match(QUERY,/FROM pg_catalog\.pg_class/u);
 assert.match(QUERY,/FROM pg_catalog\.pg_trigger/u);
 assert.match(QUERY,/iberfit_occurrence_api_u60_v1/u);
 assert.match(QUERY,/iberfit_privileged_assurance_context_v65d/u);
 assert.doesNotMatch(QUERY,/FROM public\./iu);
 assert.doesNotMatch(QUERY,/JOIN public\./iu);
 assert.doesNotMatch(QUERY,/\(\s*public\.iberfit_environment\(\)\s*\)/u);
 assert.doesNotMatch(QUERY,/\b(?:DROP|TRUNCATE|CREATE|ALTER|UPDATE|DELETE|INSERT|GRANT|REVOKE)\s+(?:TABLE|FROM|INTO|ON|EXECUTE|FUNCTION)\b/iu);
});
test('current PROD catalog gives only NO-GO partial evidence, never certifies hidden sessions',()=>{
 const result=certifyCurrentProductionBaseline([valid()],{sourceSha:SHA});
 assert.equal(result.readOnly,true);
 assert.equal(result.projectRef,PROD_REF);
 assert.equal(result.fullMigrationLedgerVerified,true);
 assert.equal(result.u72ReviewedSourceCompatible,true);
 assert.equal(result.legacyPromotionSqlRejected,true);
 assert.equal(result.registryCountVerified,false);
 assert.equal(result.activeTrainingState,'UNVERIFIED_PROTECTED_RLS');
 assert.equal(result.productionSettingsVerified,false);
 assert.equal(result.requiresPrivilegedActiveTrainingRead,true);
 assert.equal(result.requiresPrivilegedRegistryCountRead,true);
 assert.equal(result.productionReady,false);
 assert.equal(result.backendPromotionAuthorized,false);
 assert.equal(result.hostedAuthVaultSecretsRestored,false);
 assert.equal(result.platformAclRestored,false);
 assert.equal(Object.hasOwn(result,'sql'),false);
 assert.equal(Object.hasOwn(result,'activeTraining'),false);
});
test('rejected migration drift, source fingerprint, widening ACL or RLS disabled fail closed',()=>{
 const bad=[
  {applied_migrations:13},{migration_total:224},
  {migration_latest:'20261107144121'},{migration_ledger_sha256:'f'.repeat(64)},
  {existing_webauthn:false},{existing_rc74:false},{staged_u60:false},
  {existing_m44:false},{existing_connected360:false},{u72_not_installed:false},
  {coach_guard_installed:false},{coach_prepare_acl:false},{coach_finalize_acl:false},
  {coach_prepare_md5:'bad'},{coach_bind_md5:'bad'},{coach_finalize_md5:'bad'},
  {u60_auth_execute:true},{u60_anon_execute:true},{u60_detail_auth_execute:true},
  {u72_source_gateway_md5:'bad'},{u72_source_detail_md5:'bad'},
  {u72_source_receipt_md5:'bad'},{u60_fences:1},
  {registry_rls:false},{locks_rls:false},{entities_rls:false},
  {occurrences_rls:false},{environment_rpc_acl:false},
  {migration_total:'226'},
  {migration_total:226},
  {migration_latest:'20261119041637'},
  {migration_ledger_sha256:'1f7c9a41176413eb8c040fc39d1e2d4c5d65efaaca9010036e379f13ef2201b0'},
 ];
 for(const change of bad)assert.throws(
  ()=>certifyCurrentProductionBaseline([{...valid(),...change}],{sourceSha:SHA}),
  /PROD_BASELINE_/u,JSON.stringify(change));
 for(const body of [[],{},[valid(),valid()],[{...valid(),registry_rls:null}]])
  assert.throws(()=>certifyCurrentProductionBaseline(body,{sourceSha:SHA}),/PROD_BASELINE_/u);
 assert.throws(()=>certifyCurrentProductionBaseline([valid()],{sourceSha:'bad'}),/PROD_BASELINE_SHA_INVALID/u);
});
test('Management API uses fixed PROD ref and the platform-enforced read-only endpoint',async()=>{
 let calls=0;
 const fetchImpl=async(url,opt)=>{
  calls++;
  assert.equal(url,'https://api.supabase.com/v1/projects/'+PROD_REF+'/database/query/read-only');
  assert.equal(opt.method,'POST');assert.equal(opt.redirect,'error');
  assert.deepEqual(JSON.parse(opt.body),{query:QUERY});
  return {ok:true,status:201,json:async()=>[valid()]};
 };
 await assert.rejects(()=>inspectCurrentProduction({
  projectRef:'gjztkdwfmunnzhtvxrsu',sourceSha:SHA,accessToken:'fake-bounded-pat',fetchImpl
 }),/PROJECT_DENIED/u);
 assert.equal(calls,0);
 const actual=await inspectCurrentProduction({
  projectRef:PROD_REF,sourceSha:SHA,accessToken:'fake-bounded-pat',fetchImpl});
 assert.equal(calls,1);assert.equal(actual.productionReady,false);
});
test('400/403 API errors disclose only SQLSTATE or fixed coarse category',async()=>{
 assert.equal(safeManagementErrorClass({code:'42501',message:'secret-private-client-data'}),'42501');
 assert.equal(safeManagementErrorClass({message:'permission denied for private function'}),'PERMISSION_DENIED');
 assert.equal(safeManagementErrorClass({message:'syntax error in confidential SQL'}),'SQL_SYNTAX');
 assert.equal(safeManagementErrorClass({message:'private-client-record'}),'UNCLASSIFIED');
 const fetchImpl=async()=>({ok:false,status:400,json:async()=>({
  code:'42501',message:'confidential client or credentials details must not be logged',
 })});
 await assert.rejects(()=>inspectCurrentProduction({
  projectRef:PROD_REF,sourceSha:SHA,accessToken:'fake-bounded-pat',fetchImpl}),
  error=>error?.message==='PROD_BASELINE_HTTP_400_42501');
});
test('legacy executable SQL CLI cannot be generated by any automatic release workflow',()=>{
 const workflow=readFileSync('.github/workflows/final-production-bundle.yml','utf8');
 const old=readFileSync('scripts/build_final_production_promotion.mjs','utf8');
 const compatible=readFileSync('scripts/build_final_production_promotion_prod_compat.mjs','utf8');
 assert.match(workflow,/verify_current_prod_baseline\.mjs/u);
 assert.match(workflow,/PROD_CURRENT_BASELINE_READONLY\.json/u);
 assert.match(workflow,/m26-canary-readonly/u);
 assert.doesNotMatch(workflow,/Generate exact production SQL|final-production-promotion-sql|--write/u);
 assert.match(old,/FINAL_PROD_LEGACY_BUNDLE_RETIRED/u);
 assert.match(compatible,/FINAL_PROD_LEGACY_BUNDLE_RETIRED/u);
});
