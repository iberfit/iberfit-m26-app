// This helper is a bounded, read-only optimisation: auth/RLS decisions are
// never inferred here. The canonical server-authorized role is still checked
// by hydratePass and every wearable RPC retains its own authorization.
export function canSkipWearableReadForVerifiedRoles(roles){
  return Array.isArray(roles)&&roles.length>0&&
    roles.every((role)=>role==='coach'||role==='admin');
}

export async function loadWearablesWithBoundedRoleEvidence({
  roleEvidence,
  fetchWearable,
  fallback,
  waitMs=140,
}={}){
  if(typeof fetchWearable!=='function'||!roleEvidence||typeof roleEvidence.then!=='function'){
    throw new Error('M26_WEARABLE_DEMAND_INPUT_INVALID');
  }
  // Never make a Client wait indefinitely for optional application-context.
  const delay=Math.max(0,Math.min(500,Number.isFinite(Number(waitMs))?Number(waitMs):140));
  let timer=null;
  const deadline=new Promise((resolve)=>{timer=setTimeout(()=>resolve(null),delay);});
  let roles;
  try{
    roles=await Promise.race([Promise.resolve(roleEvidence).catch(()=>null),deadline]);
  }finally{
    if(timer!==null)clearTimeout(timer);
  }
  if(canSkipWearableReadForVerifiedRoles(roles)){
    return Object.freeze({skipped:true,data:fallback});
  }
  // Unknown or Client/multi-role context must preserve the original read.
  return Object.freeze({skipped:false,data:await fetchWearable()});
}
