// Candidate only: no automatic requests, no local authorization cache.
// Scope is verified against the confirmed report collection, never editor fields.
const providers=Object.freeze({apple_health:'Apple Salud',health_connect:'Health Connect'});
const decisions=Object.freeze({pending:'Solicitud pendiente de respuesta.',accepted:'Aceptación registrada. La publicación requiere comprobar su vigencia.',declined:'El Cliente no autorizó esta solicitud.',withdrawn:'El Cliente retiró esta autorización.'});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function exactValue(row,keys){
 const values=[row,row?.body].flatMap(part=>keys.map(key=>part?.[key]).filter(v=>v!==null&&v!==undefined&&v!==''));
 return values.length&&values.every(v=>v===values[0])?values[0]:null;
}
export function documentCoachReportScope(state,reportId,{actorId,lease}={}){
 const clientId=state?.selectedClientId;
 if(state?.activeArea!=='informes'||state?.hydration?.status!=='ready'||state?.identity?.role!=='coach'||state?.identity?.id!==actorId||!uuid(actorId)||!lease||!uuid(clientId)||!uuid(reportId)||!state.collections?.clients?.some(c=>c.id===clientId))return null;
 const rows=(state.collections?.reports||[]).filter(r=>r.id===reportId);
 if(rows.length!==1)return null;
 const row=rows[0],reportRevision=exactValue(row,['revision']),status=exactValue(row,['status','estado']);
 if(exactValue(row,['clientId','client_id'])!==clientId||!['borrador','aprobado'].includes(status)||exactValue(row,['reportType','report_type'])!=='weekly'||exactValue(row,['visibleToClient'])!==false||!Number.isSafeInteger(reportRevision)||reportRevision<1)return null;
 // These fields are not present in every canonical read model. If present,
 // reject contradictory values; server always checks both independently.
 for(const [keys,expected] of [[['audience'],'coach'],[['createdBy','created_by'],actorId]]){
  const present=[row,row.body].some(part=>keys.some(k=>part?.[k]!=null&&part[k]!==''));
  if(present&&exactValue(row,keys)!==expected)return null;
 }
 if(status==='aprobado'){
  const sources=[row.evidence,row.body?.evidence].filter(Array.isArray).map(items=>items.map(e=>e?.source).filter(v=>typeof v==='string'&&v.trim().toLowerCase().startsWith('connected360:')));
  if(!sources.length||sources.some(a=>a.length!==1||a[0]!==sources[0][0]))return null;
  const match=/^connected360:(?:apple_health|health_connect):([0-9a-f-]{36})$/u.exec(sources[0][0]);
  if(!match||!uuid(match[1]))return null;
  return Object.freeze({actorId,lease,role:'coach',clientId,reportId,reportRevision,status,requestId:match[1]});
 }
 return Object.freeze({actorId,lease,role:'coach',clientId,reportId,reportRevision});
}
export function sameDocumentCoachScope(a,b){return !!a&&!!b&&['actorId','lease','role','clientId','reportId','reportRevision','status','requestId'].every(k=>a[k]===b[k]);}
export function mountDocumentCoachPanel(host,{api,stillCurrent,isOnline=()=>true,scope,onTransition}={}){
 if(!host?.ownerDocument||api?.available?.()!==true||typeof api.request!=='function'||typeof stillCurrent!=='function'||!stillCurrent())return null;
 const doc=host.ownerDocument,el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const panel=el('details');panel.className='m26-publication-actions';panel.dataset.documentCoachPanel='true';
 const approved=scope?.status==='aprobado';
 const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const provider=el('select'),placeholder=el('option','Selecciona el origen');placeholder.value='';provider.append(placeholder);
 for(const [id,name] of Object.entries(providers)){const option=el('option',name);option.value=id;provider.append(option);}
 provider.value='';const providerLabel=el('label');providerLabel.append(el('span','Origen de la actividad'),provider);
 const check=el('input');check.type='checkbox';const label=el('label');label.className='m26-wearable-qa-consent';label.append(check,el('span','Confirmo que deseo solicitar este permiso para este informe.'));
 const submit=el('button','Solicitar autorización al Cliente');submit.type='button';submit.disabled=true;
 let disposed=false,busy=false,controller=null,accepted=false;
 const transition=el('button',approved?'Publicar informe autorizado':'Aprobar informe con autorización');transition.type='button';transition.disabled=true;
 const transitionCheck=el('input');transitionCheck.type='checkbox';const transitionLabel=el('label');transitionLabel.append(transitionCheck,el('span',approved?'Confirmo la publicación del informe revisado.':'Confirmo la aprobación privada del informe revisado.'));
 transition.hidden=transitionLabel.hidden=!approved;
 const updateTransition=()=>{transition.disabled=busy||!transitionCheck.checked||(!approved&&!accepted)||typeof api.transition!=='function';transitionCheck.disabled=busy;};
 const resetTransition=()=>{accepted=false;transitionCheck.checked=false;transition.hidden=transitionLabel.hidden=!approved;updateTransition();};
 transitionCheck.addEventListener('change',updateTransition);
 const active=()=>!disposed&&panel.isConnected&&api.available()===true&&stillCurrent();
 const update=()=>{submit.disabled=busy||!check.checked||!Object.hasOwn(providers,provider.value);provider.disabled=busy;check.disabled=busy;updateTransition();};
 const reset=()=>{check.checked=false;update();};
 const retire=()=>{disposed=true;controller?.abort();panel.remove();};
 provider.addEventListener('change',()=>{reset();resetTransition();status.textContent='';});check.addEventListener('change',update);
 submit.addEventListener('click',async()=>{
  if(approved||!active()||busy||!check.checked||!Object.hasOwn(providers,provider.value))return;
  if(!isOnline()){status.textContent='Sin conexión. No se ha enviado ninguna solicitud.';reset();return;}
  resetTransition();busy=true;update();controller=new AbortController();const signal=controller.signal;
  const live=()=>!signal.aborted&&active();status.textContent='Comprobando el informe y los permisos…';
  try{
   const result=await api.request({provider:provider.value,confirmed:true,signal});
   if(live()){status.textContent=decisions[result?.decision]||'No se pudo confirmar el resultado. Revisa el estado antes de volver a solicitar.';accepted=result?.decision==='accepted';transition.hidden=transitionLabel.hidden=!accepted;}
  }catch{if(live())status.textContent='No se pudo confirmar el resultado. Un nuevo intento explícito consultará la solicitud existente o solicitará permiso para el contenido actualizado.';}
  finally{busy=false;controller=null;if(active())reset();else retire();}
 });
 transition.addEventListener('click',async()=>{
  if(!active()||busy||transition.disabled||!transitionCheck.checked||!isOnline())return;
  busy=true;update();controller=new AbortController();const signal=controller.signal;
  try{
   const result=await api.transition({action:approved?'publish':'approve',confirmed:true,signal});
   if(!signal.aborted&&active()){
    status.textContent='Operación confirmada por el servidor. Actualizando el informe…';
    await onTransition?.(result);
   }
  }catch{if(!signal.aborted&&active())status.textContent='No se pudo confirmar el resultado. Actualiza el informe antes de repetir la operación.';}
  finally{busy=false;controller=null;if(active()){resetTransition();reset();}else retire();}
 });
 panel.append(el('summary','Autorización de actividad externa'));
 if(!approved)panel.append(el('p','Solicita permiso para incluir actividad de un dispositivo en este informe semanal. No modifica ni publica el documento.'),providerLabel,label,submit);
 panel.append(transitionLabel,transition,status);host.append(panel);return Object.freeze({active,retire,panel});
}
