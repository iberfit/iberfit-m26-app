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
  let mounted=false,status='idle',loadedKey='',failedKey='',request=null;
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
      node.className='m26-panel m26-client-history-load-state';
      node.setAttribute('role','status');node.setAttribute('aria-live','polite');
      route.prepend(node);
    }
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
      const sections=await loader.load({owner,clientId,sections:['session']});
      if(!current())return;
      store.incorporateClientCompletedHistory({
        ownerId:identityId,clientId,confirmedAt,lastAck,sections,
      });
      if(!current())return;
      loadedKey=key;failedKey='';status='ready';notice();render();
    }catch(error){
      if(!current())return;
      failedKey=key;status=isOnline()?'error':'offline';
      // Never leak session, token, user details or transport payload in telemetry.
      notice();render();
    }finally{
      if(request===operation)request=null;
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
    status='loading';failedKey='';
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
