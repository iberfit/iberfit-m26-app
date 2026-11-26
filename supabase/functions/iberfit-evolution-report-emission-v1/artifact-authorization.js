// Canonical private artifact identity; a second authorization must match exactly.
// No network here. The broker obtains both answers with the same user's bearer.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA=/^[0-9a-f]{64}$/u;
const BUCKET='iberfit-evolution-issued-reports';
export function authorizedArtifactIdentity(row,issuanceId){
 if(!row||row.ok!==true||row.withdrawn!==false||!UUID.test(issuanceId)||row.issuanceId!==issuanceId||!UUID.test(row.reportId)||row.artifactBucket!==BUCKET||typeof row.artifactPath!=='string'||!row.artifactPath||!SHA.test(row.artifactSha256)||!Number.isSafeInteger(row.version)||row.version<1||!Number.isSafeInteger(row.artifactSizeBytes)||row.artifactSizeBytes<1024||row.artifactSizeBytes>20971520)throw Error('M44_PDF_ISSUANCE_NOT_AVAILABLE');
 return Object.freeze({issuanceId:row.issuanceId,reportId:row.reportId,bucket:row.artifactBucket,path:row.artifactPath,sha256:row.artifactSha256,version:row.version,size:row.artifactSizeBytes});
}
export function verifyFreshArtifactAuthorization(original,fresh,issuanceId){
 const current=authorizedArtifactIdentity(fresh,issuanceId);
 if(!original||Object.keys(current).some(k=>current[k]!==original[k]))throw Error('M44_PDF_AUTHORIZATION_CHANGED');
 return current;
}
export function verifyFreshReportPreparation(original,fresh){
 if(!original?.ok||fresh?.ok!==true||!UUID.test(original.reportId)||!UUID.test(original.clientId)||!SHA.test(original.sourceSha256)||!Number.isSafeInteger(original.sourceRevision)||original.sourceRevision<2||original.artifactBucket!==BUCKET||['reportId','clientId','sourceRevision','sourceSha256','artifactBucket'].some(k=>original[k]!==fresh[k]))throw Error('M44_PDF_FINALIZE_STALE_SOURCE');
 return true;
}
