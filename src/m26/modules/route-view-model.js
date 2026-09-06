import {
  createRouteViewModel as createRouteViewModelCore,
} from './route-view-model-core.js';
import {buildCrmRenewalSummary} from '../engagement/crm-renewals.js';
import {augmentCoachCockpitWithCrm} from '../experience/coach-cockpit.js';

export {__routeViewModelInternals} from './route-view-model-core.js';

function arr(value){return Array.isArray(value)?value:[];}
function txt(value){return String(value??'').trim();}
function bodyOf(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?record.body
    :{};
}
function stateClient(state,clientId){
  const id=txt(clientId);
  return arr(state?.collections?.clients).find((record)=>txt(record?.id)===id)||null;
}
function clientName(state,view,clientId){
  const id=txt(clientId);
  const fromView=arr(view?.clients).find((client)=>txt(client?.id)===id);
  if(txt(fromView?.name))return txt(fromView.name);
  const record=stateClient(state,id);
  const body=bodyOf(record);
  return txt(record?.name||record?.nombre||body?.name||body?.nombre)||'Cliente';
}
function cockpitClientIds(view,state){
  if(!view?.coachCockpit)return [];
  if(view.kind==='hoy'){
    return [...new Set(arr(view.clients).map((client)=>txt(client?.id)).filter(Boolean))];
  }
  if(view.kind==='expediente'){
    const selected=txt(state?.selectedClientId);
    return selected?[selected]:[];
  }
  return [];
}
function applyCommercialCockpit(view,state,now){
  if(!view?.coachCockpit)return view;
  const ids=cockpitClientIds(view,state);
  if(!ids.length)return view;
  const crmSummaries=ids
    .map((clientId)=>buildCrmRenewalSummary(state,clientId,{now}))
    .filter(Boolean)
    .map((crm)=>Object.freeze({
      ...crm,
      clientName:clientName(state,view,crm.clientId),
    }));
  if(!crmSummaries.length)return view;
  return Object.freeze({
    ...view,
    coachCockpit:augmentCoachCockpitWithCrm(
      view.coachCockpit,
      crmSummaries,
    ),
  });
}

export function createRouteViewModel(shellVm,state,now=new Date(),options={}){
  const view=createRouteViewModelCore(shellVm,state,now,options);
  return applyCommercialCockpit(view,state,now);
}

export const __routeViewModelCommercialInternals=Object.freeze({
  stateClient,
  clientName,
  cockpitClientIds,
  applyCommercialCockpit,
});
