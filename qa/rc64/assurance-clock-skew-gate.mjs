import {isFutureIssuedJwtClockSkew} from '../../src/m26/supabase-transport.js';

// QA may observe a transient response while the application is performing
// its own bounded read-only PostgREST clock-skew recovery. No other HTTP
// denial is eligible. This never authorizes the Client or changes app code.
export const MAX_QA_FUTURE_IAT_RESPONSES=3;

export function shouldAwaitFinalAssuranceResponse({
  status=0,body=null,observedSkewResponses=0,
}={}){
  return Number.isInteger(observedSkewResponses)
    &&observedSkewResponses>=0
    &&observedSkewResponses<MAX_QA_FUTURE_IAT_RESPONSES
    &&isFutureIssuedJwtClockSkew({status,body});
}
