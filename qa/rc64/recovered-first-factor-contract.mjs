/**
 * RC64: distinguish a single RECOVERED first-factor transport interruption
 * from actual auth failures. This is a readonly QA assertion, not an app retry.
 * Never accept denied HTTP responses, loops, missing assurance, or foreign RPC.
 */
const AUTH_FAILURE_LABEL='POST qa-supabase /auth/v1/token';
const RECOVERABLE_CODES=new Set([
  'net::ERR_ABORTED','net::ERR_CONNECTION_RESET','net::ERR_TIMED_OUT',
  'net::ERR_NETWORK_CHANGED',
]);
export function mayRetryUserLoginAfterNetworkError({
  events=[],networkFailureCodes=[],networkErrorVisible=false,userRetryCount=0,
}={}){
  return networkErrorVisible===true&&userRetryCount===0&&
    Array.isArray(events)&&Array.isArray(networkFailureCodes)&&
    events.join('|')==='issued|requestfailed|issued|requestfailed'&&
    networkFailureCodes.length===2&&
    networkFailureCodes.every(code=>RECOVERABLE_CODES.has(code));
}

export function evaluateRecoveredFirstFactor({
  events=[],networkFailureCodes=[],externalFailures=[],authenticated=false,userRetryCount=0,
}={}){
  const failureLabels=Array.isArray(externalFailures)?[...externalFailures]:[];
  const fail=(reason)=>({recovered:false,reason,remainingFailures:failureLabels});
  if(!Array.isArray(events)||!Array.isArray(networkFailureCodes))return fail('INVALID_EVIDENCE');
  if(networkFailureCodes.length===0)return {recovered:false,reason:'NO_FIRST_FACTOR_FAILURE',remainingFailures:failureLabels};
  const issued=events.filter(e=>e==='issued').length;
  const ok=events.filter(e=>e==='http-200').length;
  const failed=events.filter(e=>e==='requestfailed').length;
  const denied=events.some(e=>/^http-(?!200$)\d{3}$/u.test(e));
  const singleAutomaticRetry=
    userRetryCount===0&&issued===2&&failed===1&&ok===1&&
    networkFailureCodes.length===1;
  // An explicit click after the UI has reported a network timeout is a human
  // recovery path. Preserve the app's two-attempt cap and allow only one
  // additional click with an immediate successful first factor. No loops.
  const explicitUserRecovery=
    userRetryCount===1&&issued===3&&failed===2&&ok===1&&
    events.join('|')==='issued|requestfailed|issued|requestfailed|issued|http-200'&&
    networkFailureCodes.length===2;
  const allowed=(singleAutomaticRetry||explicitUserRecovery)&&
    networkFailureCodes.every(code=>RECOVERABLE_CODES.has(code));
  if(!authenticated||denied||!allowed||
    events.lastIndexOf('http-200')<=events.lastIndexOf('requestfailed'))
    return fail('FIRST_FACTOR_NOT_PROVEN_RECOVERED');
  if(failureLabels.filter(x=>x===AUTH_FAILURE_LABEL).length<failed)
    return fail('FIRST_FACTOR_FAILED_REQUEST_NOT_RECORDED');
  for(let i=0;i<failed;i++){
    const index=failureLabels.indexOf(AUTH_FAILURE_LABEL);
    failureLabels.splice(index,1);
  }
  return {recovered:true,
    reason:explicitUserRecovery?'FIRST_FACTOR_USER_RETRY_RECOVERED':'FIRST_FACTOR_RECOVERED_EXACTLY_ONCE',
    remainingFailures:failureLabels};
}
