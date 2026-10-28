// SIGNATURE U44/U45 · lightweight first visit without weakening Auth.
// A visitor's marketing attribution is not an Auth callback or deep link.
// Persisted sessions, recovery, OAuth and unknown destinations keep the
// original full, authorized hydration. This helper never grants access.
const NON_AUTH_ATTRIBUTION_KEYS=new Set([
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
  'utm_id','utm_source_platform','utm_creative_format',
  'gclid','gbraid','wbraid','fbclid','msclkid','ttclid','igshid',
]);
function isAttributionOnlyQuery(search){
  let params;
  try{params=new URLSearchParams(search);}catch{return false;}
  if(![...params.keys()].length)return true;
  let hasPrelaunch=false;
  for(const [key,entry] of params){
    if(key==='prelaunch'){
      if(hasPrelaunch||!/^[0-9]{1,20}$/u.test(entry))return false;
      hasPrelaunch=true;
      continue;
    }
    if(!NON_AUTH_ATTRIBUTION_KEYS.has(key.toLowerCase()))return false;
  }
  return true;
}
export function shouldLoadFullApplicationImmediately({session,locationLike}={}){
  if(session!==null&&session!==undefined)return true;
  const pathname=String(locationLike?.pathname||'/');
  const search=String(locationLike?.search||'');
  const hash=String(locationLike?.hash||'');
  // Any hash can contain OAuth/recovery fragments: always use full bootstrap.
  if(hash)return true;
  // Existing deep-link routing must never be intercepted by the minimal login.
  if(pathname!=='/'&&pathname!=='/index.html')return true;
  if(!search)return false;
  // Default to the complete app for any unrecognized query, especially Auth
  // code, token_hash, type, state, redirect_to, error and future parameters.
  return !isAttributionOnlyQuery(search);
}
