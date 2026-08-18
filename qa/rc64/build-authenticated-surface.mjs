import {writeFile} from 'node:fs/promises';
import path from 'node:path';

await import('./build-current-surface.mjs');

const PROJECT_REF='pjhmrhejsoofmouedavw';
const expectedOrigin=`https://${PROJECT_REF}.supabase.co`;
const required=['M26_SUPABASE_URL','M26_SUPABASE_PUBLISHABLE_KEY'];
const missing=required.filter((name)=>!process.env[name]);
if(missing.length)throw new Error(`RC64_2B_AUTH_ENV_MISSING:${missing.join(',')}`);

const url=new URL(String(process.env.M26_SUPABASE_URL||''));
if(url.origin!==expectedOrigin||url.pathname!=='/'||url.search||url.hash){
  throw new Error('RC64_2B_AUTH_PROJECT_MISMATCH');
}

const key=String(process.env.M26_SUPABASE_PUBLISHABLE_KEY||'');
if(key.length<2||key.length>16_384)throw new Error('RC64_2B_AUTH_PUBLIC_KEY_INVALID');
if(/service[_-]?role/iu.test(key))throw new Error('RC64_2B_AUTH_SERVICE_ROLE_FORBIDDEN');

const runtime=[
  'window.__IBERFIT_M26_RUNTIME__ = Object.freeze({',
  '  enabled: true,',
  "  version: '26.0.0-rc64-2b-authenticated-readonly',",
  `  projectRef: ${JSON.stringify(PROJECT_REF)},`,
  `  url: ${JSON.stringify(expectedOrigin)},`,
  `  publishableKey: ${JSON.stringify(key)},`,
  '  qaOnly: true,',
  '  timeoutMs: 12000,',
  '  rpc: Object.freeze({',
  "    bootstrap: 'iberfit_bootstrap_v26',",
  "    preflight: 'iberfit_command_preflight_v26',",
  "    execute: 'iberfit_execute_command_v26',",
  '  }),',
  '});',
  '',
].join('\n');

const output=path.join(process.cwd(),'.tmp','rc64-current-surface','m26','runtime-config.js');
await writeFile(output,runtime,'utf8');

console.log(JSON.stringify({
  schema:'iberfit.rc64.2b.auth-current-source-surface.v1',
  source:'canonical-working-tree',
  output:'.tmp/rc64-current-surface',
  runtimeEnabled:true,
  qaOnly:true,
  projectRef:PROJECT_REF,
  credentialsEmbedded:false,
  backendMutationAllowed:false,
},null,2));
