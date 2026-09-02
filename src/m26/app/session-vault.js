const KEY='iberfit:m26:session:v1';
const SAFE_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_TOKEN_CHARS=16_384;
const MAX_EMAIL_CHARS=254;
function safeStorage(storage){
  try{const test='__m26_test__';storage?.setItem(test,'1');storage?.removeItem(test);return storage||null;}catch{return null;}
}
function globalStorage(name){try{return safeStorage(globalThis[name]);}catch{return null;}}
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
function writeStored(storage,value){
  if(!storage)return false;
  try{storage.setItem(KEY,JSON.stringify(value));return true;}catch{return false;}
}
function clearStored(storage){try{storage?.removeItem(KEY);}catch{}}
export function createSessionVault(options={}){
  const hasExplicitStorage=Object.prototype.hasOwnProperty.call(options,'storage');
  const local=hasExplicitStorage?safeStorage(options.storage):globalStorage('localStorage');
  const session=hasExplicitStorage?null:globalStorage('sessionStorage');
  const storage=local||session;
  const legacyStorage=local&&session&&local!==session?session:null;
  let memory=null;
  return Object.freeze({
    load(){
      if(memory)return structuredClone(memory);
      memory=readStored(storage);
      if(!memory&&legacyStorage){
        const legacy=readStored(legacyStorage);
        if(legacy){
          memory=legacy;
          if(writeStored(storage,legacy))clearStored(legacyStorage);
        }
      }
      return memory?structuredClone(memory):null;
    },
    save(sessionValue){
      memory=sanitize(sessionValue);
      if(!memory)throw new Error('M26_SESSION_INVALID');
      writeStored(storage,memory);
      if(legacyStorage)clearStored(legacyStorage);
      return structuredClone(memory);
    },
    clear(){memory=null;clearStored(storage);if(legacyStorage)clearStored(legacyStorage);},
  });
}
export function sessionExpiresSoon(session,{nowSeconds=Math.floor(Date.now()/1000),marginSeconds=90}={}){const expires=Number(session?.expiresAt||0),margin=Math.max(0,Math.min(Number(marginSeconds)||0,3600));return Boolean(expires&&expires<=Number(nowSeconds)+margin);}
