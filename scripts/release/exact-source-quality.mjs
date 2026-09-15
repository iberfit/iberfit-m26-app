export const GITHUB_ACTIONS_APP_ID=15368;

export const REQUIRED_EXACT_SOURCE_CHECKS=Object.freeze([
  'validate',
  'device-experience-gate-phase-a',
  'write-persist-idempotency-isolation',
  'client-real-coach-webauthn-matrix',
  'admin-synthetic-task-matrix',
  'workflow-matrix-matrix',
  'pwa-installed-device-matrix',
  'browser-matrix',
  'capture',
  'audit-read-only',
  'preflight',
]);

function latestOrder(run){
  const time=new Date(run?.completed_at||run?.started_at||run?.created_at||0).getTime();
  return [Number.isFinite(time)?time:0,Number(run?.id)||0];
}

function newer(a,b){
  const aa=latestOrder(a),bb=latestOrder(b);
  if(aa[0]!==bb[0])return aa[0]>bb[0];
  return aa[1]>bb[1];
}

export function evaluateExactSourceChecks({
  sourceSha,
  checkRuns=[],
  requiredChecks=REQUIRED_EXACT_SOURCE_CHECKS,
  githubActionsAppId=GITHUB_ACTIONS_APP_ID,
}={}){
  const sha=String(sourceSha||'').trim().toLowerCase();
  if(!/^[0-9a-f]{40}$/u.test(sha))throw new Error('EXACT_SOURCE_SHA_INVALID');
  const required=[...new Set((requiredChecks||[]).map((name)=>String(name||'').trim()).filter(Boolean))];
  if(!required.length)throw new Error('EXACT_SOURCE_REQUIRED_CHECKS_EMPTY');

  const latest=new Map();
  for(const run of Array.isArray(checkRuns)?checkRuns:[]){
    const name=String(run?.name||'').trim();
    if(!required.includes(name))continue;
    if(String(run?.head_sha||'').trim().toLowerCase()!==sha)continue;
    if(Number(run?.app?.id)!==Number(githubActionsAppId))continue;
    const previous=latest.get(name);
    if(!previous||newer(run,previous))latest.set(name,run);
  }

  const missing=[];
  const notSuccess=[];
  const matched={};
  for(const name of required){
    const run=latest.get(name);
    if(!run){
      missing.push(name);
      continue;
    }
    const status=String(run.status||'unknown');
    const conclusion=String(run.conclusion||'');
    matched[name]={
      id:Number(run.id)||null,
      status,
      conclusion,
      completedAt:run.completed_at||null,
      appId:Number(run?.app?.id)||null,
    };
    if(status!=='completed'||conclusion!=='success'){
      notSuccess.push({name,status,conclusion:conclusion||null});
    }
  }

  return Object.freeze({
    ok:missing.length===0&&notSuccess.length===0,
    sourceSha:sha,
    requiredChecks:required,
    missing,
    notSuccess,
    matched,
  });
}
