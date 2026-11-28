import {verifyConnected360DocumentInbox,verifyConnected360DocumentReview,connected360DocumentDecisionParams,verifyConnected360DocumentDecisionReceipt} from './document-consent-contract.js';

const providerNames={apple_health:'Apple Salud',health_connect:'Health Connect'};
const decisionNames={pending:'Pendiente',accepted:'Aceptación registrada',declined:'Rechazada',withdrawn:'Retirada'};
const sports={running:'Carrera',cycling:'Ciclismo',walking:'Caminata',strength:'Fuerza',hiit:'HIIT',swimming:'Natación',other:'Otra actividad'};
const sameReceipt=(item,review)=>['requestId','reportId','reportRevision','provider','periodStart','periodEnd','revision','decision'].every(key=>item[key]===review[key]);

// Demand-only UI. The injected adapter is unavailable in live runtime until
// authenticated RPCs and canonical publication are certified together.
export function mountDocumentConsentPanel(host,{clientId,api,stillCurrent,now=()=>new Date(),operationId=()=>globalThis.crypto.randomUUID()}={}){
 if(!host?.ownerDocument||api?.available?.()!==true||!['inbox','review','decide'].every(k=>typeof api[k]==='function')||typeof stillCurrent!=='function')return null;
 const doc=host.ownerDocument;
 const el=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const button=(text,action)=>{const node=el('button',text);node.type='button';node.addEventListener('click',action);return node;};
 const panel=el('section');panel.dataset.documentConsentPanel='true';panel.className='m26-wearable-native-connect';
 const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const content=el('div');
 let disposed=false,epoch=0,controller=null,busy=false;
 const active=()=>!disposed&&panel.isConnected&&stillCurrent()&&api.available()===true&&doc.visibilityState!=='hidden';
 const reset=()=>{epoch+=1;controller?.abort();controller=null;busy=false;content.replaceChildren();status.textContent='';open.disabled=false;};
 const retire=()=>{disposed=true;reset();panel.remove();};
 const open=button('Consultar autorizaciones',()=>load(null));
 const run=async(work,onError='No se pudo completar la consulta. Vuelve a intentarlo.')=>{
  if(!active()||busy)return;
  busy=true;open.disabled=true;const current=++epoch;controller=new AbortController();
  const signal=controller.signal,live=()=>current===epoch&&!signal.aborted&&active();
  try{await work({signal,live});}catch{if(live()){content.replaceChildren();status.textContent=onError;}}
  finally{if(current===epoch){busy=false;controller=null;if(active())open.disabled=false;else retire();}}
 };
 const load=after=>run(async({signal,live})=>{
  content.replaceChildren();status.textContent='Consultando autorizaciones…';
  const page=verifyConnected360DocumentInbox(await api.inbox({after,signal}),{clientId,after,now:now()});if(!live())return;
  status.textContent=page.items.length?'Solicitudes y decisiones registradas.':'No hay solicitudes en esta página.';
  const list=el('ul');for(const item of page.items){const row=el('li');row.append(el('strong',providerNames[item.provider]+' · '+decisionNames[item.decision]),el('p',item.periodStart+' — '+item.periodEnd),button('Revisar solicitud',()=>review(item,item.decision==='pending')));list.append(row);}content.append(list);
  if(page.nextAfter)content.append(button('Ver más solicitudes',()=>load(page.nextAfter)));
  if(after)content.append(button('Volver al inicio',()=>load(null)));
 });
 const review=(item,preview)=>run(async({signal,live})=>{
  content.replaceChildren();status.textContent='Comprobando solicitud…';
  let result;
  try{result=await api.review({requestId:item.requestId,preview,signal});}
  catch(error){if(!preview||!live())throw error;result=await api.review({requestId:item.requestId,preview:false,signal});}
  const data=verifyConnected360DocumentReview(result,{clientId,requestId:item.requestId,now:now()});if(!live())return;
  if(!sameReceipt(item,data)){status.textContent='La solicitud cambió. Actualiza el listado antes de decidir.';return;}
  status.textContent=decisionNames[data.decision]+'. Una decisión registrada no demuestra que el permiso siga vigente.';
  content.append(el('h4',providerNames[data.provider]+' · '+data.periodStart+' — '+data.periodEnd));
  if(data.preview){const p=data.preview;content.append(el('p','Informe semanal: '+p.reportTitle),el('p','Entrenador: '+p.coachName),el('p',p.evidence.observedDays+' días con actividad observada. Cobertura parcial, no sesiones confirmadas.'));const list=el('ul');for(const d of p.evidence.disciplines)list.append(el('li',sports[d.sport]+': '+d.observedDays+' días'));content.append(list);}
  else if(data.decision==='pending')content.append(el('p','No se puede verificar el contenido actual. Puedes rechazar la solicitud, pero no autorizarla.'));
  const choices=data.decision==='pending'?(data.preview?['accepted','declined']:['declined']):data.decision==='accepted'?['withdrawn']:[];
  if(choices.length){
   content.append(el('p','La autorización se limita a estas evidencias y este documento. Retirar el permiso impide nuevos accesos autorizados; no recupera copias ya descargadas.'));
   const check=el('input');check.type='checkbox';const label=el('label');label.className='m26-wearable-qa-consent';label.append(check,el('span','He revisado la información y confirmo mi decisión.'));content.append(label);
   const actions=choices.map(decision=>button({accepted:'Autorizar inclusión',declined:'No autorizar',withdrawn:'Retirar autorización'}[decision],()=>{
    if(!check.checked||!active()||busy)return;
    return run(async({signal,live})=>{
     const params=connected360DocumentDecisionParams(data,{clientId,requestId:item.requestId,now:now(),decision,operationId:operationId(),confirmed:true});
     content.replaceChildren();status.textContent='Registrando decisión…';
     verifyConnected360DocumentDecisionReceipt(await api.decide({params,signal}),params);if(!live())return;
     status.textContent='Decisión registrada. Consulta de nuevo las autorizaciones para ver el estado actualizado.';
    },'No se pudo confirmar el resultado. Consulta de nuevo las autorizaciones antes de repetir la decisión.');
   }));
   for(const action of actions){action.disabled=true;content.append(action);}
   check.addEventListener('change',()=>{for(const action of actions)action.disabled=!check.checked;});
  }
  content.append(button('Volver a solicitudes',()=>load(null)));
 });
 panel.append(el('h3','Autorizaciones de informes'),el('p','Decide qué actividad externa puede incorporarse a un informe profesional. Este permiso es independiente de la conexión de tus dispositivos.'),open,status,content);host.append(panel);
 return Object.freeze({panel,active,retire,clear:reset});
}
