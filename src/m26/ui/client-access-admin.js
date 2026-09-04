import {resolveM26Runtime} from '../supabase-transport.js';
import {createSessionVault} from '../app/session-vault.js';

const STYLE_ID='m26-client-access-admin-styles';
const ENDPOINT='/functions/v1/iberfit-client-access-v1';
const CACHE_TTL_MS=30_000;
const CACHE=new Map();

const CSS=`
.m26-client-access-card{display:grid;gap:.75rem;margin-top:.8rem;padding:.9rem 1rem;border:1px solid rgba(216,185,111,.16);border-radius:1rem;background:linear-gradient(145deg,rgba(13,48,33,.72),rgba(6,27,18,.82));box-shadow:0 14px 34px rgba(0,0,0,.12)}
.m26-client-access-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.8rem}.m26-client-access-copy{display:grid;gap:.18rem;min-width:0}.m26-client-access-copy span{color:#d8b96f;font-size:.64rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.m26-client-access-copy strong{color:#f6efdf;font-size:.94rem}.m26-client-access-copy small{color:#a9a397;font-size:.7rem;line-height:1.42}.m26-client-access-status{flex:none;padding:.36rem .56rem;border:1px solid rgba(216,185,111,.18);border-radius:999px;color:#d9cda9;background:rgba(216,185,111,.055);font-size:.65rem;font-weight:760}.m26-client-access-status.is-active{border-color:rgba(125,196,150,.24);color:#c9ecd5;background:rgba(64,135,91,.12)}.m26-client-access-actions{display:flex;gap:.5rem;flex-wrap:wrap}.m26-client-access-actions button,.m26-client-admin-actions button{min-height:2.55rem;padding:.52rem .75rem;border:1px solid rgba(216,185,111,.2);border-radius:.72rem;color:#f0e4ca;background:rgba(216,185,111,.065);font:inherit;font-size:.73rem;font-weight:740;cursor:pointer}.m26-client-access-actions button:hover,.m26-client-admin-actions button:hover{border-color:rgba(216,185,111,.42);background:rgba(216,185,111,.11)}.m26-client-admin-actions{display:flex;gap:.42rem;flex-wrap:wrap;margin-top:.45rem}.m26-client-admin-actions .is-danger{border-color:rgba(219,129,109,.24);color:#f0cbc2;background:rgba(117,40,28,.12)}
.m26-client-access-dialog{width:min(42rem,calc(100vw - 2rem));max-height:min(88dvh,52rem);padding:0;border:1px solid rgba(216,185,111,.22);border-radius:1.25rem;color:#f7f1e4;background:#0a2117;box-shadow:0 28px 90px rgba(0,0,0,.48);overflow:hidden}.m26-client-access-dialog::backdrop{background:rgba(1,8,5,.72);backdrop-filter:blur(6px)}.m26-client-access-dialog-inner{display:grid;gap:1rem;padding:1.25rem}.m26-client-access-dialog header{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.m26-client-access-dialog header div{display:grid;gap:.2rem}.m26-client-access-dialog header span{color:#d8b96f;font-size:.64rem;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.m26-client-access-dialog h3{margin:0;color:#f8f2e7;font-size:1.28rem;letter-spacing:-.025em}.m26-client-access-close{width:2.6rem;height:2.6rem;border:1px solid rgba(216,185,111,.16);border-radius:.75rem;color:#e5d7b8;background:rgba(255,255,255,.035);font:inherit;font-size:1.1rem;cursor:pointer}.m26-client-access-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.58rem}.m26-client-access-details>div{display:grid;gap:.14rem;padding:.68rem .72rem;border:1px solid rgba(216,185,111,.1);border-radius:.75rem;background:rgba(255,255,255,.025)}.m26-client-access-details span{color:#99938a;font-size:.63rem;text-transform:uppercase;letter-spacing:.06em}.m26-client-access-details strong{overflow-wrap:anywhere;color:#eee4cf;font-size:.78rem}.m26-client-access-notice{margin:0;padding:.72rem .78rem;border-radius:.78rem;color:#beb6a8;background:rgba(255,255,255,.035);font-size:.72rem;line-height:1.5}.m26-client-access-notice.is-error{color:#f2d5cc;background:rgba(126,47,31,.17)}.m26-client-delete-zone{display:grid;gap:.7rem;padding-top:.85rem;border-top:1px solid rgba(216,185,111,.12)}.m26-client-delete-zone h4{margin:0;color:#f2d7cf;font-size:.88rem}.m26-client-delete-zone p{margin:0;color:#aaa399;font-size:.7rem;line-height:1.5}.m26-client-delete-zone label{display:grid;gap:.4rem;color:#d8cdc0;font-size:.7rem;font-weight:700}.m26-client-delete-zone input{min-height:2.9rem;padding:.66rem .72rem;border:1px solid rgba(218,142,124,.22);border-radius:.72rem;color:#fff3ef;background:rgba(0,0,0,.18);font:inherit}.m26-client-delete-zone button{min-height:2.8rem;padding:.62rem .8rem;border:1px solid rgba(218,142,124,.3);border-radius:.72rem;color:#f7d9d0;background:rgba(126,47,31,.2);font:inherit;font-weight:760;cursor:pointer}.m26-client-delete-zone button:disabled{opacity:.45;cursor:not-allowed}.m26-client-access-actions button:focus-visible,.m26-client-admin-actions button:focus-visible,.m26-client-access-dialog button:focus-visible,.m26-client-access-dialog input:focus-visible{outline:3px solid rgba(237,210,145,.78);outline-offset:2px}
@media(max-width:760px){.m26-client-access-head{display:grid}.m26-client-access-status{justify-self:start}.m26-client-access-details{grid-template-columns:1fr}.m26-client-access-dialog{width:calc(100vw - 1rem);max-height:calc(100dvh - 1rem);border-radius:1rem}.m26-client-access-dialog-inner{padding:1rem}.m26-client-access-actions{display:grid;grid-template-columns:1fr}.m26-client-access-actions button{width:100%;min-height:3rem}}
@media(min-width:761px) and (max-width:1180px){.m26-client-access-dialog{width:min(38rem,calc(100vw - 3rem))}.m26-client-access-dialog-inner{padding:1.15rem}}
@media(prefers-reduced-motion:reduce){.m26-client-access-dialog::backdrop{backdrop-filter:none}}
`;

function installStyles(document){
  if(!document?.head||document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');style.id=STYLE_ID;style.textContent=CSS;document.head.appendChild(style);
}
function el(document,tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=String(text);return node;}
function normalizeName(value){return String(value||'').normalize('NFKC').replace(/\s+/gu,' ').trim();}
function dateLabel(value){
  if(!value)return '—';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return '—';
  try{return new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(d);}catch{return d.toLocaleString();}
}
function statusLabel(status){return status==='active'?'Acceso activo':status==='invited'?'Invitación enviada':'Sin invitación';}
function runtime(){return resolveM26Runtime(globalThis.__IBERFIT_M26_RUNTIME__||{},globalThis.location);}
async function api(action,payload={}){
  const rt=runtime();if(!rt.enabled||!rt.url||!rt.publishableKey)throw new Error('M26_BACKEND_DISABLED');
  const session=createSessionVault().load();if(!session?.token)throw new Error('M26_AUTH_REQUIRED');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15_000);
  try{
    const response=await globalThis.fetch(`${rt.url}${ENDPOINT}`,{method:'POST',signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{apikey:rt.publishableKey,authorization:`Bearer ${session.token}`,'content-type':'application/json','x-client-info':`iberfit-m26-web/${rt.version}`},body:JSON.stringify({action,...payload})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.ok!==true){const error=new Error(String(data?.code||`M26_HTTP_${response.status}`));error.status=response.status;error.body=data;throw error;}
    return data;
  }catch(error){if(error?.name==='AbortError')throw new Error('M26_TIMEOUT');throw error;}finally{clearTimeout(timer);}
}
async function fetchStatus(clientId,{force=false}={}){
  const cached=CACHE.get(clientId);if(!force&&cached&&Date.now()-cached.at<CACHE_TTL_MS)return cached.value;
  const result=await api('status',{clientId});const value=result.status;CACHE.set(clientId,{at:Date.now(),value});return value;
}
function humanError(error){
  const code=String(error?.message||'');
  if(code==='M26_CLIENT_DELETE_RETENTION_BLOCKED')return 'Este cliente conserva registros de consentimiento, incidencia o cumplimiento que impiden una eliminación física segura.';
  if(/PRIVILEGED_WEBAUTHN_REQUIRED|AUTH_REQUIRED|SESSION/.test(code))return 'La operación requiere una sesión administrativa verificada. Vuelve a confirmar tu acceso seguro e inténtalo de nuevo.';
  if(/CLIENT_EMAIL_INVALID/.test(code))return 'El expediente no tiene un correo válido para enviar la invitación.';
  if(/INVITE_SEND_FAILED/.test(code))return 'No se pudo enviar la invitación en este momento. No se ha activado ningún acceso.';
  if(/TIMEOUT|NETWORK|FETCH/.test(code))return 'No fue posible conectar. Comprueba la conexión e inténtalo de nuevo.';
  return 'No fue posible completar la operación. No se ha aplicado ningún cambio inseguro.';
}
function setNotice(dialog,text,{error=false}={}){const notice=dialog.querySelector('[data-client-access-notice]');if(!notice)return;notice.textContent=text;notice.classList.toggle('is-error',error);}
function detail(document,label,value){const box=el(document,'div');box.append(el(document,'span','',label),el(document,'strong','',value||'—'));return box;}
function updateDialog(dialog,status){
  dialog.dataset.clientName=normalizeName(status.clientName);
  const details=dialog.querySelector('[data-client-access-details]');details.replaceChildren(
    detail(dialog.ownerDocument,'Estado',statusLabel(status.status)),detail(dialog.ownerDocument,'Correo',status.email),detail(dialog.ownerDocument,'Última invitación',dateLabel(status.lastInvitedAt)),detail(dialog.ownerDocument,'Activación',dateLabel(status.activatedAt)),
  );
  const invite=dialog.querySelector('[data-client-access-invite]');
  if(invite){invite.hidden=status.status==='active';invite.textContent=status.status==='invited'?'Reenviar invitación':'Enviar invitación';invite.disabled=false;}
  const title=dialog.querySelector('h3');if(title)title.textContent=status.clientName||'Cliente IBERFIT';
  const confirm=dialog.querySelector('[data-client-delete-confirm]');if(confirm){confirm.value='';confirm.placeholder=status.clientName||'Nombre exacto';}
  const del=dialog.querySelector('[data-client-delete-submit]');if(del)del.disabled=true;
}
function createDialog(root,role){
  const document=root.ownerDocument;let dialog=document.querySelector('[data-m26-client-access-dialog]');if(dialog)return dialog;
  dialog=el(document,'dialog','m26-client-access-dialog');dialog.dataset.m26ClientAccessDialog='true';
  const inner=el(document,'div','m26-client-access-dialog-inner');
  const head=el(document,'header');const heading=el(document,'div');heading.append(el(document,'span','','Acceso a IBERFIT'),el(document,'h3','','Cliente IBERFIT'));const close=el(document,'button','m26-client-access-close','×');close.type='button';close.setAttribute('aria-label','Cerrar');close.dataset.clientAccessClose='true';head.append(heading,close);
  const details=el(document,'div','m26-client-access-details');details.dataset.clientAccessDetails='true';
  const notice=el(document,'p','m26-client-access-notice','Cargando estado de acceso…');notice.dataset.clientAccessNotice='true';
  const actions=el(document,'div','m26-client-access-actions');const invite=el(document,'button','','Enviar invitación');invite.type='button';invite.dataset.clientAccessInvite='true';actions.append(invite);
  inner.append(head,details,notice,actions);
  if(role==='admin'){
    const zone=el(document,'section','m26-client-delete-zone');zone.append(el(document,'h4','','Eliminar cliente de IBERFIT'),el(document,'p','','Esta acción elimina de forma permanente su expediente operativo y datos de entrenamiento asociados. Si existen registros que deban conservarse por cumplimiento, IBERFIT bloqueará la eliminación.'));
    const label=el(document,'label','','Escribe el nombre exacto del cliente para confirmar');const input=el(document,'input');input.type='text';input.autocomplete='off';input.dataset.clientDeleteConfirm='true';label.append(input);const del=el(document,'button','','Eliminar cliente definitivamente');del.type='button';del.dataset.clientDeleteSubmit='true';del.disabled=true;zone.append(label,del);inner.append(zone);
  }
  dialog.append(inner);document.body.appendChild(dialog);return dialog;
}
async function openDialog(root,{clientId,clientName,role}){
  const dialog=createDialog(root,role);dialog.dataset.clientId=clientId;dialog.dataset.clientName=normalizeName(clientName);setNotice(dialog,'Consultando el estado real del acceso…');dialog.showModal?.();
  try{const status=await fetchStatus(clientId,{force:true});updateDialog(dialog,status);setNotice(dialog,status.status==='active'?'El acceso del cliente está activo y vinculado a su expediente.':status.status==='invited'?'La invitación fue emitida. El acceso solo se activará cuando el cliente complete el enlace seguro.':'Todavía no se ha emitido una invitación para este cliente.');}catch(error){setNotice(dialog,humanError(error),{error:true});}
}
function clientInlineCard(root,viewModel){
  if(viewModel?.identity?.role!=='coach'||!viewModel?.selectedClient?.id)return null;
  if(!['progreso','expediente'].includes(String(viewModel.activeArea||'')))return null;
  const document=root.ownerDocument;const route=root.querySelector('#m26-main .m26-route');if(!route)return null;
  route.querySelector('[data-m26-client-access-card]')?.remove?.();
  const card=el(document,'section','m26-client-access-card');card.dataset.m26ClientAccessCard='true';card.dataset.clientId=viewModel.selectedClient.id;card.dataset.clientName=viewModel.selectedClient.name;
  const head=el(document,'div','m26-client-access-head');const copy=el(document,'div','m26-client-access-copy');copy.append(el(document,'span','','Acceso a IBERFIT'),el(document,'strong','',viewModel.selectedClient.name),el(document,'small','','Invitación, activación y estado de acceso del cliente.'));const status=el(document,'span','m26-client-access-status','Consultando…');status.dataset.clientAccessInlineStatus='true';head.append(copy,status);const actions=el(document,'div','m26-client-access-actions');const manage=el(document,'button','','Gestionar acceso');manage.type='button';manage.dataset.m26ClientAccessOpen=viewModel.selectedClient.id;manage.dataset.clientName=viewModel.selectedClient.name;actions.append(manage);card.append(head,actions);
  const anchor=route.querySelector('[data-m27-cliente-360]');if(anchor)anchor.after(card);else route.append(card);
  void fetchStatus(viewModel.selectedClient.id).then(value=>{status.textContent=statusLabel(value.status);status.classList.toggle('is-active',value.status==='active');}).catch(()=>{status.textContent='Estado no disponible';});
  return card;
}
function bind(root){
  if(root.dataset?.m26ClientAccessBound==='true')return;
  if(root.dataset)root.dataset.m26ClientAccessBound='true';
  root.addEventListener('click',event=>{
    const opener=event.target.closest?.('[data-m26-client-access-open]');if(opener){event.preventDefault();const role=String(opener.dataset.clientRole||root.dataset.clientAccessRole||'coach');void openDialog(root,{clientId:String(opener.dataset.m26ClientAccessOpen||''),clientName:String(opener.dataset.clientName||''),role});return;}
    const dialog=event.target.closest?.('[data-m26-client-access-dialog]');if(!dialog)return;
    if(event.target.closest?.('[data-client-access-close]')){dialog.close?.();return;}
    if(event.target.closest?.('[data-client-access-invite]')){const button=event.target.closest('[data-client-access-invite]');button.disabled=true;setNotice(dialog,'Enviando la invitación segura…');void api('invite',{clientId:dialog.dataset.clientId}).then(result=>{CACHE.delete(dialog.dataset.clientId);updateDialog(dialog,result.status);setNotice(dialog,'Invitación emitida. El cliente recibirá un enlace seguro para crear su acceso.');}).catch(error=>{button.disabled=false;setNotice(dialog,humanError(error),{error:true});});return;}
    if(event.target.closest?.('[data-client-delete-submit]')){const button=event.target.closest('[data-client-delete-submit]');const input=dialog.querySelector('[data-client-delete-confirm]');button.disabled=true;setNotice(dialog,'Eliminando el expediente de forma segura…');void api('delete-client',{clientId:dialog.dataset.clientId,confirmationName:input?.value||''}).then(()=>{CACHE.delete(dialog.dataset.clientId);setNotice(dialog,'Cliente eliminado. Actualizando IBERFIT…');setTimeout(()=>globalThis.location?.reload?.(),250);}).catch(error=>{button.disabled=false;setNotice(dialog,humanError(error),{error:true});});}
  });
  root.addEventListener('input',event=>{const input=event.target.closest?.('[data-client-delete-confirm]');if(!input)return;const dialog=input.closest('[data-m26-client-access-dialog]');const button=dialog?.querySelector('[data-client-delete-submit]');if(button)button.disabled=normalizeName(input.value)!==normalizeName(dialog.dataset.clientName);});
}
export function enhanceClientAccessAdmin({root,viewModel}={}){
  if(!root?.ownerDocument||viewModel?.mode!=='authenticated')return false;
  const role=String(viewModel?.identity?.role||'');if(!['coach','admin'].includes(role))return false;
  installStyles(root.ownerDocument);root.dataset.clientAccessRole=role;bind(root);clientInlineCard(root,viewModel);return true;
}
