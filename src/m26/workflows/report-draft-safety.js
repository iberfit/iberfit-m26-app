// M43: keep each Coach report draft isolated and reconcile remote revision before approval.
// This policy never changes backend authorization or publishes a report to a client.
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const FINAL_STATUSES=new Set(['aprobado','approved','publicado','published','archivado','archived']);
const DRAFT_STATUSES=new Set(['borrador','draft']);
const FIELDS=['title','assessmentId','periodStart','periodEnd','summary','conclusions','recommendations',
  'reportType','coachComment','evidenceSignature','reportModelVersion',
  'sourceAssessmentId','sourceAssessmentRevision'];
const value=(record,key)=>record?.[key]??record?.body?.[key]??null;

export function reportDraftScope(entityId){
  const id=String(entityId||'').trim();
  if(!SAFE_ID.test(id))throw new Error('M43_REPORT_DRAFT_ID_INVALID');
  // Typical UUIDs fit the local repository's 80-character scope contract.
  // Reject an oversized identifier rather than truncating into another draft.
  const escaped=id.replace(/_/g,'_5f').replace(/:/g,'_3a');
  const scope='report-approval-'+escaped;
  if(scope.length>80)throw new Error('M43_REPORT_DRAFT_SCOPE_TOO_LONG');
  return scope;
}

export function legacyReportDraftScope(assessmentId){
  const id=String(assessmentId||'').trim();
  if(!SAFE_ID.test(id)||id.length>64)throw new Error('M43_REPORT_ASSESSMENT_INVALID');
  return 'report-approval:'+id;
}

export async function restoreReportDraft(repository,clientId,assessmentId,entityId){
  const scope=entityId?reportDraftScope(entityId):null;
  if(scope){
    const current=await repository.load(clientId,scope);
    if(current){
      if(String(current.value?.id||'')!==String(entityId)||String(current.value?.assessmentId||'')!==String(assessmentId)||String(current.value?.clientId||'')!==String(clientId))
        throw new Error('M43_REPORT_DRAFT_IDENTITY_CONFLICT');
      return current;
    }
  }
  // Older clients stored one report under the assessment ID. Read without
  // deleting; only the explicit save to a unique entity key migrates it.
  const legacy=await repository.load(clientId,legacyReportDraftScope(assessmentId));
  if(!legacy)return null;
  if(String(legacy.value?.clientId||'')!==String(clientId)||String(legacy.value?.assessmentId||'')!==String(assessmentId))
    throw new Error('M43_REPORT_LEGACY_DRAFT_IDENTITY_CONFLICT');
  if(entityId&&String(legacy.value?.id||'')!==String(entityId))return null;
  return legacy;
}

export function reportApprovalDecision(reports,clientId,draft){
  const id=String(draft?.id||'').trim(),owner=String(clientId||'').trim();
  if(!SAFE_ID.test(id)||!SAFE_ID.test(owner)||String(draft?.clientId||'')!==owner)
    throw new Error('M43_REPORT_APPROVAL_IDENTITY_INVALID');
  const remote=(Array.isArray(reports)?reports:[]).find(r=>String(value(r,'id')||'')===id);
  if(!remote)return Object.freeze({kind:'create',baseRevision:0});
  if(String(value(remote,'clientId')??value(remote,'client_id')??'')!==owner)
    throw new Error('M43_REPORT_REMOTE_CLIENT_CONFLICT');
  const revision=Number(value(remote,'revision'));
  if(!Number.isInteger(revision)||revision<1)throw new Error('M43_REPORT_REMOTE_REVISION_UNKNOWN');
  const status=String(value(remote,'status')??value(remote,'estado')??'').trim().toLowerCase();
  if(FINAL_STATUSES.has(status)){
    // Authoritative replay must match all authored report material, not just prose.
    // A changed coach annotation or evidence payload is a new version, never an ACK replay.
    const equal=FIELDS.every(field=>String(value(remote,field)??'').trim()===String(draft[field]??'').trim())
      &&JSON.stringify(value(remote,'evidence')??[])===JSON.stringify(draft.evidence??[]);
    return Object.freeze({kind:equal?'already-approved':'new-version-required',baseRevision:revision});
  }
  if(DRAFT_STATUSES.has(status))return Object.freeze({kind:'update-draft',baseRevision:revision});
  throw new Error('M43_REPORT_REMOTE_STATUS_UNSUPPORTED');
}
