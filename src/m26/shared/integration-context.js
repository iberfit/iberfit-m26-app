const ROLE_ALIASES=Object.freeze({client:'client',cliente:'client',coach:'coach',entrenador:'coach',admin:'admin',administrador:'admin'});
const CLIENT_SCOPED=new Set(['clients','clientProfiles','clientAccess','iriAssessments','reports','trainingCycles','sessions','sessionExecutions','appointments','checkins','habits','habitLogs','privateNotes','intelligenceRuns','domainEvents','wearableConnections','wearableDailySummaries','wearableSyncRuns','m26Entities']);
function recordClientId(record,key){
  if(key==='clients')return String(record?.id||'');
  const body=record?.body&&typeof record.body==='object'?record.body:{};
  return String(record?.clientId||record?.client_id||body.clientId||body.client_id||(key==='clientProfiles'?record?.id:'')||'');
}
export function normalizeApplicationContextExtension(input={}){
  return Object.freeze({
    available:input?.available===true,
    organizationId:String(input?.organizationId||input?.organization_id||'').trim()||null,
    membershipStatus:String(input?.membershipStatus||input?.membership_status||'').trim().toLowerCase()||null,
    roles:Object.freeze([...new Set((input?.roles||[]).map((r)=>ROLE_ALIASES[String(r||'').toLowerCase()]||null).filter(Boolean))]),
    assignmentScopeEnforced:input?.assignmentScopeEnforced===true||input?.assignment_scope_enforced===true,
    assignedClientIds:Object.freeze([...new Set((input?.assignedClientIds||input?.assigned_client_ids||[]).map(String))]),
    revision:Number(input?.revision||0),
  });
}
export function filterSnapshotForAssignmentScope(snapshot,extension,activeRole){
  const context=normalizeApplicationContextExtension(extension);
  if(context.available&&context.membershipStatus!=='active')throw new Error('M26_ORGANIZATION_ACCESS_SUSPENDED');
  if(!context.available||activeRole!=='coach'||!context.assignmentScopeEnforced)return structuredClone(snapshot);
  const allowed=new Set(context.assignedClientIds);
  const data={};
  for(const [key,value] of Object.entries(snapshot?.data||{})){
    data[key]=Array.isArray(value)&&CLIENT_SCOPED.has(key)?value.filter((item)=>allowed.has(recordClientId(item,key))):structuredClone(value);
  }
  return {...structuredClone(snapshot),data};
}
