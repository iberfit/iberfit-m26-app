import {parseCivilDate,reportCivilDate} from '../domain/civil-date.js';
import {documentCoachReportScope} from './document-coach-panel.js';
import {privateReportMaterialMatches} from '../workflows/report-draft-safety.js';

// Only the existing private M44 creation RPC is used. Neither a receipt nor
// an optimistic local draft is sufficient to offer document consent.
export async function confirmPrivateWeeklyDraft({draft,scope,assertCurrent,create,refresh,getState,now=new Date()}={}){
 const start=parseCivilDate(draft?.periodStart)?.iso,end=parseCivilDate(draft?.periodEnd)?.iso;
 if(!start||!end||end>=reportCivilDate(now)||Date.parse(end)-Date.parse(start)!==6*86_400_000)throw Error('GX_DOCUMENT_PRIVATE_DRAFT_PERIOD_INVALID');
 if(!scope?.lease||scope.role!=='coach'||draft?.id!==scope.reportId||draft?.clientId!==scope.clientId
 ||draft?.reportType!=='weekly'||draft?.reviewAccepted!==true||draft?.visibleToClient!==false
 ||!Array.isArray(draft.evidence)||draft.evidence.length<1||draft.evidence.length>=12
 ||draft.evidence.some(r=>typeof r?.source!=='string'||r.source.trim().toLowerCase().startsWith('connected360:')))
  throw Error('GX_DOCUMENT_PRIVATE_DRAFT_INVALID');
 assertCurrent();
 const receipt=await create({clientId:scope.clientId,reportId:scope.reportId,draft},assertCurrent);
 if(receipt?.ok!==true||!['created','already-created'].includes(receipt.kind)||receipt.entityId!==scope.reportId||receipt.remoteRevision!==1)
  throw Error('GX_DOCUMENT_PRIVATE_DRAFT_RECEIPT_INVALID');
 // Refresh may replace the editor DOM; check the session and selected record,
 // not the now detached form. Never delete the original local draft.
 await refresh();
 const state=getState(),confirmed=documentCoachReportScope(state,scope.reportId,{actorId:scope.actorId,lease:scope.lease});
 const record=state?.collections?.reports?.find(r=>r.id===scope.reportId);
 if(!confirmed||confirmed.clientId!==scope.clientId||confirmed.reportRevision!==1
 ||!privateReportMaterialMatches(record,draft)
 ||(record?.body&&!privateReportMaterialMatches(record.body,draft))
 ||(record?.content&&!privateReportMaterialMatches(record.content,draft)))
  throw Error('GX_DOCUMENT_PRIVATE_DRAFT_READBACK_INVALID');
 return Object.freeze({reportId:scope.reportId,reportRevision:1});
}
