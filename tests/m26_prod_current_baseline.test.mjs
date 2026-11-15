import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 PROD_REF,REQUIRED_VERSIONS,EXACT_LEDGER_SHA256,EXACT_LEDGER_TOTAL,EXACT_LEDGER_LATEST,QUERY,certifyCurrentProductionBaseline,inspectCurrentProduction,
} from '../scripts/ops/verify_current_prod_baseline.mjs';
const SHA='cf9283ec321ca12e7df47bf18b450f5a8337c899';
const valid=()=>({
 applied_migrations:14,migration_total:EXACT_LEDGER_TOTAL,
 migration_latest:EXACT_LEDGER_LATEST,migration_ledger_sha256:EXACT_LEDGER_SHA256,
 existing_webauthn:true,existing_rc74:true,staged_u60:true,
 existing_m44:true,existing_connected360:true,prod_environment:true,
 enabled_commands:58,u60_auth_execute:false,u60_anon_execute:false,
 u72_source_gateway_md5:'5914acf371015a6bbeeaf95f99e056e3',
 u72_source_detail_md5:'35862b8e4977fcf0c3d611937fe83126',
 u72_source_receipt_md5:'f97d7df4fdd510b63ac1249352273927',
 u72_not_installed:true,u60_detail_auth_execute:false,u60_fences:2,
 active_occurrences:0,
 active_locks:0,active_legacy_executions:0,
});
test('real PROD post-August catalog is distinct from old pre-RC74 promotion',()=>{
 assert.equal(PROD_REF,'pjhmrhejsoofmouedavw');
 assert.equal(REQUIRED_VERSIONS.length,14);
 assert.equal(EXACT_LEDGER_TOTAL,225);
 assert.match(EXACT_LEDGER_SHA256,/^[0-9a-f]{64}$/u);
 assert.equal(new Set(REQUIRED_VERSIONS).size,14);
 assert.match(QUERY,/supabase_migrations.schema_migrations/u);
 assert.match(QUERY,/iberfit_occurrence_api_u60_v1/u);
 assert.match(QUERY,/iberfit_privileged_assurance_context_v65d/u);
 assert.doesNotMatch(QUERY,/\b(?:DROP TABLE|TRUNCATE|CREATE TABLE|ALTER TABLE|UPDATE public|DELETE FROM|INSERT INTO|GRANT EXECUTE|REVOKE)\b/iu);
});
test('current catalog certifies READ-ONLY NO-GO, not deploy approval or secret recovery',()=>{
 const r=certifyCurrentProductionBaseline([valid()],{sourceSha:SHA});
 assert.equal(r.readOnly,true);
 assert.equal(r.projectRef,PROD_REF);
 assert.equal(r.legacyPromotionSqlRejected,true);
 assert.equal(r.fullMigrationLedgerVerified,true);
 assert.equal(r.u72ReviewedSourceCompatible,true);
 assert.equal(r.u72Installed,false);
 assert.equal(r.productionReady,false);
 assert.equal(r.backendPromotionAuthorized,false);
 assert.equal(r.hostedAuthVaultSecretsRestored,false);
 assert.equal(r.platformAclRestored,false);
 assert.equal(r.activeTraining,false);
 assert.equal(Object.hasOwn(r,'sql'),false);
});
test('active sessions remain visible in read-only evidence and never purged',()=>{
 const r=certifyCurrentProductionBaseline([{...valid(),active_locks:1,active_legacy_executions:2}],{sourceSha:SHA});
 assert.equal(r.activeTraining,true);assert.equal(r.productionReady,false);
 const active=certifyCurrentProductionBaseline([{...valid(),active_occurrences:1}],{sourceSha:SHA});
 assert.equal(active.activeTraining,true);
});
test('missing version, widened grant, drift and malformed payload fail closed',()=>{
 for(const diff of [
  {applied_migrations:13},{migration_total:224},
  {migration_latest:'20261107144121'},
  {migration_ledger_sha256:'a'.repeat(64)},
  {enabled_commands:57},{existing_webauthn:false},
  {existing_rc74:false},{staged_u60:false},{existing_m44:false},
  {existing_connected360:false},{prod_environment:false},
  {u60_auth_execute:true},{u60_anon_execute:true},{u60_detail_auth_execute:true},
  {u72_not_installed:false},{u60_fences:1},
  {u72_source_gateway_md5:'bad'},{u72_source_detail_md5:'bad'},
  {u72_source_receipt_md5:'bad'},
  {active_locks:'0'},{active_legacy_executions:-1},
 ])assert.throws(()=>certifyCurrentProductionBaseline([{...valid(),...diff}],{sourceSha:SHA}),/PROD_BASELINE_/u,JSON.stringify(diff));
 for(const data of [[],[valid(),valid()],{},[{...valid(),staged_u60:null}]])
  assert.throws(()=>certifyCurrentProductionBaseline(data,{sourceSha:SHA}),/PROD_BASELINE_/u);
 assert.throws(()=>certifyCurrentProductionBaseline([valid()],{sourceSha:'bad'}),/SHA_INVALID/u);
});
test('remote request is pinned to PROD management read-only endpoint',async()=>{
 let n=0;
 const fetchImpl=async(url,options)=>{
  n++;assert.equal(url,'https://api.supabase.com/v1/projects/'+PROD_REF+'/database/query/read-only');
  assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  assert.deepEqual(JSON.parse(options.body),{query:QUERY});
  return {ok:true,status:200,json:async()=>[valid()]};
 };
 await assert.rejects(()=>inspectCurrentProduction({projectRef:'gjztkdwfmunnzhtvxrsu',sourceSha:SHA,accessToken:'test-plaintext-not-real',fetchImpl}),/PROJECT_DENIED/u);
 assert.equal(n,0);
 const r=await inspectCurrentProduction({projectRef:PROD_REF,sourceSha:SHA,accessToken:'test-plaintext-not-real',fetchImpl});
 assert.equal(n,1);assert.equal(r.productionReady,false);
});
test('old CLI production SQL artifact cannot be emitted or uploaded',()=>{
 const wf=readFileSync('.github/workflows/final-production-bundle.yml','utf8');
 const old=readFileSync('scripts/build_final_production_promotion.mjs','utf8');
 const compat=readFileSync('scripts/build_final_production_promotion_prod_compat.mjs','utf8');
 assert.match(wf,/verify_current_prod_baseline\.mjs/u);
 assert.match(wf,/PROD_CURRENT_BASELINE_READONLY\.json/u);
 assert.doesNotMatch(wf,/Generate exact production SQL|final-production-promotion-sql|--write/u);
 assert.match(wf,/m26-canary-readonly/u);
 assert.match(wf,/SUPABASE_ACCESS_TOKEN/u);
 assert.match(old,/FINAL_PROD_LEGACY_BUNDLE_RETIRED/u);
 assert.match(compat,/FINAL_PROD_LEGACY_BUNDLE_RETIRED/u);
 assert.doesNotMatch(wf,/supabase db (?:push|reset)|apply_migration|service_role/u);
});
