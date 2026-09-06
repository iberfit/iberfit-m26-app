import {messagesForThread} from './state.js';
import {buildCrmRenewalSummary} from '../engagement/crm-renewals.js';
import {augmentCoachCockpitWithCrm} from '../experience/coach-cockpit.js';

const list=(value)=>Array.isArray(value)?value:[];
const field=(record,...keys)=>{
  const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:{};
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
};
function commercialClientIds(vm,state){
  if(!vm?.coachCockpit)return [];
  if(vm.kind==='hoy'){
    return [...new Set(
      list(vm.clients)
        .map((client)=>String(client?.id||'').trim())
        .filter(Boolean)
    )];
  }
  if(vm.kind==='expediente'){
    const id=String(state?.selectedClientId||'').trim();
    return id?[id]:[];
  }
  return [];
}
function commercialClientName(vm,state,clientIdValue){
  const id=String(clientIdValue||'').trim();
  const fromVm=list(vm?.clients).find((client)=>String(client?.id||'').trim()===id);
  const vmName=String(fromVm?.name||'').trim();
  if(vmName)return vmName;
  const record=list(state?.collections?.clients).find((client)=>String(client?.id||'').trim()===id);
  return String(field(record,'name','nombre')||'Cliente').trim()||'Cliente';
}
export function applyCommercialCoachCockpit(vm,state,now=new Date()){
  if(!vm?.coachCockpit||!state)return vm;
  const ids=commercialClientIds(vm,state);
  if(!ids.length)return vm;
  const summaries=ids
    .map((id)=>buildCrmRenewalSummary(state,id,{now}))
    .filter(Boolean)
    .map((crm)=>Object.freeze({
      ...crm,
      clientName:commercialClientName(vm,state,crm.clientId),
    }));
  if(!summaries.length)return vm;
  return Object.freeze({
    ...vm,
    coachCockpit:augmentCoachCockpitWithCrm(vm.coachCockpit,summaries),
  });
}
function routeNow(base,state){
  const raw=base?.rc39?.generatedAt||state?.hydration?.serverTime||null;
  const parsed=raw?new Date(raw):null;
  return parsed&&!Number.isNaN(parsed.getTime())?parsed:new Date();
}
export function createCommunicationRouteViewModel(base,shellVm,state){
  const projected=applyCommercialCoachCockpit(base,state,routeNow(base,state));
  const area=String(shellVm?.activeArea||state?.activeArea||'');
  const role=String(shellVm?.identity?.role||state?.identity?.role||'').toLowerCase();
  if(area!=='mensajes'||!['client','coach'].includes(role))return projected;
  if(state?.communication?.available!==true)return Object.freeze({...projected,communication:true,kind:'communication-unavailable',reason:state?.communication?.reason||'backend_unavailable',role});
  return Object.freeze({...projected,communication:true,kind:'communication',role,threads:Object.freeze((state.communication.threads||[]).map((t)=>Object.freeze({...structuredClone(t),messages:messagesForThread(state,t.id)}))),notifications:Object.freeze(structuredClone(state.communication.notifications||[])),clients:role==='coach'?Object.freeze(structuredClone(state.collections?.clients||[])):Object.freeze([]),canOpenThread:role==='coach'});
}