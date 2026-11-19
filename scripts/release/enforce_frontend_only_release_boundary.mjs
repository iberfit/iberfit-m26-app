// Pages rollback does not revert Supabase Edge or Hosted Auth.
// Keep the pre-mutation full-release route closed until an independently
// reversible backend release path has been certified. No network or secrets.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const BACKEND_NO_GO='IBERFIT_PROD_BACKEND_MUTATION_REQUIRES_VERIFIED_ROLLBACK';
const SHA=/^[0-9a-f]{40}$/u;
export function enforcePagesOnlyBoundary(m){
  if(!m||typeof m!=='object'||Array.isArray(m)||
     m.schema!=='iberfit.production.release.v1'||
     m.sourceBranch!=='canary/rc74-4'||
     m.target!=='iberfit-m26-production'||
     m.domain!=='app.iberfit.cl'||m.promote!==true||
     !SHA.test(m.sourceSha||''))
    throw Error('IBERFIT_PROD_RELEASE_IDENTITY_INVALID');
  if(m.frontendOnly!==true)throw Error(BACKEND_NO_GO);
  if(!SHA.test(m.expectedPreviousLiveSha||'')||
     m.expectedPreviousLiveSha===m.sourceSha)
    throw Error('IBERFIT_PROD_PREVIOUS_LIVE_SHA_INVALID');
  const mode=m.datedTrainingMode??'closed';
  if(!['closed','active'].includes(mode))throw Error('IBERFIT_PROD_DATED_MODE_INVALID');
  if(mode==='active'&&m.backendActivationProof!=='verified-dated-sql-edge')
    throw Error('IBERFIT_PROD_BACKEND_PREACTIVATION_REQUIRED');
  if(mode==='closed'&&m.backendActivationProof!==undefined)
    throw Error('IBERFIT_PROD_BACKEND_PROOF_UNEXPECTED');
  return Object.freeze({scope:'PAGES_FRONTEND_ONLY',datedMode:mode,
    backendMutationsAuthorized:false,hostedAuthMutationsAuthorized:false,
    backendRecoveryCertified:false});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    if(process.argv.length!==2)throw Error('IBERFIT_PROD_RELEASE_NO_ARGUMENTS');
    const manifest=readFileSync('.iberfit/production-release.json','utf8');
    if(Buffer.byteLength(manifest,'utf8')>8192)
      throw Error('IBERFIT_PROD_RELEASE_MANIFEST_TOO_LARGE');
    const result=enforcePagesOnlyBoundary(JSON.parse(manifest));
    console.log('IBERFIT_PROD_PAGES_ONLY_BOUNDARY_OK:'+result.scope);
  }catch(error){
    const code=String(error?.message||'');
    console.error(code.startsWith('IBERFIT_PROD_')?code:'IBERFIT_PROD_RELEASE_BOUNDARY_ERROR');
    process.exitCode=1;
  }
}
