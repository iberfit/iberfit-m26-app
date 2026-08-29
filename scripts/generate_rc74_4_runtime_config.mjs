import fs from 'node:fs';
import path from 'node:path';
import {M26_PRODUCTION_SUPABASE_ORIGIN} from '../src/m26/supabase-transport.js';

const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const QA_ORIGIN=`https://${QA_PROJECT_REF}.supabase.co`;
const VERSION='26.0.0-canary.74.4-phase-a';
const RELEASE='IBERFIT_M26_CANARY_RC74_4_PHASE_A';
const required=['M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_PROJECT_REF','M26_QA_ONLY'];
const missing=required.filter((name)=>!process.env[name]);
if(missing.length)throw new Error(`RC74_4_RUNTIME_ENV_MISSING:${missing.join(',')}`);
if(process.env.M26_PROJECT_REF!==QA_PROJECT_REF)throw new Error('RC74_4_RUNTIME_PROJECT_REF_MISMATCH');
if(String(process.env.M26_QA_ONLY).toLowerCase()!=='true')throw new Error('RC74_4_RUNTIME_QA_ONLY_REQUIRED');

const url=new URL(String(process.env.M26_SUPABASE_URL||''));
if(url.origin!==QA_ORIGIN||url.pathname!=='/'||url.search||url.hash||url.username||url.password){
  throw new Error('RC74_4_RUNTIME_QA_ORIGIN_MISMATCH');
}
const key=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||'').trim();
if(key.length<2||key.length>16_384)throw new Error('RC74_4_RUNTIME_PUBLIC_KEY_INVALID');
if(/service[_-]?role/iu.test(key))throw new Error('RC74_4_RUNTIME_SERVICE_ROLE_FORBIDDEN');
if(key.split('.').length===3){
  try{
    const payload=JSON.parse(Buffer.from(key.split('.')[1].replace(/-/gu,'+').replace(/_/gu,'/'),'base64').toString('utf8'));
    if(payload?.role==='service_role')throw new Error('RC74_4_RUNTIME_SERVICE_ROLE_FORBIDDEN');
  }catch(error){
    if(String(error?.message||'').includes('SERVICE_ROLE'))throw error;
  }
}

const buildDir=path.resolve(process.env.M26_BUILD_DIR||path.join('.tmp','rc64-current-surface'));
const target=path.join(buildDir,'m26','runtime-config.js');
const headersTargets=[path.join(buildDir,'_headers'),path.join(buildDir,'m26','_headers')];
const headersTemplatePath=path.resolve('public','m26','_headers');
if(!fs.existsSync(path.dirname(target)))throw new Error(`RC74_4_RUNTIME_BUILD_MISSING:${buildDir}`);
if(!fs.existsSync(headersTemplatePath))throw new Error('RC74_4_HEADERS_TEMPLATE_MISSING');

const headersTemplate=fs.readFileSync(headersTemplatePath,'utf8');
const productionOrigin=String(M26_PRODUCTION_SUPABASE_ORIGIN||'').trim();
if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/u.test(productionOrigin)||productionOrigin===QA_ORIGIN){
  throw new Error('RC74_4_HEADERS_PRODUCTION_ORIGIN_INVALID');
}
const productionOriginCount=headersTemplate.split(productionOrigin).length-1;
if(productionOriginCount!==3)throw new Error(`RC74_4_HEADERS_PRODUCTION_ORIGIN_COUNT:${productionOriginCount}`);
if(headersTemplate.includes(QA_ORIGIN))throw new Error('RC74_4_HEADERS_TEMPLATE_ALREADY_QA');
if(/https:\/\/\*\.supabase\.co/iu.test(headersTemplate))throw new Error('RC74_4_HEADERS_WILDCARD_FORBIDDEN');

const canaryHeaders=headersTemplate.split(productionOrigin).join(QA_ORIGIN);
const qaOriginCount=canaryHeaders.split(QA_ORIGIN).length-1;
if(qaOriginCount!==3)throw new Error(`RC74_4_HEADERS_QA_ORIGIN_COUNT:${qaOriginCount}`);
if(canaryHeaders.includes(productionOrigin))throw new Error('RC74_4_HEADERS_PRODUCTION_ORIGIN_LEAK');
if(/https:\/\/\*\.supabase\.co/iu.test(canaryHeaders))throw new Error('RC74_4_HEADERS_WILDCARD_FORBIDDEN');
const cspLine=canaryHeaders.split(/\r?\n/u).find((line)=>line.includes('Content-Security-Policy:'))||'';
for(const requiredDirective of [
  `connect-src 'self' ${QA_ORIGIN};`,
  `img-src 'self' data: blob: ${QA_ORIGIN};`,
  `frame-src 'self' ${QA_ORIGIN};`,
]){
  if(!cspLine.includes(requiredDirective))throw new Error(`RC74_4_HEADERS_QA_DIRECTIVE_MISSING:${requiredDirective.split(' ')[0]}`);
}

const validationOnly=String(process.env.M26_RUNTIME_VALIDATION_ONLY||'').toLowerCase()==='true';
const config={
  enabled:true,
  version:VERSION,
  projectRef:QA_PROJECT_REF,
  url:QA_ORIGIN,
  publishableKey:key,
  qaOnly:true,
  timeoutMs:12000,
  rpc:{
    bootstrap:'iberfit_bootstrap_v26',
    preflight:'iberfit_command_preflight_v26',
    execute:'iberfit_execute_command_v26',
  },
};
fs.writeFileSync(target,`window.__IBERFIT_M26_RUNTIME__ = Object.freeze(${JSON.stringify(config,null,2)});\n`,'utf8');
for(const headersTarget of headersTargets)fs.writeFileSync(headersTarget,canaryHeaders,'utf8');
console.log(JSON.stringify({
  ok:true,
  release:RELEASE,
  version:VERSION,
  phase:'A',
  target:path.relative(process.cwd(),target).replaceAll(path.sep,'/'),
  headersTargets:headersTargets.map((headersTarget)=>path.relative(process.cwd(),headersTarget).replaceAll(path.sep,'/')),
  projectRef:QA_PROJECT_REF,
  qaOnly:true,
  validationOnly,
  productionModified:false,
  productionDeployed:false,
  headersProductionOriginCount:productionOriginCount,
  headersQaOriginCount:qaOriginCount,
  keyType:key.startsWith('sb_publishable_')?'publishable':'legacy_anon_or_publishable',
},null,2));
