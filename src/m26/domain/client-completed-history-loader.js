// P0 #1209 · QA-only, lossless, owner-scoped paged history orchestrator.
// Does not silently fall back to empty history on auth/network failures.
import {createClientCompletedHistoryPager} from './client-completed-history-pager.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SECTIONS=new Set(['session','session_execution']);
const MAX_PAGES_PER_SECTION=128;
function fail(code){throw new Error('M26_CLIENT_HISTORY_'+code);}
export function createClientCompletedHistoryLoader({
  transport,getToken,getOwner,getClientId,isOnline=()=>true,
}={}){
  if(typeof transport?.clientCompletedHistoryPage!=='function'
     ||typeof getToken!=='function'||typeof getOwner!=='function'
     ||typeof getClientId!=='function'||typeof isOnline!=='function')
    fail('DEPENDENCIES_REQUIRED');
  let active=null;
  function assertCurrent(owner,clientId,signal){
    if(signal?.aborted)fail('CANCELLED');
    if(getOwner()!==owner||getClientId()!==clientId)fail('OWNER_STALE');
    if(!isOnline())fail('OFFLINE');
  }
  function cancel(){
    const previous=active;active=null;
    previous?.controller.abort();
  }
  function load({owner,clientId,sections=['session'],limit=24,signal}={}){
    if(!owner||typeof owner!=='object'||!UUID.test(String(clientId||'')))
      fail('OWNER_REQUIRED');
    if(!Array.isArray(sections)||!sections.length||sections.length>2
       ||new Set(sections).size!==sections.length||sections.some(s=>!SECTIONS.has(s))
       ||!Number.isInteger(limit)||limit<1||limit>32)
      fail('ARGUMENTS_INVALID');
    assertCurrent(owner,clientId,signal);
    const key=sections.join('|')+':'+limit;
    if(active&&active.owner===owner&&active.clientId===clientId&&active.key===key)
      return active.promise;
    cancel();
    const controller=new AbortController();
    const onAbort=()=>controller.abort();
    signal?.addEventListener('abort',onAbort,{once:true});
    if(signal?.aborted)controller.abort();
    const work=async()=>{
      try{
        const complete={};
        for(const section of sections){
          assertCurrent(owner,clientId,controller.signal);
          const pager=createClientCompletedHistoryPager({owner,clientId,section,limit});
          let pages=0;
          while(!pager.status().ready){
            if(++pages>MAX_PAGES_PER_SECTION)fail('PAGE_BUDGET_EXCEEDED');
            assertCurrent(owner,clientId,controller.signal);
            const token=await getToken();
            assertCurrent(owner,clientId,controller.signal);
            if(typeof token!=='string'||!token)fail('AUTH_REQUIRED');
            const payload=await transport.clientCompletedHistoryPage(
              token,pager.nextRequest({requestOwner:owner}),{signal:controller.signal});
            assertCurrent(owner,clientId,controller.signal);
            pager.accept({requestOwner:owner,page:payload});
          }
          complete[section]=pager.finish({requestOwner:owner});
        }
        assertCurrent(owner,clientId,controller.signal);
        return Object.freeze(complete);
      }finally{
        signal?.removeEventListener?.('abort',onAbort);
      }
    };
    const operation={owner,clientId,key,controller,promise:null};
    operation.promise=work().finally(()=>{
      if(active===operation)active=null;
    });
    active=operation;
    return operation.promise;
  }
  return Object.freeze({load,cancel});
}
