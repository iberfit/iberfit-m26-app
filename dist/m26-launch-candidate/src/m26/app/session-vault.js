const KEY='iberfit:m26:session:v1';
function safeStorage(storage){
  if(arguments.length===0){try{storage=globalThis.sessionStorage;}catch{return null;}}
  try{const test='__m26_test__';storage?.setItem(test,'1');storage?.removeItem(test);return storage||null;}catch{return null;}
}
function sanitize(session){if(!session?.token||!session?.user?.id)return null;return {token:String(session.token),refreshToken:session.refreshToken?String(session.refreshToken):null,expiresAt:session.expiresAt||null,user:{id:String(session.user.id),email:String(session.user.email||'')}};}
export function createSessionVault({storage=safeStorage()}={}){
  let memory=null;
  return Object.freeze({
    load(){if(memory)return structuredClone(memory);if(!storage)return null;try{memory=sanitize(JSON.parse(storage.getItem(KEY)||'null'));return memory?structuredClone(memory):null;}catch{return null;}},
    save(session){memory=sanitize(session);if(!memory)throw new Error('M26_SESSION_INVALID');if(storage)storage.setItem(KEY,JSON.stringify(memory));return structuredClone(memory);},
    clear(){memory=null;if(storage)storage.removeItem(KEY);},
  });
}
export function sessionExpiresSoon(session,{nowSeconds=Math.floor(Date.now()/1000),marginSeconds=90}={}){const expires=Number(session?.expiresAt||0);return Boolean(expires&&expires<=nowSeconds+marginSeconds);}
