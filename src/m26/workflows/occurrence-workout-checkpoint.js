// SIGNATURE U51 · encrypted, owner-bound CAS checkpoint for unfinished dated workouts.
// Separate AES-GCM AAD/key domain from U42 command journal. No localStorage,
// no public RPC, no tokens and no fallback to plaintext/device-only memory.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const VERSION=1, MAX_BYTES=524288;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const fail=(reason)=>{throw new Error('U51_'+reason);};
const uid=v=>{
  if(typeof v!=='string'||!UUID.test(v))fail('IDENTITY_INVALID');
  return v.toLowerCase();
};
const encode64=bytes=>{
  const array=new Uint8Array(bytes);let s='';
  for(let i=0;i<array.length;i+=8192)
    s+=String.fromCharCode(...array.subarray(i,i+8192));
  return btoa(s);
};
const decode64=s=>{
  if(typeof s!=='string'||s.length>MAX_BYTES*2||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(s))fail('CIPHERTEXT_INVALID');
  try{
    const raw=atob(s),bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return bytes;
  }catch{fail('CIPHERTEXT_INVALID');}
};
export function createEncryptedOccurrenceWorkoutCheckpoint({
  ownerId,store,keyProvider,cryptoImpl=globalThis.crypto,
}={}){
  const owner=uid(ownerId);
  if(store?.capability!=='persistent-owner-isolated-atomic'
    ||!['get','putIfAbsent','replaceIfEqual','deleteIfEqual']
      .every(k=>typeof store[k]==='function')
    ||typeof keyProvider!=='function'||!cryptoImpl?.subtle?.digest||
    !cryptoImpl?.subtle?.encrypt||!cryptoImpl?.subtle?.decrypt||
    !cryptoImpl?.getRandomValues)fail('DEPENDENCIES_REQUIRED');
  const scopeKey=({clientId,occurrenceId}={})=>
    owner+'|'+uid(clientId)+'|'+uid(occurrenceId);
  const location=async(scope)=>{
    const digest=await cryptoImpl.subtle.digest('SHA-256',
      encoder.encode('U51|private-workout-checkpoint|'+scope));
    return 'm26:occurrence:v1:'+Array.from(new Uint8Array(digest),
      n=>n.toString(16).padStart(2,'0')).join('');
  };
  const key=async()=>{
    const k=await keyProvider();
    if(k?.algorithm?.name!=='AES-GCM'||k?.algorithm?.length!==256||
      k.extractable!==false||!k.usages?.includes?.('encrypt')||
      !k.usages?.includes?.('decrypt'))fail('KEY_UNAVAILABLE');
    return k;
  };
  async function readCheckpoint(target){
    const scope=scopeKey(target);
    const etag=await store.get(await location(scope));
    if(etag==null)return null;
    if(typeof etag!=='string'||etag.length>MAX_BYTES*2)
      fail('CIPHERTEXT_INVALID');
    let wrapper;
    try{wrapper=JSON.parse(etag);}catch{fail('CIPHERTEXT_INVALID');}
    if(wrapper?.v!==VERSION)fail('CIPHERTEXT_INVALID');
    const iv=decode64(wrapper.iv),cipher=decode64(wrapper.data);
    if(iv.length!==12||cipher.length<16)fail('CIPHERTEXT_INVALID');
    let data;
    try{data=await cryptoImpl.subtle.decrypt({
      name:'AES-GCM',iv,additionalData:encoder.encode('U51|'+scope),
    },await key(),cipher);}catch{fail('AUTHENTICATION_TAG_INVALID');}
    if(data.byteLength>MAX_BYTES)fail('PLAINTEXT_TOO_LARGE');
    let payload;
    try{payload=JSON.parse(decoder.decode(data));}
    catch{fail('PLAINTEXT_INVALID');}
    if(payload?.v!==VERSION||payload.scope!==scope||
      payload.snapshot?.kind!=='iberfit.occurrence-workout-draft.v1'||
      uid(payload.snapshot.clientId)!==uid(target.clientId)||
      uid(payload.snapshot.occurrenceId)!==uid(target.occurrenceId))
      fail('CHECKPOINT_SCOPE_MISMATCH');
    return Object.freeze({snapshot:structuredClone(payload.snapshot),etag});
  }
  async function writeCheckpoint(target,snapshot,expectedEtag=null){
    const scope=scopeKey(target);
    if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||
      snapshot.kind!=='iberfit.occurrence-workout-draft.v1'||
      uid(snapshot.clientId)!==uid(target.clientId)||
      uid(snapshot.occurrenceId)!==uid(target.occurrenceId))
      fail('CHECKPOINT_SCOPE_MISMATCH');
    const plain=encoder.encode(JSON.stringify({v:VERSION,scope,snapshot}));
    if(plain.byteLength>MAX_BYTES)fail('PLAINTEXT_TOO_LARGE');
    const iv=cryptoImpl.getRandomValues(new Uint8Array(12));
    const encrypted=await cryptoImpl.subtle.encrypt({
      name:'AES-GCM',iv,additionalData:encoder.encode('U51|'+scope),
    },await key(),plain);
    const ciphertext=JSON.stringify({v:VERSION,iv:encode64(iv),data:encode64(encrypted)});
    const name=await location(scope);
    const won=expectedEtag==null
      ?await store.putIfAbsent(name,ciphertext)
      :await store.replaceIfEqual(name,expectedEtag,ciphertext);
    if(won!==true)fail('CHECKPOINT_CAS_CONFLICT');
    const confirmed=await readCheckpoint(target);
    if(confirmed?.etag!==ciphertext||
      JSON.stringify(confirmed.snapshot)!==JSON.stringify(snapshot))
      fail('PERSISTENCE_UNVERIFIED');
    return ciphertext;
  }
  async function clearCheckpoint(target,expectedEtag){
    const scope=scopeKey(target);
    if(typeof expectedEtag!=='string'||!expectedEtag)
      fail('CHECKPOINT_ETAG_REQUIRED');
    if(await store.deleteIfEqual(await location(scope),expectedEtag)!==true)
      fail('CHECKPOINT_CAS_CONFLICT');
    if(await readCheckpoint(target)!==null)fail('DELETION_UNVERIFIED');
  }
  return Object.freeze({
    capability:'encrypted-owner-bound-cas',
    readCheckpoint,writeCheckpoint,clearCheckpoint,
  });
}
