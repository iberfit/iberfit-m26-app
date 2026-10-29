// QA-only lossless canonical-summary references. Preserve every record,
// revision and event without increasing bootstrap size limits.
const REF='__iberfitQaCanonicalExecutionSummaryRefV1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const str=x=>String(x??'');
const qaCoach=s=>s?.environment==='QA'&&s?.user?.role==='coach'&&s?.canary?.active===true;
const canon=x=>Array.isArray(x)?'['+x.map(canon).join(',')+']'
  :object(x)?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}'
  :JSON.stringify(x);
const index=s=>new Map((Array.isArray(s?.data?.m26Entities)?s.data.m26Entities:[])
  .filter(e=>e?.entityType==='session_execution'&&UUID.test(str(e.entityId)))
  .map(e=>[str(e.entityId),e]));
function validLineage(row,e){
 const b=e?.body;
 return object(b)&&UUID.test(str(row?.id))&&str(row.id)===str(e.entityId)
   &&str(row.id)===str(b.id)&&UUID.test(str(row.client_id))
   &&str(row.client_id)===str(e.clientId)&&str(row.client_id)===str(b.clientId)
   &&UUID.test(str(row.session_id))&&str(row.session_id)===str(b.sessionId)
   &&Number.isSafeInteger(Number(row.revision))&&Number(row.revision)>=0
   &&Number(row.revision)===Number(e.revision)&&Number(row.revision)===Number(b.revision);
}
export function compactQaCanonicalExecutionSummaries(snapshot){
 if(!qaCoach(snapshot)||!Array.isArray(snapshot?.data?.sessionExecutions))return snapshot;
 const byId=index(snapshot);let count=0;
 const rows=snapshot.data.sessionExecutions.map(row=>{
  const e=byId.get(str(row?.id));
  if(!e||!validLineage(row,e)||!object(row.summary)||canon(row.summary)!==canon(e.body))
   return row;
  count++;
  return {...row,summary:{[REF]:row.id}};
 });
 return count?{...snapshot,data:{...snapshot.data,sessionExecutions:rows}}:snapshot;
}
export function expandQaCanonicalExecutionSummaries(snapshot){
 const rows=snapshot?.data?.sessionExecutions;
 if(!Array.isArray(rows))return snapshot;
 let byId=null,count=0;
 const expanded=rows.map(row=>{
  const summary=row?.summary;
  if(!object(summary)||!Object.prototype.hasOwnProperty.call(summary,REF))return row;
  if(!qaCoach(snapshot)||Object.keys(summary).length!==1||
    !UUID.test(str(summary[REF]))||str(summary[REF])!==str(row.id))
   throw new Error('U48_QA_CANONICAL_SUMMARY_REF_INVALID');
  byId??=index(snapshot);
  const e=byId.get(str(row.id));
  if(!validLineage(row,e))throw new Error('U48_QA_CANONICAL_SUMMARY_LINEAGE_CONFLICT');
  count++;
  return {...row,summary:structuredClone(e.body)};
 });
 return count?{...snapshot,data:{...snapshot.data,sessionExecutions:expanded}}:snapshot;
}
export const __qaCanonicalSummaryTransportInternals=Object.freeze({REF});
