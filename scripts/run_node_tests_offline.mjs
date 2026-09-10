import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';

if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true')throw new Error('OFFLINE_TESTS_REQUIRE_LINUX_CI');
const files=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`tests/${name}`);
if(!files.length)throw new Error('OFFLINE_TESTS_EMPTY');
const args=process.argv.length>2?process.argv.slice(2):['--test',...files];
const guard=resolve('scripts/offline_network_guard.mjs');
const inherited=String(process.env.NODE_OPTIONS||'').trim();
const env={
  ...process.env,
  NODE_OPTIONS:`${inherited}${inherited?' ':''}--import=${guard}`,
  M26_OFFLINE_TESTS:'true',
};
for(const name of Object.keys(env)){
  if(/(?:SUPABASE|PASSWORD|SECRET|TOKEN|API[_-]?KEY|PUBLISHABLE[_-]?KEY)/i.test(name))delete env[name];
}
const result=spawnSync(process.execPath,args,{stdio:'inherit',env,timeout:20*60*1000});
if(result.error)throw result.error;
if(result.signal)throw new Error(`OFFLINE_TESTS_TERMINATED:${result.signal}`);
process.exit(result.status??1);