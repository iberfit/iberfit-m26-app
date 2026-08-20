import {castilianOperationTitle} from '../ui/castellano.js';
function clone(value){return value==null?value:structuredClone(value);}
function qaStage(stage){
  try{
    const hook=globalThis.__IBERFIT_M26_QA_STAGE__;
    if(typeof hook==='function')void hook(stage);
  }catch{}
}
function list(value){return Array.isArray(value)?value:[];}
function compact(item,status){return Object.freeze({operationId:item.operationId,type:item.type,entityType:item.entityType,entityId:item.entityId,clientId:item.clientId,status,createdAt:item.createdAt||null,updatedAt:item.updatedAt||null,errorCode:item.errorCode||null,retryable:item.retryable!==false,attempts:Math.max(0,Math.trunc(Number(item.attempts)||0)),nextRetryAt:item.nextRetryAt||null,title:castilianOperationTitle(item.type,item.entityType),actions:Object.freeze(status==='pending'&&item.retryable!==false?['retry','inspect']:status==='conflict'?['inspect','discard_local']:['inspect','discard_local'])});}
export function buildVerificationCenter(state){
  const pending=list(state?.pendingOperations).map((item)=>compact(item,'pending'));
  const conflicts=list(state?.conflicts).map((item)=>compact(item,'conflict'));
  const rejected=list(state?.rejectedOperations).map((item)=>compact(item,'rejected'));
  const items=[...conflicts,...rejected,...pending];
  return Object.freeze({pending:Object.freeze(pending),conflicts:Object.freeze(conflicts),rejected:Object.freeze(rejected),items:Object.freeze(items),summary:Object.freeze({pending:pending.length,conflicts:conflicts.length,rejected:rejected.length,total:items.length}),deploymentBlocked:conflicts.length>0||rejected.length>0});
}
export async function refreshVerificationState({repository,store}){
  qaStage('rc64-verification-refresh-start');
  if(!repository?.list||!store?.projectOperations)throw new Error('M26_VERIFICATION_DEPENDENCIES_REQUIRED');
  qaStage('rc64-verification-repository-list-start');
  const records=await repository.list();
  qaStage('rc64-verification-repository-list-ready');
  qaStage('rc64-verification-project-start');
  store.projectOperations(records);
  qaStage('rc64-verification-project-ready');
  qaStage('rc64-verification-center-start');
  const center=buildVerificationCenter(store.getState());
  qaStage('rc64-verification-center-ready');
  return center;
}
export function createVerificationController({root,commandBus,repository,store}){
  if(!root?.addEventListener||!repository?.remove||!commandBus?.retry)throw new Error('M26_VERIFICATION_CONTROLLER_REQUIRED');
  let mounted=false;
  async function onClick(event){
    const button=event.target.closest?.('[data-verification-action]');if(!button)return;
    const action=button.getAttribute('data-verification-action');const operationId=button.getAttribute('data-operation-id');if(!operationId)return;
    button.disabled=true;button.setAttribute('aria-busy','true');
    try{
      if(action==='retry')await commandBus.retry(operationId);
      else if(action==='discard_local')await repository.remove(operationId);
      else if(action==='inspect'){const record=(await repository.list()).find((item)=>item.operationId===operationId)||null;root.dispatchEvent(new CustomEvent('m26:inspect-operation',{bubbles:true,detail:{operation:clone(record)}}));return;}
      await refreshVerificationState({repository,store});
    }catch(error){root.dispatchEvent(new CustomEvent('m26:verification-error',{bubbles:true,detail:{operationId,action,code:error.message}}));}
    finally{button.disabled=false;button.removeAttribute('aria-busy');}
  }
  return Object.freeze({mount(){if(mounted)return;root.addEventListener('click',onClick);mounted=true;},destroy(){if(!mounted)return;root.removeEventListener('click',onClick);mounted=false;}});
}
