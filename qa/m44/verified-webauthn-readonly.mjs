// Run exclusively inside the official Canary OIDC-guarded Coach WebAuthn job,
// after the browser has completed genuine registration/authentication.
// Demonstrates that the M44 session guard accepts verified MFA while report
// scoping still refuses an absent report. No business writes, no private data.
const ORIGIN='https://m26-canary.iberfit.cl';
const QA='https://gjztkdwfmunnzhtvxrsu.supabase.co';
const MISSING='0d000000-0000-4000-8000-000000000044';
export async function certifyM44VerifiedAssuranceBoundary({
 context,accessToken,publishableKey
}={}){
 if(!context?.request||!String(accessToken||'').startsWith('eyJ')||
    !String(publishableKey||'').trim())
  throw Error('M44_VERIFIED_QA_SESSION_REQUIRED');
 async function rpc(name,args={}){
  const response=await context.request.post(QA+'/rest/v1/rpc/'+name,{
   headers:{apikey:publishableKey,authorization:'Bearer '+accessToken,
    origin:ORIGIN,'content-type':'application/json'},
   data:args,timeout:30000,
  });
  return {status:response.status(),body:await response.json().catch(()=>({}))};
 }
 const assurance=await rpc('iberfit_privileged_assurance_context_v65d');
 if(assurance.status!==200||assurance.body?.iberfitAssurance!=='verified'||
    assurance.body?.privilegedRole!=='coach'||
    !['webauthn','email_otp'].includes(assurance.body?.assuranceMethod))
  throw Error('M44_QA_POSITIVE_VERIFIED_ASSURANCE_NOT_ESTABLISHED');
 const history=await rpc('iberfit_m44_report_issued_pdf_history_v1',{p_report_id:MISSING});
 if(history.status!==403||history.body?.message!=='M44_PDF_HISTORY_NOT_FOUND')
  throw Error('M44_QA_VERIFIED_ROLE_DID_NOT_REACH_REPORT_SCOPE_GATE');
 return Object.freeze({assurance:'verified',actor:'coach',scoping:'checked-after-mfa',
  absentReportBlocked:true,mutationsPerformed:false});
}
