const KEY='iberfit:m26:session:v2';
const LEGACY_KEY='iberfit:m26:session:v1';
const SAFE_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_TOKEN_CHARS=16_384;
const MAX_EMAIL_CHARS=254;

function browserStorage(name){
  try{return globalThis?.[name]||null;}catch{return null;}
}
function safeStorage(storage){
  try{
    if(!storage)return null;
    const test='__m26_session_test__';
    storage.setItem(test,'1');
    storage.removeItem(test);
    return storage;
  }catch{return null;}
}
function sanitize(session){
  const token=String(session?.token||'');
  const refreshToken=session?.refreshToken==null?'':String(session.refreshToken);
  const userId=String(session?.user?.id||'');
  const email=String(session?.user?.email||'').trim().toLowerCase();
  const expiresAt=session?.expiresAt==null?null:Number(session.expiresAt);
  if(
    !token||
    token.length>MAX_TOKEN_CHARS||
    /[\u0000-\u001f\u007f]/u.test(token)||
    refreshToken.length>MAX_TOKEN_CHARS||
    /[\u0000-\u001f\u007f]/u.test(refreshToken)||
    !SAFE_ID_PATTERN.test(userId)||
    email.length<3||
    email.length>MAX_EMAIL_CHARS||
    !email.includes('@')||
    /[\u0000-\u001f\u007f]/u.test(email)
  )return null;
  if(expiresAt!==null&&(!Number.isInteger(expiresAt)||expiresAt<0))return null;
  return {token,refreshToken:refreshToken||null,expiresAt,user:{id:userId,email}};
}
function readSession(storage,key){
  if(!storage)return null;
  try{return sanitize(JSON.parse(storage.getItem(key)||'null'));}
  catch{return null;}
}
function removeSession(storage,key){
  try{storage?.removeItem?.(key);}catch{}
}

export function createSessionVault({
  storage=safeStorage(browserStorage('localStorage')),
  legacyStorage=safeStorage(browserStorage('sessionStorage')),
}={}){
  const durable=safeStorage(storage);
  const legacy=safeStorage(legacyStorage);
  let memory=null;

  function persist(value){
    if(durable)durable.setItem(KEY,JSON.stringify(value));
    removeSession(durable,LEGACY_KEY);
    removeSession(legacy,LEGACY_KEY);
    removeSession(legacy,KEY);
  }

  return Object.freeze({
    load(){
      if(memory)return structuredClone(memory);
      const candidates=[
        [durable,KEY],
        [durable,LEGACY_KEY],
        [legacy,KEY],
        [legacy,LEGACY_KEY],
      ];
      for(const [candidateStorage,key] of candidates){
        const candidate=readSession(candidateStorage,key);
        if(!candidate){
          if(candidateStorage&&candidateStorage.getItem?.(key))removeSession(candidateStorage,key);
          continue;
        }
        memory=candidate;
        persist(memory);
        return structuredClone(memory);
      }
      return null;
    },
    save(session){
      memory=sanitize(session);
      if(!memory)throw new Error('M26_SESSION_INVALID');
      persist(memory);
      return structuredClone(memory);
    },
    clear(){
      memory=null;
      for(const target of [durable,legacy]){
        removeSession(target,KEY);
        removeSession(target,LEGACY_KEY);
      }
    },
  });
}

export function sessionExpiresSoon(session,{nowSeconds=Math.floor(Date.now()/1000),marginSeconds=90}={}){
  const expires=Number(session?.expiresAt||0);
  const margin=Math.max(0,Math.min(Number(marginSeconds)||0,3600));
  return Boolean(expires&&expires<=Number(nowSeconds)+margin);
}

export const __sessionVaultInternals=Object.freeze({
  KEY,
  LEGACY_KEY,
  sanitize,
});
