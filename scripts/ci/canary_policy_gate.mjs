import {execFileSync} from 'node:child_process';
import {appendFile} from 'node:fs/promises';

const ALWAYS_REQUIRED=Object.freeze(['validate']);

function normalizePath(value){
  return String(value||'')
    .replaceAll('\\','/')
    .replace(/^\.\//u,'')
    .trim();
}

function isWithin(path,prefix){
  return path===prefix||path.startsWith(`${prefix}/`);
}

export function isFastLaneRelevant(file){
  const path=normalizePath(file);
  return [
    'src/m26',
    'public/m26',
    'tests',
    'scripts',
    '.github/workflows',
  ].some((prefix)=>isWithin(path,prefix));
}

export function isContinuousAuditRelevant(file){
  const path=normalizePath(file);
  if([
    'public/m26',
    'src/m26',
    'qa/p0-pwa-upgrade',
    'scripts/audit',
    'scripts/lib',
    'tests',
  ].some((prefix)=>isWithin(path,prefix))){
    return true;
  }

  return new Set([
    'package.json',
    'package-lock.json',
    'playwright.p0-pwa-upgrade.config.mjs',
    '.github/workflows/ci.yml',
    '.github/workflows/remote-gates.yml',
    '.github/workflows/hosted-auth-security-hardening.yml',
    '.github/workflows/production-promote.yml',
    '.github/workflows/continuous-app-audit.yml',
  ]).has(path);
}

export function isDeviceExperienceRelevant(file){
  const path=normalizePath(file);
  if([
    'src/m26',
    'public/m26',
    'qa',
    'supabase/functions/iberfit-qa-webauthn-cert-broker',
  ].some((prefix)=>isWithin(path,prefix))){
    return true;
  }

  return new Set([
    'playwright.authenticated.config.mjs',
    'playwright.client-guided-welcome.config.mjs',
    'playwright.device-experience.config.mjs',
    'playwright.authenticated-visual.config.mjs',
    'playwright.admin-interaction.config.mjs',
    'playwright.daily-admin-visual.config.mjs',
    'playwright.p0-pwa-upgrade.config.mjs',
    'playwright.coach-webauthn-recurring.config.mjs',
    'docs/DEVICE_EXPERIENCE_POLICY.md',
    'tests/m26_device_experience_gate_contract.test.mjs',
    'tests/m26_coach_webauthn_recurring_contract.test.mjs',
    '.github/workflows/device-experience-gate.yml',
    '.github/workflows/coach-webauthn-recurring.yml',
  ]).has(path);
}

export function isAuthenticatedInteractionRelevant(file){
  const path=normalizePath(file);
  if([
    'src/m26/app',
    'src/m26/design',
    'src/m26/engagement',
    'src/m26/shell',
    'src/m26/ui',
  ].some((prefix)=>isWithin(path,prefix))){
    return true;
  }

  return new Set([
    'src/m26/modules/route-render.js',
    'qa/rc64/authenticated-interaction.spec.mjs',
    'qa/rc64/secure-current-source-auth.mjs',
    'qa/rc64/build-authenticated-surface.mjs',
    'qa/rc64/real-shell-server.mjs',
    'playwright.authenticated-interaction.config.mjs',
    '.github/workflows/authenticated-client-interaction.yml',
  ]).has(path);
}

export function requiredChecksForFiles(files=[]){
  const normalized=[...new Set(files.map(normalizePath).filter(Boolean))];
  const required=[...ALWAYS_REQUIRED];

  if(normalized.some(isFastLaneRelevant)){
    required.push('targeted-preflight');
  }
  if(normalized.some(isContinuousAuditRelevant)){
    required.push('audit-read-only');
  }
  if(normalized.some(isDeviceExperienceRelevant)){
    required.push('device-experience-gate-phase-a');
  }
  if(normalized.some(isAuthenticatedInteractionRelevant)){
    required.push('authenticated-client-controls');
  }

  return Object.freeze(required);
}

function latestRunByName(checkRuns=[]){
  const latest=new Map();
  for(const run of checkRuns){
    const name=String(run?.name||'').trim();
    if(!name)continue;
    const previous=latest.get(name);
    if(!previous||Number(run?.id||0)>Number(previous?.id||0)){
      latest.set(name,run);
    }
  }
  return latest;
}

export function evaluateRequiredChecks(required,checkRuns=[]){
  const latest=latestRunByName(checkRuns);
  const pending=[];
  const failed=[];
  const passed=[];

  for(const name of required){
    const run=latest.get(name);
    if(!run||run.status!=='completed'){
      pending.push(name);
      continue;
    }
    if(run.conclusion==='success'){
      passed.push(name);
      continue;
    }
    failed.push({name,conclusion:run.conclusion||'unknown'});
  }

  return Object.freeze({
    state:failed.length?'failure':pending.length?'pending':'success',
    passed:Object.freeze(passed),
    pending:Object.freeze(pending),
    failed:Object.freeze(failed),
  });
}

function changedFiles(baseRef){
  const output=execFileSync(
    'git',
    ['diff','--name-only','--diff-filter=ACMR',`origin/${baseRef}...HEAD`],
    {encoding:'utf8'},
  );
  return output.split(/\r?\n/u).map(normalizePath).filter(Boolean);
}

async function fetchCheckRuns({repository,sha,token}){
  const response=await fetch(
    `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?filter=latest&per_page=100`,
    {
      headers:{
        Accept:'application/vnd.github+json',
        Authorization:`Bearer ${token}`,
        'X-GitHub-Api-Version':'2022-11-28',
        'User-Agent':'iberfit-canary-policy-gate',
      },
    },
  );
  if(!response.ok){
    const body=await response.text();
    throw new Error(`CHECK_RUNS_HTTP_${response.status}: ${body.slice(0,300)}`);
  }
  const payload=await response.json();
  return Array.isArray(payload?.check_runs)?payload.check_runs:[];
}

function sleep(ms){
  return new Promise((resolve)=>setTimeout(resolve,ms));
}

async function writeSummary(lines){
  const target=process.env.GITHUB_STEP_SUMMARY;
  if(!target)return;
  await appendFile(target,`${lines.join('\n')}\n`,'utf8');
}

async function main(){
  const repository=String(process.env.GITHUB_REPOSITORY||'').trim();
  const sha=String(process.env.POLICY_HEAD_SHA||process.env.GITHUB_SHA||'').trim();
  const baseRef=String(process.env.GITHUB_BASE_REF||'').trim();
  const token=String(process.env.GH_TOKEN||'').trim();
  const pollMs=Math.max(5000,Number(process.env.POLICY_POLL_MS||15000));
  const timeoutMs=Math.max(60000,Number(process.env.POLICY_TIMEOUT_MS||3000000));

  if(!repository||!sha||!baseRef||!token){
    throw new Error('CANARY_POLICY_GATE_ENV_INCOMPLETE');
  }

  const files=changedFiles(baseRef);
  const required=requiredChecksForFiles(files);
  const deadline=Date.now()+timeoutMs;

  console.log(`CANARY_POLICY_HEAD=${sha}`);
  console.log(`CANARY_POLICY_BASE=${baseRef}`);
  console.log(`CANARY_POLICY_FILES=${files.length}`);
  console.log(`CANARY_POLICY_REQUIRED=${required.join(',')}`);

  while(Date.now()<deadline){
    const runs=await fetchCheckRuns({repository,sha,token});
    const evaluation=evaluateRequiredChecks(required,runs);

    if(evaluation.state==='success'){
      console.log(`CANARY_POLICY_GATE=GREEN required=${required.join(',')}`);
      await writeSummary([
        '## Canary policy gate · GREEN',
        '',
        `SHA: \`${sha}\``,
        `Required: ${required.map((name)=>`\`${name}\``).join(', ')}`,
      ]);
      return;
    }

    if(evaluation.state==='failure'){
      const failures=evaluation.failed
        .map(({name,conclusion})=>`${name}:${conclusion}`)
        .join(',');
      await writeSummary([
        '## Canary policy gate · BLOCKED',
        '',
        `SHA: \`${sha}\``,
        `Failures: ${failures}`,
      ]);
      throw new Error(`CANARY_POLICY_REQUIRED_CHECK_FAILED ${failures}`);
    }

    console.log(`CANARY_POLICY_WAITING=${evaluation.pending.join(',')}`);
    await sleep(pollMs);
  }

  throw new Error(`CANARY_POLICY_TIMEOUT required=${required.join(',')}`);
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  main().catch((error)=>{
    console.error(error?.stack||error);
    process.exitCode=1;
  });
}
