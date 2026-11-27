import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {gx350SourceScope} from './verify_gx350_preactivated.mjs';

// Release hosts use the system Git installation, never a PATH-resolved executable.
const SYSTEM_GIT=process.platform==='win32'?'C:/Program Files/Git/cmd/git.exe':'/usr/bin/git';
const SHA=/^[0-9a-f]{40}$/u;
const REJECTED_PREFIXES=[
  'supabase/functions/',
  'backend/',
  'scripts/auth/',
];
const REJECTED_PATHS=new Set(['supabase/config.toml']);
// QA migration/rollback SQL files are inert repository evidence in a
// frontend-only release. They must never become executable backend modules.
const QA_SOURCE_SQL=/^supabase\/qa-(?:migrations|rollbacks)\/[0-9a-z][0-9a-z._-]*\.sql$/u;
// Exception for this certified U120 frontend-only promotion, NOT a general
// backend/QA allowance. These source blobs are NEVER deployed or executed.
// Any edit, new rollout, alternate path or blob SHA fails closed.
export const FROZEN_QA_INERT_BLOBS=Object.freeze({
  "supabase/functions/iberfit-qa-webauthn-cert-broker/index.ts": "30b5df936fefa3f2308e5a1ba2aec7bb28ad780d",
  "supabase/qa-rollouts/20261031213500_p0_free_qa_legacy_compact_refs_v1.disable.sql": "113445be39b4a06bd280c299f88c82659a107e26",
  "supabase/qa-rollouts/20261031213500_p0_free_qa_legacy_compact_refs_v1.enable.sql": "fb9ab40dbb51f6c4c2ffd492a9e8badfb85a4d59",
  "supabase/qa-rollouts/20261101115000_p0_free_qa_hidden_fixture_checkin_revisions_v1.disable.sql": "14a5f9e8a746384eb9bbaa4355c6cf01899659c5",
  "supabase/qa-rollouts/20261101115000_p0_free_qa_hidden_fixture_checkin_revisions_v1.enable.sql": "c0432a32be9d2dee07264fef660e4891f49d5a00",
  "supabase/qa-rollouts/20261102015500_p0_free_qa_client_body_envelope_dedup_v1.disable.sql": "e9e3eed735c544ec635b4694caa211d826f34c03",
  "supabase/qa-rollouts/20261102015500_p0_free_qa_client_body_envelope_dedup_v1.enable.sql": "860a8b5f87f93e353e85f182899a39d2bff3a76f",
  "supabase/qa-rollouts/20261102051000_p0_free_qa_client_body_envelope_dedup_v2.enable.sql": "2e1273ff2dfe5a441d85edf77c0e81a50be7afc6",
});
// M1: these four SQL source files are out-of-band *procedures*, not migrations
// and never run by production-promote. Allow only immutable Git blob identities.
// Unknown/changed Supabase paths still block a frontend-only release.
export const FROZEN_M1_RELEASE_PROCEDURE_BLOBS=Object.freeze({
  "supabase/release-procedures/20261112_m1_u60_prod_guarded_disable.sql": "3c10bfce644084f7b98de67904e0293ff0e344fd",
  "supabase/release-procedures/20261112_m1_u60_prod_guarded_enable.sql": "64280b198675aa8477fb65328717e991a8bc324e",
  "supabase/release-procedures/20261113_m1_u72_prod_guarded_install.sql": "6373698bf94389ad8ac9cde610344a1eb92757f6",
  "supabase/release-procedures/20261113_m1_u72_prod_guarded_rollback.sql": "c2634579ade73aee72fd0029705e745ee4ff0711"
});
// This single Edge source is inert in a Pages-only build. Its independently
// deployed version must be attested before activating dated training.
export const FROZEN_PREACTIVATED_EDGE_BLOBS=Object.freeze({
 'supabase/functions/iberfit-admin-client-invite-v1/index.ts':
 '9124e4e5c46419f4cc339fed05f6be34ac67524b',
});
const QA_BLOB_SHA=/^[0-9a-f]{40}$/u;

// Validate *exact source commit* blob identities. Do not rely on the working
// directory or trust that a filename alone proves a QA-only source is inert.
export function verifyFrozenQaArtifacts({sourceSha,changedPaths,blobAtSource}={}){
  if(!SHA.test(sourceSha||'')||!Array.isArray(changedPaths))
    throw Error('FRONTEND_ONLY_QA_BLOB_INPUT_INVALID');
  const frozen=changedPaths.filter(path=>Object.hasOwn(FROZEN_QA_INERT_BLOBS,path));
  if(frozen.length>0&&typeof blobAtSource!=='function')
    throw Error('FRONTEND_ONLY_QA_BLOB_READER_REQUIRED');
  for(const path of frozen){
    const actual=String(blobAtSource(sourceSha,path)||'').trim();
    if(!QA_BLOB_SHA.test(actual)||actual!==FROZEN_QA_INERT_BLOBS[path])
      throw Error('FRONTEND_ONLY_QA_SOURCE_DRIFT:'+path);
  }
  return Object.freeze({verified:frozen.length,paths:Object.freeze([...frozen])});
}


export function verifyFrozenM1ReleaseProcedures({sourceSha,changedPaths,blobAtSource}={}){
  if(!SHA.test(sourceSha||'')||!Array.isArray(changedPaths))
    throw Error('FRONTEND_ONLY_M1_SQL_BLOB_INPUT_INVALID');
  const procedures=changedPaths.filter(path=>
    Object.hasOwn(FROZEN_M1_RELEASE_PROCEDURE_BLOBS,path));
  if(procedures.length>0&&typeof blobAtSource!=='function')
    throw Error('FRONTEND_ONLY_M1_SQL_BLOB_READER_REQUIRED');
  for(const path of procedures){
    const actual=String(blobAtSource(sourceSha,path)||'').trim();
    if(!QA_BLOB_SHA.test(actual)||
      actual!==FROZEN_M1_RELEASE_PROCEDURE_BLOBS[path])
      throw Error('FRONTEND_ONLY_M1_SQL_SOURCE_DRIFT:'+path);
  }
  return Object.freeze({verified:procedures.length,
    paths:Object.freeze([...procedures])});
}

export function verifyFrozenPreactivatedEdge({sourceSha,changedPaths,blobAtSource}={}){
 if(!SHA.test(sourceSha||'')||!Array.isArray(changedPaths))
   throw Error('FRONTEND_ONLY_EDGE_INPUT_INVALID');
 const files=changedPaths.filter(path=>Object.hasOwn(FROZEN_PREACTIVATED_EDGE_BLOBS,path));
 if(files.length&&typeof blobAtSource!=='function')
   throw Error('FRONTEND_ONLY_EDGE_BLOB_READER_REQUIRED');
 for(const path of files){
   const actual=String(blobAtSource(sourceSha,path)||'').trim();
   if(actual!==FROZEN_PREACTIVATED_EDGE_BLOBS[path])
     throw Error('FRONTEND_ONLY_EDGE_SOURCE_DRIFT:'+path);
 }
 return Object.freeze({verified:files.length,paths:Object.freeze(files)});
}

// Exact-reviewed QA rollouts and dormant PROD rollback/install source cannot be
// executed by this Pages workflow. A source-only exception never authorizes SQL.
export const FROZEN_INERT_CUTOVER_SQL_BLOBS=Object.freeze({
  "supabase/qa-rollouts/20261116024000_p0_free_qa_completed_execution_detail_demand_v1.disable.sql": "c2b4f67b59d7b2d80346b8680cfc800a55d1abff",
  "supabase/qa-rollouts/20261116024000_p0_free_qa_completed_execution_detail_demand_v1.enable.sql": "84adeadf42b304ceac4ac2b10cd8b78302d69f43",
  "supabase/qa-rollouts/20261118015500_p0_free_completed_session_scalar_fast_v1.disable.sql": "241b5e42852fc6b2727b30de76f970c6a89d6c78",
  "supabase/qa-rollouts/20261118015500_p0_free_completed_session_scalar_fast_v1.enable.sql": "4d60e713b9a3f632c32d15b86370cb6f7baa050d",
  "supabase/qa-rollouts/20261118032000_p0_free_completed_execution_scalar_fast_v1.disable.sql": "bc31a8a33aea69b6731b4acc41a56a3917eb317d",
  "supabase/qa-rollouts/20261118032000_p0_free_completed_execution_scalar_fast_v1.enable.sql": "5dbaa3b77df96319cf287a7b19b13d1ca3acdc5d",
  "supabase/qa-rollouts/p0_free_qa_history_page64_v1.sql": "cc9b4a0e77b39b7e299b286730a4bf3af4581f1b",
  "supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.rollback.sql": "75f1b5c7c21d303dd9fda523a4b8911d9df080c8",
  "supabase/release-procedures/20261117_m1_u72_prod_guarded_materialized_v1.sql": "1b96811cae4b7cfc1daa069e1ece14f264e9768c",
  // M1 autonomous date-only SQL is inert source in the PAGES-only release.
  // Backend must already be independently certified; no SQL is run here.
  "supabase/release-procedures/20261121_m1_autonomous_dates_guarded_overlay_v1.sql": "97ab01d06d474fcad94d65efd751ae4b325f8f25",
  "supabase/release-procedures/20261121_m1_autonomous_dates_guarded_overlay_v1.rollback.sql": "07e3456a0e01663bbdeeed62348c464cc3a500ad",
  // PR #1462: reviewed dormant IRI history v2 candidate and rollback. Only
  // these two immutable source blobs; no SQL execution, migration or grants.
  "supabase/release-procedures/free_iri_report_history_pagination_v2.sql": "639d24299aefd06f2d2c2d8984ed822279f664e3",
  "supabase/release-procedures/free_iri_report_history_pagination_v2.rollback.sql": "8934d30f546d2608346925e70d659cc8f3493698"
});
export function verifyFrozenInertCutoverSql({sourceSha,changedPaths,blobAtSource}={}){
 if(!SHA.test(sourceSha||'')||!Array.isArray(changedPaths))
   throw Error('FRONTEND_ONLY_INERT_SQL_INPUT_INVALID');
 const files=changedPaths.filter(p=>Object.hasOwn(FROZEN_INERT_CUTOVER_SQL_BLOBS,p));
 if(files.length&&typeof blobAtSource!=='function')
   throw Error('FRONTEND_ONLY_INERT_SQL_BLOB_READER_REQUIRED');
 for(const path of files){
   const actual=String(blobAtSource(sourceSha,path)||'').trim();
   if(actual!==FROZEN_INERT_CUTOVER_SQL_BLOBS[path])
     throw Error('FRONTEND_ONLY_INERT_SQL_SOURCE_DRIFT:'+path);
 }
 return Object.freeze({verified:files.length,paths:Object.freeze(files)});
}

// A frontend-only release does not run SQL. New migration/rollback source files
// remain unapplied and must never be mistaken for a completed DB migration.
export function evaluateFrontendOnlyChanges({sourceSha,expectedPreviousLiveSha,changedPaths}={}){
  if(!SHA.test(sourceSha||''))throw Error('FRONTEND_ONLY_SOURCE_SHA_INVALID');
  if(!SHA.test(expectedPreviousLiveSha||''))throw Error('FRONTEND_ONLY_BASELINE_SHA_INVALID');
  if(sourceSha===expectedPreviousLiveSha)throw Error('FRONTEND_ONLY_SAME_SHA');
  if(!Array.isArray(changedPaths)||changedPaths.length===0)
    throw Error('FRONTEND_ONLY_EMPTY_DIFF');
  const blocked=[];
  const unappliedMigrations=[];
  for(const path of changedPaths){
    if(typeof path!=='string'||!path||path.includes('\0')||/[\r\n]/u.test(path)||
       path.startsWith('/')||path.split('/').includes('..')){
      throw Error('FRONTEND_ONLY_DIFF_PATH_INVALID');
    }
    if(!Object.hasOwn(FROZEN_QA_INERT_BLOBS,path)&&
       !Object.hasOwn(FROZEN_M1_RELEASE_PROCEDURE_BLOBS,path)&&
       !Object.hasOwn(FROZEN_PREACTIVATED_EDGE_BLOBS,path)&&
       !Object.hasOwn(FROZEN_INERT_CUTOVER_SQL_BLOBS,path)&&
       (REJECTED_PATHS.has(path)||REJECTED_PREFIXES.some(prefix=>path.startsWith(prefix))||
        (path.startsWith('supabase/')&&
         !/^supabase\/(?:migrations|rollbacks)\//u.test(path)&&
         !QA_SOURCE_SQL.test(path)))){
      blocked.push(path);
    }
    if(/^supabase\/(?:migrations|rollbacks)\//u.test(path)||QA_SOURCE_SQL.test(path))
      unappliedMigrations.push(path);
  }
  if(blocked.length){
    // File paths, never API keys, are safe to output in the protected CI log.
    throw Error('FRONTEND_ONLY_BACKEND_CHANGED:'+blocked.join(','));
  }
  return Object.freeze({
    ok:true,
    schema:'iberfit.production.frontend-only-scope.v1',
    sourceSha,
    expectedPreviousLiveSha,
    changedFileCount:changedPaths.length,
    backendServicesDeployed:false,
    hostedAuthMutated:false,
    productionSqlApplied:false,
    unappliedMigrationFileCount:unappliedMigrations.length,
  });
}

export function verifyFrontendOnlyLiveIdentity(version,{expectedPreviousLiveSha,prodRef}={}){
  if(!version||typeof version!=='object'||Array.isArray(version)||
     version.sourceSha!==expectedPreviousLiveSha||
     version.environment!=='PRODUCTION'||version.production!==true||
     version.qaOnly!==false||version.projectRef!==prodRef)
    throw Error('FRONTEND_ONLY_LIVE_PROD_IDENTITY_DRIFT');
  return true;
}

// A release manifest is not enough: the build mode, verification mode and
// backend preactivation evidence must all describe the SAME exact source SHA.
// This guards against stale GITHUB_ENV or a closed/active mode mismatch.
export function certifyFrontendReleaseModeContext({
 sourceSha,mode,verificationMode,activationFlag,certifiedSourceSha,operatorApproval
}={}){
 if(!SHA.test(sourceSha||''))throw Error('FRONTEND_ONLY_MODE_SOURCE_SHA_INVALID');
 if(!['closed','active'].includes(mode))throw Error('FRONTEND_ONLY_MODE_UNSUPPORTED');
 if(verificationMode!==mode)throw Error('FRONTEND_ONLY_MODE_VERIFIER_DRIFT');
 if(activationFlag!==(mode==='active'?'true':'false'))
   throw Error('FRONTEND_ONLY_MODE_ACTIVATION_DRIFT');
 if(mode==='active'){
   if(certifiedSourceSha!==sourceSha||operatorApproval!=='approved')
     throw Error('FRONTEND_ONLY_MODE_BACKEND_CERTIFICATION_REQUIRED');
 }else if(certifiedSourceSha!==undefined||operatorApproval!==undefined){
   throw Error('FRONTEND_ONLY_MODE_CLOSED_PROOF_UNEXPECTED');
 }
 return Object.freeze({mode,sourceSha,backendMutationsAuthorized:false});
}

async function main(){
  if(process.env.FRONTEND_ONLY_RELEASE!=='true')throw Error('FRONTEND_ONLY_MODE_NOT_AUTHORIZED');
  if(process.env.APP_DOMAIN!=='app.iberfit.cl')throw Error('FRONTEND_ONLY_DOMAIN_MISMATCH');
  const prodRef='pjhmrhejsoofmouedavw';
  if(process.env.PROD_SUPABASE_REF!==prodRef)throw Error('FRONTEND_ONLY_PROD_REF_MISMATCH');
  const sourceSha=process.env.SOURCE_SHA;
  const expectedPreviousLiveSha=process.env.EXPECTED_PREVIOUS_LIVE_SHA;
  if(!SHA.test(sourceSha||'')||!SHA.test(expectedPreviousLiveSha||'')){
    throw Error('FRONTEND_ONLY_SHA_INVALID');
  }
  certifyFrontendReleaseModeContext({
    sourceSha,mode:process.env.M26_U60_PROD_MODE,
    verificationMode:process.env.M26_VERIFY_DATED_TRAINING_MODE,
    activationFlag:process.env.U60_RELEASE_ACTIVE,
    certifiedSourceSha:process.env.M26_U60_CERTIFIED_SOURCE_SHA,
    operatorApproval:process.env.M26_U60_OPERATOR_APPROVAL,
  });
  try{
    execFileSync(SYSTEM_GIT,['merge-base','--is-ancestor',expectedPreviousLiveSha,sourceSha],
      {stdio:'pipe',timeout:10000});
  }catch{
    throw Error('FRONTEND_ONLY_SOURCE_NOT_DESCENDANT_OF_PROD');
  }
  const changedPaths=execFileSync(SYSTEM_GIT,['diff','--name-only',
    expectedPreviousLiveSha,sourceSha],{encoding:'utf8',timeout:10000})
    .split(/\r?\n/u).filter(Boolean);
  // GX350 remains a Pages-only workflow; its backend is separately preactivated.
  // Exact candidate source scope is necessary but not sufficient: the independent
  // live backend attestation is executed before build and again before cutover.
  const gx350=gx350SourceScope({sourceSha,expectedPreviousLiveSha});
  if(gx350&&process.env.M26_U60_PROD_MODE!=='active')throw Error('GX350_RELEASE_ACTIVE_MODE_REQUIRED');
  const legacyPaths=gx350?changedPaths.filter(p=>!gx350.paths.includes(p)):changedPaths;
  const proof=evaluateFrontendOnlyChanges({sourceSha,expectedPreviousLiveSha,changedPaths:legacyPaths});
  // Special-case QA material is frozen by source blob and never executed.
  // Git object lookup is locked to the signed release SHA, not HEAD/working tree.
  const qaArtifacts=verifyFrozenQaArtifacts({
    sourceSha,changedPaths:legacyPaths,
    blobAtSource:(source,path)=>execFileSync(SYSTEM_GIT,['rev-parse',source+':'+path],
      {encoding:'utf8',timeout:10000}).trim(),
  });
  const m1Procedures=verifyFrozenM1ReleaseProcedures({
    sourceSha,changedPaths:legacyPaths,
    blobAtSource:(source,path)=>execFileSync(SYSTEM_GIT,['rev-parse',source+':'+path],
      {encoding:'utf8',timeout:10000}).trim(),
  });
  const inertSql=verifyFrozenInertCutoverSql({
    sourceSha,changedPaths:legacyPaths,
    blobAtSource:(source,path)=>execFileSync(SYSTEM_GIT,['rev-parse',source+':'+path],
      {encoding:'utf8',timeout:10000}).trim(),
  });
  const edgeSource=verifyFrozenPreactivatedEdge({
    sourceSha,changedPaths:legacyPaths,
    blobAtSource:(source,path)=>execFileSync(SYSTEM_GIT,['rev-parse',source+':'+path],
      {encoding:'utf8',timeout:10000}).trim(),
  });
  const response=await fetch('https://'+process.env.APP_DOMAIN+'/m26/version.json',{
    method:'GET',cache:'no-store',redirect:'follow',
    headers:{'cache-control':'no-cache','pragma':'no-cache'},
    signal:AbortSignal.timeout(20000),
  });
  if(!response.ok)throw Error('FRONTEND_ONLY_PROD_IDENTITY_HTTP_'+response.status);
  let version;
  try{version=await response.json();}
  catch{throw Error('FRONTEND_ONLY_PROD_IDENTITY_NOT_JSON');}
  verifyFrontendOnlyLiveIdentity(version,{expectedPreviousLiveSha,prodRef});
  writeFileSync('FRONTEND_ONLY_SCOPE_EVIDENCE.json',
    JSON.stringify({...proof,changedFileCount:changedPaths.length,gx350ScopedSourceVerified:gx350?.paths.length??0,frozenQaInertArtifactsVerified:qaArtifacts.verified,
      stagedM1SqlProceduresVerified:m1Procedures.verified,
      preactivatedEdgeSourceVerified:edgeSource.verified,
      inertCutoverSqlFilesVerified:inertSql.verified,liveIdentityVerified:true},null,2)+'\n',{encoding:'utf8',flag:'w',mode:0o600});
  console.log('FRONTEND_ONLY_PROD_SCOPE_CERTIFIED source='+sourceSha+
    ' previous='+expectedPreviousLiveSha+' changed='+changedPaths.length+
    ' unappliedMigrations='+proof.unappliedMigrationFileCount+
    ' backendWrites=false hostedAuthWrites=false');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(error=>{
    console.error(String(error?.message||'FRONTEND_ONLY_SCOPE_FAILED'));
    process.exitCode=1;
  });
}
// SIGNATURE U122 (2026-11-02): release-only exact-SHA gate renewal after the
// concurrent P0 Supabase Free QA observability merge. All frontend-only scope,
// frozen blob SHA enforcement, PROD identity lock and security logic unchanged.

// SIGNATURE U123: end-to-end production gate source is CI-audited on the exact
// Canary merge SHA; no operational, backend, permission or data behavior changes.

// SIGNATURE U124 (2026-11-02): trigger all exact-source QA release gates for
// the Coach real-pointer and IRI JSON reliability fix. This is inert source
// commentary; PROD SHA lock, frozen QA blobs, scopes and security stay intact.

// SIGNATURE R49 (2026-11-02): exact-source release QA gate renewal after the
// merged R49 visual closure. This comment changes no runtime, backend, Auth,
// permissions, production promotion safety, or client-visible behaviour.

// FUNCTIONAL360 R50 (2026-11-03): renew exact-source release certifications for
// running first-click recovery, next-open wearable permission invitation,
// seven-report draft safety and Client/Coach/ Admin chart views. This inert
// comment triggers required Coach/Admin WebAuthn and remote QA on the same
// Canary SHA; it does not change release checks, production, Auth, RLS,
// data, permissions, application runtime, or privacy policy.

// R50 M44 path-filter convergence 2026-11-04: renew all seven exact-source
// QA gates after protected M44 backup; no executable promotion behavior changed.
