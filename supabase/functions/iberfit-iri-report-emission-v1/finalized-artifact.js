// Immutable IRI publication: an ambiguous RPC result or a failed download
// URL must never erase a possibly committed artifact. Only an explicitly
// acknowledged idempotent replay can prove the newly uploaded object is unused.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA=/^[0-9a-f]{64}$/u;
export async function finishIriArtifactDelivery({final,storage,expected}){
  if(final?.error)throw final.error;
  const row=final?.data;
  if(row?.ok!==true||typeof row.reused!=='boolean'
    ||row.issueRequestId!==expected.issueRequestId||row.clientId!==expected.clientId
    ||row.assessmentId!==expected.assessmentId||row.audience!==expected.audience
    ||!UUID.test(row.issuanceId||'')||!UUID.test(row.documentId||'')
    ||!Number.isSafeInteger(row.version)||row.version<1||!SHA.test(row.artifactSha256||''))
    throw Error('IRI_REPORT_FINALIZE_INVALID_RESPONSE');
  const canonicalPath=[expected.clientId,expected.assessmentId,expected.audience,row.issuanceId,'report.pdf'].join('/');
  if(row.artifactPath!==canonicalPath
    ||(!row.reused&&(row.issuanceId!==expected.issuanceId||row.artifactSha256!==expected.artifactHash))
    ||(row.reused&&canonicalPath===expected.artifactPath&&row.artifactSha256!==expected.artifactHash))
    throw Error('IRI_REPORT_FINALIZE_ARTIFACT_PATH_INVALID');
  if(row.reused&&canonicalPath!==expected.artifactPath){
    // Only this request's unique, noncanonical upload may be removed.
    // A cleanup failure does not invalidate the already committed report.
    try{await storage.remove([expected.artifactPath]);}catch{}
  }
  const signed=await storage.createSignedUrl(canonicalPath,120);
  if(signed?.error)throw signed.error;
  if(typeof signed?.data?.signedUrl!=='string'||!signed.data.signedUrl)
    throw Error('IRI_REPORT_SIGNED_URL_INVALID');
  return {...row,signedUrl:signed.data.signedUrl,expiresIn:120,sourceSha256:expected.sourceHash};
}
