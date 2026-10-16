import {clientBackupFolderName} from './client_backup_drive_naming.mjs';

// A plan is NOT proof that binary files have been downloaded, encrypted or restored.
// Relational client links must be verified upstream against the canonical database.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHARED_BUCKETS=new Set(['iberfit-exercise-media','iberfit-exercise-media-review']);

function canonicalObject(item){
  if(!item||typeof item!=='object')throw Error('STORAGE_BACKUP_ITEM_INVALID');
  const bucket=String(item.bucketId||'').trim();
  const name=String(item.objectName||'').normalize('NFC');
  const size=item.sizeBytes;
  if(!/^[a-z0-9][a-z0-9._-]{1,100}$/u.test(bucket)
    ||!name||name.length>700||name.startsWith('/')||name.includes('\\')
    ||name.split('/').some(segment=>!segment||segment==='.'||segment==='..')
    ||/[\u0000-\u001f\u007f]/u.test(name))
    throw Error('STORAGE_BACKUP_OBJECT_PATH_INVALID');
  if(!Number.isSafeInteger(size)||size<0)throw Error('STORAGE_BACKUP_OBJECT_SIZE_INVALID');
  return Object.freeze({bucketId:bucket,objectName:name,sizeBytes:size});
}
function objectKey(x){return JSON.stringify([x.bucketId,x.objectName]);}

export function planPrivateStorageBackup({
  objects,clients,verifiedClientLinks=[],
  expectedCount=null,expectedBytes=null,
}={}){
  if(!Array.isArray(objects)||!Array.isArray(clients)||!Array.isArray(verifiedClientLinks))
    throw Error('STORAGE_BACKUP_INVENTORY_INVALID');
  const canonicalClients=new Map();
  for(const client of clients){
    const clientId=String(client?.id||'').trim().toLowerCase();
    if(!UUID.test(clientId)||canonicalClients.has(clientId))
      throw Error('STORAGE_BACKUP_CLIENT_ID_INVALID_OR_DUPLICATED');
    const folderName=clientBackupFolderName({clientId,fullName:client.name});
    canonicalClients.set(clientId,Object.freeze({clientId,folderName}));
  }
  const unique=new Map();
  for(const item of objects){
    const value=canonicalObject(item),key=objectKey(value);
    if(unique.has(key))throw Error('STORAGE_BACKUP_DUPLICATE_OBJECT');
    unique.set(key,value);
  }
  const links=new Map();
  for(const p of verifiedClientLinks){
    if(p?.verification!=='DATABASE_FOREIGN_KEY_VERIFIED')
      throw Error('STORAGE_BACKUP_CLIENT_RELATION_UNVERIFIED');
    const clientId=String(p?.clientId||'').toLowerCase();
    if(!canonicalClients.has(clientId))throw Error('STORAGE_BACKUP_CLIENT_NOT_IN_CANONICAL_REGISTER');
    const key=objectKey(canonicalObject({
      bucketId:p.bucketId,objectName:p.objectName,sizeBytes:p.sizeBytes,
    }));
    if(!unique.has(key))throw Error('STORAGE_BACKUP_LINK_WITHOUT_SOURCE_OBJECT');
    if(SHARED_BUCKETS.has(p.bucketId))throw Error('STORAGE_BACKUP_SHARED_MEDIA_CANNOT_BE_PERSONAL');
    if(links.has(key))throw Error('STORAGE_BACKUP_AMBIGUOUS_CLIENT_LINK');
    links.set(key,clientId);
  }
  const items=[];
  let bytes=0,personal=0,unattributed=0,shared=0;
  for(const [key,item] of unique){
    bytes+=item.sizeBytes;
    if(!Number.isSafeInteger(bytes))throw Error('STORAGE_BACKUP_TOTAL_BYTES_OVERFLOW');
    const clientId=links.get(key);
    if(SHARED_BUCKETS.has(item.bucketId)){shared++;items.push({...item,scope:'GENERAL_SHARED'});continue;}
    if(!clientId){unattributed++;items.push({...item,scope:'GENERAL_UNATTRIBUTED'});continue;}
    personal++;items.push({...item,scope:'ONE_CLIENT',clientId,folderName:canonicalClients.get(clientId).folderName});
  }
  if(expectedCount!==null&&expectedCount!==items.length)
    throw Error('STORAGE_BACKUP_INVENTORY_COUNT_MISMATCH');
  if(expectedBytes!==null&&expectedBytes!==bytes)
    throw Error('STORAGE_BACKUP_INVENTORY_BYTES_MISMATCH');
  return Object.freeze({
    schema:'iberfit.storage-recovery-plan.v1',objects:items,
    totalCount:items.length,totalBytes:bytes,personal,unattributed,shared,
    downloadedAndEncrypted:false,storageRestoreVerified:false,
  });
}
