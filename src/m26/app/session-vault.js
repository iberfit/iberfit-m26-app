const KEY='iberfit:m26:session:v1';
const SAFE_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_TOKEN_CHARS=16_384;
const MAX_EMAIL_CHARS=254;
function safeStorage(storage){
  if(arguments.length===0){try{storage=globalThis.sessionStorage;}catch{return null;}}
  try{const test='__m26_test__';storage?.setItem(test,'1');storage?.removeItem(test);return storage||null;}catch{return null;}
}
function sanitize(session){
  const token=String(session?.token||''),refreshToken=session?.refreshToken==null?'':String(session.refreshToken),userId=String(session?.user?.id||''),email=String(session?.user?.email||''),expiresAt=session?.expiresAt==null?null:Number(session.expiresAt);
  if(!token||token.length>MAX_TOKEN_CHARS||/[\u0000-\u001f\u007f]/.test(token)||refreshToken.length>MAX_TOKEN_CHARS||/[\u0000-\u001f\u007f]/.test(refreshToken)||!SAFE_ID_PATTERN.test(userId)||email.length<3||email.length>MAX_EMAIL_CHARS||!email.includes('@')||/[\u0000-\u001f\u007f]/.test(email))return null;
  if(expiresAt!==null&&(!Number.isInteger(expiresAt)||expiresAt<0))return null;
  return {token,refreshToken:refreshToken||null,expiresAt,user:{id:userId,email}};
}
export function createSessionVault({storage=safeStorage()}={}){
  let memory=null;
  return Object.freeze({
    load(){if(memory)return structuredClone(memory);if(!storage)return null;try{memory=sanitize(JSON.parse(storage.getItem(KEY)||'null'));if(!memory)storage.removeItem(KEY);return memory?structuredClone(memory):null;}catch{storage.removeItem(KEY);memory=null;return null;}},
    save(session){memory=sanitize(session);if(!memory)throw new Error('M26_SESSION_INVALID');if(storage)storage.setItem(KEY,JSON.stringify(memory));return structuredClone(memory);},
    clear(){memory=null;if(storage)storage.removeItem(KEY);},
  });
}
export function sessionExpiresSoon(session,{nowSeconds=Math.floor(Date.now()/1000),marginSeconds=90}={}){const expires=Number(session?.expiresAt||0),margin=Math.max(0,Math.min(Number(marginSeconds)||0,3600));return Boolean(expires&&expires<=Number(nowSeconds)+margin);}
