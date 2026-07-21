import { M26_COMMAND_REGISTRY,M26_EXTENDED_COMMAND_REGISTRY,normalizeRegistryRole,validateCommandCatalog,validatedRuntimeRegistry } from '../command-catalog.js';
export function normalizeBootstrapRole(bootstrap={}){return normalizeRegistryRole(bootstrap.role||bootstrap.profile?.role||bootstrap.user_profile?.role||'');}
export function validateQaIdentity({session,bootstrap,expectedRole,expectedEmailPrefix='iberfit.cl+qa.'}={}){
  const errors=[];const email=String(session?.user?.email||'').toLowerCase();const role=normalizeBootstrapRole(bootstrap);const expected=normalizeRegistryRole(expectedRole);
  if(!session?.token||!session?.user?.id)errors.push('AUTH_SESSION_INVALID');if(!email.startsWith(expectedEmailPrefix))errors.push('QA_EMAIL_REQUIRED');if(role!==expected)errors.push('ROLE_MISMATCH');
  return {ok:errors.length===0,errors,email,role,userId:session?.user?.id||null};
}
export function buildAuthenticatedQaReport({coach,client,installedCommands,preflights=[],requireEngagement=false}={}){
  const expected=requireEngagement?M26_EXTENDED_COMMAND_REGISTRY:M26_COMMAND_REGISTRY;const commandCatalog=validateCommandCatalog(installedCommands||[],expected);const runtime=validatedRuntimeRegistry(installedCommands||[]);
  const coachIdentity=validateQaIdentity({...coach,expectedRole:'coach'});const clientIdentity=validateQaIdentity({...client,expectedRole:'cliente'});const preflightFailures=preflights.filter((item)=>item?.ok!==true);
  return {ok:commandCatalog.ok&&coachIdentity.ok&&clientIdentity.ok&&preflightFailures.length===0,generatedAt:new Date().toISOString(),requireEngagement,commandCatalog,runtimeRegistry:{ok:runtime.ok,count:runtime.registry.length,rejected:runtime.rejected},identities:{coach:coachIdentity,client:clientIdentity},preflights,preflightFailures};
}
