const KEY='iberfit:m26:session:v1';
const SAFE_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_TOKEN_CHARS=16_384;
const MAX_EMAIL_CHARS=254;

function safeStorage(storage){
  try{
    if(!storage)return null;
    const test='__m26_session_vault_test__';
    storage.setItem(test,'1');
    storage.removeItem(test);
    return storage;
  }catch{return null;}
}

function globalStorage(name){
  try{return safeStorage(globalThis?.[name]);}
  catch{return null;}
}

function sanitize(session){
  const token=String(session?.token||''),refreshToken=session?.refreshToken==null?'':String(session.refreshToken),userId=String(session?.user?.id||''),email=String(session?.user?.email||''),expiresAt=session?.expiresAt==null?null:Number(session.expiresAt);
  if(!token||token.length>MAX_TOKEN_CHARS||/[\u0000-\u001f\u007f]/.test(token)||refreshToken.length>MAX_TOKEN_CHARS||/[\u0000-\u001f\u007f]/.test(refreshToken)||!SAFE_ID_PATTERN.test(userId)||email.length<3||email.length>MAX_EMAIL_CHARS||!email.includes('@')||/[\u0000-\u001f\u007f]/.test(email))return null;
  if(expiresAt!==null&&(!Number.isInteger(expiresAt)||expiresAt<0))return null;
  return {token,refreshToken:refreshToken||null,expiresAt,user:{id:userId,email}};
}

function readStored(storage){
  if(!storage)return null;
  try{
    const value=sanitize(JSON.parse(storage.getItem(KEY)||'null'));
    if(!value)storage.removeItem(KEY);
    return value;
  }catch{
    try{storage.removeItem(KEY);}catch{}
    return null;
  }
}

export function createSessionVault({
  storage=globalStorage('localStorage')||globalStorage('sessionStorage'),
  legacyStorage=globalStorage('sessionStorage'),
}={}){
  const primary=safeStorage(storage);
  const legacy=safeStorage(legacyStorage);
  let memory=null;

  function removeLegacy(){
    if(!legacy||legacy===primary)return;
    try{legacy.removeItem(KEY);}catch{}
  }

  return Object.freeze({
    load(){
      if(memory)return structuredClone(memory);
      memory=readStored(primary);
      if(memory)return structuredClone(memory);

      const legacySession=legacy===primary?null:readStored(legacy);
      if(!legacySession)return null;

      memory=legacySession;
      try{
        primary?.setItem(KEY,JSON.stringify(memory));
        removeLegacy();
      }catch{}
      return structuredClone(memory);
    },
    save(session){
      memory=sanitize(session);
      if(!memory)throw new Error('M26_SESSION_INVALID');
      if(primary)primary.setItem(KEY,JSON.stringify(memory));
      removeLegacy();
      return structuredClone(memory);
    },
    clear(){
      memory=null;
      try{primary?.removeItem(KEY);}catch{}
      removeLegacy();
    },
  });
}

export function sessionExpiresSoon(session,{nowSeconds=Math.floor(Date.now()/1000),marginSeconds=90}={}){const expires=Number(session?.expiresAt||0),margin=Math.max(0,Math.min(Number(marginSeconds)||0,3600));return Boolean(expires&&expires<=Number(nowSeconds)+margin);}
