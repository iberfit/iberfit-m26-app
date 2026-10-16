// Private destination checks for encrypted M44 backup workflow artifacts.
// This does not download or decrypt data; it only decides where a certified
// ciphertext-only artifact may be placed in IBERFIT's existing private Drive.
const SHA=/^[0-9a-f]{40}$/u;
const FOLDER_MIME='application/vnd.google-apps.folder';
const NAME='01 - Copia general cifrada IBERFIT';

export function requirePrivateDriveFolder(metadata,{
  expectedOwner='iberfit.cl@gmail.com',expectedName,
}={}){
  if(!metadata||metadata.mime_type!==FOLDER_MIME
    ||metadata.file_or_folder!=='folder'
    ||metadata.title!==expectedName
    ||metadata.shared!==false
    ||metadata.source_visibility_status!=='permission_metadata_available')
    throw Error('M44_DRIVE_DESTINATION_IDENTITY_NOT_VERIFIED');
  const permissions=metadata.permissions;
  if(!Array.isArray(permissions)||permissions.length!==1
    ||permissions[0]?.type!=='user'
    ||permissions[0]?.role!=='owner'
    ||String(permissions[0]?.emailAddress||'').toLowerCase()!==expectedOwner)
    throw Error('M44_DRIVE_DESTINATION_NOT_OWNER_PRIVATE');
  return Object.freeze({id:metadata.id,name:metadata.title});
}
export function generalEncryptedM44DriveRoute({
  runId,sourceSha,createdAt,artifactName,destination,
}={}){
  const id=Number(runId),sha=String(sourceSha||'').toLowerCase();
  if(!Number.isSafeInteger(id)||id<=0||!SHA.test(sha)
    ||artifactName!=='iberfit-prod-ciphertext-'+id)
    throw Error('M44_DRIVE_ARTIFACT_PROVENANCE_INVALID');
  const date=new Date(createdAt);
  if(!Number.isFinite(date.getTime()))throw Error('M44_DRIVE_ARTIFACT_DATE_INVALID');
  const folder=requirePrivateDriveFolder(destination,{expectedName:NAME});
  return Object.freeze({
    scope:'ALL_IBERFIT',
    folderId:folder.id,
    filename:'IBERFIT · Recuperación general cifrada · '+date.toISOString().replace(/[-:.]/gu,'')+' · '+sha.slice(0,12)+'.zip',
    needsEncryptedContentsVerification:true,
    clientId:null,
    restorationVerified:false,
    uploaded:false,
  });
}
