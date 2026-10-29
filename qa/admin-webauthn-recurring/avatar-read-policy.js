// QA-only fail-closed request classifier for existing M42 private profile avatars.
// Does not authorize requests; it decides whether a legitimate authenticated GET
// is permitted through the Playwright network interceptor to real QA RLS.
const PATH=/^\/storage\/v1\/object\/authenticated\/iberfit-profile-avatars\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/avatar\.webp$/u;
export function isAuthorizedQaAvatarRead(request,{origin}={}){
  if(!request||typeof request.url!=='function'||typeof request.method!=='function'||typeof request.headers!=='function')return false;
  let url;try{url=new URL(request.url());}catch{return false;}
  if(url.origin!==origin||request.method().toUpperCase()!=='GET'||!PATH.test(url.pathname))return false;
  if([...url.searchParams.keys()].some(key=>key!=='cacheNonce'))return false;
  const headers=request.headers()||{};
  const bearer=String(headers.authorization||headers.Authorization||'');
  const apiKey=String(headers.apikey||headers.apiKey||'');
  return /^Bearer [A-Za-z0-9._~-]{24,}$/u.test(bearer)&&apiKey.length>=16;
}
