import fs from 'node:fs';
import path from 'node:path';

const PROJECT_REF='pjhmrhejsoofmouedavw';
const version='26.0.0-prepublicacion-infraestructura.29';
const required=['M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY','M26_QA_ONLY'];
const missing=required.filter((name)=>!process.env[name]);
if(missing.length)throw new Error(`RC29_RUNTIME_ENV_MISSING:${missing.join(',')}`);
const url=process.env.M26_SUPABASE_URL.replace(/\/$/,'');
if(new URL(url).hostname!==`${PROJECT_REF}.supabase.co`)throw new Error('RC29_RUNTIME_PROJECT_MISMATCH');
if(String(process.env.M26_QA_ONLY).toLowerCase()!=='true')throw new Error('RC29_RUNTIME_QA_ONLY_REQUIRED');
const key=process.env.M26_SUPABASE_PUBLISHABLE_KEY.trim();
if(!key)throw new Error('RC29_RUNTIME_PUBLISHABLE_KEY_MISSING');
if(/service[_-]?role/i.test(key))throw new Error('RC29_RUNTIME_SERVICE_ROLE_FORBIDDEN');
if(key.split('.').length===3){
  try{const payload=JSON.parse(Buffer.from(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'));if(payload?.role==='service_role')throw new Error('RC29_RUNTIME_SERVICE_ROLE_FORBIDDEN');}catch(error){if(String(error?.message).includes('SERVICE_ROLE'))throw error;}
}
const buildDir=process.env.M26_BUILD_DIR||path.join('dist','m26-prepublicacion-infraestructura-candidate');
const target=path.join(buildDir,'m26','runtime-config.js');
if(!fs.existsSync(path.dirname(target)))throw new Error(`RC29_RUNTIME_BUILD_MISSING:${buildDir}`);
const config={enabled:true,version,projectRef:PROJECT_REF,url,publishableKey:key,qaOnly:true,timeoutMs:12000,rpc:{bootstrap:'iberfit_bootstrap_v26',preflight:'iberfit_command_preflight_v26',execute:'iberfit_execute_command_v26'}};
fs.writeFileSync(target,`window.__IBERFIT_M26_RUNTIME__ = Object.freeze(${JSON.stringify(config,null,2)});
`);
console.log(JSON.stringify({ok:true,target,version,projectRef:PROJECT_REF,qaOnly:true,keyType:key.startsWith('sb_publishable_')?'publishable':'legacy_anon_or_publishable'},null,2));
