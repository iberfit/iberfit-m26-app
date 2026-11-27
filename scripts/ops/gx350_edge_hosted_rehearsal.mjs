// One-off QA-only hosted deployment/rollback rehearsal under temporary slugs.
// Never replaces a canonical function, writes production, uses client data,
// sends mail, or presents gateway rejection as authenticated business E2E.
import {execFileSync} from 'node:child_process';
import {appendFileSync,readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gitBlob,validateScope} from './gx350_edge_scope.mjs';
import {repositoryReader,rehearseEdgePackages} from './gx350_edge_stage_rehearsal.mjs';
import {verifyGx350Edges} from '../release/verify_gx350_preactivated.mjs';
const QA='gjztkdwfmunnzhtvxrsu',REPO='iberfit/iberfit-m26-app',BRANCH='refs/heads/ops/gx350-m44-managed-recovery-preflight';
const ORIGIN='https://m26-canary.iberfit.cl',OTHER='https://untrusted.invalid';
const token=process.env.SUPABASE_ACCESS_TOKEN;
const run=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT;
const fail=code=>{throw Error('GX350_HOSTED_'+code);};
if(process.env.GITHUB_REPOSITORY!==REPO||process.env.GITHUB_REF!==BRANCH||
 !/^[0-9]{1,20}$/u.test(run||'')||!/^[0-9]{1,4}$/u.test(attempt||'')||!token||token.length<20)fail('PROTECTED_CONTEXT');
const manifest=validateScope(JSON.parse(readFileSync(new URL('./gx350_edge_scope.json',import.meta.url),'utf8')));
if(manifest.qaProject!==QA)fail('QA_REF');
const aliases=manifest.functions.map((_,i)=>'gx350-drill-'+run+'-'+attempt+'-'+(i+1));
const read=repositoryReader(fileURLToPath(new URL('../../',import.meta.url)));
const api='https://api.supabase.com/v1/projects/'+QA;
async function request(path,method='GET',body){
 const response=await fetch(api+path,{method,redirect:'error',
  headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)fail('MANAGEMENT_HTTP_'+response.status);
 if(method==='DELETE')return null;
 try{return await response.json();}catch{fail('MANAGEMENT_JSON');}
}
async function assertQA(){
 const project=await request('');
 if(project.status!=='ACTIVE_HEALTHY'||(project.id??project.ref)!==QA)fail('QA_PROJECT_STATE');
 const raw=await request('/database/query/read-only','POST',{query:'select public.iberfit_environment() as environment'});
 const rows=Array.isArray(raw)?raw:raw?.result;
 const env=rows?.[0]?.environment;
 if(rows?.length!==1||env?.environment!=='QA'||env.realDataAllowed!==false||env.productionBlocked!==true)fail('QA_SAFETY');
}
async function list(){
 const raw=await request('/functions');
 const rows=Array.isArray(raw)?raw:raw?.functions;
 if(!Array.isArray(rows)||new Set(rows.map(x=>x.slug)).size!==rows.length)fail('FUNCTION_LIST');
 return rows;
}
function canonical(rows){
 return JSON.stringify(rows.filter(x=>!aliases.includes(x.slug)).map(x=>[x.slug,x.id,x.version,x.verify_jwt,x.ezbr_sha256,x.status]).sort((a,b)=>a[0].localeCompare(b[0])));
}
async function cleanup(){
 await assertQA();
 const before=await list();
 for(const alias of aliases)if(before.some(x=>x.slug===alias))await request('/functions/'+alias,'DELETE');
 if((await list()).some(x=>aliases.includes(x.slug)))fail('CLEANUP_INCOMPLETE');
 console.log('GX350_HOSTED_QA_CLEANUP_OK:temporary_functions=0');
}
function stage(f,kind,alias){
 const dir=mkdtempSync(join(tmpdir(),'iberfit-gx350-hosted-'));
 try{
  const target=join(dir,'supabase','functions',alias);
  mkdirSync(target,{recursive:true});
  writeFileSync(join(dir,'supabase','config.toml'),'project_id = "gx350-drill"\n[functions.'+alias+']\nverify_jwt = '+f.verifyJwt+'\n',{flag:'wx'});
  for(const x of [...f[kind],...(kind==='prod'&&f.importMap?[f.importMap]:[])]){
   const bytes=read(x.sourceRef,x.sourcePath);
   if(gitBlob(bytes)!==x.blob)fail('PACKAGE_SOURCE_DRIFT');
   const file=join(target,x.name);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes,{flag:'wx'});
  }
  return dir;
 }catch(error){rmSync(dir,{recursive:true,force:true});throw error;}
}
async function deploy(f,kind,alias){
 const dir=stage(f,kind,alias);
 try{
  // Fixed CLI version and fixed QA target. Keep provider output out of logs.
  try{execFileSync(join(dirname(process.execPath),'npx'),['--yes','supabase@2.117.0','functions','deploy',alias,'--workdir',dir,'--project-ref',QA,'--use-api','--yes',...(f.verifyJwt?[]:['--no-verify-jwt'])],{stdio:'pipe',timeout:180000,maxBuffer:1024*1024});}
  catch{fail('DEPLOY_FAILED');}
 }finally{rmSync(dir,{recursive:true,force:true});}
 const rows=await list(),meta=rows.find(x=>x.slug===alias);
 if(!meta||meta.status!=='ACTIVE'||meta.verify_jwt!==f.verifyJwt||
  !/^[a-f0-9]{64}$/u.test(meta.ezbr_sha256||'')||!Number.isSafeInteger(meta.version)||meta.version<1)fail('DEPLOY_METADATA');
 return {digest:meta.ezbr_sha256,version:meta.version};
}
async function probe(f,alias){
 const uuid='00000000-0000-4000-8000-000000000001';
 const body=f.slug.includes('invite')?{command:{type:'ADMIN_CLIENTE_REENVIAR_INVITACION',operationId:'gx350-hosted-drill',entityId:uuid,payload:{clientId:uuid}}}:f.slug.includes('evolution')?{action:'latest',reportId:uuid}:{action:'health'};
 // Gateway JWT rejects unauthenticated requests before evolution code. Do
 // not count those requests as business/runtime proof for that function.
 const cases=f.verifyJwt?[['POST',ORIGIN,null,401],['POST',ORIGIN,'Bearer synthetic-invalid',401]]:
 [['POST',ORIGIN,null,401],['POST',OTHER,null,403],['GET',ORIGIN,null,405],['OPTIONS',ORIGIN,null,204],['POST',ORIGIN,'Bearer synthetic-invalid',401]];
 for(const [method,origin,auth,status] of cases){
  const res=await fetch('https://'+QA+'.supabase.co/functions/v1/'+alias,{method,redirect:'error',headers:{Origin:origin,'Content-Type':'application/json',...(auth?{Authorization:auth}:{})},...(method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  await res.body?.cancel();
  if(res.status!==status)fail('PROBE_STATUS_'+method+'_'+res.status);
  if(!f.verifyJwt&&res.headers.get('access-control-allow-origin')!==(origin===OTHER?null:origin))fail('PROBE_CORS');
 }
 return cases.length;
}
async function main(){
 await assertQA();
 const original=await list();verifyGx350Edges(original);
 if(original.some(x=>aliases.includes(x.slug)))fail('ALIAS_COLLISION');
 const baseline=canonical(original);
 rehearseEdgePackages(manifest,read);
 // The cleanup step is permitted only after all run-specific aliases were
 // shown absent. A failed preflight can never delete an existing alias.
 if(!process.env.GITHUB_OUTPUT)fail('CLEANUP_MARKER_MISSING');
 appendFileSync(process.env.GITHUB_OUTPUT,'cleanup_safe=true\n');
 let checks=0,deploys=0;
 try{
  for(const [i,f] of manifest.functions.entries()){
   const alias=aliases[i];let first,second;
   for(const [stageNo,kind] of ['prod','candidate','prod'].entries()){
    const meta=await deploy(f,kind,alias);deploys++;
    if(stageNo===0)first=meta;
    if(stageNo===1){second=meta;if(second.digest===first.digest||second.version<=first.version)fail('CANDIDATE_NOT_DISTINCT');}
    if(stageNo===2&&(meta.digest!==first.digest||meta.version<=second.version))fail('ROLLBACK_BUNDLE_MISMATCH');
    checks+=await probe(f,alias);
   }
   console.log('GX350_HOSTED_QA_ROLLBACK_OK:'+f.slug);
  }
 }finally{await cleanup();}
 const final=await list();verifyGx350Edges(final);
 if(canonical(final)!==baseline)fail('CANONICAL_DRIFT');
 console.log(JSON.stringify({schema:'iberfit.gx350.hosted-qa-rehearsal.v1',candidate:manifest.candidate,deploys,checks,temporarySlugsOnly:true,canonicalUnchanged:true,qaCleanupVerified:true,productionWrites:0,authenticatedBusinessE2E:false,priorImportMapLiveBytesVerified:false,fullPlatformRecoveryCertified:false,productionAuthorized:false}));
}
try{
 if(process.argv.length===3&&process.argv[2]==='--cleanup')await cleanup();
 else if(process.argv.length===2)await main();
 else fail('ARGUMENTS');
}catch(error){
 const msg=String(error?.message||'');
 console.error(msg.startsWith('GX350_HOSTED_')||msg.startsWith('GX350_RELEASE_')||msg.startsWith('GX350_EDGE_')?msg:'GX350_HOSTED_REHEARSAL_FAILED');
 process.exitCode=1;
}
