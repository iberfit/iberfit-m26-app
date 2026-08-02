const CAPABILITY=/^[a-z][a-z0-9_.:-]{2,79}$/;
const SCOPES=new Set(['organization','assigned_clients','own_client','none']);
function capability(value){
  const text=String(value||'').trim().toLowerCase();
  if(!CAPABILITY.test(text)||text.includes('*'))throw new Error('M26_PERMISSION_CAPABILITY_INVALID');
  return text;
}
export function createPermissionSet(input={}){
  const scopeType=String(input.scopeType||input.scope?.type||'none').trim().toLowerCase();
  if(!SCOPES.has(scopeType))throw new Error('M26_PERMISSION_SCOPE_INVALID');
  const revision=Number(input.revision||0);
  if(!Number.isInteger(revision)||revision<0)throw new Error('M26_PERMISSION_REVISION_INVALID');
  return Object.freeze({
    capabilities:Object.freeze([...new Set((input.capabilities||[]).map(capability))].sort()),
    scope:Object.freeze({
      type:scopeType,
      organizationId:String(input.organizationId||input.scope?.organizationId||'').trim()||null,
      clientIds:Object.freeze([...new Set(input.clientIds||input.scope?.clientIds||[])].map(String).sort()),
    }),
    revision,
    issuedAt:new Date(input.issuedAt||Date.now()).toISOString(),
  });
}
export function hasCapability(set,value){return createPermissionSet(set).capabilities.includes(capability(value));}
export function requireCapability(set,value){if(!hasCapability(set,value))throw new Error(`M26_ADMIN_CAPABILITY_REQUIRED:${capability(value)}`);return true;}
