// M43 Canary Pages propagation: retry only transient same-origin static module
// 5xx. No retries can turn a broken login, unsafe request or wrong SHA green.
export const MAX_CANARY_EDGE_ATTEMPTS=3;
const RETRYABLE_STATUS=new Set([502,503,504,520,522,524]);
export function isRetryableCanaryStaticFailure({
  badResponses=[],blockedMutations=[],forbiddenOrigins=[],pageErrors=[],
}={}){
  return badResponses.length>0
    && blockedMutations.length===0
    && forbiddenOrigins.length===0
    && pageErrors.length===0
    && badResponses.every(item=>
      RETRYABLE_STATUS.has(item.status)
      && item.origin==='https://m26-canary.iberfit.cl'
      && /^\/(?:src|m26)\/[A-Za-z0-9_./-]+\.(?:js|css|mjs)$/u.test(String(item.path||'')));
}
