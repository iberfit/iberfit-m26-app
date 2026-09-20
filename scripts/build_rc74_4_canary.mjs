import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const QA_REF='gjztkdwfmunnzhtvxrsu';
const QA_ORIGIN=`https://${QA_REF}.supabase.co`;
const PROD_REF='pjhmrhejsoofmouedavw';
const CANARY_BRANCH='canary/rc74-4';
const VERSION='26.0.0-canary.74.4-phase-a';
const RELEASE='IBERFIT_M26_CANARY_RC74_4_PHASE_A';

function fail(code){throw new Error(code);}
function sha(value){
  const normalized=String(value||'').trim().toLowerCase();
  return /^[0-9a-f]{40}$/u.test(normalized)?normalized:'';
}
function run(script,env={}){
  const result=spawnSync(process.execPath,[script],{
    cwd:root,
    env:{...process.env,...env},
    encoding:'utf8',
    stdio:'inherit',
    shell:false,
  });
  if(result.error)fail(`RC74_4_CANARY_BUILD_PROCESS_START_FAILED:${script}:${result.error.code||'UNKNOWN'}`);
  if(result.status!==0)fail(`RC74_4_CANARY_BUILD_STEP_FAILED:${script}`);
}

const sourceSha=sha(process.env.M26_SOURCE_SHA||process.env.CF_PAGES_COMMIT_SHA);
const sourceBranch=String(process.env.M26_SOURCE_BRANCH||process.env.CF_PAGES_BRANCH||'').trim();
const projectRef=String(process.env.M26_PROJECT_REF||'').trim();
const qaOnly=String(process.env.M26_QA_ONLY||'').trim().toLowerCase();
const supabaseUrl=String(process.env.M26_SUPABASE_URL||'').trim();
const publishableKey=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||'').trim();
const buildDir=path.resolve(process.env.M26_BUILD_DIR||path.join(root,'.tmp','rc64-current-surface'));

if(!sourceSha)fail('RC74_4_CANARY_SOURCE_SHA_INVALID');
if(sourceBranch!==CANARY_BRANCH)fail(`RC74_4_CANARY_SOURCE_BRANCH_MISMATCH:${sourceBranch||'missing'}`);
if(projectRef!==QA_REF)fail('RC74_4_CANARY_PROJECT_REF_MISMATCH');
if(qaOnly!=='true')fail('RC74_4_CANARY_QA_ONLY_REQUIRED');
let parsedUrl;
try{parsedUrl=new URL(supabaseUrl);}catch{fail('RC74_4_CANARY_SUPABASE_URL_INVALID');}
if(parsedUrl.origin!==QA_ORIGIN||parsedUrl.pathname!=='/'||parsedUrl.search||parsedUrl.hash)fail('RC74_4_CANARY_SUPABASE_ORIGIN_MISMATCH');
if(!publishableKey)fail('RC74_4_CANARY_PUBLISHABLE_KEY_MISSING');
if(/service[_-]?role/iu.test(publishableKey))fail('RC74_4_CANARY_SERVICE_ROLE_FORBIDDEN');

const sharedEnv={
  M26_BUILD_DIR:buildDir,
  M26_SOURCE_SHA:sourceSha,
  M26_SOURCE_BRANCH:sourceBranch,
  M26_PROJECT_REF:QA_REF,
  M26_QA_ONLY:'true',
  M26_SUPABASE_URL:QA_ORIGIN,
  M26_SUPABASE_PUBLISHABLE_KEY:publishableKey,
};
run('qa/rc64/build-current-surface.mjs',sharedEnv);
run('scripts/generate_rc74_4_runtime_config.mjs',sharedEnv);

const identity=Object.freeze({
  release:RELEASE,
  version:VERSION,
  sourceSha,
  sourceBranch,
  environment:'QA',
  projectRef:QA_REF,
  qaOnly:true,
  production:false,
});
const identityText=`${JSON.stringify(identity,null,2)}\n`;
const identityTargets=[path.join(buildDir,'version.json'),path.join(buildDir,'m26','version.json')];
for(const target of identityTargets){
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,identityText,'utf8');
}

const runtimePath=path.join(buildDir,'m26','runtime-config.js');
const rootHeadersPath=path.join(buildDir,'_headers');
const m26HeadersPath=path.join(buildDir,'m26','_headers');
for(const requiredPath of [runtimePath,rootHeadersPath,m26HeadersPath,...identityTargets]){
  if(!fs.existsSync(requiredPath)||fs.statSync(requiredPath).size===0)fail(`RC74_4_CANARY_BUILD_OUTPUT_MISSING:${path.relative(root,requiredPath)}`);
}
const runtime=fs.readFileSync(runtimePath,'utf8');
const headers=`${fs.readFileSync(rootHeadersPath,'utf8')}\n${fs.readFileSync(m26HeadersPath,'utf8')}`;
if(!runtime.includes('enabled: true')&&!runtime.includes('"enabled": true'))fail('RC74_4_CANARY_RUNTIME_NOT_ENABLED');
if(!runtime.includes('qaOnly: true')&&!runtime.includes('"qaOnly": true'))fail('RC74_4_CANARY_RUNTIME_NOT_QA_ONLY');
if(!runtime.includes(QA_REF)||runtime.includes(PROD_REF))fail('RC74_4_CANARY_RUNTIME_PROJECT_LEAK');
if(!headers.includes(QA_ORIGIN)||headers.includes(`https://${PROD_REF}.supabase.co`))fail('RC74_4_CANARY_HEADERS_PROJECT_LEAK');
for(const target of identityTargets){
  const parsed=JSON.parse(fs.readFileSync(target,'utf8'));
  if(parsed.sourceSha!==sourceSha)fail('RC74_4_CANARY_IDENTITY_SHA_MISMATCH');
  if(parsed.sourceBranch!==CANARY_BRANCH)fail('RC74_4_CANARY_IDENTITY_BRANCH_MISMATCH');
  if(parsed.projectRef!==QA_REF||parsed.qaOnly!==true||parsed.production!==false)fail('RC74_4_CANARY_IDENTITY_ENVIRONMENT_MISMATCH');
}

console.log(JSON.stringify({
  ok:true,
  release:RELEASE,
  version:VERSION,
  sourceSha,
  sourceBranch,
  buildDir:path.relative(root,buildDir).replaceAll(path.sep,'/'),
  identityTargets:identityTargets.map((target)=>path.relative(root,target).replaceAll(path.sep,'/')),
  projectRef:QA_REF,
  qaOnly:true,
  productionModified:false,
  productionDeployed:false,
},null,2));
