// P0 #1209 · QA-only owner-scoped completed history: explicit user demand, never route-entry prefetch.
// Both QA rollout flags remain OFF until an approved measured pilot.
import {createClientCompletedHistoryLoader} from '../domain/client-completed-history-loader.js';

const HISTORY_AREAS=new Set(['sesion','planificacion','progreso']);
function fingerprint(state){
  return [state?.identity?.id,state?.identity?.clientId,state?.identity?.role,state?.hydration?.confirmedAt,
    JSON.stringify(state?.lastAck??null)].join('|');
}
export function canOfferClientHistory(state,area,enabled){
  return enabled===true&&state?.identity?.role==='client'
    &&state?.hydration?.status==='ready'&&HISTORY_AREAS.has(String(area||''))
    &&Boolean(state.identity.id&&state.identity.clientId&&state.hydration.confirmedAt);
}
export function shouldLoadClientHistory(state,area,enabled,explicit=false){
  return explicit===true&&canOfferClientHistory(state,area,enabled);
}
export function createClientHistoryDemandController({
  root,store,transport,enabled=false,getToken,getOwner,isOnline=()=>true,render=()=>{},
}={}){
  if(!root||typeof store?.getState!=='function'||typeof transport?.clientCompletedHistoryPage!=='function'
     ||typeof getToken!=='function'||typeof getOwner!=='function')
    throw new Error('M26_FREE_HISTORY_CONTROLLER_DEPENDENCIES_REQUIRED');
  const loader=createClientCompletedHistoryLoader({
    transport,getToken,getOwner,getClientId:()=>String(store.getState().identity?.clientId||''),
    isOnline,
  });
  let mounted=false,status='idle',loadedKey='',failedKey='',failureCode='',request=null;
  let activeArea=String(store.getState().activeArea||'');
  function cancelPending(){
    if(request){loader.cancel();request=null;}
  }
  function notice(){
    const previous=root.querySelector?.('[data-m26-free-history-status]');
    if(!canOfferClientHistory(store.getState(),activeArea,enabled)||status==='ready'){
      previous?.remove?.();return;
    }
    const route=root.querySelector?.('.m26-route');
    if(!route)return;
    const doc=root.ownerDocument||globalThis.document;
    let node=previous;
    if(!node){
      node=doc.createElement('aside');
      node.dataset.m26FreeHistoryStatus='';
      // Place archive requests after today's session instead of showing a
      // technical recovery banner above the primary training action. Keep a
      // prepend fallback for older lightweight host fixtures.
      node.className='m26-client-history-load-state m26-client-history-quiet-disclosure';
      if(typeof route.append==='function')route.append(node);
      else route.prepend(node);
    }
    // QA diagnostics are bounded error classes, never request bodies or identities.
    if(status==='error'&&failureCode)node.dataset.m26FreeHistoryFailureCode=failureCode;
    else delete node.dataset.m26FreeHistoryFailureCode;
    node.setAttribute('role',status==='loading'?'status':'group');
    node.setAttribute('aria-live',status==='loading'?'polite':'off');
    node.textContent=status==='idle'
      ?'Los detalles de sesiones antiguas se consultan sólo cuando los solicitas.'
      :status==='loading'
      ?'Actualizando el expediente histórico completo. Los entrenamientos disponibles siguen accesibles.'
      :status==='offline'
      ?'El historial antiguo requiere conexión. Tus sesiones disponibles permanecen visibles.'
      :'No se ha podido recuperar el historial completo. No se ha perdido ningún registro.';
    if(status!=='loading'){
      const button=doc.createElement('button');button.type='button';
      if(status==='idle'){
        button.dataset.m26FreeHistoryOpen='';
        button.textContent='Consultar historial completo';
      }else{
        button.dataset.m26FreeHistoryRetry='';
        button.textContent='Reintentar historial';
      }
      node.append(button);
    }
  }
  async function loadOnce(operation,{clientId,identityId,confirmedAt,lastAck}){
    const {owner,key,area}=operation;
    const current=()=>request===operation&&activeArea===area
      &&canOfferClientHistory(store.getState(),activeArea,enabled)
      &&getOwner()===owner&&fingerprint(store.getState())===key;
    try{
      // Both canonical sections must be complete before an atomic Client store commit.
      // This is exclusively user-triggered; no execution-history prefetch on route entry.
      // QA-only demand path. The server and fail-closed pager both cap at 32.
      // Fewer cursor round trips; no reduction of records or body content.
      const sections=await loader.load({owner,clientId,sections:['session','session_execution'],limit:32});
      if(!current())return;
      store.incorporateClientCompletedHistory({
        ownerId:identityId,clientId,confirmedAt,lastAck,sections,
      });
      if(!current())return;
      loadedKey=key;failedKey='';failureCode='';status='ready';notice();render();
    }catch(error){
      if(!current())return;
      failedKey=key;status=isOnline()?'error':'offline';
      const code=String(error?.message||'');
      failureCode=/^M26_CLIENT_HISTORY_[A-Z0-9_]{1,64}$/u.test(code)
        ?code:'M26_CLIENT_HISTORY_UNCLASSIFIED';
      // Never leak session, token, user details or transport payload in telemetry.
      notice();render();
    }finally{
      if(request===operation){
        request=null;
        if(status==='loading'){
          // Identity, revision or hydration changed before the complete read;
          // preserve prior records and allow only explicit recovery.
          failedKey=key;status='error';failureCode='M26_CLIENT_HISTORY_STALE_CONTEXT';
          notice();render();
        }
      }
    }
  }
  function maybeLoad(area,{explicit=false}={}){
    const state=store.getState();
    if(!canOfferClientHistory(state,area,enabled)){
      cancelPending();status='idle';failedKey='';notice();return;
    }
    const key=fingerprint(state);
    if(request&&request.key!==key){
      cancelPending();status='idle';failedKey='';
    }
    if(loadedKey===key){status='ready';notice();return;}
    if(request&&request.key===key){notice();return;}
    if(explicit!==true){
      if(failedKey!==key)status='idle';
      notice();return;
    }
    if(!shouldLoadClientHistory(state,area,enabled,true))return;
    const owner=getOwner();
    if(!owner||typeof owner!=='object')return;
    if(!isOnline()){failedKey=key;status='offline';notice();return;}
    const {clientId,id:identityId}=state.identity,{confirmedAt}=state.hydration;
    const lastAck=structuredClone(state.lastAck??null);
    status='loading';failedKey='';failureCode='';
    const operation={owner,key,area};request=operation;
    notice();
    void loadOnce(operation,{clientId,identityId,confirmedAt,lastAck});
  }
  function onShellRendered(event){
    const nextArea=event?.detail?.role==='client'?String(event?.detail?.area||''):'';
    if(nextArea!==activeArea){
      cancelPending();status='idle';failedKey='';
    }
    activeArea=nextArea;
    if(!activeArea){cancelPending();status='idle';loadedKey='';failedKey='';notice();return;}
    maybeLoad(activeArea); // No RPC on navigation or shell re-render.
  }
  function onClick(event){
    const action=event.target?.closest?.('[data-m26-free-history-open], [data-m26-free-history-retry]');
    if(!action)return;
    event.preventDefault();
    const state=store.getState();
    if(!canOfferClientHistory(state,activeArea,enabled))return;
    failedKey='';status='idle';
    maybeLoad(activeArea,{explicit:true}); // The ONLY load trigger.
  }
  function mount(){
    if(mounted||enabled!==true)return;
    mounted=true;
    root.addEventListener('m26:shell-rendered',onShellRendered);
    root.addEventListener('click',onClick);
    maybeLoad(activeArea); // Offer button only; no network request.
  }
  function destroy(){
    cancelPending();loader.cancel();mounted=false;status='idle';loadedKey='';failedKey='';
    activeArea='';
    root.removeEventListener?.('m26:shell-rendered',onShellRendered);
    root.removeEventListener?.('click',onClick);
    notice();
  }
  return Object.freeze({mount,destroy,status:()=>status});
}
