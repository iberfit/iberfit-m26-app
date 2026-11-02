// QA-only authentication smoke: core bootstrap is NOT the default Coach UX.
export function canUseQaCoachCoreAuthSmoke({runtime={},runtimeConfig={},email='',reason='',probe=false}={}){
  return runtime.enabled===true
    &&runtime.qaOnly===true&&runtime.canary===true
    &&runtime.host==='m26-canary.iberfit.cl'
    &&runtime.projectRef==='gjztkdwfmunnzhtvxrsu'
    &&runtime.url==='https://gjztkdwfmunnzhtvxrsu.supabase.co'
    &&String(email||'').trim().toLowerCase()==='qa.rc74.coach@iberfit.cl'
    &&reason==='login'
    &&runtimeConfig?.freeQaCoachCoreAuthSmoke===true
    &&probe===true;
}
