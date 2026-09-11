import {writeFile} from 'node:fs/promises';
import path from 'node:path';

await import('./build-current-surface.mjs');

const PROJECT_REF='gjztkdwfmunnzhtvxrsu';
const runtime=[
  'window.__IBERFIT_M26_RUNTIME__ = Object.freeze({',
  '  enabled: true,',
  "  version: '26.0.0-rc64-auth-no-freeze-hermetic',",
  `  projectRef: ${JSON.stringify(PROJECT_REF)},`,
  `  url: ${JSON.stringify(`https://${PROJECT_REF}.supabase.co`)},`,
  "  publishableKey: 'sb_publishable_hermetic_auth_freeze_probe_not_sent',",
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
  schema:'iberfit.rc64.auth-no-freeze.hermetic-surface.v1',
  source:'canonical-working-tree',
  output:'.tmp/rc64-current-surface',
  runtimeEnabled:true,
  qaOnly:true,
  projectRef:PROJECT_REF,
  credentialsEmbedded:false,
  networkAuthExpected:false,
},null,2));
