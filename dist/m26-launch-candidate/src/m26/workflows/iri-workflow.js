import { scoreIriPerformance } from '../norms/iri-scoring.js';
import { validateIriProfile } from './iri-profile.js';
const REQUIRED=['clientId','assessmentDate','stepFinalHr','stepOneMinuteHr','strengthPatterns','bodyComposition','sexForNorms'];
function finite(value){ return Number.isFinite(Number(value)); }
export function computeDeltaFc(finalHr, oneMinuteHr){ if(!finite(finalHr)||!finite(oneMinuteHr)) throw new Error('M26_IRI_HR_REQUIRED'); return Number(finalHr)-Number(oneMinuteHr); }
export function validateIriDraft(draft={}){
  const errors=[]; for(const key of REQUIRED){ if(draft[key]===null||draft[key]===undefined||draft[key]===''||(Array.isArray(draft[key])&&!draft[key].length)) errors.push(key); }
  if(finite(draft.stepFinalHr)&&finite(draft.stepOneMinuteHr)&&computeDeltaFc(draft.stepFinalHr,draft.stepOneMinuteHr)<0) errors.push('deltaFc');
  if(!draft.strengthPatterns || typeof draft.strengthPatterns!=='object') errors.push('strengthPatterns');
  const profile=validateIriProfile(draft,draft.assessmentDate); errors.push(...profile.errors);
  return {ok:errors.length===0,errors:Object.freeze([...new Set(errors)])};
}
export function buildIriCommand(draft, revision=0){ if(!draft?.id) throw new Error('M26_IRI_REMOTE_ENTITY_REQUIRED'); const check=validateIriDraft(draft); if(!check.ok) throw new Error(`M26_IRI_INVALID:${check.errors.join(',')}`); const profile=validateIriProfile(draft,draft.assessmentDate); const normalized={...draft,ageYears:profile.ageYears}; const scoring=scoreIriPerformance(normalized); if(!scoring.context.ok) throw new Error(`M26_IRI_NORM_CONTEXT_INVALID:${scoring.context.errors.join(',')}`); return {type:'IRI_COMPLETAR',entityType:'iri',entityId:draft.id,clientId:draft.clientId,baseRevision:revision,payload:{patch:{...structuredClone(normalized),deltaFc:computeDeltaFc(draft.stepFinalHr,draft.stepOneMinuteHr),normScoring:scoring,normEngineVersion:'m26-rc5.1'}}}; }
export function buildIriReportCommand({clientId,assessmentId,reportId,visibility='coach',previewAccepted=true},revision=0){ if(!clientId||!assessmentId||!reportId) throw new Error('M26_IRI_REPORT_CONTEXT_REQUIRED'); if(!previewAccepted) throw new Error('M26_IRI_REPORT_PREVIEW_REQUIRED'); return {type:'INFORME_PUBLICAR',entityType:'report',entityId:reportId,clientId,baseRevision:revision,previewAccepted:true,payload:{patch:{assessmentId,visibility,format:'a4-premium',singleReport:true}}}; }
