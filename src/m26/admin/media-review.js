const AREA='admin-media-review';
const FLAG='admin_media_review_enabled';
const SERVICE_EVENT='m26:admin-service-ready';
const BRIDGE_KEY='__IBERFIT_M26_ADMIN_MEDIA_REVIEW_BRIDGE_V1__';
const STYLE_MARKER='data-m26-media-review-style';
const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const pct=(value)=>Number.isFinite(Number(value))?`${Math.round(Number(value)*100)} %`:'—';
const date=(value)=>{const d=value?new Date(value):null;return d&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(d):'—';};
const stateLabel=(value)=>({awaiting_human_approval:'Pendiente de revisión',publish_requested:'Publicación en cola',publishing:'Publicando',publish_failed:'Error de publicación'}[String(value||'')]||String(value||'Pendiente'));

export function adminMediaReviewEnabled(state){return state?.identity?.role==='admin'&&state?.admin?.available===true&&state?.admin?.organization?.settings?.[FLAG]===true;}
export function filterAdminMediaReviewNavigation(navigation,state){
  if(adminMediaReviewEnabled(state))return navigation;
  const strip=(items)=>Object.freeze((items||[]).filter((item)=>item?.key!==AREA));
  return Object.freeze({...navigation,primary:strip(navigation?.primary),context:strip(navigation?.context),tools:strip(navigation?.tools),mobile:strip(navigation?.mobile)});
}
export function initialAreaFromPath(pathname){return String(pathname||'').replace(/\/+$/u,'')==='/admin/media-review'?AREA:null;}
export function areaPath(area){return area===AREA?'/admin/media-review':'/';}

export function renderAdminMediaReviewRoute(){
  return `<div class="m26-admin-route m26-media-review-route" data-admin-media-review-route>
    <section class="m26-admin-hero m26-media-review-hero">
      <div><p class="m26-eyebrow">Media Factory · control humano</p><h2>Media Review</h2><p>Compara START y FINAL antes de autorizar cualquier publicación. Superar QA automático nunca publica por sí solo.</p></div>
      <button type="button" data-media-review-retry>Actualizar bandeja</button>
    </section>
    <div class="m26-media-review-live" data-media-review-live role="status" aria-live="polite" aria-atomic="true">Cargando candidatos pendientes…</div>
    <section class="m26-media-review-list" data-media-review-list aria-busy="true"></section>
  </div>`;
}

function emptyMarkup(){return `<div class="m26-admin-panel m26-media-review-empty"><p class="m26-eyebrow">Bandeja al día</p><h3>No hay candidatos pendientes</h3><p>Los candidatos aparecerán aquí únicamente después de superar el QA automático y antes de cualquier publicación.</p></div>`;}
function errorMarkup(message){return `<div class="m26-admin-panel m26-media-review-error" role="alert"><p class="m26-eyebrow">No se pudo actualizar</p><h3>Media Review sigue protegida</h3><p>${esc(message||'No fue posible cargar la bandeja.')}</p><button type="button" data-media-review-retry>Reintentar</button></div>`;}
function image(label,url,exercise){return `<figure class="m26-media-review-phase"><figcaption>${esc(label)}</figcaption>${url?`<img src="${esc(url)}" alt="${esc(`${exercise} · ${label}`)}" loading="lazy" decoding="async">`:`<div class="m26-media-review-image-missing" role="img" aria-label="${esc(`${label} no disponible`)}">Evidencia no disponible</div>`}</figure>`;}
function actionForm(candidate,action,label,{primary=false,reason=false}={}){
  const busy=['publish_requested','publishing'].includes(candidate.reviewState);
  return `<form class="m26-media-review-action" data-media-review-action="${esc(action)}" data-media-job-id="${esc(candidate.jobId)}">
    ${reason?`<label><span>Motivo</span><textarea name="reason" minlength="3" maxlength="500" required placeholder="Decisión breve y trazable"${busy?' disabled aria-disabled="true"':''}></textarea></label>`:''}
    <button type="submit"${primary?' class="m26-primary-action"':''}${busy?' disabled aria-disabled="true"':''}>${esc(label)}</button>
  </form>`;
}
function candidateMarkup(candidate){
  const exercise=String(candidate.exerciseName||candidate.exerciseId||'Ejercicio');
  const state=String(candidate.reviewState||'awaiting_human_approval');
  const retryPublish=state==='publish_failed';
  const queuedPublish=state==='publish_requested'||state==='publishing';
  const muscles=Array.isArray(candidate.primaryMuscles)?candidate.primaryMuscles.filter(Boolean).join(', '):'';
  return `<article class="m26-admin-panel m26-media-review-candidate" data-media-review-job="${esc(candidate.jobId)}">
    <header class="m26-media-review-heading">
      <div><p class="m26-eyebrow">${esc(candidate.exerciseId)}</p><h3>${esc(exercise)}</h3><p>${esc([candidate.pattern,candidate.equipment,candidate.difficulty].filter(Boolean).join(' · '))}</p></div>
      <span class="m26-badge" data-media-review-state>${esc(stateLabel(state))}</span>
    </header>
    <div class="m26-media-review-compare">${image('START',candidate.startUrl,exercise)}${image('FINAL',candidate.finalUrl,exercise)}</div>
    <dl class="m26-media-review-meta">
      <div><dt>QA biomecánica</dt><dd>${esc(pct(candidate.confidence?.biomechanics))}</dd></div>
      <div><dt>QA visual</dt><dd>${esc(pct(candidate.confidence?.visual))}</dd></div>
      <div><dt>Intentos</dt><dd>${esc(candidate.attempts)}</dd></div>
      <div><dt>QA completado</dt><dd>${esc(date(candidate.timestamps?.qaCompletedAt))}</dd></div>
      <div><dt>SHA</dt><dd><code>${esc(String(candidate.sha256||'').slice(0,16))}…</code></dd></div>
      <div><dt>Workflow</dt><dd><code>${esc(String(candidate.provenance?.workflowSha||'').slice(0,12)||'—')}</code></dd></div>
      ${muscles?`<div><dt>Objetivo principal</dt><dd>${esc(muscles)}</dd></div>`:''}
    </dl>
    ${candidate.error?`<div class="m26-admin-notice m26-media-review-notice" role="status"><strong>Último estado</strong><p>${esc(candidate.error)}</p></div>`:''}
    <details class="m26-media-review-trace"><summary>Trazabilidad</summary><dl><div><dt>Job</dt><dd><code>${esc(candidate.jobId)}</code></dd></div><div><dt>Run</dt><dd>${esc(candidate.provenance?.runId||'—')}</dd></div><div><dt>Artifact</dt><dd>${esc(candidate.provenance?.artifactName||'—')}</dd></div><div><dt>Actualizado</dt><dd>${esc(date(candidate.timestamps?.updatedAt))}</dd></div></dl></details>
    <div class="m26-media-review-actions">
      ${actionForm(candidate,'approve',queuedPublish?'Publicación en cola':retryPublish?'Reintentar publicación':'Aprobar y publicar',{primary:true})}
      <details><summary>Rechazar</summary>${actionForm(candidate,'reject','Confirmar rechazo',{reason:true})}</details>
      <details><summary>Regenerar</summary>${actionForm(candidate,'regenerate','Solicitar regeneración',{reason:true})}</details>
    </div>
  </article>`;
}
function renderInto(root,{status='loading',candidates=[],error=null}={}){
  const route=root.querySelector?.('[data-admin-media-review-route]');if(!route)return false;
  const list=route.querySelector?.('[data-media-review-list]'),live=route.querySelector?.('[data-media-review-live]');if(!list)return false;
  if(status==='loading'){list.setAttribute('aria-busy','true');list.innerHTML='<div class="m26-admin-panel m26-media-review-loading" aria-hidden="true"><span></span><span></span><span></span></div>';if(live)live.textContent='Cargando candidatos pendientes…';return true;}
  list.setAttribute('aria-busy','false');
  if(status==='error'){list.innerHTML=errorMarkup(error);if(live)live.textContent='No fue posible cargar Media Review.';return true;}
  list.innerHTML=candidates.length?candidates.map(candidateMarkup).join(''):emptyMarkup();
  if(live)live.textContent=candidates.length===1?'1 candidato pendiente.':`${candidates.length} candidatos pendientes.`;
  return true;
}
function friendly(error){const code=String(error?.message||error||'');if(/DISABLED|404/u.test(code))return 'La bandeja está desactivada por configuración.';if(/409|CONFLICT|NOT_ELIGIBLE|STATE/u.test(code))return 'Este candidato ya cambió de estado en otra sesión. La bandeja se actualizará.';if(/TIMEOUT|NETWORK|FETCH|Failed to fetch/i.test(code))return 'Fallo de red. No se ha perdido ninguna decisión; puedes reintentar.';return 'No fue posible completar la operación. El candidato no se ha publicado.';}
function notify(message){try{globalThis.dispatchEvent?.(new CustomEvent('m26:toast',{detail:{message}}));}catch{}}
function setPending(form,pending,label=''){
  const button=form?.querySelector?.('button[type="submit"]');if(!button)return;
  if(pending){if(!button.dataset.label)button.dataset.label=button.textContent||'';button.textContent=label||button.textContent;button.disabled=true;form.setAttribute('aria-busy','true');}
  else{button.textContent=button.dataset.label||button.textContent;delete button.dataset.label;button.disabled=false;form.removeAttribute('aria-busy');}
}
function actionInput(form){
  const action=String(form?.dataset?.mediaReviewAction||''),jobId=String(form?.dataset?.mediaJobId||''),reason=String(new FormData(form).get('reason')||'').trim();
  if(!['approve','reject','regenerate'].includes(action)||!jobId)return null;
  return {action,jobId,reason,type:{approve:'ADMIN_MEDIA_REVIEW_APROBAR_PUBLICAR',reject:'ADMIN_MEDIA_REVIEW_RECHAZAR',regenerate:'ADMIN_MEDIA_REVIEW_REGENERAR'}[action]};
}

export function createAdminMediaReviewController({root,store,service,onToast=()=>{}}={}){
  if(!root?.addEventListener||!store?.getState||!store?.subscribe||!service?.listMediaReview||!service?.execute)throw new Error('M26_MEDIA_REVIEW_CONTROLLER_CONTEXT_REQUIRED');
  let unsubscribe=null,generation=0,loading=false,lastArea='';const locks=new Set();
  const active=()=>store.getState()?.identity?.role==='admin'&&store.getState()?.activeArea===AREA&&adminMediaReviewEnabled(store.getState());
  async function load({force=false}={}){
    if(!active())return false;if(loading&&!force)return false;loading=true;const turn=++generation;renderInto(root,{status:'loading'});
    try{const response=await service.listMediaReview();if(turn!==generation||!active())return false;renderInto(root,{status:'ready',candidates:Array.isArray(response?.candidates)?response.candidates:[]});return true;}
    catch(error){if(turn===generation&&active())renderInto(root,{status:'error',error:friendly(error)});return false;}
    finally{if(turn===generation)loading=false;}
  }
  async function submit(form){
    const input=actionInput(form);if(!input)return;
    const {action,jobId,reason,type}=input;
    if(locks.has(jobId)){onToast('Ese candidato ya tiene una decisión en curso.');return;}locks.add(jobId);setPending(form,true,action==='approve'?'Encolando publicación…':action==='reject'?'Rechazando…':'Encolando…');
    try{await service.execute({type,entityId:jobId,reason:reason||null,payload:{jobId}});onToast(action==='approve'?'Aprobación registrada. Publicación encolada en el canal OIDC autorizado.':action==='reject'?'Candidato rechazado con trazabilidad.':'Regeneración encolada en Media Factory.');await load({force:true});}
    catch(error){const message=friendly(error);onToast(message);if(/409|CONFLICT|NOT_ELIGIBLE|STATE/u.test(String(error?.message||error||'')))await load({force:true});else setPending(form,false);}
    finally{locks.delete(jobId);}
  }
  function onSubmit(event){const form=event.target?.closest?.('[data-media-review-action]');if(!form)return;event.preventDefault();void submit(form);}
  function onClick(event){if(!event.target?.closest?.('[data-media-review-retry]'))return;event.preventDefault();void load({force:true});}
  function sync(){const area=String(store.getState()?.activeArea||'');if(area===lastArea){if(area===AREA&&active()&&root.querySelector?.('[data-admin-media-review-route]')&&!root.querySelector?.('[data-media-review-job],.m26-media-review-empty,.m26-media-review-error,.m26-media-review-loading'))void load();return;}lastArea=area;if(active())queueMicrotask(()=>load({force:true}));else generation++;}
  return Object.freeze({mount(){root.addEventListener('submit',onSubmit);root.addEventListener('click',onClick);unsubscribe=store.subscribe(sync);sync();},sync,destroy(){generation++;unsubscribe?.();unsubscribe=null;root.removeEventListener('submit',onSubmit);root.removeEventListener('click',onClick);}});
}

function ensureMediaReviewStyle(documentLike){
  if(!documentLike?.head||documentLike.head.querySelector?.(`link[${STYLE_MARKER}]`))return false;
  const link=documentLike.createElement?.('link');if(!link)return false;
  link.rel='stylesheet';link.href=new URL('./media-review.css',import.meta.url).href;link.setAttribute(STYLE_MARKER,'true');documentLike.head.append(link);return true;
}
function rootPath(locationLike){return `${locationLike?.pathname||'/'}${locationLike?.search||''}${locationLike?.hash||''}`;}
export function createAdminMediaReviewDomBridge({globalLike=globalThis,documentLike=globalLike?.document}={}){
  if(!documentLike?.addEventListener||!documentLike?.querySelector)return null;
  let service=null,observer=null,loading=false,generation=0,routeVisible=false,previousArea='admin-inicio';const locks=new Set();
  const route=()=>documentLike.querySelector('[data-admin-media-review-route]');
  const mediaPath=()=>initialAreaFromPath(globalLike?.location?.pathname)===AREA;
  function mediaNav(){return documentLike.querySelector(`[data-m26-area="${AREA}"]`);}
  function replaceRootPath(){try{if(mediaPath())globalLike.history?.replaceState?.({m26MediaReview:false},'',areaPath('admin-inicio'));}catch{}}
  function syncHistory(){
    const visible=Boolean(route());
    if(visible&&!routeVisible&&!mediaPath()){
      try{globalLike.history?.pushState?.({m26MediaReview:true,previousArea},'',areaPath(AREA));}catch{}
    }else if(!visible&&routeVisible&&mediaPath())replaceRootPath();
    if(!visible&&mediaPath()&&!mediaNav())replaceRootPath();
    routeVisible=visible;
  }
  async function load({force=false}={}){
    const host=route();if(!host||!service?.listMediaReview)return false;if(loading&&!force)return false;
    loading=true;const turn=++generation;renderInto(documentLike,{status:'loading'});
    try{const response=await service.listMediaReview();if(turn!==generation||!route())return false;renderInto(documentLike,{status:'ready',candidates:Array.isArray(response?.candidates)?response.candidates:[]});return true;}
    catch(error){if(turn===generation&&route())renderInto(documentLike,{status:'error',error:friendly(error)});return false;}
    finally{if(turn===generation)loading=false;}
  }
  async function submit(form){
    const input=actionInput(form);if(!input||!service?.execute)return;
    const {action,jobId,reason,type}=input;if(locks.has(jobId)){notify('Ese candidato ya tiene una decisión en curso.');return;}
    locks.add(jobId);setPending(form,true,action==='approve'?'Encolando publicación…':action==='reject'?'Rechazando…':'Encolando…');
    try{await service.execute({type,entityId:jobId,reason:reason||null,payload:{jobId}});notify(action==='approve'?'Aprobación registrada. Publicación encolada en el canal OIDC autorizado.':action==='reject'?'Candidato rechazado con trazabilidad.':'Regeneración encolada en Media Factory.');await load({force:true});}
    catch(error){notify(friendly(error));if(/409|CONFLICT|NOT_ELIGIBLE|STATE/u.test(String(error?.message||error||'')))await load({force:true});else setPending(form,false);}
    finally{locks.delete(jobId);}
  }
  function sync(){
    ensureMediaReviewStyle(documentLike);syncHistory();const host=route();if(!host){generation++;return false;}
    if(!service?.listMediaReview){const live=host.querySelector?.('[data-media-review-live]');if(live)live.textContent='Preparando conexión segura…';return false;}
    const settled=host.querySelector?.('[data-media-review-job],.m26-media-review-empty,.m26-media-review-error,.m26-media-review-loading');if(!settled&&!loading)void load({force:true});return true;
  }
  function onService(event){const candidate=event?.detail?.service;if(!candidate?.listMediaReview||!candidate?.execute)return;service=candidate;sync();}
  function onSubmit(event){const form=event.target?.closest?.('[data-media-review-action]');if(!form)return;event.preventDefault();void submit(form);}
  function onClick(event){
    const areaButton=event.target?.closest?.('[data-m26-area]');
    if(areaButton){const target=String(areaButton.getAttribute?.('data-m26-area')||'');if(target===AREA){const current=documentLike.querySelector?.('[data-m26-area][aria-current="page"]')?.getAttribute?.('data-m26-area');if(current&&current!==AREA)previousArea=current;}else if(mediaPath())replaceRootPath();}
    if(event.target?.closest?.('[data-media-review-retry]')){event.preventDefault();void load({force:true});}
  }
  function onPopState(){
    queueMicrotask(()=>{
      if(mediaPath()){const button=mediaNav();if(button&&!route())button.click?.();return;}
      if(route()){const button=documentLike.querySelector?.(`[data-m26-area="${previousArea}"]`)||documentLike.querySelector?.('[data-m26-area="admin-inicio"]');button?.click?.();}
    });
  }
  function mount(){
    ensureMediaReviewStyle(documentLike);globalLike.addEventListener?.(SERVICE_EVENT,onService);globalLike.addEventListener?.('popstate',onPopState);documentLike.addEventListener('submit',onSubmit);documentLike.addEventListener('click',onClick,true);
    const Observer=globalLike.MutationObserver;if(typeof Observer==='function'){observer=new Observer(()=>queueMicrotask(sync));observer.observe(documentLike.documentElement||documentLike.body,{childList:true,subtree:true});}
    sync();return true;
  }
  function destroy(){generation++;observer?.disconnect?.();observer=null;globalLike.removeEventListener?.(SERVICE_EVENT,onService);globalLike.removeEventListener?.('popstate',onPopState);documentLike.removeEventListener('submit',onSubmit);documentLike.removeEventListener('click',onClick,true);}
  return Object.freeze({mount,destroy,sync,load});
}
export function installAdminMediaReviewDomBridge({globalLike=globalThis,documentLike=globalLike?.document}={}){
  if(!documentLike?.addEventListener)return null;
  const existing=globalLike?.[BRIDGE_KEY];if(existing?.destroy)return existing;
  const bridge=createAdminMediaReviewDomBridge({globalLike,documentLike});bridge?.mount?.();try{globalLike[BRIDGE_KEY]=bridge;}catch{}return bridge;
}

installAdminMediaReviewDomBridge();

export const __mediaReviewInternals=Object.freeze({candidateMarkup,renderInto,friendly,actionInput,setPending,ensureMediaReviewStyle,rootPath,SERVICE_EVENT,BRIDGE_KEY});