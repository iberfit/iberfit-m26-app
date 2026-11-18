// Read-only device QA proof, never an auth retry or a privilege grant.
// Accept only a single typed transport loss with a later successful server 200.
export const ASSURANCE_FAILURE_LABEL='POST qa-supabase /rest/v1/rpc/iberfit_privileged_assurance_context_v65d';
const RECOVERABLE=new Set(['net::ERR_ABORTED','net::ERR_CONNECTION_RESET',
 'net::ERR_TIMED_OUT','net::ERR_NETWORK_CHANGED']);
export function evaluateRecoveredAssuranceTransport({
 events=[],networkFailureCodes=[],externalFailures=[],serverAssuranceVerified=false,
}={}){
 const remainingFailures=Array.isArray(externalFailures)?[...externalFailures]:[];
 const result=(recovered,reason)=>Object.freeze({recovered,reason,remainingFailures});
 if(!Array.isArray(events)||!Array.isArray(networkFailureCodes)||!Array.isArray(externalFailures))
  return result(false,'INVALID_EVIDENCE');
 const count=remainingFailures.filter(x=>x===ASSURANCE_FAILURE_LABEL).length;
 if(count===0)return result(false,'NO_ASSURANCE_FAILURE');
 if(serverAssuranceVerified!==true||count!==1||networkFailureCodes.length!==1||
    !RECOVERABLE.has(networkFailureCodes[0])||
    events.join('|')!=='issued|requestfailed|issued|http-200')
  return result(false,'ASSURANCE_RECOVERY_NOT_PROVEN');
 remainingFailures.splice(remainingFailures.indexOf(ASSURANCE_FAILURE_LABEL),1);
 return result(true,'ASSURANCE_TRANSPORT_RECOVERED_EXACTLY_ONCE');
}
