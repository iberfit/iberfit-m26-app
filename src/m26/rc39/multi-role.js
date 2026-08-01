const ROLE_ALIASES=Object.freeze({
  admin:'admin',administrador:'admin',administrator:'admin',
  coach:'coach',entrenador:'coach',
  client:'client',cliente:'client',
});
const ORDER=Object.freeze(['coach','admin','client']);
export function normalizeRc39Role(value){
  return ROLE_ALIASES[String(value||'').trim().toLowerCase()]||null;
}
export function normalizeAuthorizedRoles(identity={},fallback=null){
  const candidates=[
    identity.authorizedRoles,
    identity.authorized_roles,
    identity.roles,
    identity.appRoles,
    identity.app_roles,
  ].find(Array.isArray)||[];
  const values=[...candidates,identity.role,fallback]
    .map(normalizeRc39Role)
    .filter(Boolean);
  return Object.freeze([...new Set(values)].sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b)));
}
export function resolveActiveRole(authorizedRoles=[],preferred=null){
  const roles=normalizeAuthorizedRoles({authorizedRoles});
  const normalized=normalizeRc39Role(preferred);
  if(normalized&&roles.includes(normalized))return normalized;
  return roles[0]||null;
}
export function canSwitchApplication(identity={}){
  return normalizeAuthorizedRoles(identity).filter((role)=>['coach','admin'].includes(role)).length>1;
}
export function requiresRoleChoice(identity={}){
  return canSwitchApplication(identity)&&identity.roleChoiceConfirmed!==true;
}
export function withActiveRole(identity={},role,{choiceConfirmed=true}={}){
  const authorizedRoles=normalizeAuthorizedRoles(identity);
  const active=normalizeRc39Role(role);
  if(!active||!authorizedRoles.includes(active))throw new Error('M26_ROLE_SWITCH_FORBIDDEN');
  return Object.freeze({
    ...structuredClone(identity),
    role:active,
    authorizedRoles,
    roleChoiceConfirmed:choiceConfirmed,
  });
}
export function roleApplicationLabel(role){
  return ({coach:'App Coach',admin:'App Admin',client:'App Cliente'})[normalizeRc39Role(role)]||'IBERFIT';
}
