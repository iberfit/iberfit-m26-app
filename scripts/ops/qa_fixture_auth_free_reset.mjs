// One-shot, fail-closed QA-only maintenance via the official Supabase Auth API.
// Never touches SQL/Storage, prod, non-fixture identities, MFA credentials or business records.
export const QA_ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
export const FIXTURES=Object.freeze([
  // Lowest historical fixture count first; fail before larger resets if recovery fails.
  {label:'client_a',email:'qa.rc74.client-a@iberfit.cl',envEmail:'M26_QA_CLIENT_A_EMAIL',envPassword:'M26_QA_CLIENT_A_PASSWORD'},
  {label:'coach',email:'qa.rc74.coach@iberfit.cl',envEmail:'M26_QA_COACH_EMAIL',envPassword:'M26_QA_COACH_PASSWORD'},
  {label:'client_b',email:'qa.rc74.client-b@iberfit.cl',envEmail:'M26_QA_CLIENT_B_EMAIL',envPassword:'M26_QA_CLIENT_B_PASSWORD'},
]);
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const API_KEY=/^(?:sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)$/u;
function hasExactlyQaOrigin(raw){
  try{
    const url=new URL(raw);
    return url.origin===QA_ORIGIN&&url.pathname==='/'&&url.search===''&&url.hash===''&&!url.username&&!url.password;
  }catch{return false;}
}
export function validateQaFixtureReset(env){
  const safe=env?.GITHUB_ACTIONS==='true'&&env?.GITHUB_REPOSITORY==='iberfit/iberfit-m26-app'
    &&env?.GITHUB_REF==='refs/heads/canary/rc74-4'
    &&env?.QA_FIXTURE_RESET_AUTHORIZED==='true'
    &&env?.M26_QA_ONLY==='true'&&env?.M26_PROJECT_REF==='gjztkdwfmunnzhtvxrsu'
    &&hasExactlyQaOrigin(env?.M26_SUPABASE_URL)
    &&API_KEY.test(String(env?.M26_SUPABASE_PUBLISHABLE_KEY||''))
    &&String(env.M26_SUPABASE_PUBLISHABLE_KEY).length>=18
    &&String(env.M26_SUPABASE_PUBLISHABLE_KEY).length<=16384
    &&/^[a-f0-9]{40}$/u.test(String(env?.GITHUB_SHA||''))
    &&/^\d{5,20}$/u.test(String(env?.GITHUB_RUN_ID||''))
    &&String(env?.GITHUB_TOKEN||'').length>=20;
  if(!safe)throw Error('QA_FIXTURE_RESET_SCOPE_DENIED');
  for(const fixture of FIXTURES){
    if(String(env[fixture.envEmail]||'').trim().toLowerCase()!==fixture.email
      ||String(env[fixture.envPassword]||'').length<8)
      throw Error('QA_FIXTURE_RESET_IDENTITY_DENIED:'+fixture.label);
  }
  return true;
}
async function request(url,{fetchImpl,headers={},method='GET',body,timeoutMs=15000}={}){
  const reply=await fetchImpl(url,{
    method,headers, ...(body===undefined?{}:{body:JSON.stringify(body)}),
    redirect:'error',cache:'no-store',credentials:'omit',
    signal:AbortSignal.timeout(timeoutMs),
  });
  return reply;
}
export async function qaResetQuiet({env,fetchImpl=globalThis.fetch}){
  const root='https://api.github.com/repos/iberfit/iberfit-m26-app';
  const headers={authorization:'Bearer '+env.GITHUB_TOKEN,
    accept:'application/vnd.github+json','user-agent':'iberfit-free-qa-fixture-maintenance'};
  const branch=await request(root+'/git/ref/heads/canary/rc74-4',{fetchImpl,headers});
  if(!branch.ok)throw Error('QA_RESET_HEAD_UNAVAILABLE');
  const branchJson=await branch.json();
  if(String(branchJson?.object?.sha||'')!==env.GITHUB_SHA)
    return {ready:false,reason:'superseded-source',activeRuns:0};
  let totalBusy=0;
  // GitHub's repository-wide run list also catches PR runs that share the same
  // synthetic identities. Count only; never persist job IDs, tokens or URLs.
  for(const status of ['in_progress','queued','waiting','pending','requested']){
    const url=root+'/actions/runs?per_page=100&status='+status;
    const result=await request(url,{fetchImpl,headers});
    if(!result.ok)throw Error('QA_RESET_ACTIONS_UNAVAILABLE');
    const body=await result.json();
    if(!Array.isArray(body?.workflow_runs)||!Number.isInteger(body.total_count)
      ||body.total_count>100) return {ready:false,reason:'unbounded-active-runs',activeRuns:100};
    totalBusy+=body.workflow_runs.filter(run=>String(run.id)!==String(env.GITHUB_RUN_ID)).length;
  }
  return totalBusy?{ready:false,reason:'other-github-runs',activeRuns:totalBusy}
    :{ready:true,reason:'isolated',activeRuns:0};
}
async function authRequest(env,fetchImpl,path,{token=null,password=null,email=null,scope=null}={}){
  const key=env.M26_SUPABASE_PUBLISHABLE_KEY;
  const headers={apikey:key,accept:'application/json',
    ...(token?{authorization:'Bearer '+token}:{}),
    ...(password?{'content-type':'application/json'}:{})};
  return request(QA_ORIGIN+path+(scope?'?scope='+scope:''),{
    fetchImpl,headers,method:'POST',
    ...(password?{body:{email,password}}:{}),timeoutMs:scope==='global'?45000:15000,
  });
}
async function passwordLogin(env,fetchImpl,fixture){
  const resp=await authRequest(env,fetchImpl,'/auth/v1/token?grant_type=password',{
    email:fixture.email,password:env[fixture.envPassword],
  });
  if(!resp.ok)throw Error('QA_RESET_AUTH_PRECHECK_FAILED:'+fixture.label);
  const body=await resp.json();
  const token=String(body?.access_token||'');
  if(String(body?.user?.email||'').toLowerCase()!==fixture.email
    ||!UUID.test(String(body?.user?.id||''))
    ||token.length<100||token.length>16384
    ||!/^[-\w]+\.[-\w]+\.[-\w]+$/u.test(token))
    throw Error('QA_RESET_AUTH_OWNER_MISMATCH:'+fixture.label);
  return {label:fixture.label,uid:body.user.id,token};
}
async function logout(env,fetchImpl,token,scope){
  const result=await authRequest(env,fetchImpl,'/auth/v1/logout',{token,scope});
  return result.ok===true;
}
export async function qaFixtureGlobalReset({env,fetchImpl=globalThis.fetch}){
  validateQaFixtureReset(env);
  const start=await qaResetQuiet({env,fetchImpl});
  if(!start.ready)return {status:'skipped',reason:start.reason,busyRuns:start.activeRuns};
  const sessions=[];
  let revocations=0;
  try{
    // Preflight EVERY credential + identity before terminating even one session.
    for(const fixture of FIXTURES)sessions.push(await passwordLogin(env,fetchImpl,fixture));
    if(new Set(sessions.map(s=>s.uid)).size!==FIXTURES.length)
      throw Error('QA_RESET_DUPLICATE_IDENTITY');
    const repeat=await qaResetQuiet({env,fetchImpl});
    if(!repeat.ready)return {status:'skipped',reason:repeat.reason,busyRuns:repeat.activeRuns};
    // Verify recovery after EACH fixture before proceeding to the next. An
    // unresponsive GoTrue gateway cannot cause further bulk invalidations.
    let reloginOk=0;
    for(let i=0;i<sessions.length;i++){
      const lease=sessions[i];
      const fixture=FIXTURES[i];
      if(!await logout(env,fetchImpl,lease.token,'global'))
        throw Error('QA_RESET_GLOBAL_LOGOUT_FAILED:'+lease.label);
      revocations++;
      const fresh=await passwordLogin(env,fetchImpl,fixture);
      if(fresh.uid!==lease.uid)throw Error('QA_RESET_POSTCHECK_IDENTITY_MISMATCH:'+fixture.label);
      if(!await logout(env,fetchImpl,fresh.token,'local'))
        throw Error('QA_RESET_POSTCHECK_LOGOUT_FAILED:'+fixture.label);
      reloginOk++;
    }
    return {status:'completed',globalLogoutAccounts:revocations,
      freshLoginsVerified:reloginOk,qaOnly:true,productionTouched:false};
  }catch(error){
    // Partial global logouts are safe and idempotent; never retry in a loop.
    throw Object.assign(new Error(String(error?.message||'QA_RESET_FAILED')),{globalLogoutAccounts:revocations});
  }finally{
    // Preflight sessions left behind after partial failure must not linger.
    // Already globally signed-out tokens are harmless; local sign-out is best effort.
    await Promise.all(sessions.map(async lease=>{
      try{await logout(env,fetchImpl,lease.token,'local');}catch{}
    }));
  }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  qaFixtureGlobalReset({env:process.env}).then(result=>{
    console.log('IBERFIT_QA_AUTH_RESET='+JSON.stringify(result));
    if(result.status==='skipped')process.exitCode=0;
  }).catch(error=>{
    // A fixed categorical error is safe to log; no returned HTTP payloads.
    console.error('IBERFIT_QA_AUTH_RESET_FAILED:'+String(error.message).slice(0,120));
    process.exitCode=1;
  });
}
