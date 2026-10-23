// Fail-closed allowance for Cloudflare's bounded edge propagation after an exact deploy.
// Only the SAME QA branch/project may converge to the expected immutable source SHA.
// No client data is read, no POST is made, and a persistent mismatch still blocks deploy.
const SHA=/^[0-9a-f]{40}$/u;
const defaultSleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
function fail(code){throw new Error(code);}
function sanitize(raw){
  const sourceSha=String(raw?.sourceSha||raw?.commit||raw?.sha||'').trim().toLowerCase();
  return Object.freeze({
    sourceSha,
    sourceBranch:String(raw?.sourceBranch||raw?.branch||'').trim(),
    qaOnly:raw?.qaOnly===true,
    projectRef:String(raw?.projectRef||'').trim(),
    version:String(raw?.version||'').slice(0,120),
  });
}
export async function waitForExactCanarySha({
  readVersion,
  expectedSha,
  qaProjectRef,
  branch='canary/rc74-4',
  maxAttempts=24,
  retryDelayMs=4000,
  sleep=defaultSleep,
  onRetry=()=>{},
}={}){
  if(typeof readVersion!=='function'||typeof sleep!=='function')fail('PRELAUNCH_CONVERGENCE_DEPENDENCY_INVALID');
  if(!SHA.test(String(expectedSha||'')))fail('PRELAUNCH_EXPECTED_SHA_INVALID');
  if(!String(qaProjectRef||'').trim()||!String(branch||'').trim())fail('PRELAUNCH_CONVERGENCE_SCOPE_INVALID');
  const attempts=Math.max(1,Math.min(30,Math.floor(Number(maxAttempts)||24)));
  const delay=Math.max(0,Math.min(10_000,Math.floor(Number(retryDelayMs)||0)));
  let lastSha='';
  for(let attempt=1;attempt<=attempts;attempt++){
    let raw;
    try{raw=await readVersion(attempt);}
    catch(error){
      // Only bounded Cloudflare 5xx errors are transient. A 401/403, malformed
      // body or wrong QA identity never becomes acceptable through retry.
      if(!/^PRELAUNCH_LIVE_HTTP_5\d\d$/u.test(String(error?.message||error)))throw error;
      if(attempt===attempts)fail('PRELAUNCH_LIVE_EDGE_5XX_PERSISTENT');
      onRetry({attempt,reason:'edge-5xx'});
      if(delay)await sleep(delay);
      continue;
    }
    const version=sanitize(raw);
    if(!SHA.test(version.sourceSha))fail('PRELAUNCH_LIVE_VERSION_SHA_INVALID');
    if(version.sourceBranch!==branch)fail('PRELAUNCH_LIVE_VERSION_BRANCH_MISMATCH');
    if(!version.qaOnly)fail('PRELAUNCH_LIVE_VERSION_NOT_QA');
    if(version.projectRef!==qaProjectRef)fail('PRELAUNCH_LIVE_VERSION_PROJECT_MISMATCH');
    if(version.sourceSha===expectedSha)return Object.freeze({version,edgeAttempts:attempt});
    lastSha=version.sourceSha;
    if(attempt<attempts){
      onRetry({attempt,reason:'stale-sha',observedSha:lastSha,expectedSha});
      if(delay)await sleep(delay);
    }
  }
  fail('PRELAUNCH_LIVE_DEPLOY_SHA_MISMATCH');
}
