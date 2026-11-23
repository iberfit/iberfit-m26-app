// P0 Free: remove only the short-lived AUTH session created by an isolated,
// authorized QA browser run. Not a PROD auth control or fixture-data cleanup.
// A successful local-scoped sign-out prevents abandoned QA sessions/refresh
// tokens from accumulating across repeated full-device regression runs.
// No persistent credentials, broad revocation, SQL, or shared-user sign-out.
import {CANARY_ORIGIN,QA_PROJECT_REF,SUPABASE_ORIGIN} from './secure-current-source-auth.mjs';

const SESSION_KEY='iberfit:m26:session:v1';
const QA_FIXTURE_EMAILS=Object.freeze([
  'qa.rc74.coach@iberfit.cl',
  'qa.rc74.client-a@iberfit.cl',
  'qa.rc74.client-b@iberfit.cl',
]);

export function trustedQaCleanupPage(raw){
  try{
    const url=new URL(String(raw||''));
    return url.origin===CANARY_ORIGIN&&url.protocol==='https:'&&
      !url.username&&!url.password;
  }catch{return false;}
}

// This function is serialized by Playwright into the real isolated QA page.
// Do not close over Node state: the configuration is explicitly passed in.
// The optional scope is for offline unit tests, never passed to Playwright.
export async function releaseQaSessionInPage({
  qaOrigin,apiOrigin,projectRef,storageKey,scope=globalThis,
}={}){
  try{
    if(scope.location?.origin!==qaOrigin||
      qaOrigin!=='https://m26-canary.iberfit.cl'||
      apiOrigin!=='https://gjztkdwfmunnzhtvxrsu.supabase.co'||
      projectRef!=='gjztkdwfmunnzhtvxrsu'||
      storageKey!=='iberfit:m26:session:v1')return 'skipped';
    const runtime=scope.__IBERFIT_M26_RUNTIME__;
    if(runtime?.qaOnly!==true||runtime?.projectRef!==projectRef||
      runtime?.url!==apiOrigin||runtime?.enabled!==true)return 'skipped';
    const apiKey=String(runtime.publishableKey||'');
    if(apiKey.length<10||apiKey.length>16384||
      !/^(?:sb_publishable_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_.-]+)$/u.test(apiKey)||
      typeof scope.fetch!=='function')return 'skipped';

    const read=(storage)=>{
      try{
        const text=storage?.getItem?.(storageKey);
        if(!text||text.length>34000)return null;
        const item=JSON.parse(text);
        if(!item||typeof item!=='object'||Array.isArray(item))return null;
        return item;
      }catch{return null;}
    };
    const local=(()=>{try{return scope.localStorage;}catch{return null;}})();
    const session=(()=>{try{return scope.sessionStorage;}catch{return null;}})();
    const candidate=read(local)||read(session);
    const token=String(candidate?.token||'');
    const email=String(candidate?.user?.email||'').trim().toLowerCase();
    if(!['qa.rc74.coach@iberfit.cl',
      'qa.rc74.client-a@iberfit.cl','qa.rc74.client-b@iberfit.cl'].includes(email)||
      token.length<100||token.length>16384||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token))
      return 'no-session';

    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),5000);
    try{
      const response=await scope.fetch(apiOrigin+'/auth/v1/logout?scope=local',{
        method:'POST',
        headers:{apikey:apiKey,Authorization:'Bearer '+token,accept:'application/json'},
        credentials:'omit',redirect:'error',cache:'no-store',signal:ctrl.signal,
      });
      if(!response?.ok)return 'failed';
      // A replacement login while the request is in flight owns its own
      // session. Never clear another account's or a refreshed token's lease.
      for(const storage of [local,session]){
        try{
          if(read(storage)?.token===token)storage.removeItem(storageKey);
        }catch{}
      }
      return 'released';
    }catch{return 'failed';}
    finally{clearTimeout(timer);}
  }catch{return 'failed';}
}

export async function releaseQaSessionBeforeContextClose(page){
  if(!page||typeof page.evaluate!=='function'||page.isClosed?.()===true||
    !trustedQaCleanupPage(page.url?.()))return 'skipped';
  try{
    const outcome=await page.evaluate(releaseQaSessionInPage,{
      qaOrigin:CANARY_ORIGIN,
      apiOrigin:SUPABASE_ORIGIN,
      projectRef:QA_PROJECT_REF,
      storageKey:SESSION_KEY,
    });
    return ['released','no-session','skipped','failed'].includes(outcome)
      ?outcome:'failed';
  }catch{return 'failed';}
}

// Only coarse fixed outcome counts may leave the browser process.
export const __qaSessionCleanupInternals=Object.freeze({SESSION_KEY,QA_FIXTURE_EMAILS});
