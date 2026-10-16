import crypto from 'node:crypto';
import {readFile,writeFile,stat} from 'node:fs/promises';

export const RECOVERY_SCHEMA='iberfit.free-recovery.db-envelope.v1';
export const MAX_ARCHIVE_BYTES=24*1024*1024;
const PROD='pjhmrhejsoofmouedavw';

export function assertProdConnection(urlString){
  let parsed;
  try{parsed=new URL(urlString);}catch{throw Error('RECOVERY_DATABASE_URL_INVALID');}
  if(!['postgres:','postgresql:'].includes(parsed.protocol)
    ||parsed.username!=='postgres.'+PROD
    ||!parsed.password
    ||!parsed.hostname.endsWith('.pooler.supabase.com')
    ||parsed.port!=='5432'
    ||parsed.pathname!=='/postgres'
    ||!['require','verify-ca','verify-full'].includes(parsed.searchParams.get('sslmode')))
    throw Error('RECOVERY_PRODUCTION_SESSION_POOLER_REQUIRED');
  return {projectRef:PROD,encryptedTransport:true};
}
export function assertArchiveList(toc){
  const lines=String(toc||'').split(/\r?\n/u);
  for(const [schema,table] of [['public','clients'],['auth','users'],['storage','objects']]){
    if(!lines.some(line=>new RegExp('TABLE DATA\\s+'+schema+'\\s+'+table+'\\s','u').test(line)))
      throw Error('RECOVERY_CRITICAL_TABLE_MISSING:'+schema+'.'+table);
  }
  return true;
}
function rsaPub(pem){
  let key;
  try{key=crypto.createPublicKey(pem);}catch{throw Error('RECOVERY_PUBLIC_KEY_INVALID');}
  if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength||0)<3072)
    throw Error('RECOVERY_RSA_KEY_TOO_WEAK');
  return key;
}
export async function encryptBackup({sourcePath,encryptedPath,manifestPath,publicKey,sourceSha}){
  if(!/^[a-f0-9]{40}$/u.test(sourceSha||''))throw Error('RECOVERY_SOURCE_SHA_INVALID');
  const pub=rsaPub(publicKey);
  const size=(await stat(sourcePath)).size;
  if(size<128||size>MAX_ARCHIVE_BYTES)throw Error('RECOVERY_FREE_QUOTA_OR_EMPTY_ARCHIVE');
  const plaintext=await readFile(sourcePath);
  const key=crypto.randomBytes(32),iv=crypto.randomBytes(12);
  try{
    const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
    const encrypted=Buffer.concat([cipher.update(plaintext),cipher.final()]);
    const wrapped=crypto.publicEncrypt({key:pub,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},key);
    const metadata={
      schema:RECOVERY_SCHEMA,projectRef:PROD,createdAt:new Date().toISOString(),sourceSha,
      encryption:'AES-256-GCM+RSA-OAEP-SHA256',iv:iv.toString('base64'),
      wrappedKey:wrapped.toString('base64'),tag:cipher.getAuthTag().toString('base64'),
      ciphertextSha256:crypto.createHash('sha256').update(encrypted).digest('hex'),
      ciphertextBytes:encrypted.length,
      databaseArchiveValidated:true,fullRestoreVerified:false,storageObjectBytesIncluded:false,
      productionMigrationApproved:false,
    };
    await writeFile(encryptedPath,encrypted,{flag:'wx',mode:0o600});
    await writeFile(manifestPath,JSON.stringify(metadata,null,2)+'\n',{flag:'wx',mode:0o600});
    return metadata;
  }finally{key.fill(0);plaintext.fill(0);}
}
export async function decryptBackup({encryptedPath,manifest,privateKey}){
  if(manifest?.schema!==RECOVERY_SCHEMA||manifest?.projectRef!==PROD)
    throw Error('RECOVERY_MANIFEST_SCOPE_INVALID');
  const bytes=await readFile(encryptedPath);
  const digest=crypto.createHash('sha256').update(bytes).digest('hex');
  if(digest!==manifest.ciphertextSha256||bytes.length!==manifest.ciphertextBytes)
    throw Error('RECOVERY_ENCRYPTED_ARCHIVE_TAMPERED');
  const key=crypto.privateDecrypt({key:privateKey,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(manifest.wrappedKey,'base64'));
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(manifest.iv,'base64'));
    decipher.setAuthTag(Buffer.from(manifest.tag,'base64'));
    return Buffer.concat([decipher.update(bytes),decipher.final()]);
  }finally{key.fill(0);}
}