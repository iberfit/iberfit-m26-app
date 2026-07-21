import {createM26Id} from '../platform/id.js';
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
function cleanText(value,max){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max);}
function safeId(value){const id=String(value||'').trim();return SAFE_ID.test(id)?id:null;}
function validDate(value){const text=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;const date=new Date(`${text}T00:00:00Z`);if(!Number.isFinite(date.getTime()))return null;return date.toISOString().slice(0,10)===text?text:null;}
export function validateReportDraft(draft={}){
  const errors=[];
  if(!safeId(draft.clientId))errors.push('clientId');
  if(!safeId(draft.assessmentId))errors.push('assessmentId');
  if(!cleanText(draft.title,140))errors.push('title');
  if(!validDate(draft.periodStart))errors.push('periodStart');
  if(!validDate(draft.periodEnd))errors.push('periodEnd');
  if(draft.periodStart&&draft.periodEnd&&new Date(`${draft.periodEnd}T00:00:00Z`)<new Date(`${draft.periodStart}T00:00:00Z`))errors.push('chronology');
  if(cleanText(draft.summary,2500).length<20)errors.push('summary');
  if(cleanText(draft.conclusions,2500).length<20)errors.push('conclusions');
  if(cleanText(draft.recommendations,2500).length<20)errors.push('recommendations');
  if(draft.reviewAccepted!==true)errors.push('reviewAccepted');
  return {ok:errors.length===0,errors:[...new Set(errors)]};
}
export function normalizeReportDraft(draft={}){
  const check=validateReportDraft(draft);if(!check.ok)throw new Error(`M26_REPORT_DRAFT_INVALID:${check.errors.join(',')}`);
  return Object.freeze({
    id:safeId(draft.id)||createM26Id(),clientId:safeId(draft.clientId),assessmentId:safeId(draft.assessmentId),
    title:cleanText(draft.title,140),periodStart:draft.periodStart,periodEnd:draft.periodEnd,
    summary:cleanText(draft.summary,2500),conclusions:cleanText(draft.conclusions,2500),recommendations:cleanText(draft.recommendations,2500),
    format:'a4-premium',visibility:'coach',singleReport:true,status:'aprobado',visibleToClient:false,
  });
}
export function buildApproveReportDraftCommand(draft,baseRevision=0){
  const normalized=normalizeReportDraft(draft);
  return {type:'INFORME_APROBAR',entityType:'report',entityId:normalized.id,clientId:normalized.clientId,baseRevision:Number.isInteger(Number(baseRevision))&&Number(baseRevision)>=0?Number(baseRevision):0,payload:{patch:structuredClone(normalized)}};
}
