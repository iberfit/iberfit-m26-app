import {renderFollowupCapture,buildFollowupCapture,renderFollowupHistory,renderFollowupDetail,renderFollowupRecentActions,renderProfessionalReview,renderPublicationList,renderPublicationHead,renderPublicationReviewActions} from './professional-followup-ui.js';
import {PROFESSIONAL_RECTIFICATION_REASONS,professionalFollowupDetailMatchesDraft,professionalFollowupDetailMatchesReference,compareProfessionalFollowupPair,buildProfessionalPublicationDraft,professionalPublicationOperationParams,verifyProfessionalPublicationRecovery,verifyProfessionalPublicationRead,verifyProfessionalPublicationReceipt,buildProfessionalPublicationReportPreview,professionalReportProofParams,verifyProfessionalReportEvidence,bindProfessionalReportSelection} from '../domain/professional-followup.js';

// Only the currently open professional workspace retains these private rows.
// Never write them to canonical state, draft repository, telemetry or browser storage.
export function createProfessionalFollowupController({root,getScope,getSessionScope,getReportScope=null,leaveTarget=globalThis.window,read,readRecent,readDetail,record,rectify,findPublication,listPublications,readPublication,publish,withdraw,recoverPublication,readReportProof,reviewGoal=()=>'',subscribe=()=>()=>{},newId=()=>globalThis.crypto.randomUUID(),online=()=>globalThis.navigator?.onLine!==false,confirm=message=>globalThis.confirm?.(message)===true}={}){
 let mounted=false,unsubscribe=null,scope=null,host=null,opened=false,busy=false,epoch=0,abort=null,rows=[],cursor=null,loaded=false,draft={},pending=null,notice='',goalNotice='',recentNotice='',recentRows=[],detail=null,publicationPreview=null,publicationItems=[],publicationCursor=null,publicationLoaded=false,publicationHead=null,publicationReport=null,publicationRecoveryChecked=false;
 // At most one uncertain operation, private and memory-only, bound to a live session.
 let recovery=null,reportSelection=null;
 const clearRecovery=()=>{recovery=null;publicationRecoveryChecked=false;leaveTarget?.removeEventListener?.('beforeunload',beforeLeave);};
 const current=()=>getScope?.()||null;
 const auth=()=>getSessionScope?.()||null;
 const sameSession=(a,b)=>Boolean(a?.lease&&b?.lease&&a.lease===b.lease&&a.actorId===b.actorId);
 const sameScope=(a,b)=>sameSession(a,b)&&a.clientId===b.clientId;
 const belongs=()=>mounted&&opened&&sameScope(scope,current())&&sameSession(scope,auth());
 function purgeRecovery(){if(recovery&&!sameSession(recovery.scope,auth()))clearRecovery();}
 function remember(op){purgeRecovery();if(recovery||!belongs())return false;reportSelection?.clear();pending=op;recovery={scope,op};leaveTarget?.addEventListener?.('beforeunload',beforeLeave);return true;}
 function beforeLeave(event){purgeRecovery();if(recovery){event.preventDefault();event.returnValue='';}}
 function clear(){publicationRecoveryChecked=false;epoch++;abort?.abort();abort=null;opened=false;busy=false;scope=null;rows=[];cursor=null;loaded=false;draft={};pending=null;notice='';goalNotice='';recentNotice='';recentRows=[];detail=null;publicationPreview=null;clearPublications();if(host){const body=host.querySelector('[data-gx-followup-body]');if(body)body.replaceChildren();const b=host.querySelector('[data-gx-followup-action="open"]');if(b)b.hidden=false;}host=null;}
 function clearPublications(){publicationItems=[];publicationCursor=null;publicationLoaded=false;publicationHead=null;publicationReport=null;}
 const publicationPending=()=>pending&&['publication','withdrawal'].includes(pending.kind);
 const canPublish=()=>typeof findPublication==='function'&&typeof publish==='function'&&typeof recoverPublication==='function';
 function render(){if(!belongs())return;const next=root.querySelector('[data-gx-followup-host]');if(!next||next.getAttribute('data-gx-followup-host')!==scope.clientId)return;host=next;
  const body=host.querySelector('[data-gx-followup-body]');if(!body)return;const open=host.querySelector('[data-gx-followup-action="open"]');if(open)open.hidden=true;
  body.innerHTML=`<p role="status" aria-live="polite" data-gx-followup-notice></p><div class="m26-action-grid"><button type="button" data-gx-followup-action="reload">Actualizar historial</button><button type="button" data-gx-followup-action="close">Cerrar seguimiento</button>${typeof readRecent==='function'?'<button type="button" data-gx-followup-action="recent">Comprobar registros recientes</button>':''}</div><p role="status" aria-live="polite" data-gx-followup-recent></p>${typeof readDetail==='function'?renderFollowupRecentActions(recentRows,{pendingId:publicationPending()?null:pending?.payload.id}):''}${renderFollowupDetail(detail)}${pending?'<p>Hay una operación sin confirmar. Reintenta exactamente la misma operación antes de registrar otra.</p><button type="button" data-gx-followup-action="retry" class="m26-primary-action">Reintentar misma operación</button>':loaded?renderFollowupCapture(draft):''}<div data-gx-followup-history>${loaded?renderFollowupHistory(rows,{nextCursor:cursor,allowReview:!pending&&!recovery}):'<p>Historial todavía no cargado.</p>'}</div>${publicationPreview&&!pending&&!recovery?renderProfessionalReview(publicationPreview.previous,publicationPreview.current)+(canPublish()?renderPublicationReviewActions(publicationPreview,{canPublish:true}):''):''}${typeof listPublications==='function'&&!pending?'<button type="button" data-gx-followup-action="publication-list">Consultar publicaciones profesionales</button>'+renderPublicationList(publicationItems,{loaded:publicationLoaded,nextCursor:publicationCursor})+renderPublicationHead(publicationHead,{preview:publicationReport,canVerify:typeof readReportProof==='function',canWithdraw:!recovery&&typeof withdraw==='function'&&typeof recoverPublication==='function'}):''}${publicationPending()?'<button type="button" data-gx-followup-action="publication-recover">Comprobar operación de publicación</button>'+(publicationRecoveryChecked?'<button type="button" data-gx-followup-action="publication-stop-retry">Dejar de reintentar</button>':''):''}<p role="status" aria-live="polite" data-gx-goal-notice></p>`;
  body.querySelector('[data-gx-followup-notice]').textContent=notice;body.querySelector('[data-gx-goal-notice]').textContent=goalNotice;const recentNode=body.querySelector('[data-gx-followup-recent]');if(recentNode)recentNode.textContent=recentNotice;
  if(busy)for(const el of body.querySelectorAll('button,input,select'))el.disabled=true;
  if(pending)for(const el of body.querySelectorAll('[data-gx-followup-action="void"],[data-gx-followup-action="more"],[data-gx-followup-action="goal"],[data-gx-followup-action="reload"],[data-gx-void-reason]'))el.disabled=true;
  if(recovery&&!sameScope(recovery.scope,scope)){
   body.querySelector('[data-gx-followup-notice]').textContent='Hay otra operación profesional por confirmar en esta sesión. Puedes consultar este historial, pero resuelve aquella operación antes de registrar o anular mediciones.';
   for(const el of body.querySelectorAll('[data-gx-followup-form] button[type="submit"],[data-gx-followup-action="void"],[data-gx-void-reason]'))el.disabled=true;
  }
  body.setAttribute('aria-busy',String(busy));
 }
 function invalidate(){reportSelection?.prune();purgeRecovery();if(!opened)return;if(!belongs()){clear();return;}const next=root.querySelector('[data-gx-followup-host]');if(next!==host){if(!next){clear();return;}render();}}
 function capture(form){if(form)draft=Object.fromEntries(new FormData(form).entries());}
 function onInput(event){if(!opened||busy||pending||!belongs())return;const form=event.target.closest?.('[data-gx-followup-form]');if(!form||!host?.contains(form))return;capture(form);}
 function onChange(event){if(!opened||busy||pending||!belongs())return;const form=event.target.closest?.('[data-gx-followup-form]');if(!form||!host?.contains(form))return;capture(form);if(event.target.name==='metric'){const metric=draft.metric,measuredAt=draft.measuredAt;draft={metric,measuredAt};render();host?.querySelector('[name="metric"]')?.focus();}}
 function start(){const token=++epoch;abort=new AbortController();busy=true;render();return {token,signal:abort.signal};}
 const live=token=>token===epoch&&belongs();
 function finish(token){purgeRecovery();if(live(token)){busy=false;abort=null;render();}else if(opened&&!belongs())clear();}
 function failure(){rows=[];cursor=null;loaded=false;goalNotice='';notice='No se pudo confirmar el historial. Comprueba la conexión y los permisos; vuelve a actualizar.';}
 async function load(more=false){if(!belongs()||busy||pending)return;if(!online()){notice='Sin conexión. No se consultará ni registrará información.';render();return;}if(more&&(!cursor||rows.length>=90))return;const oldRows=rows,oldCursor=cursor;publicationPreview=null;clearPublications();recentRows=[];detail=null;recentNotice='';notice='Consultando historial profesional…';goalNotice='';const {token,signal}=start();try{const page=await read(scope.clientId,{cursor:more?oldCursor:null,limit:30,signal});if(!live(token))return;if(page.clientId!==scope.clientId)throw Error('GX_FOLLOWUP_SCOPE');const next=more?[...oldRows,...page.items]:page.items;if(new Set(next.map(x=>x.id)).size!==next.length)throw Error('GX_FOLLOWUP_DUPLICATE');rows=next;cursor=rows.length>=90?null:page.nextCursor;loaded=true;notice=rows.length>=90&&page.nextCursor?'Se muestran hasta 90 mediciones por consulta. Historial parcial.':'';}catch{if(live(token))failure();}finally{finish(token);}}
 async function checkRecent(){
  if(!belongs()||busy||typeof readRecent!=='function')return;
  if(!online()){recentNotice='Sin conexión. No se pueden comprobar los registros recientes.';render();return;}
  publicationPreview=null;clearPublications();recentRows=[];detail=null;recentNotice='Comprobando registros recientes…';const {token,signal}=start();
  try{const page=await readRecent(scope.clientId,{signal});if(!live(token))return;if(page.clientId!==scope.clientId||!Array.isArray(page.items))throw Error('GX_FOLLOWUP_SCOPE');
   recentRows=page.items;
   const stamp=v=>new Intl.DateTimeFormat('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'medium'}).format(new Date(v));
   const summaries=page.items.map(r=>`${r.kind==='record'?'Medición registrada':'Anulación registrada'} el ${stamp(r.createdAt)} (medición: ${stamp(r.measuredAt)}; referencia: ${r.id})`);
   const match=pending&&!publicationPending()&&page.items.some(r=>r.id===pending.payload.id&&r.kind===pending.kind);
   recentNotice=(match?'La referencia de la operación pendiente figura registrada. Reintenta la misma operación para confirmar el contenido exacto. ':'')+(summaries.length?'Últimos registros de tu cuenta en este expediente: '+summaries.join(' · '):'No aparecen registros recientes de tu cuenta en este expediente.')+' La ausencia de una referencia no demuestra que la operación haya fallado; comprueba el historial antes de repetir una medición.';
  }catch{if(live(token)){recentRows=[];detail=null;recentNotice='No se pudieron comprobar los registros recientes. Reintenta la consulta con conexión y permisos vigentes.';}}finally{finish(token);}
 }
 async function checkDetail(operationId){
  if(!belongs()||busy||typeof readDetail!=='function'||publicationPending()||(!recentRows.some(r=>r.id===operationId)&&pending?.payload.id!==operationId))return;
  publicationPreview=null;clearPublications();detail=null;if(!online()){recentNotice='Sin conexión. No se puede verificar el contenido.';render();return;}
  recentNotice='Consultando contenido registrado…';const {token,signal}=start();
  try{const result=await readDetail(scope.clientId,operationId,{signal});if(!live(token))return;
   if(result.clientId!==scope.clientId||result.operationId!==operationId||result.observation?.clientId!==scope.clientId)throw Error('GX_FOLLOWUP_SCOPE');
   const expected=recentRows.find(r=>r.id===operationId);if(!professionalFollowupDetailMatchesReference(result,expected))throw Error('GX_FOLLOWUP_SCOPE');
   detail=result;
   if(pending?.payload.id===operationId&&professionalFollowupDetailMatchesDraft(result,pending)){
    clearRecovery();pending=null;draft={};rows=[];cursor=null;loaded=false;goalNotice='';notice='Operación confirmada mediante lectura del contenido exacto. Actualiza el historial.';recentNotice='El contenido registrado coincide con la operación pendiente.';
   }else recentNotice=pending?.payload.id===operationId?'El contenido no coincide con la operación pendiente. No se ha confirmado; no registres una nueva medición.':'Contenido confirmado en el servidor. Si perdiste el borrador, comprueba manualmente los datos antes de repetir la operación.';
  }catch{if(live(token))recentNotice='No se pudo verificar el contenido. La ausencia de una respuesta no demuestra que la operación haya fallado.';}finally{finish(token);}
 }
 async function submitPending(){if(!belongs()||busy||!pending)return;if(!online()){notice='Sin conexión. La operación se conserva en memoria; reinténtala al recuperar la conexión.';render();return;}const op=pending;publicationRecoveryChecked=false;publicationPreview=null;clearPublications();recentRows=[];detail=null;recentNotice='';notice='Confirmando operación en el servidor…';const {token,signal}=start();try{const result=await (op.kind==='publication'?publish(op.payload.draft,op.payload.operationId,{signal}):op.kind==='withdrawal'?withdraw(op.payload.draft,op.payload.operationId,{signal}):op.kind==='record'?record(op.payload,{signal}):rectify(op.payload,{signal}));if(!live(token))return;if(result.clientId!==scope.clientId||result.id!==op.payload.id)throw Error('GX_FOLLOWUP_SCOPE');if(publicationPending()){const p=professionalPublicationOperationParams(op);const h=verifyProfessionalPublicationRead(result,{p_client:p.p_client,p_publication:p.p_publication});if(!h||h.revision!==p.p_expected+1||h.status!==p.p_status )throw Error('GX_PUBLICATION_ACK');if(h.status==='published')verifyProfessionalPublicationReceipt({ok:true,...h},op.payload.draft);publicationHead=h;}clearRecovery();pending=null;draft={};rows=[];cursor=null;loaded=false;goalNotice='';notice='Operación confirmada. Actualiza el historial para comprobar el resultado.';}catch{if(live(token)){rows=[];cursor=null;loaded=false;goalNotice='';notice='No se pudo confirmar la operación. Conservamos el mismo identificador para evitar duplicados al reintentar.';}}finally{finish(token);}}
 async function lookupPublication(){
  if(!belongs()||busy||pending||recovery||!publicationPreview||!canPublish())return;
  const preview=publicationPreview;preview.checked=false;preview.head=null;publicationHead=null;publicationReport=null;
  if(!online()){notice='Sin conexión. No se puede comprobar la publicación.';render();return;}
  notice='Comprobando publicación existente…';const {token,signal}=start();
  try{const h=await findPublication(scope.clientId,preview.previous.id,preview.current.id,{signal});if(!live(token))return;
   if(h&&(h.clientId!==scope.clientId||(h.status==='published'&&(h.pair.previous.id!==preview.previous.id||h.pair.current.id!==preview.current.id))))throw Error('GX_PUBLICATION_SCOPE');
   preview.checked=true;preview.head=h;publicationHead=h;publicationReport=h?buildProfessionalPublicationReportPreview(h,{clientId:scope.clientId,reviewGoal}):null;notice=h?'Publicación localizada.':'No existe publicación para este par al consultar.';
  }catch{if(live(token)){preview.checked=false;preview.head=null;publicationHead=null;notice='No se pudo comprobar el par. No se habilitará la publicación.';}}finally{finish(token);}
 }
 async function loadPublications(more=false){
  if(!belongs()||busy||pending||typeof listPublications!=='function'||(more&&(!publicationCursor||publicationItems.length>=60)))return;
  if(!online()){clearPublications();notice='Sin conexión. No se pueden comprobar publicaciones.';render();return;}
  const old=more?publicationItems:[],after=more?publicationCursor:null;publicationHead=null;publicationReport=null;publicationPreview=null;notice='Consultando publicaciones…';const {token,signal}=start();
  try{const p=await listPublications(scope.clientId,{cursor:after,limit:10,signal});if(!live(token))return;if(p.clientId!==scope.clientId||!Array.isArray(p.items)||p.items.some(x=>x.clientId!==scope.clientId))throw Error('GX_PUBLICATION_SCOPE');const all=[...old,...p.items];if(new Set(all.map(x=>x.id)).size!==all.length)throw Error('GX_PUBLICATION_DUPLICATE');publicationItems=all;publicationCursor=all.length>=60?null:p.nextCursor;publicationLoaded=true;notice=all.length>=60&&p.nextCursor?'Listado parcial: hasta 60 publicaciones.':'';
  }catch{if(live(token)){clearPublications();notice='No se pudieron comprobar las publicaciones. Actualiza la consulta.';}}finally{finish(token);}
 }
 async function loadPublication(id){
  if(!belongs()||busy||pending||typeof readPublication!=='function'||!publicationItems.some(h=>h.id===id))return;
  publicationHead=null;publicationReport=null;publicationPreview=null;if(!online()){notice='Sin conexión. No se puede comprobar la publicación.';render();return;}
  notice='Comprobando revisión vigente…';const {token,signal}=start();try{const h=await readPublication(scope.clientId,id,{signal});if(!live(token))return;if(!h||h.id!==id||h.clientId!==scope.clientId)throw Error('GX_PUBLICATION_SCOPE');publicationHead=h;publicationReport=buildProfessionalPublicationReportPreview(h,{clientId:scope.clientId,reviewGoal});notice='Revisión comprobada.';}catch{if(live(token)){publicationHead=null;notice='No se pudo comprobar la revisión.';}}finally{finish(token);}
 }
 async function checkReportProof(){
  if(!belongs()||busy||pending||typeof readReportProof!=='function'||!publicationHead||publicationHead.status!=='published'||!publicationReport)return;
  const head=publicationHead,preview=publicationReport;
  const {canonicalEvidence:previousEvidence,...plainPreview}=preview;publicationReport=Object.freeze({...plainPreview,serverVerified:false});
  if(!online()){notice='Sin conexión. No se ha comprobado la vigencia de la evidencia.';render();return;}
  const options={clientId:scope.clientId,periodStart:preview.periodEnd,periodEnd:preview.periodEnd};
  // This is a fresh proof read, with the earlier baseline outside the period
  // allowed by design; it is not the approval or issuance of an official report.
  notice='Contrastando evidencia con el servidor…';const {token,signal}=start();
  try{
   const params=professionalReportProofParams([head],options);
   const proof=await readReportProof([head],{...options,signal});
   if(!live(token))return;
   const {official,...raw}=proof;
   if(official!==false)throw Error('M26_GX_REPORT_EVIDENCE_RESPONSE_INVALID');
   const verified=verifyProfessionalReportEvidence(raw,params,[head]);
   const staged=reportSelection?.stage(head,verified,options)===true;
   publicationReport=Object.freeze({...plainPreview,serverVerified:true,canonicalEvidence:verified.evidence[0]});notice=staged?'Evidencia contrastada y disponible para seleccionar en Informes durante esta sesión. No se ha emitido ningún informe.':'Vigencia y contenido contrastados en esta consulta. No equivale a emisión de informe.';
  }catch{if(live(token)){
   reportSelection?.clear();publicationHead=null;publicationReport=null;if(publicationPreview){publicationPreview.checked=false;publicationPreview.head=null;}
   notice='No se pudo comprobar la vigencia de esta evidencia. Consulta de nuevo la publicación antes de utilizarla.';
  }}finally{finish(token);}
 }
 async function checkPublicationOperation(){
  if(!belongs()||busy||!publicationPending()||typeof recoverPublication!=='function')return;
  if(!online()){notice='Sin conexión. La operación sigue pendiente.';render();return;}
  const op=pending;publicationRecoveryChecked=false;notice='Comprobando la operación exacta…';const {token,signal}=start();
  try{const result=verifyProfessionalPublicationRecovery(await recoverPublication(op,{signal}),professionalPublicationOperationParams(op));if(!live(token))return;
   if(!result){publicationRecoveryChecked=true;notice='Todavía no se ha confirmado esta operación. Su ausencia no demuestra que haya fallado.';return;}
   clearRecovery();pending=null;publicationPreview=null;clearPublications();notice='Operación confirmada en el historial. '+(result.currentStatus==='published'?'La última revisión figuraba publicada al consultar.':'La última revisión no aporta evidencia vigente.')+' Consulta el listado actualizado.';
  }catch{if(live(token))notice='No se pudo confirmar el contenido exacto de la operación. Se conserva el mismo identificador.';}finally{finish(token);}
 }
 async function submitPublication(kind){
  if(!belongs()||busy||pending||recovery||!online()||typeof recoverPublication!=='function')return;
  let d;try{
   if(kind==='publication'){
    const p=publicationPreview;if(!canPublish()||!p?.checked||p.head&&p.head.status!=='withdrawn')return;
    if(!confirm('Confirmas que ambas mediciones son equivalentes y han sido revisadas. ¿Registrar la publicación profesional?'))return;
    d=buildProfessionalPublicationDraft({id:p.head?.id||newId(),clientId:scope.clientId,expectedRevision:p.head?.revision||0,reviewed:true},p.previous,p.current);if(!d)throw Error('GX_PUBLICATION_DRAFT');
   }else{
    const h=publicationHead;if(typeof withdraw!=='function'||!h||h.status==='withdrawn'||h.clientId!==scope.clientId)return;
    if(!confirm('¿Retirar esta revisión profesional? Se conservará su trazabilidad y dejará de aportar evidencia vigente.'))return;
    d=Object.freeze({id:h.id,clientId:h.clientId,expectedRevision:h.revision});
   }
   const op=Object.freeze({kind,payload:Object.freeze({id:d.id,clientId:d.clientId,draft:d,operationId:newId()})});professionalPublicationOperationParams(op);if(!remember(op))return;
  }catch{notice='No se pudo preparar una revisión válida. Actualiza el historial.';render();return;}await submitPending();
 }
 async function onSubmit(event){const form=event.target.closest?.('[data-gx-followup-form]');if(!form||!host?.contains(form))return;event.preventDefault();if(!belongs()||busy||pending||!loaded)return;capture(form);purgeRecovery();if(recovery){notice='Hay otra operación profesional por confirmar en esta sesión. Resuélvela antes de registrar una nueva.';render();return;}try{if(!remember({kind:'record',payload:buildFollowupCapture(draft,{id:newId(),clientId:scope.clientId})}))return;}catch{notice='Revisa la fecha, el valor, el protocolo y las condiciones de la medición.';render();return;}await submitPending();}
 async function onClick(event){const button=event.target.closest?.('[data-gx-followup-action]');if(!button||!root.contains(button))return;const action=button.getAttribute('data-gx-followup-action'),panel=button.closest('[data-gx-followup-host]');if(!panel)return;event.preventDefault();if(action==='open'){if(opened||busy)return;const s=current();if(!s||panel.getAttribute('data-gx-followup-host')!==s.clientId)return;purgeRecovery();if(!sameSession(s,auth()))return;scope=s;host=panel;opened=true;if(recovery&&sameScope(recovery.scope,s)){pending=recovery.op;notice='Operación pendiente recuperada en esta sesión. Reintenta la misma operación antes de continuar.';render();return;}render();await load();return;}
  if(!belongs()||panel!==host||busy)return;
  if(action==='close'){if(pending&&!confirm('La operación no está confirmada. Se conservará únicamente en memoria mientras dure esta sesión. Si recargas o cierras la aplicación, comprueba el historial antes de registrar otra medición. ¿Cerrar?'))return;clear();return;}
  if(action==='recent'){await checkRecent();return;}if(action==='detail'){await checkDetail(button.getAttribute('data-gx-id'));return;}if(action==='retry'){await submitPending();return;}if(action==='publication-recover'){await checkPublicationOperation();return;}if(action==='publication-stop-retry'){if(publicationPending()&&publicationRecoveryChecked&&confirm('Esta operación no está confirmada y podría completarse todavía. Dejar de reintentar no la cancela. Consulta las publicaciones antes de continuar. ¿Dejar de reintentar?')){clearRecovery();pending=null;publicationPreview=null;clearPublications();notice='Has dejado de reintentar. La operación podría completarse todavía; consulta las publicaciones antes de continuar.';render();}return;}if(pending)return;
  if(action==='publication-list'){await loadPublications();return;}if(action==='publication-more'){await loadPublications(true);return;}if(action==='publication-detail'){await loadPublication(button.getAttribute('data-gx-id'));return;}if(action==='publication-lookup'){await lookupPublication();return;}if(action==='report-proof'){if(publicationHead?.id===button.getAttribute('data-gx-id'))await checkReportProof();return;}if(action==='publish-publication'){await submitPublication('publication');return;}if(action==='withdraw-publication'){if(publicationHead?.id===button.getAttribute('data-gx-id'))await submitPublication('withdrawal');return;}
  if(action==='close-review'){publicationPreview=null;publicationHead=null;publicationReport=null;render();return;}
  if(action==='reload'){await load();return;}if(action==='more'){await load(true);return;}
  const row=rows.find(x=>x.id===button.getAttribute('data-gx-id'));if(!row||row.rectification||!loaded)return;
  if(action==='review-publication'){
   purgeRecovery();if(recovery)return;
   const i=rows.indexOf(row),previous=rows.slice(i+1).find(p=>compareProfessionalFollowupPair(p,row));
   if(!previous)return;publicationHead=null;publicationReport=null;publicationPreview={previous,current:row,checked:false,head:null};render();host?.querySelector('[data-gx-publication-preview] button')?.focus?.();return;
  }
  if(action==='goal'){try{goalNotice=reviewGoal(scope.clientId,row)||'No hay un objetivo publicado comparable con esta medición.';}catch{goalNotice='No se pudo comprobar el objetivo.';}render();return;}
  if(action==='void'){purgeRecovery();if(recovery){notice='Hay otra operación profesional por confirmar en esta sesión. Resuélvela antes de anular otra medición.';render();return;}const select=[...host.querySelectorAll('[data-gx-void-reason]')].find(x=>x.getAttribute('data-gx-void-reason')===row.id);const reason=select?.value;if(!Object.hasOwn(PROFESSIONAL_RECTIFICATION_REASONS,reason||'')){notice='Selecciona un motivo de anulación.';host.querySelector('[data-gx-followup-notice]').textContent=notice;select?.focus();return;}if(!confirm('La medición original se conservará en el historial, pero dejará de utilizarse en comparaciones. ¿Confirmas la anulación?'))return;if(!remember({kind:'void',payload:Object.freeze({id:newId(),clientId:scope.clientId,targetId:row.id,reason})}))return;await submitPending();}
 }
 return Object.freeze({mount(){if(mounted)return;if(typeof getReportScope==='function')reportSelection=bindProfessionalReportSelection(root,getReportScope);mounted=true;root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);root.addEventListener('input',onInput);root.addEventListener('change',onChange);root.addEventListener('m26:shell-rendered',invalidate);unsubscribe=subscribe(invalidate);},destroy(){if(!mounted)return;clear();clearRecovery();reportSelection?.destroy();reportSelection=null;mounted=false;unsubscribe?.();unsubscribe=null;root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);root.removeEventListener('input',onInput);root.removeEventListener('change',onChange);root.removeEventListener('m26:shell-rendered',invalidate);}});
}
