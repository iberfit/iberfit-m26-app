// SIGNATURE release authority: do not publish a Canary commit whose current
// authenticated Coach/Admin, device, remote-readonly, audit and exact deploy have not passed.
const REQUIRED=[
  'IBERFIT M26 CI',
  'IBERFIT Canary Exact Deploy',
  'IBERFIT Coach WebAuthn Recurring',
  'IBERFIT Admin WebAuthn Recurring',
  'IBERFIT Device Experience Gate',
  'IBERFIT M26 Gates remotos de solo lectura',
  'IBERFIT M26 Continuous App Audit',
];
const SHA=/^[a-f0-9]{40}$/u;
const BRANCH='canary/rc74-4';
export function verifySourceQaGates(body,sha){
  if(!SHA.test(String(sha||'')))throw new Error('SIGNATURE_GATE_SOURCE_SHA_INVALID');
  if(!Array.isArray(body?.workflow_runs))throw new Error('SIGNATURE_GATE_RUN_INVENTORY_INVALID');
  if(Number(body.total_count)>100)throw new Error('SIGNATURE_GATE_RUN_INVENTORY_TRUNCATED');
  const result=[];
  for(const name of REQUIRED){
    const matches=body.workflow_runs.filter(run=>
      run?.name===name&&run?.head_sha===sha&&run?.head_branch===BRANCH&&
      ['push','workflow_dispatch'].includes(run?.event));
    if(matches.length===0)throw new Error('SIGNATURE_GATE_MISSING:'+name);
    matches.sort((a,b)=>Date.parse(b.updated_at||b.created_at||0)-Date.parse(a.updated_at||a.created_at||0));
    const last=matches[0];
    if(last.status!=='completed'||last.conclusion!=='success')
      throw new Error('SIGNATURE_GATE_NOT_GREEN:'+name+':'+String(last.status)+':'+String(last.conclusion));
    result.push({name,runId:last.id});
  }
  return result;
}

if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url){
  const repo=String(process.env.GITHUB_REPOSITORY||'');
  const sha=String(process.env.SOURCE_SHA||'');
  const token=String(process.env.GH_ACTIONS_TOKEN||'');
  if(repo!=='iberfit/iberfit-m26-app')throw new Error('SIGNATURE_GATE_REPOSITORY_INVALID');
  if(!SHA.test(sha)||!token)throw new Error('SIGNATURE_GATE_AUTH_OR_SHA_REQUIRED');
  const url='https://api.github.com/repos/'+repo+
    '/actions/runs?head_sha='+encodeURIComponent(sha)+'&per_page=100';
  const res=await fetch(url,{
    headers:{
      Authorization:'Bearer '+token,
      Accept:'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
    },
    signal:AbortSignal.timeout(15_000),
  });
  if(!res.ok)throw new Error('SIGNATURE_GATE_GITHUB_READ_FAILED:'+res.status);
  const result=verifySourceQaGates(await res.json(),sha);
  for(const row of result)console.log('SIGNATURE_SOURCE_GATE_SUCCESS:'+row.name+':'+row.runId);
}
