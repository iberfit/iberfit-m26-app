// SIGNATURE U44 · explicit preauth policy. Do not change privileged role or
// token authorization; this only avoids unauthenticated module waterfalls.
export function shouldLoadFullApplicationImmediately({session,locationLike}={}){
  if(session!==null&&session!==undefined)return true;
  const pathname=String(locationLike?.pathname||'/');
  const search=String(locationLike?.search||'');
  const hash=String(locationLike?.hash||'');
  if(hash)return true;
  if(pathname!=='/'&&pathname!=='/index.html')return true;
  if(!search)return false;
  // Canary's cache-busting smoke query is not an Auth callback.
  return !/^\?prelaunch=\d{1,20}$/u.test(search);
}
