const ROLE_ALIASES=Object.freeze({
  client:'client',cliente:'client',
  coach:'coach',entrenador:'coach',
  admin:'admin',administrador:'admin',administrator:'admin',
});
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function role(value){return ROLE_ALIASES[String(value||'').trim().toLowerCase()]||null;}
function id(value,{optional=false}={}){
  if((value===null||value===undefined||value==='')&&optional)return null;
  const text=String(value||'').trim();
  if(!SAFE_ID.test(text))throw new Error('M26_APPLICATION_CONTEXT_ID_INVALID');
  return text;
}
export function createApplicationContext(input={}){
  const application=role(input.application||input.activeRole);
  const activeRole=role(input.activeRole||application);
  if(!application||activeRole!==application)throw new Error('M26_APPLICATION_ROLE_MISMATCH');
  const revision=Number(input.revision||0);
  if(!Number.isInteger(revision)||revision<0)throw new Error('M26_APPLICATION_CONTEXT_REVISION_INVALID');
  return Object.freeze({
    application,activeRole,
    organizationId:id(input.organizationId,{optional:true}),
    selectedClientId:application==='admin'?null:id(input.selectedClientId,{optional:true}),
    permissions:Object.freeze([...new Set((Array.isArray(input.permissions)?input.permissions:[]).map(String).map((x)=>x.trim()).filter(Boolean))].sort()),
    sessionId:id(input.sessionId),
    issuedAt:new Date(input.issuedAt||Date.now()).toISOString(),
    revision,
  });
}
export function switchApplicationContext(current,nextApplication,identity={}){
  const next=role(nextApplication);
  const allowed=[...new Set([...(identity.authorizedRoles||[]),identity.role].map(role).filter(Boolean))];
  if(!next||!allowed.includes(next))throw new Error('M26_APPLICATION_SWITCH_FORBIDDEN');
  const previous=createApplicationContext(current);
  return createApplicationContext({
    application:next,activeRole:next,organizationId:previous.organizationId,
    selectedClientId:null,permissions:[],sessionId:previous.sessionId,
    issuedAt:new Date().toISOString(),revision:previous.revision+1,
  });
}
export const __applicationContextInternals=Object.freeze({role,id});
