import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const commands=[
  ['node',['scripts/remote-gates/check_repository_hygiene.mjs']],
  ['npm',['test']],
  ['npm',['run','validate:rc17']],
  ['node',['--test','tests/m26_rc18_prelaunch_repository.test.mjs']]
];
const results=[];
for(const [command,args] of commands){const run=spawnSync(command,args,{encoding:'utf8',stdio:'pipe'});results.push({command:[command,...args].join(' '),status:run.status,stdout:run.stdout.slice(-4000),stderr:run.stderr.slice(-4000)});if(run.status!==0){writeFileSync('recovery/RC18_LOCAL_VALIDATION.json',JSON.stringify({ok:false,results},null,2)+'\n');process.stderr.write(run.stdout+run.stderr);process.exit(run.status||1);}}
const report={ok:true,generatedAt:new Date().toISOString(),localOnly:true,remoteGatesPassed:false,results:results.map(x=>({command:x.command,status:x.status}))};
writeFileSync('recovery/RC18_LOCAL_VALIDATION.json',JSON.stringify(report,null,2)+'\n');
console.log('RC18 LOCAL PRELAUNCH VALIDATION PASS');
console.log('Remote Supabase, physical-device and Cloudflare canary gates remain pending.');
