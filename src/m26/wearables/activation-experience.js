// Connected360 production first-access choice. Old observations are data,
// not proof that Health Connect is actively linked to this account.
const ACTIVE_STATES=new Set(['conectado','connected']);
const BLOCKED_STATES=new Set(['revocado','revoked','pausado','paused']);
export function clientWearableActivation(view){
  const wearable=view&&typeof view==='object'?view:{};
  const rows=Number(wearable.summary?.daysWithData||0);
  const connections=Array.isArray(wearable.connections)?wearable.connections:[];
  // Only a backend-certified automatic source with a real sync receipt may
  // suppress the optional connection entry point. A legacy/imported record,
  // former OS consent, or seven stale days must never do so.
  const linked=connections.some(item=>
    ACTIVE_STATES.has(String(item.status||item.state||'').toLowerCase())
    &&item.certifiedAutomatic===true
  );
  if(linked)return Object.freeze({kind:'linked',cta:false});
  // Deliberate pause/revocation is not permission to ask again on sign-in.
  if(connections.some(item=>BLOCKED_STATES.has(
    String(item.status||item.state||'').toLowerCase()
  )))return Object.freeze({kind:'blocked',cta:false});
  const native=wearable.productionNativeReady===true;
  return Object.freeze({
    kind:native?(rows>0?'reconnect':'consent'):'compatible-app-required',
    cta:true,native,
  });
}
