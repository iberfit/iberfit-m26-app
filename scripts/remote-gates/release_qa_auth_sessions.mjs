// Scoped QA cleanup: invalidate ONLY sessions minted by this Node gate.
// No production, global sign-out, service role, passwords, IDs or bulk SQL.
const ORIGIN='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const EMAILS=new Set([
  'qa.rc74.coach@iberfit.cl','qa.rc74.client-a@iberfit.cl','qa.rc74.client-b@iberfit.cl',
]);
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;
function isQaReleaseScope({base,key,projectRef,qaOnly,fetchImpl}){
  let safe=false;
  try{
    const url=new URL(base);
    const k=String(key||'');
    safe=url.origin===ORIGIN&&url.pathname==='/'&&url.search===''&&
      url.hash===''&&!url.username&&!url.password&&
      projectRef==='gjztkdwfmunnzhtvxrsu'&&String(qaOnly).toLowerCase()==='true'&&
      typeof fetchImpl==='function'&&k.length>=10&&k.length<=16384&&
      /^(?:sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)$/u.test(k);
  }catch{}
  return safe;
}
export async function releaseQaAuthSessions({
  sessions=[],base,key,projectRef,qaOnly,fetchImpl=globalThis.fetch,
}={}){
  const result={released:0,failed:0,skipped:0};
  if(!Array.isArray(sessions)||sessions.length>3){
    result.skipped=Array.isArray(sessions)?sessions.length:0;
    return result;
  }
  const safe=isQaReleaseScope({base,key,projectRef,qaOnly,fetchImpl});
  if(!safe){result.skipped=sessions.length;return result;}
  const outcomes=await Promise.all(sessions.map(async session=>{
    const email=String(session?.email||'').trim().toLowerCase();
    const token=String(session?.token||'');
    if(!EMAILS.has(email)||token.length<100||token.length>16384||!JWT.test(token))return 'skipped';
    try{
      const response=await fetchImpl(ORIGIN+'/auth/v1/logout?scope=local',{
        method:'POST',headers:{apikey:key,authorization:'Bearer '+token,accept:'application/json'},
        credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000),
      });
      return response?.ok===true?'released':'failed';
    }catch{return 'failed';}
  }));
  for(const status of outcomes)result[status]++;
  return result;
}

/** Run bounded QA cleanup after success or failure without masking the primary error. */
export async function runQaStageWithCleanup(run,cleanup,onCleanupFailure=()=>{}){
  let result;
  try{
    result=await run();
  }catch(primaryError){
    try{
      await cleanup();
    }catch{
      onCleanupFailure();
    }
    throw primaryError;
  }
  await cleanup();
  return result;
}

/** Verify exact QA scope and fixture mapping before login; keep only this run's leases. */
export function createQaAuthLease({
  base,key,projectRef,qaOnly,fixtures={},tag,fetchImpl=globalThis.fetch,
}={}){
  if(typeof tag!=='string'||! /^[A-Z0-9_]{1,64}$/u.test(tag))throw Error('QA_AUTH_LEASE_TAG_INVALID');
  if(qaOnly!=='true'||!isQaReleaseScope({base,key,projectRef,qaOnly,fetchImpl}))
    throw Error(tag+'_QA_SCOPE_DENIED');
  const entries=Object.entries(fixtures);
  if(entries.length<1||entries.length>3||entries.some(([expected,configured])=>
    !EMAILS.has(expected)||String(configured||'').trim().toLowerCase()!==expected))
    throw Error(tag+'_QA_FIXTURE_DENIED');
  const allowed=new Set(entries.map(([email])=>email));
  const sessions=[];
  return Object.freeze({
    track(body,expectedEmail){
      const email=String(body?.user?.email||'').trim().toLowerCase();
      const token=body?.access_token;
      if(email!==String(expectedEmail||'').trim().toLowerCase()||!allowed.has(email)||
         typeof token!=='string'||token.length<100||token.length>16384||!JWT.test(token))
        throw Error(tag+'_QA_FIXTURE_IDENTITY_MISMATCH');
      if(sessions.some(session=>session.token===token))return token;
      if(sessions.length>=3)throw Error(tag+'_QA_SESSION_LIMIT');
      sessions.push({email,token});
      return token;
    },
    async release(){
      if(sessions.length===0)return;
      const result=await releaseQaAuthSessions({sessions,base,key,projectRef,qaOnly,fetchImpl});
      console.log(tag+'_QA_AUTH_RELEASE='+result.released+'/'+sessions.length);
      if(result.released!==sessions.length||result.failed!==0||result.skipped!==0)
        throw Error(tag+'_QA_AUTH_CLEANUP_INCOMPLETE');
      sessions.length=0;
    },
  });
}
