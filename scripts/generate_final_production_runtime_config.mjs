import fs from 'node:fs';
import path from 'node:path';
import {
  M26_PRODUCTION_PROJECT_REF,
  M26_PRODUCTION_SUPABASE_ORIGIN,
  M26_QA_PROJECT_REF,
  M26_QA_SUPABASE_ORIGIN,
} from '../src/m26/supabase-transport.js';

const APPROVED_SOURCE_BRANCH='canary/rc74-4';
const VERSION='26.0.0-production.rc74.4';
const RELEASE='IBERFIT_M26_PRODUCTION_RC74_4';

const required=['M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY','M26_SOURCE_SHA','M26_SOURCE_BRANCH'];
const missing=required.filter((name)=>!String(process.env[name]||'').trim());
if(missing.length)throw new Error(`FINAL_PROD_RUNTIME_ENV_MISSING:${missing.join(',')}`);
if(process.env.M26_PROJECT_REF!==M26_PRODUCTION_PROJECT_REF)throw new Error('FINAL_PROD_RUNTIME_PROJECT_REF_MISMATCH');
if(String(process.env.M26_QA_ONLY).toLowerCase()!=='false')throw new Error('FINAL_PROD_RUNTIME_QA_ONLY_MUST_BE_FALSE');

const sourceSha=String(process.env.M26_SOURCE_SHA||'').trim().toLowerCase();
const sourceBranch=String(process.env.M26_SOURCE_BRANCH||'').trim();
const promotionHead=String(process.env.M26_PROMOTION_HEAD||'').trim().toLowerCase();
if(!/^[0-9a-f]{40}$/u.test(sourceSha))throw new Error('FINAL_PROD_RUNTIME_SOURCE_SHA_INVALID');
if(sourceBranch!==APPROVED_SOURCE_BRANCH)throw new Error('FINAL_PROD_RUNTIME_SOURCE_BRANCH_MISMATCH');
if(promotionHead&&promotionHead!==sourceSha)throw new Error('FINAL_PROD_RUNTIME_PROMOTION_HEAD_MISMATCH');

const url=new URL(String(process.env.M26_SUPABASE_URL||''));
if(url.origin!==M26_PRODUCTION_SUPABASE_ORIGIN||url.pathname!=='/'||url.search||url.hash||url.username||url.password){
  throw new Error('FINAL_PROD_RUNTIME_ORIGIN_MISMATCH');
}

const key=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||'').trim();
if(key.length<24||key.length>16_384)throw new Error('FINAL_PROD_RUNTIME_PUBLIC_KEY_INVALID');
if(!key.startsWith('sb_publishable_'))throw new Error('FINAL_PROD_RUNTIME_PUBLISHABLE_KEY_REQUIRED');
if(/service[_-]?role/iu.test(key))throw new Error('FINAL_PROD_RUNTIME_SERVICE_ROLE_FORBIDDEN');
if(key.split('.').length===3){
  try{
    const payload=JSON.parse(Buffer.from(key.split('.')[1].replace(/-/gu,'+').replace(/_/gu,'/'),'base64').toString('utf8'));
    if(payload?.role===['service','role'].join('_'))throw new Error('FINAL_PROD_RUNTIME_SERVICE_ROLE_FORBIDDEN');
  }catch(error){
    if(String(error?.message||'').includes('SERVICE_ROLE'))throw error;
  }
}

const buildDir=path.resolve(process.env.M26_BUILD_DIR||path.join('.tmp','rc64-current-surface'));
const m26Dir=path.join(buildDir,'m26');
const target=path.join(m26Dir,'runtime-config.js');
const versionTarget=path.join(m26Dir,'version.json');
const headersTargets=[path.join(buildDir,'_headers'),path.join(m26Dir,'_headers')];
const headersTemplatePath=path.resolve('public','m26','_headers');
if(!fs.existsSync(m26Dir))throw new Error(`FINAL_PROD_RUNTIME_BUILD_MISSING:${buildDir}`);
if(!fs.existsSync(headersTemplatePath))throw new Error('FINAL_PROD_HEADERS_TEMPLATE_MISSING');

let headers=fs.readFileSync(headersTemplatePath,'utf8').replace(/\r\n?/gu,'\n');
const prodCount=headers.split(M26_PRODUCTION_SUPABASE_ORIGIN).length-1;
if(prodCount!==3)throw new Error(`FINAL_PROD_HEADERS_ORIGIN_COUNT:${prodCount}`);
if(headers.includes(M26_QA_SUPABASE_ORIGIN)||headers.includes(M26_QA_PROJECT_REF))throw new Error('FINAL_PROD_HEADERS_QA_LEAK');
if(/https:\/\/\*\.supabase\.co/iu.test(headers))throw new Error('FINAL_PROD_HEADERS_WILDCARD_FORBIDDEN');

const rootBoundary='\n\n/m26/runtime-config.js';
const rootBoundaryIndex=headers.indexOf(rootBoundary);
if(rootBoundaryIndex<0)throw new Error('FINAL_PROD_HEADERS_ROOT_BOUNDARY_MISSING');
const rootRule=headers.slice(0,rootBoundaryIndex);
const rootCache='  Cache-Control: no-store';
if(rootRule.split(rootCache).length-1!==1)throw new Error('FINAL_PROD_HEADERS_ROOT_CACHE_CONTROL_DRIFT');
headers=`${rootRule.replace(rootCache,`${rootCache}, no-transform`)}${headers.slice(rootBoundaryIndex)}`;
const indexCache='/m26/index.html\n  Cache-Control: no-cache, must-revalidate';
if(headers.split(indexCache).length-1!==1)throw new Error('FINAL_PROD_HEADERS_INDEX_CACHE_CONTROL_DRIFT');
headers=headers.replace(indexCache,`${indexCache}, no-transform`);

const cspLine=headers.split('\n').find((line)=>line.includes('Content-Security-Policy:'))||'';
for(const directive of [
  `connect-src 'self' ${M26_PRODUCTION_SUPABASE_ORIGIN};`,
  `img-src 'self' data: blob: ${M26_PRODUCTION_SUPABASE_ORIGIN};`,
  `frame-src 'self' ${M26_PRODUCTION_SUPABASE_ORIGIN};`,
]){
  if(!cspLine.includes(directive))throw new Error(`FINAL_PROD_HEADERS_DIRECTIVE_MISSING:${directive.split(' ')[0]}`);
}

const config={
  enabled:true,
  version:VERSION,
  projectRef:M26_PRODUCTION_PROJECT_REF,
  url:M26_PRODUCTION_SUPABASE_ORIGIN,
  publishableKey:key,
  qaOnly:false,
  timeoutMs:12000,
  rpc:{
    bootstrap:'iberfit_bootstrap_v26',
    preflight:'iberfit_command_preflight_v26',
    execute:'iberfit_execute_command_v26',
  },
};
const provenance={
  release:RELEASE,
  version:VERSION,
  sourceSha,
  sourceBranch,
  promotionHead:promotionHead||sourceSha,
  environment:'PRODUCTION',
  projectRef:M26_PRODUCTION_PROJECT_REF,
  qaOnly:false,
  production:true,
};

fs.writeFileSync(target,`window.__IBERFIT_M26_RUNTIME__ = Object.freeze(${JSON.stringify(config,null,2)});\n`,'utf8');
fs.writeFileSync(versionTarget,`${JSON.stringify(provenance,null,2)}\n`,'utf8');
for(const headersTarget of headersTargets)fs.writeFileSync(headersTarget,headers,'utf8');

for(const [name,content] of [
  ['runtime',fs.readFileSync(target,'utf8')],
  ['version',fs.readFileSync(versionTarget,'utf8')],
  ['headers',headers],
]){
  if(content.includes(M26_QA_PROJECT_REF)||content.includes(M26_QA_SUPABASE_ORIGIN)||content.includes('m26-canary.iberfit.cl')){
    throw new Error(`FINAL_PROD_${name.toUpperCase()}_QA_OR_CANARY_LEAK`);
  }
  if(/service[_-]?role/iu.test(content))throw new Error(`FINAL_PROD_${name.toUpperCase()}_SECRET_MARKER`);
}

console.log(JSON.stringify({
  ok:true,
  release:RELEASE,
  version:VERSION,
  sourceSha,
  sourceBranch,
  projectRef:M26_PRODUCTION_PROJECT_REF,
  qaOnly:false,
  production:true,
  target:path.relative(process.cwd(),target).replaceAll(path.sep,'/'),
  versionTarget:path.relative(process.cwd(),versionTarget).replaceAll(path.sep,'/'),
  headersTargets:headersTargets.map((p)=>path.relative(process.cwd(),p).replaceAll(path.sep,'/')),
  keyType:key.startsWith('sb_publishable_')?'publishable':'legacy_anon_or_publishable',
},null,2));
