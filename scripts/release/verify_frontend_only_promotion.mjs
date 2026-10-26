import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

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
    if(REJECTED_PATHS.has(path)||REJECTED_PREFIXES.some(prefix=>path.startsWith(prefix))||
       (path.startsWith('supabase/')&&
        !/^supabase\/(?:migrations|rollbacks)\//u.test(path)&&
        !QA_SOURCE_SQL.test(path))){
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
    execFileSync('git',['merge-base','--is-ancestor',expectedPreviousLiveSha,sourceSha],
      {stdio:'pipe',timeout:10000});
  }catch{
    throw Error('FRONTEND_ONLY_SOURCE_NOT_DESCENDANT_OF_PROD');
  }
  const changedPaths=execFileSync('git',['diff','--name-only',
    expectedPreviousLiveSha,sourceSha],{encoding:'utf8',timeout:10000})
    .split(/\r?\n/u).filter(Boolean);
  const proof=evaluateFrontendOnlyChanges({sourceSha,expectedPreviousLiveSha,changedPaths});
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
    JSON.stringify({...proof,liveIdentityVerified:true},null,2)+'\n',{encoding:'utf8',flag:'w',mode:0o600});
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
