import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

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
  try{
    execFileSync(SYSTEM_GIT,['merge-base','--is-ancestor',expectedPreviousLiveSha,sourceSha],
      {stdio:'pipe',timeout:10000});
  }catch{
    throw Error('FRONTEND_ONLY_SOURCE_NOT_DESCENDANT_OF_PROD');
  }
  const changedPaths=execFileSync(SYSTEM_GIT,['diff','--name-only',
    expectedPreviousLiveSha,sourceSha],{encoding:'utf8',timeout:10000})
    .split(/\r?\n/u).filter(Boolean);
  const proof=evaluateFrontendOnlyChanges({sourceSha,expectedPreviousLiveSha,changedPaths});
  // Special-case QA material is frozen by source blob and never executed.
  // Git object lookup is locked to the signed release SHA, not HEAD/working tree.
  const qaArtifacts=verifyFrozenQaArtifacts({
    sourceSha,changedPaths,
    blobAtSource:(source,path)=>execFileSync(SYSTEM_GIT,['rev-parse',source+':'+path],
      {encoding:'utf8',timeout:10000}).trim(),
  });
  const m1Procedures=verifyFrozenM1ReleaseProcedures({
    sourceSha,changedPaths,
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
    JSON.stringify({...proof,frozenQaInertArtifactsVerified:qaArtifacts.verified,
      stagedM1SqlProceduresVerified:m1Procedures.verified,liveIdentityVerified:true},null,2)+'\n',{encoding:'utf8',flag:'w',mode:0o600});
  console.log('FRONTEND_ONLY_PROD_SCOPE_CERTIFIED source='+sourceSha+
    ' previous='+expectedPreviousLiveSha+' changed='+proof.changedFileCount+
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
