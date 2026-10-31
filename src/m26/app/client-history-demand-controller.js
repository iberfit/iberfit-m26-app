// P0 #1209 · Feature-gated QA Client historical archive hydration.
// Disabled by default: enabling requires the matching QA SQL paging RPC,
// bootstrap reduction, ownership and Device/CI evidence on one exact SHA.
import {createClientCompletedHistoryLoader} from '../domain/client-completed-history-loader.js';

const HISTORY_AREAS=new Set(['sesion','planificacion','progreso']);
function fingerprint(state){
  return [state?.identity?.id,state?.identity?.clientId,state?.hydration?.confirmedAt,
    JSON.stringify(state?.lastAck??null)].join('|');
}
export function shouldLoadClientHistory(state,area,enabled){
  return enabled===true&&state?.identity?.role==='client'
    &&state?.hydration?.status==='ready'&&HISTORY_AREAS.has(String(area||''))
    &&Boolean(state.identity.id&&state.identity.clientId&&state.hydration.confirmedAt);
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
  function notice(){
    const previous=root.querySelector?.('[data-m26-free-history-status]');
    if(status==='ready'||status==='idle'||enabled!==true){
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
    const copy=status==='loading'
      ?'Actualizando el expediente histórico completo. Los entrenamientos disponibles siguen accesibles.'
      :status==='offline'
      ?'El historial antiguo requiere conexión. Tus sesiones disponibles permanecen visibles.'
      :'No se ha podido recuperar el historial completo. No se ha perdido ningún registro.';
    node.textContent=copy;
    if(status==='error'||status==='offline'){
      const button=doc.createElement('button');button.type='button';
      button.dataset.m26FreeHistoryRetry='';
      button.textContent='Reintentar historial';node.append(button);
    }
  }
  async function loadOnce({owner,key,clientId,identityId,confirmedAt,lastAck}){
    try{
      const sections=await loader.load({owner,clientId,sections:['session']});
      if(getOwner()!==owner||fingerprint(store.getState())!==key)
        throw new Error('M26_CLIENT_HISTORY_OWNER_STALE');
      store.incorporateClientCompletedHistory({
        ownerId:identityId,clientId,confirmedAt,lastAck,sections,
      });
      if(getOwner()!==owner||fingerprint(store.getState())!==key)
        throw new Error('M26_CLIENT_HISTORY_OWNER_STALE');
      loadedKey=key;failedKey='';status='ready';notice();render();
    }catch(error){
      if(getOwner()!==owner||fingerprint(store.getState())!==key)return;
      failedKey=key;status=isOnline()?'error':'offline';
      // Do not log token, payload, URLs, identifiers or private server messages.
      notice();render();
    }finally{
      if(request?.owner===owner&&request.key===key)request=null;
    }
  }
  function maybeLoad(area){
    const state=store.getState();
    if(!shouldLoadClientHistory(state,area,enabled)){
      loader.cancel();request=null;status='idle';notice();return;
    }
    const key=fingerprint(state);
    if(loadedKey===key){status='ready';notice();return;}
    // A failed page load is retryable ONLY by explicit user action. Never
    // create an automatic render -> request -> error -> render Egress loop.
    if(failedKey===key){notice();return;}
    if(request&&request.key===key){notice();return;}
    if(request)loader.cancel();
    const owner=getOwner();
    if(!owner||typeof owner!=='object')return;
    const {clientId,id:identityId}=state.identity,{confirmedAt}=state.hydration;
    const lastAck=structuredClone(state.lastAck??null);
    status=isOnline()?'loading':'offline';
    if(status==='offline'){notice();return;}
    request={owner,key};
    notice();
    void loadOnce({owner,key,clientId,identityId,confirmedAt,lastAck});
  }
  function onShellRendered(event){
    if(event?.detail?.role!=='client'){notice();return;}
    maybeLoad(event.detail.area);
  }
  function onClick(event){
    if(!event.target?.closest?.('[data-m26-free-history-retry]'))return;
    event.preventDefault();failedKey='';status='idle';request=null;
    maybeLoad(store.getState().activeArea);
  }
  function mount(){
    if(mounted||enabled!==true)return;
    mounted=true;
    root.addEventListener('m26:shell-rendered',onShellRendered);
    root.addEventListener('click',onClick);
    maybeLoad(store.getState().activeArea);
  }
  function destroy(){
    loader.cancel();mounted=false;status='idle';loadedKey='';failedKey='';request=null;
    root.removeEventListener?.('m26:shell-rendered',onShellRendered);
    root.removeEventListener?.('click',onClick);
    notice();
  }
  return Object.freeze({mount,destroy,status:()=>status});
}
