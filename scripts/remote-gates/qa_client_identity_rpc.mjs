// QA-only, least-privilege identity reads. Never load a client's full, possibly
// megabyte-sized historical bootstrap when a test only needs role/client ID.
// Both values must come from the same authenticated actor's existing RPCs.
// No storage, impersonation, synthetic stubs, service-role, or cached identity.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
export async function readQaClientIdentity({readRole,readClientId,label='QA_CLIENT'}={}){
  if(typeof readRole!=='function'||typeof readClientId!=='function'){
    throw new Error('QA_CLIENT_IDENTITY_RPC_READERS_REQUIRED');
  }
  const [roleValue,clientValue]=await Promise.all([readRole(),readClientId()]);
  const role=String(roleValue||'').trim().toLowerCase();
  const clientId=String(clientValue||'').trim();
  if(!['client','cliente'].includes(role)||!UUID.test(clientId)){
    throw new Error(`${label}_CLIENT_CONTEXT_INVALID`);
  }
  return Object.freeze({role,clientId});
}
