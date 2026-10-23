/** Retry budget for the QA-only, authenticated read-only remote gate.
 * Explicit RPC allowlist prevents accidental replay of business mutations.
 */
const READ_ONLY_RPCS=new Set([
  'iberfit_environment',
  'iberfit_privileged_assurance_context_v65d',
  'iberfit_bootstrap_v26',
  'iberfit_application_context_v14',
  'iberfit_appointment_change_requests_v13',
]);
export function isRetryableReadOnlyRequest({pathname,method}){
  if(method==='GET'&&pathname==='/rest/v1/domain_command_registry_v26')return true;
  if(method!=='POST'||!pathname.startsWith('/rest/v1/rpc/'))return false;
  return READ_ONLY_RPCS.has(pathname.slice('/rest/v1/rpc/'.length));
}
export function classifyTransientNetworkIssue(error){
  const name=String(error?.name||'');
  if(name==='TimeoutError'||name==='AbortError')return 'TIMEOUT';
  if(name==='TypeError')return 'NETWORK';
  return null;
}
