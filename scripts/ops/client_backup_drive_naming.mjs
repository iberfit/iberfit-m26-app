
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function canonicalIdentity({clientId,fullName}={}){
  const id=String(clientId||'').toLowerCase().trim();
  if(!UUID.test(id))throw Error('BACKUP_CLIENT_ID_INVALID');
  if(typeof fullName!=='string')throw Error('BACKUP_CLIENT_NAME_MISSING');
  const name=fullName.normalize('NFC').replace(/\s+/g,' ').trim();
  if(name.length<2||name.length>100||/[\\/<>:"|?*]/.test(name)||name==='.'||name==='..'||/[\x00-\x1f\x7f]/.test(name))throw Error('BACKUP_CLIENT_NAME_INVALID');
  return {clientId:id,fullName:name};
}
export function clientBackupFolderName(identity){
  const {clientId,fullName}=canonicalIdentity(identity);
  return fullName+' · '+clientId;
}
export function clientBackupFileName(identity,createdAt){
  const {fullName}=canonicalIdentity(identity);
  const date=new Date(createdAt);
  if(!Number.isFinite(date.getTime()))throw Error('BACKUP_CLIENT_DATE_INVALID');
  return fullName+' · '+date.toISOString().replace(/[-:.]/g,'')+' · copia-cifrada.enc';
}
export function assertIndividualBackup({clientId,archiveClientId,scope}={}){
  const a=String(clientId||'').toLowerCase(),b=String(archiveClientId||'').toLowerCase();
  if(!UUID.test(a)||a!==b||scope!=='ONE_CLIENT')throw Error('BACKUP_CLIENT_SCOPE_INVALID');
  return true;
}
