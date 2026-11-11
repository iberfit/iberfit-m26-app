// One-role prefetch policy. This only controls concurrent READS.
// Security still depends on the normal authenticated bootstrap,
// owner lease, application-role resolution and backend RLS.
export function canPrefetchClientCommunication(authorizedRoles,requestedRole=null){
  if(!Array.isArray(authorizedRoles)||authorizedRoles.length!==1
    ||authorizedRoles[0]!=='client')return false;
  const requested=String(requestedRole||'').trim().toLowerCase();
  return requested===''||requested==='client';
}
