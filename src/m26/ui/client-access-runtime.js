import {enhanceClientAccessAdmin} from './client-access-admin.js';

function selectedClient(state){
  const role=String(state?.identity?.role||'');
  const clientId=role==='client'?String(state?.identity?.clientId||''):String(state?.selectedClientId||'');
  const client=(state?.collections?.clients||[]).find(item=>String(item?.id||'')===clientId)||null;
  return client?{id:String(client.id),name:String(client.name||client.nombre||'Cliente IBERFIT'),modality:String(client.modality||client.modalidad||''),status:String(client.status||client.estado||'')}:null;
}
function shellViewModel(state){
  return Object.freeze({mode:'authenticated',identity:Object.freeze({role:String(state?.identity?.role||'')}),activeArea:String(state?.activeArea||''),selectedClient:selectedClient(state)});
}
function decorateAdminClientRows(root,state){
  if(String(state?.identity?.role||'')!=='admin'||String(state?.activeArea||'')!=='admin-clientes')return;
  const forms=[...root.querySelectorAll?.('[data-admin-form="client-lifecycle"]')||[]];
  for(const form of forms){
    const clientId=String(form.querySelector?.('input[name="clientId"]')?.value||'').trim();
    if(!clientId)continue;
    const row=form.closest?.('tr');const cell=form.closest?.('td');if(!row||!cell||cell.querySelector?.(`[data-m26-client-access-open="${CSS.escape(clientId)}"]`))continue;
    const clientName=String(row.querySelector?.('td:first-child')?.textContent||'Cliente IBERFIT').replace(/\s+/gu,' ').trim();
    const actions=root.ownerDocument.createElement('div');actions.className='m26-client-admin-actions';
    const access=root.ownerDocument.createElement('button');access.type='button';access.textContent='Acceso';access.dataset.m26ClientAccessOpen=clientId;access.dataset.clientName=clientName;access.dataset.clientRole='admin';
    const remove=root.ownerDocument.createElement('button');remove.type='button';remove.textContent='Eliminar';remove.className='is-danger';remove.dataset.m26ClientAccessOpen=clientId;remove.dataset.clientName=clientName;remove.dataset.clientRole='admin';
    actions.append(access,remove);cell.append(actions);
  }
}
function enhance(root){
  const app=globalThis.__IBERFIT_M26_APP__;const state=app?.getState?.();
  if(!state?.identity?.role)return false;
  const vm=shellViewModel(state);enhanceClientAccessAdmin({root,viewModel:vm});decorateAdminClientRows(root,state);return true;
}
export function installClientAccessRuntime({root=document.querySelector('#app')}={}){
  if(!root?.addEventListener)return ()=>{};
  const onRender=()=>queueMicrotask(()=>enhance(root));
  root.addEventListener('m26:shell-rendered',onRender);
  enhance(root);
  return ()=>root.removeEventListener('m26:shell-rendered',onRender);
}
