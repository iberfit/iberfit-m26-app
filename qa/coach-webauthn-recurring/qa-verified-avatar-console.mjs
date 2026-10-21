// QA-only: Chromium reports a resource error even for an optional, missing
// private avatar. Permit only a verified NoSuchKey at the identical URL.
// Do not suppress unrelated HTTP errors or duplicate browser-console failures.
const OPTIONAL_ABSENT_AVATAR_ERROR=/^Failed to load resource: the server responded with a status of (?:400|404)\b/iu;
export function unexpectedCoachConsoleErrors(errors=[],verifiedMissing=[]){
  const counts=new Map();
  for(const result of verifiedMissing){
    if(result?.valid!==true||typeof result.url!=='string'||!result.url.startsWith('https://'))
      throw new Error('U26_UNVERIFIED_AVATAR_RESPONSE');
    counts.set(result.url,(counts.get(result.url)||0)+1);
  }
  return errors.filter(({text,url}={})=>{
    if(typeof text!=='string'||typeof url!=='string'||
       !OPTIONAL_ABSENT_AVATAR_ERROR.test(text)||(counts.get(url)||0)<=0)return true;
    counts.set(url,counts.get(url)-1);
    return false;
  });
}
