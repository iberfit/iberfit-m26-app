// IBERFIT UNIVERSAL 360 · U60 owner-unlocked, recoverable local encryption.
// The user supplies a separate recovery phrase on a real gesture. It is not
// an auth password, never persisted, logged, or derived from an access token.
// A stable domain-separated salt permits reopening ciphertext after refresh;
// PBKDF2 yields only a non-extractable browser CryptoKey.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const REF=/^[a-z0-9]{20}$/u;
const encoder=new TextEncoder();
const fail=reason=>{throw new Error('U60_OWNER_KEY_'+reason);};
export function createOccurrenceOwnerKeyVault({
  ownerId,projectRef,cryptoImpl=globalThis.crypto,
}={}){
  const owner=String(ownerId||'').toLowerCase();
  const project=String(projectRef||'').toLowerCase();
  if(!UUID.test(owner)||!REF.test(project)||
    !cryptoImpl?.subtle?.digest||!cryptoImpl?.subtle?.deriveKey||
    !cryptoImpl?.subtle?.importKey)fail('DEPENDENCIES_REQUIRED');
  let key=null,disposed=false,generation=0;
  const isUnlocked=()=>Boolean(key)&&!disposed;
  async function unlock(phrase){
    if(disposed)fail('DESTROYED');
    if(typeof phrase!=='string'||phrase.length<16||phrase.length>256)
      fail('RECOVERY_PHRASE_REQUIRED');
    const lease=++generation;
    key=null;
    // This derived key is intentionally NOT saved in IndexedDB/localStorage:
    // after an authenticated reload, only the same phrase can unlock records.
    const salt=new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',
      encoder.encode('IBERFIT|U60|owner-recovery|v1|'+project+'|'+owner)));
    const material=await cryptoImpl.subtle.importKey(
      'raw',encoder.encode(phrase),'PBKDF2',false,['deriveKey']);
    const derived=await cryptoImpl.subtle.deriveKey({
      name:'PBKDF2',salt,iterations:420000,hash:'SHA-256',
    },material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    if(disposed||lease!==generation)fail('UNLOCK_SUPERSEDED');
    if(derived?.extractable!==false||
      derived?.algorithm?.name!=='AES-GCM'||
      derived?.algorithm?.length!==256)fail('CRYPTO_KEY_INVALID');
    key=derived;
    return true;
  }
  async function getKey(){
    if(!isUnlocked())fail('LOCKED');
    return key;
  }
  const lock=()=>{generation++;key=null;};
  const destroy=()=>{lock();disposed=true;};
  return Object.freeze({unlock,getKey,isUnlocked,lock,destroy});
}
