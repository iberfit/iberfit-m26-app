import {parseCivilDate,reportCivilDate} from '../domain/civil-date.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SHA=/^[0-9a-f]{64}$/u;
const SPORTS=new Set(['running','cycling','walking','strength','hiit','swimming','other']);
const DECISION_REVISION=Object.freeze({pending:0,accepted:1,declined:1,withdrawn:2});
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=v=>typeof v==='string'&&UUID.test(v);
const digest=v=>typeof v==='string'&&SHA.test(v);
const text=(v,limit)=>typeof v==='string'&&v.trim().length>0&&v.length<=limit&&!/[\u0000-\u001f\u007f]/u.test(v);
const fail=()=>{throw Error('GX_DOCUMENT_REVIEW_INVALID');};
// The server is authoritative. This minimized DTO must never be persisted in
// a generic collection or interpreted as publication authorization.
export function verifyConnected360DocumentReview(value,{clientId,requestId,now=new Date()}={}){
 const today=Number.isFinite(now?.getTime?.())?reportCivilDate(now):null;
 if(!uuid(clientId)||!uuid(requestId)||!today||!exact(value,['schema','requestId','reportId','reportRevision','clientId','provider','periodStart','periodEnd','draftSha256','evidenceSha256','revision','decision','preview'])
 ||value.schema!=='iberfit.connected360.document-review.v1'||value.clientId!==clientId||value.requestId!==requestId||!uuid(value.reportId)
 ||!Number.isSafeInteger(value.reportRevision)||value.reportRevision<1||value.reportRevision>2147483647
 ||!['health_connect','apple_health'].includes(value.provider)||!digest(value.draftSha256)||!digest(value.evidenceSha256)
 ||!Object.hasOwn(DECISION_REVISION,value.decision)||value.revision!==DECISION_REVISION[value.decision]
 ||typeof value.periodStart!=='string'||typeof value.periodEnd!=='string'||parseCivilDate(value.periodStart)?.iso!==value.periodStart||parseCivilDate(value.periodEnd)?.iso!==value.periodEnd
 ||value.periodEnd>=today||value.periodStart>value.periodEnd)fail();
 const days=1+(Date.parse(value.periodEnd)-Date.parse(value.periodStart))/86400000;
 if(days<1||days>7)fail();
 if(value.preview===null)return Object.freeze({...value});
 const p=value.preview;
 if(value.decision!=='pending'||!exact(p,['reportTitle','coachName','reportType','evidence'])||!text(p.reportTitle,140)||!text(p.coachName,160)||p.reportType!=='weekly')fail();
 const e=p.evidence;
 if(!exact(e,['schema','provider','periodStart','periodEnd','coverage','observedDays','disciplines','evidenceSha256'])
 ||e.schema!=='iberfit.connected360.report-observations.v1'||e.provider!==value.provider||e.periodStart!==value.periodStart||e.periodEnd!==value.periodEnd
 ||e.coverage!=='observed-only'||e.evidenceSha256!==value.evidenceSha256||!Number.isInteger(e.observedDays)||e.observedDays<1||e.observedDays>days
 ||!Array.isArray(e.disciplines)||e.disciplines.length<1||e.disciplines.length>SPORTS.size)fail();
 const seen=new Set();let sum=0;
 const disciplines=e.disciplines.map(d=>{
  if(!exact(d,['sport','observedDays'])||!SPORTS.has(d.sport)||seen.has(d.sport)||!Number.isInteger(d.observedDays)||d.observedDays<1||d.observedDays>e.observedDays)fail();
  seen.add(d.sport);sum+=d.observedDays;return Object.freeze({...d});
 });
 if(sum<e.observedDays)fail();
 return Object.freeze({...value,preview:Object.freeze({...p,evidence:Object.freeze({...e,disciplines:Object.freeze(disciplines)})})});
}
// Explicit UI action only. Receipt-only mode can decline/withdraw but never
// accept. This builds a command; it neither sends nor grants authorization.
export function connected360DocumentDecisionParams(value,{clientId,requestId,now,decision,operationId,confirmed=false}={}){
 const v=verifyConnected360DocumentReview(value,{clientId,requestId,now});
 if(confirmed!==true||!uuid(operationId)||!((v.decision==='pending'&&(decision==='declined'||(decision==='accepted'&&v.preview!==null)))||(v.decision==='accepted'&&decision==='withdrawn')))throw Error('GX_DOCUMENT_DECISION_NOT_CONFIRMED');
 return Object.freeze({p_request:v.requestId,p_expected_revision:v.revision,p_operation:operationId,p_decision:decision,p_draft_sha:v.draftSha256,p_evidence_sha:v.evidenceSha256});
}
export function verifyConnected360DocumentDecisionReceipt(value,params){
 if(!params||!uuid(params.p_request)||!uuid(params.p_operation)||!['accepted','declined','withdrawn'].includes(params.p_decision)||params.p_expected_revision!==(params.p_decision==='withdrawn'?1:0)
 ||!exact(value,['requestId','operationId','revision','decision','duplicate'])||value.requestId!==params.p_request||value.operationId!==params.p_operation||value.decision!==params.p_decision||value.revision!==params.p_expected_revision+1||typeof value.duplicate!=='boolean')fail();
 return Object.freeze({...value});
}

// Receipt-only listing: does not authorize publication or acceptance. The
// cursor is opaque and scope-bound by the server. Never persist this inbox.
export function verifyConnected360DocumentInbox(value,{clientId,after=null,now=new Date()}={}){
 const today=Number.isFinite(now?.getTime?.())?reportCivilDate(now):null;
 if(!uuid(clientId)||!today||(after!==null&&!uuid(after))||!exact(value,['schema','clientId','after','items','nextAfter'])
 ||value.schema!=='iberfit.connected360.document-inbox.v1'||value.clientId!==clientId||value.after!==after
 ||!Array.isArray(value.items)||value.items.length>20)fail();
 const seen=new Set();
 const items=value.items.map(item=>{
  if(!exact(item,['requestId','reportId','reportRevision','provider','periodStart','periodEnd','revision','decision'])
  ||!uuid(item.requestId)||!uuid(item.reportId)||item.requestId===after||seen.has(item.requestId)
  ||!Number.isSafeInteger(item.reportRevision)||item.reportRevision<1||item.reportRevision>2147483647
  ||!['health_connect','apple_health'].includes(item.provider)||!Object.hasOwn(DECISION_REVISION,item.decision)||item.revision!==DECISION_REVISION[item.decision]
  ||typeof item.periodStart!=='string'||typeof item.periodEnd!=='string'||parseCivilDate(item.periodStart)?.iso!==item.periodStart||parseCivilDate(item.periodEnd)?.iso!==item.periodEnd
  ||item.periodStart>item.periodEnd||item.periodEnd>=today||(Date.parse(item.periodEnd)-Date.parse(item.periodStart))/86400000>6)fail();
  seen.add(item.requestId);return Object.freeze({...item});
 });
 if(value.nextAfter!==null&&(items.length!==20||value.nextAfter!==items.at(-1)?.requestId))fail();
 return Object.freeze({...value,items:Object.freeze(items)});
}

// An historical receipt from the Coach request operation, not proof of
// current permission. Bind all selected report identity fields to the response.
export function verifyConnected360DocumentCoachReceipt(value,{reportId,clientId,reportRevision,provider}={}){
 if(!uuid(reportId)||!uuid(clientId)||!Number.isSafeInteger(reportRevision)||reportRevision<1||reportRevision>2147483647
 ||!['apple_health','health_connect'].includes(provider)
 ||!exact(value,['schema','requestId','reportId','clientId','reportRevision','provider','revision','decision'])
 ||value.schema!=='iberfit.connected360.document-coach-receipt.v1'||!uuid(value.requestId)
 ||value.reportId!==reportId||value.clientId!==clientId||value.reportRevision!==reportRevision||value.provider!==provider
 ||!Object.hasOwn(DECISION_REVISION,value.decision)||value.revision!==DECISION_REVISION[value.decision])fail();
 return Object.freeze({...value});
}

// A canonical transition receipt is an acknowledgement, not a current grant.
// No extra data, cross-document substitution or replay is accepted.
export function verifyConnected360DocumentTransitionReceipt(value,{reportId,requestId,operationId,reportRevision,action}={}){
 if(!uuid(reportId)||!uuid(requestId)||!uuid(operationId)||!Number.isSafeInteger(reportRevision)||reportRevision<1||reportRevision>2147483646
 ||!['approve','publish'].includes(action)||!exact(value,['schema','reportId','requestId','operationId','revision','status'])
 ||value.schema!=='iberfit.connected360.document-transition.v1'||value.reportId!==reportId||value.requestId!==requestId||value.operationId!==operationId
 ||value.revision!==reportRevision+1||value.status!==(action==='approve'?'aprobado':'publicado'))throw Error('GX_DOCUMENT_TRANSITION_RECEIPT_INVALID');
 return Object.freeze({...value});
}
