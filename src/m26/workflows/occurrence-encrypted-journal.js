// SIGNATURE U42 · encrypt-before-persist, identity-bound occurrence recovery.
// No raw command, token or password is written to web storage by this module.
// The caller must supply an actual durable owner-isolated store and a
// non-extractable AES-GCM key available AFTER an authenticated unlock.
// Never generate an ephemeral key as a persistence fallback.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_PLAINTEXT_BYTES=524288;
const VERSION=1;
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
function fail(reason){throw new Error('U42_'+reason);}
const uuid=value=>{
  const id=String(value||'').toLowerCase();
  if(!UUID.test(id))fail('IDENTITY_INVALID');
  return id;
};
function scopeParts(value,ownerId){
  const input=String(value||'');
  const p=input.split('|');
  if(p.length!==3)fail('SCOPE_INVALID');
  const [actor,clientId,occurrenceId]=p.map(uuid);
  if(actor!==ownerId)fail('ACTOR_SCOPE_FORBIDDEN');
  if(input!==[actor,clientId,occurrenceId].join('|'))fail('SCOPE_NONCANONICAL');
  return {scope:input,clientId,occurrenceId};
}
const toB64=bytes=>{
  const array=new Uint8Array(bytes);
  let binary='';
  for(let i=0;i<array.length;i+=8192)
    binary+=String.fromCharCode(...array.subarray(i,i+8192));
  return btoa(binary);
};
function fromB64(raw){
  if(typeof raw!=='string'||raw.length>MAX_PLAINTEXT_BYTES*2
    ||!/^[A-Za-z0-9+/]*={0,2}$/u.test(raw))fail('CIPHERTEXT_INVALID');
  try{
    const binary=atob(raw),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return bytes;
  }catch{fail('CIPHERTEXT_INVALID');}
}
const secretKey=async(keyProvider)=>{
  const key=await keyProvider();
  if(key?.algorithm?.name!=='AES-GCM'||key?.algorithm?.length!==256
    ||key?.extractable!==false||!key.usages?.includes?.('encrypt')
    ||!key.usages?.includes?.('decrypt'))fail('KEY_UNAVAILABLE');
  return key;
};
/**
 * store: {capability:'persistent-owner-isolated-atomic',get(key),
 *         putIfAbsent(key,value),deleteIfEqual(key,expectedValue)}.
 * Both write primitives MUST be linearizable across tabs/processes, not
 * implemented as read-then-write promises. Key management belongs to the session's
 * private encrypted vault, NOT plaintext localStorage/sessionStorage.
 * This adapter is intentionally not auto-mounted to the current UI.
 */
export function createEncryptedOccurrenceJournal({
  ownerId,store,keyProvider,cryptoImpl=globalThis.crypto,
}={}){
  const owner=uuid(ownerId);
  if(store?.capability!=='persistent-owner-isolated-atomic'
    ||typeof store.get!=='function'||typeof store.putIfAbsent!=='function'
    ||typeof store.deleteIfEqual!=='function'||typeof keyProvider!=='function'
    ||!cryptoImpl?.subtle?.digest||!cryptoImpl?.subtle?.encrypt
    ||!cryptoImpl?.subtle?.decrypt||!cryptoImpl?.getRandomValues)
    fail('DEPENDENCIES_REQUIRED');
  const storageKey=async(scope)=>'m26:occurrence:v1:'+
    Array.from(new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',encoder.encode(scope))),
      b=>b.toString(16).padStart(2,'0')).join('');
  const readRecord=async(value)=>{
    const {scope,clientId,occurrenceId}=scopeParts(value,owner);
    const key=await storageKey(scope);
    const stored=await store.get(key);
    if(stored===null||stored===undefined)return null;
    if(typeof stored!=='string'||stored.length>MAX_PLAINTEXT_BYTES*2)
      fail('CIPHERTEXT_INVALID');
    let obj;
    try{obj=JSON.parse(stored);}catch{fail('CIPHERTEXT_INVALID');}
    if(obj?.version!==VERSION||typeof obj.iv!=='string'
      ||typeof obj.ciphertext!=='string')fail('CIPHERTEXT_INVALID');
    const iv=fromB64(obj.iv),ciphertext=fromB64(obj.ciphertext);
    if(iv.byteLength!==12||ciphertext.byteLength<16)fail('CIPHERTEXT_INVALID');
    const cryptoKey=await secretKey(keyProvider);
    let payload;
    try{
      payload=await cryptoImpl.subtle.decrypt({
        name:'AES-GCM',iv,additionalData:encoder.encode(scope),
      },cryptoKey,ciphertext);
    }catch{fail('AUTHENTICATION_TAG_INVALID');}
    if(payload.byteLength>MAX_PLAINTEXT_BYTES)fail('PLAINTEXT_TOO_LARGE');
    let record;
    try{record=JSON.parse(decoder.decode(payload));}
    catch{fail('PLAINTEXT_INVALID');}
    if(record?.version!==VERSION||record.scope!==scope||
      !record.command||record.command.clientId!==clientId||
      record.command.entityId!==occurrenceId)
      fail('RECORD_SCOPE_MISMATCH');
    return {command:structuredClone(record.command),ciphertext:stored};
  };
  const readPending=async(value)=>(await readRecord(value))?.command??null;
  const writePending=async(value,command)=>{
    const {scope,clientId,occurrenceId}=scopeParts(value,owner);
    if(!command||typeof command!=='object'||Array.isArray(command)
      ||command.clientId!==clientId||command.entityId!==occurrenceId
      ||!UUID.test(String(command.operationId||'')))
      fail('COMMAND_SCOPE_MISMATCH');
    const plain=encoder.encode(JSON.stringify({
      version:VERSION,scope,command,
    }));
    if(plain.byteLength>MAX_PLAINTEXT_BYTES)fail('PLAINTEXT_TOO_LARGE');
    const key=await secretKey(keyProvider);
    const iv=cryptoImpl.getRandomValues(new Uint8Array(12));
    const encrypted=await cryptoImpl.subtle.encrypt({
      name:'AES-GCM',iv,additionalData:encoder.encode(scope),
    },key,plain);
    const storageName=await storageKey(scope);
    // Cross-tab and cross-worker single-writer claim. Never perform
    // get+set as two asynchronous operations: two tabs could both send.
    const ciphertext=JSON.stringify({
      version:VERSION,iv:toB64(iv),ciphertext:toB64(encrypted),
    });
    if(await store.putIfAbsent(storageName,ciphertext)!==true)
      fail('PENDING_EXISTS');
    const persisted=await readPending(scope);
    if(JSON.stringify(persisted)!==JSON.stringify(command))
      fail('PERSISTENCE_UNVERIFIED');
  };
  const clearPending=async(value,operationId)=>{
    const {scope}=scopeParts(value,owner);
    const entry=await readRecord(scope);
    if(!entry)return;
    if(uuid(operationId)!==String(entry.command.operationId).toLowerCase())
      fail('OPERATION_MISMATCH');
    // Never delete an altered journal committed by another tab after read.
    if(await store.deleteIfEqual(await storageKey(scope),entry.ciphertext)!==true)
      fail('DELETION_CONFLICT');
    if(await readPending(scope)!==null)fail('DELETION_UNVERIFIED');
  };
  return Object.freeze({
    capability:'encrypted-owner-bound',
    readPending,writePending,clearPending,
  });
}
