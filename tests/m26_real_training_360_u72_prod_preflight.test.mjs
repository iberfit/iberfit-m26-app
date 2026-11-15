import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {QUERY,FUNCTIONS,REQUIRED_VERSIONS,U72_READONLY_SCHEMA,
 evaluateProdU72ReadOnlyPreflight} from '../scripts/release/m1_u72_prod_readonly_preflight.mjs';
const good=()=>({
 schema:U72_READONLY_SCHEMA,
 environment:{environment:'PRODUCTION',real_data_allowed:'true',production_blocked:'false'},
 missingRequiredMigrations:0,
 functionBaselines:Object.fromEntries(Object.keys(FUNCTIONS).map(key=>[key,{
  present:true,hashOK:true,securityDefiner:true,postgresOwner:true,
  emptySearchPath:true,authCanExecute:false,anonCanExecute:false,
  serviceCanExecute:false}])),
 occurrence:{rls_enabled:true,anon_direct_all:false,auth_direct_all:false},
 fences:{receipt_guard_on:true,typed_fence_on:true},
 activity:{active_dates:false,paused_executions:false},
 legacyEntry:{legacy_auth:false,legacy_anon:false},u72AlreadyInstalled:false,
});
test('only genuinely closed compatible PROD baseline passes, never authorizes release',()=>{
 const proof=evaluateProdU72ReadOnlyPreflight([{report:good()}]);
 assert.equal(proof.dbInstallPreflightReady,true);
 for(const key of ['productionReleaseAuthorized','platformRecoveryVerified',
  'hostedAuthRecoveryVerified','billedEgressVerified','liveCoachClientAcceptanceVerified'])
  assert.equal(proof[key],false);
 assert.equal(proof.databaseWrites,0);
});
test('rejects drift in every boolean and baseline function',()=>{
 const cases=[
  x=>{x.schema='wrong';},x=>{x.environment.environment='QA';},
  x=>{x.environment.real_data_allowed=false;},
  x=>{x.environment.production_blocked='true';},
  x=>{x.missingRequiredMigrations=1;},x=>{x.activity.active_dates=true;},
  x=>{x.activity.paused_executions=true;},
  x=>{x.fences.receipt_guard_on=false;},x=>{x.fences.typed_fence_on=false;},
  x=>{x.legacyEntry.legacy_auth=true;},x=>{x.legacyEntry.legacy_anon=true;},
  x=>{x.occurrence.rls_enabled=false;},
  x=>{x.occurrence.auth_direct_all=true;},x=>{x.occurrence.anon_direct_all=true;},
  x=>{x.u72AlreadyInstalled=true;},
  x=>{delete x.functionBaselines.u60_gateway;},
  x=>{x.functionBaselines.u60_gateway.hashOK=false;},
  x=>{x.functionBaselines.u60_receipt.securityDefiner=false;},
  x=>{x.functionBaselines.u60_detail_private.postgresOwner=false;},
  x=>{x.functionBaselines.u60_detail_public.emptySearchPath=false;},
  x=>{x.functionBaselines.u60_gateway.authCanExecute=true;},
  x=>{x.functionBaselines.u60_gateway.anonCanExecute=true;},
  x=>{x.functionBaselines.u60_gateway.serviceCanExecute=true;},
 ];
 for(const mutate of cases){
  const x=good();mutate(x);
  assert.throws(()=>evaluateProdU72ReadOnlyPreflight({result:[{report:x}]}));
 }
});
test('incomplete/null/ambiguous replies never get interpreted as release permission',()=>{
 for(const reply of [null,{},[],[{report:good()},{report:good()}],
  {result:[]}, {result:[{report:good()},{report:good()}]},
  {report:{...good(),functionBaselines:{}}}
 ])assert.throws(()=>evaluateProdU72ReadOnlyPreflight(reply));
});
test('preflight SQL uses only SELECT and provenance constants from immutable release',()=>{
 const install=readFileSync(new URL('../supabase/release-procedures/20261113_m1_u72_prod_guarded_install.sql',import.meta.url),'utf8');
 const on=readFileSync(new URL('../supabase/release-procedures/20261112_m1_u60_prod_guarded_enable.sql',import.meta.url),'utf8');
 assert.match(QUERY,/^WITH expected_functions/u);
 assert.doesNotMatch(QUERY,/\b(?:INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|GRANT|REVOKE|PERFORM|EXECUTE|DO)\s+(?:ON|TABLE|FUNCTION|FROM|INTO|SET)\b/iu);
 assert.equal(REQUIRED_VERSIONS.length,8);
 for(const version of REQUIRED_VERSIONS){
  assert.ok(QUERY.includes("'"+version+"'"));
  assert.ok(on.includes("'"+version+"'"));
 }
 for(const [name,f] of Object.entries(FUNCTIONS)){
  assert.ok(QUERY.includes("'"+name+"'"));
  assert.ok(QUERY.includes("'"+f.hash+"'"));
  assert.ok(install.includes(f.hash)||on.includes(f.hash),
    'signed source hash drift: '+name);
 }
 assert.ok(QUERY.includes("training_session_occurrences_v1"));
 assert.ok(QUERY.includes("domain_entities_v26"));
 assert.ok(QUERY.includes("u60_dated_execution_update_receipt"));
 assert.ok(QUERY.includes("u60_typed_execution_fence"));
 assert.ok(QUERY.includes("pg_get_functiondef"));
 assert.ok(!QUERY.includes('decrypted_secret'));
 assert.ok(!QUERY.includes('auth.users'));
});
