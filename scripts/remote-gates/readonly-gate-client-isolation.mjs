export const RC29_QA_CLIENTS_NOT_DISTINCT='RC29_QA_CLIENTS_NOT_DISTINCT';

function normalizeClientId(value){
  return typeof value==='string'?value.trim():'';
}

export function assertDistinctQaClientIds(
  values,
  errorCode=RC29_QA_CLIENTS_NOT_DISTINCT,
){
  if(!Array.isArray(values))throw new Error(errorCode);
  const clientIds=values.map(normalizeClientId).filter(Boolean);
  if(clientIds.length!==2||new Set(clientIds).size!==2)throw new Error(errorCode);
  return true;
}
