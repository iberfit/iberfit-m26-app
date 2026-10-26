// SIGNATURE U45 · IndexedDB atomic ciphertext journal storage.
// Store contains ONLY authenticated encrypted records, never JWTs, CryptoKeys,
// private plaintext, or anything that can identify a Client from its key.
// Encryption/unlock happens separately in occurrence-encrypted-journal.js.
// Deliberately opt-in, not auto-mounted to the current session UI.
const DATABASE='iberfit-occurrence-private-v1';
const OBJECT_STORE='ciphertext';
const KEY=/^m26:occurrence:v1:[a-f0-9]{64}$/u;
const MAX_CIPHERTEXT_BYTES=1048576;
const fail=(reason)=>new Error('U45_'+reason);
const validateKey=(key)=>{
  if(typeof key!=='string'||!KEY.test(key))throw fail('STORAGE_KEY_INVALID');
  return key;
};
const validateCipher=(v)=>{
  if(typeof v!=='string'||v.length<30||v.length>MAX_CIPHERTEXT_BYTES)
    throw fail('STORAGE_VALUE_INVALID');
  return v;
};
/**
 * IDB readwrite transactions serialize the read + add/delete decision even
 * if two independent tabs have separate connections to this database.
 * Browsers may evict site storage: an unavailable/lost journal must never
 * trigger fallback execution or a fresh operationId after unknown outcomes.
 * A caller must separately provide a recoverable, owner-unlocked AES key.
 */
export function createAtomicOccurrenceIndexedDbStore({
  indexedDBImpl=globalThis.indexedDB,
  databaseName=DATABASE,
}={}){
  if(!indexedDBImpl||typeof indexedDBImpl.open!=='function')
    throw fail('INDEXEDDB_UNAVAILABLE');
  if(typeof databaseName!=='string'||!/^iberfit-occurrence-private-v1(?:-qa-[a-z0-9-]{1,40})?$/u.test(databaseName))
    throw fail('DATABASE_NAME_INVALID');
  let connection=null;
  let opening=null;
  async function database(){
    if(connection)return connection;
    if(opening)return opening;
    opening=new Promise((resolve,reject)=>{
      let request;
      try{request=indexedDBImpl.open(databaseName,1);}
      catch(e){reject(fail('OPEN_FAILED'));return;}
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(OBJECT_STORE))
          db.createObjectStore(OBJECT_STORE);
      };
      // A blocked request can subsequently succeed after the caller has
      // already received an error. Never retain that abandoned connection.
      let abandoned=false;
      request.onblocked=()=>{abandoned=true;reject(fail('OPEN_BLOCKED'));};
      request.onerror=()=>{abandoned=true;reject(fail('OPEN_FAILED'));};
      request.onsuccess=()=>{
        const db=request.result;
        if(abandoned){db.close();return;}
        const invalidate=()=>{
          if(connection===db){connection=null;opening=null;}
        };
        db.onversionchange=()=>{
          db.close();
          invalidate();
        };
        // Unexpected browser/OS database closures also require a fresh open.
        db.onclose=invalidate;
        connection=db;
        resolve(db);
      };
    }).catch(e=>{opening=null;throw e;});
    return opening;
  }
  async function transact(mode,onStore){
    const db=await database();
    return new Promise((resolve,reject)=>{
      let tx,result;
      try{
        tx=db.transaction(OBJECT_STORE,mode);
      }catch{
        reject(fail('TRANSACTION_UNAVAILABLE'));return;
      }
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(fail('TRANSACTION_ABORTED'));
      tx.onerror=()=>reject(fail('TRANSACTION_FAILED'));
      try{
        onStore(tx.objectStore(OBJECT_STORE),value=>{result=value;});
      }catch{
        try{tx.abort();}catch{}
        reject(fail('TRANSACTION_INVALID'));
      }
    });
  }
  const get=key=>{
    const name=validateKey(key);
    return transact('readonly',(store,setResult)=>{
      const request=store.get(name);
      request.onsuccess=()=>setResult(request.result??null);
    });
  };
  const putIfAbsent=(key,value)=>{
    const name=validateKey(key),ciphertext=validateCipher(value);
    return transact('readwrite',(store,setResult)=>{
      const request=store.get(name);
      request.onsuccess=()=>{
        if(request.result!==undefined){
          setResult(false);return;
        }
        // This add is scheduled in the SAME readwrite transaction.
        const add=store.add(ciphertext,name);
        add.onsuccess=()=>setResult(true);
      };
    });
  };
  // U51: atomic compare-and-swap, never a read-then-set across tabs.
  const replaceIfEqual=(key,expected,next)=>{
    const name=validateKey(key),old=validateCipher(expected),cipher=validateCipher(next);
    return transact('readwrite',(store,setResult)=>{
      const request=store.get(name);
      request.onsuccess=()=>{
        if(request.result!==old){setResult(false);return;}
        const put=store.put(cipher,name);
        put.onsuccess=()=>setResult(true);
      };
    });
  };
  const deleteIfEqual=(key,expected)=>{
    const name=validateKey(key),ciphertext=validateCipher(expected);
    return transact('readwrite',(store,setResult)=>{
      const request=store.get(name);
      request.onsuccess=()=>{
        if(request.result!==ciphertext){
          setResult(false);return;
        }
        const del=store.delete(name);
        del.onsuccess=()=>setResult(true);
      };
    });
  };
  const close=()=>{
    if(connection)connection.close();
    connection=null;opening=null;
  };
  return Object.freeze({
    capability:'persistent-owner-isolated-atomic',
    get,putIfAbsent,replaceIfEqual,deleteIfEqual,close,
  });
}
