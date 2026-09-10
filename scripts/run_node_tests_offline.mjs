import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';

// CI-only OS isolation. Never fall back to a network-enabled test run.
if(process.platform!=='linux'||process.env.GITHUB_ACTIONS!=='true')throw new Error('OFFLINE_TESTS_REQUIRE_LINUX_CI');
const uid=process.getuid(),gid=process.getgid();
if(uid===0)throw new Error('OFFLINE_TESTS_REQUIRE_UNPRIVILEGED_RUNNER');
const files=readdirSync('tests').filter(name=>name.endsWith('.test.mjs')).sort().map(name=>`tests/${name}`);
if(!files.length)throw new Error('OFFLINE_TESTS_EMPTY');
const args=process.argv.length>2?process.argv.slice(2):['--test',...files];
const result=spawnSync('sudo',['-n','--preserve-env','unshare','--net','--','setpriv',
  `--reuid=${uid}`,`--regid=${gid}`,'--clear-groups','--no-new-privs',
  process.execPath,...args],{stdio:'inherit',env:process.env,timeout:20*60*1000});
if(result.error)throw result.error;
if(result.signal)throw new Error(`OFFLINE_TESTS_TERMINATED:${result.signal}`);
process.exit(result.status??1);
