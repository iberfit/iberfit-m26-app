// The Coach QA fixture is allowed to fetch private profile avatars only from
// its own authenticated Supabase QA tenant. Storage enforces the caller's RLS;
// this route whitelist is deliberately narrower than any generic Storage GET.
const AVATAR_PATH=/^\/storage\/v1\/object\/authenticated\/iberfit-profile-avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar\.webp$/i;

export function isAuthorizedQaAvatarRead(request,{qaOrigin}={}){
  if(!request||!qaOrigin)return false;
  let url;
  try{url=new URL(request.url());}catch{return false;}
  if(url.origin!==qaOrigin||request.method().toUpperCase()!=='GET'||!AVATAR_PATH.test(url.pathname))return false;
  const headers=request.headers?.()||{};
  const bearer=String(headers.authorization||headers.Authorization||'');
  const key=String(headers.apikey||headers.apiKey||'');
  if(!/^Bearer [A-Za-z0-9_.-]{100,}$/u.test(bearer)||!key.startsWith('sb_publishable_'))return false;
  if([...url.searchParams.keys()].some(k=>k!=='cacheNonce'))return false;
  const nonce=url.searchParams.get('cacheNonce');
  return nonce===null||(/^[0-9]{10,17}-[0-9]{1,8}$/u.test(nonce)&&url.searchParams.getAll('cacheNonce').length===1);
}

export function isExpectedMissingQaAvatarResponse(request,status,body,{qaOrigin}={}){
  return status===400&&isAuthorizedQaAvatarRead(request,{qaOrigin})&&
    body!==null&&typeof body==='object'&&
    body.code==='NoSuchKey';
}

export function isNativeMissingResourceConsoleMessage(message){
  return /^Failed to load resource: the server responded with a status of 400 \(\)$/u.test(String(message||''));
}
