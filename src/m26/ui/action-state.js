export const ACTION_STATE_SEMANTICS=Object.freeze({
  idle:Object.freeze({role:null,live:null,busy:false}),
  loading:Object.freeze({role:'status',live:'polite',busy:true}),
  success:Object.freeze({role:'status',live:'polite',busy:false}),
  pending:Object.freeze({role:'status',live:'polite',busy:false}),
  error:Object.freeze({role:'alert',live:'assertive',busy:false}),
  retry:Object.freeze({role:'alert',live:'assertive',busy:false}),
  offline:Object.freeze({role:'alert',live:'assertive',busy:false}),
});
const VALID=new Set(Object.keys(ACTION_STATE_SEMANTICS));
const OFFLINE_CODES=new Set(['M26_NETWORK_UNAVAILABLE','M26_OFFLINE','NETWORK_UNAVAILABLE','OFFLINE']);
function errorCode(error){return String(error?.code||error?.message||error||'').trim().toUpperCase();}
function isOfflineError(error){
  if(globalThis?.navigator?.onLine===false)return true;
  const code=errorCode(error);
  return [...OFFLINE_CODES].some((candidate)=>code===candidate||code.includes(candidate));
}
export function createActionState(initial={}){const state={status:'idle',message:'',attempt:0,...initial};if(!VALID.has(state.status))throw new Error('M26_ACTION_STATE_INVALID');return state;}
export function beginAction(state){state.status='loading';state.message='';state.attempt+=1;return state;}
export function succeedAction(state,message='Acción completada'){state.status='success';state.message=message;return state;}
export function pendActionSync(state,message='Guardado en este dispositivo · pendiente de sincronización'){state.status='pending';state.message=message;return state;}
export function markActionOffline(state,message='Sin conexión · vuelve a intentarlo cuando recuperes internet'){state.status='offline';state.message=message;return state;}
export function failAction(state,error,{retryable=true}={}){state.status=retryable?'retry':'error';state.message=String(error?.message||error||'No fue posible completar la acción');return state;}
export async function runAction(state,action){
  beginAction(state);
  try{
    const value=await action();
    if(value?.queued)pendActionSync(state);
    else succeedAction(state);
    return {ok:true,value,state};
  }catch(error){
    if(isOfflineError(error))markActionOffline(state);
    else failAction(state,error,{retryable:![400,401,403,409,422].includes(Number(error?.status))});
    return {ok:false,error,state};
  }
}
export function renderActionState(state={status:'idle',message:''}){
  if(state.status==='idle')return '';
  const semantics=ACTION_STATE_SEMANTICS[state.status];
  if(!semantics)throw new Error('M26_ACTION_STATE_INVALID');
  const busyMessage=state.status==='loading'?'Procesando…':'';
  return `<div class="m26-action-state is-${state.status}" data-action-state="${state.status}" role="${semantics.role}" aria-live="${semantics.live}" aria-atomic="true"${semantics.busy?' aria-busy="true"':''}>${state.message||busyMessage}</div>`;
}
