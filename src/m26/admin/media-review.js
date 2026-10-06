const AREA='admin-media-review';
const FLAG='admin_media_review_enabled';
const SERVICE_EVENT='m26:admin-service-ready';
const BRIDGE_KEY='__IBERFIT_M26_ADMIN_MEDIA_REVIEW_BRIDGE_V1__';
const STYLE_MARKER='data-m26-media-review-style';
const esc=(value)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const pct=(value)=>Number.isFinite(Number(value))?`${Math.round(Number(value)*100)} %`:'—';
const date=(value)=>{const d=value?new Date(value):null;return d&&!Number.isNaN(d.getTime())?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(d):'—';};
const stateLabel=(value)=>({
  approved:'Aprobada y publicada',
  pending:'Pendiente de generación',
  queued:'En cola',
  regenerating:'Regeneración en cola',
  generating:'Generando',
  awaiting_review:'Pendiente de revisión humana',
  awaiting_human_approval:'Pendiente de revisión humana',
  publish_requested:'Publicación en cola',
  publishing:'Publicando',
  publish_failed:'Error de publicación',
  failed:'Generación fallida',
  blocked:'Bloqueada tras varios intentos',
}[String(value||'')]||String(value||'Pendiente'));

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
      <div>
        <p class="m26-eyebrow">Biblioteca visual · gobierno y calidad</p>
        <h2>Centro de Media</h2>
        <p>Inventario completo de imágenes de ejercicios, estado de la factoría y revisión humana. Nada se publica por superar QA automático: la aprobación final sigue siendo explícita.</p>
      </div>
      <button type="button" data-media-review-retry>Actualizar estado</button>
    </section>
    <div class="m26-media-review-live" data-media-review-live role="status" aria-live="polite" aria-atomic="true">Cargando estado de Media Factory…</div>
    <section class="m26-media-control-summary" data-media-control-summary aria-label="Resumen del estado de imágenes"></section>
    <section class="m26-admin-panel m26-media-control-tools" aria-label="Buscar y filtrar inventario">
      <label><span>Buscar ejercicio</span><input type="search" data-media-inventory-search autocomplete="off" placeholder="Nombre, ID, patrón o material"></label>
      <label><span>Estado</span><select data-media-inventory-filter>
        <option value="all">Todos los estados</option>
        <option value="approved">Aprobadas</option>
        <option value="review">Revisión humana</option>
        <option value="active">En cola / generando</option>
        <option value="errors">Fallidas / bloqueadas</option>
        <option value="pending">Pendientes sin imagen IBERFIT</option>
      </select></label>
      <small data-media-inventory-visible aria-live="polite"></small>
    </section>
    <section class="m26-media-control-section" aria-labelledby="m26-media-review-title">
      <header class="m26-media-control-section-head"><div><p class="m26-eyebrow">Control humano</p><h3 id="m26-media-review-title">Pendientes de aprobación</h3></div><span data-media-review-count></span></header>
      <section class="m26-media-review-list" data-media-review-list aria-busy="true"></section>
    </section>
    <section class="m26-media-control-section" aria-labelledby="m26-media-inventory-title">
      <header class="m26-media-control-section-head"><div><p class="m26-eyebrow">Inventario</p><h3 id="m26-media-inventory-title">Todos los ejercicios</h3></div><span data-media-inventory-count></span></header>
      <section class="m26-media-inventory-list" data-media-inventory-list aria-busy="true"></section>
    </section>
  </div>`;
}

function emptyMarkup(){return `<div class="m26-admin-panel m26-media-review-empty"><p class="m26-eyebrow">Revisión humana</p><h3>No hay candidatos esperando aprobación</h3><p>Los ejercicios aparecen aquí únicamente después de superar el QA automático. El inventario completo permanece visible debajo.</p></div>`;}
function errorMarkup(message){return `<div class="m26-admin-panel m26-media-review-error" role="alert"><p class="m26-eyebrow">No se pudo actualizar</p><h3>Centro de Media sigue protegido</h3><p>${esc(message||'No fue posible cargar el estado de Media Factory.')}</p><button type="button" data-media-review-retry>Reintentar</button></div>`;}
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
    <header class="m26-media-review-heading"><div><p class="m26-eyebrow">${esc(candidate.exerciseId)}</p><h3>${esc(exercise)}</h3><p>${esc([candidate.pattern,candidate.equipment,candidate.difficulty].filter(Boolean).join(' · '))}</p></div><span class="m26-badge" data-media-review-state>${esc(stateLabel(state))}</span></header>
    <div class="m26-media-review-compare">${image('START',candidate.startUrl,exercise)}${image('FINAL',candidate.finalUrl,exercise)}</div>
    <dl class="m26-media-review-meta">
      <div><dt>QA biomecánica</dt><dd>${esc(pct(candidate.confidence?.biomechanics))}</dd></div><div><dt>QA visual</dt><dd>${esc(pct(candidate.confidence?.visual))}</dd></div><div><dt>Intentos</dt><dd>${esc(candidate.attempts)}</dd></div><div><dt>QA completado</dt><dd>${esc(date(candidate.timestamps?.qaCompletedAt))}</dd></div><div><dt>SHA</dt><dd><code>${esc(String(candidate.sha256||'').slice(0,16))}…</code></dd></div><div><dt>Workflow</dt><dd><code>${esc(String(candidate.provenance?.workflowSha||'').slice(0,12)||'—')}</code></dd></div>
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
function inventoryGroup(state){
  if(state==='approved')return 'approved';
  if(['awaiting_review','publish_requested','publishing','publish_failed'].includes(state))return 'review';
  if(['queued','regenerating','generating'].includes(state))return 'active';
  if(['failed','blocked'].includes(state))return 'errors';
  return 'pending';
}
function inventoryTone(state){
  if(state==='approved')return 'success';
  if(['failed','blocked','publish_failed'].includes(state))return 'danger';
  if(['awaiting_review','publish_requested','publishing','queued','regenerating','generating'].includes(state))return 'pending';
  return 'neutral';
}
function mediaFailureContext(job,state){
  if(!['failed','blocked','publish_failed'].includes(String(state||'')))return null;
  const reason=String(job?.lastError||'').trim();
  if(state==='publish_failed')return {cause:'publication',title:'Publicación pendiente de resolver',detail:'El candidato no se ha publicado. Conservar la revisión humana y comprobar el motivo antes de reintentar.'};
  if(/^(START_PHASE_QA_FAILED|RAW_PHASE_QA_FAILED)(?::|$)/u.test(reason))return {cause:'quality',title:'No superó el control de calidad',detail:'Revisar la ejecución del movimiento, la anatomía y la calidad visual antes de solicitar otra generación.'};
  if(/^AUTO_FACTORY_DEFERRED:AI_PROVIDER_DAILY_QUOTA_EXHAUSTED$/u.test(reason))return {cause:'capacity',title:'Capacidad de generación agotada',detail:'El proveedor aplazó este trabajo. No se debe publicar un resultado incompleto.'};
  if(/^IBERFIT_AUTO_FACTORY_STAGE_[A-Z0-9_]+(?::|$)/u.test(reason))return {cause:'transfer',title:'Incidencia al preparar la imagen',detail:'La transferencia privada falló; no implica que la ejecución del ejercicio fuera incorrecta.'};
  if(/^workflow_failed_run_[0-9]+_attempt_[0-9]+$/u.test(reason))return {cause:'unclassified',title:'Generación interrumpida',detail:'La ejecución terminó sin un diagnóstico de calidad concluyente. Consultar los registros antes de reintentar.'};
  if(/^AUTO_FACTORY_STALE_RECOVERY$/u.test(reason))return {cause:'interrupted',title:'Proceso interrumpido',detail:'La generación anterior dejó de responder y requiere una recuperación controlada.'};
  return {cause:'unclassified',title:state==='blocked'?'Intentos agotados':'Generación sin completar',detail:'No hay evidencia suficiente para atribuir el problema a la calidad de la imagen. Revisar el registro antes de reintentar.'};
}
function inventoryMarkup(item){
  const state=String(item?.state||'pending');
  const job=item?.job||null;
  const failure=mediaFailureContext(job,state);
  const search=[item?.exerciseName,item?.exerciseId,item?.pattern,item?.equipment,item?.difficulty,stateLabel(state)].filter(Boolean).join(' ').toLowerCase();
  const canRegenerate=Boolean(job?.jobId&&['failed','blocked'].includes(state));
  const preview=item?.publicUrl
    ?`<img class="m26-media-inventory-thumb" src="${esc(item.publicUrl)}" alt="${esc(item.exerciseName||item.exerciseId||'Ejercicio')}" loading="lazy" decoding="async">`
    :`<div class="m26-media-inventory-placeholder" aria-hidden="true"><span>IBERFIT</span></div>`;
  return `<article class="m26-admin-panel m26-media-inventory-item" data-media-inventory-item data-media-state="${esc(state)}" data-media-group="${esc(inventoryGroup(state))}" data-media-search="${esc(search)}">
    ${preview}
    <div class="m26-media-inventory-copy">
      <p class="m26-eyebrow">${esc(item.exerciseId||'Ejercicio')}</p><h4>${esc(item.exerciseName||item.exerciseId||'Ejercicio')}</h4><p>${esc([item.pattern,item.equipment].filter(Boolean).join(' · ')||'Contexto por completar')}</p>
      <div class="m26-media-inventory-status"><span class="m26-badge is-${esc(inventoryTone(state))}">${esc(stateLabel(state))}</span>${job?.attempts?`<small>${esc(job.attempts)} intento${Number(job.attempts)===1?'':'s'}</small>`:''}</div>
      ${failure?`<div class="m26-media-inventory-diagnosis" data-media-error-cause="${esc(failure.cause)}"><strong>${esc(failure.title)}</strong><small>${esc(failure.detail)}</small>${job?.lastError?`<details><summary>Detalle técnico</summary><code>${esc(job.lastError)}</code></details>`:''}</div>`:''}
      ${canRegenerate?`<details class="m26-media-inventory-retry"><summary>Regenerar</summary>${actionForm({jobId:job.jobId,reviewState:job.reviewState},'regenerate','Solicitar nueva generación',{reason:true})}</details>`:''}
    </div>
  </article>`;
}
function summaryMarkup(summary={}){
  const cells=[
    ['Aprobadas',summary.approvedPublished||0,'Listas en Biblioteca y Sesiones'],
    ['Pendientes',summary.pendingCatalog||0,'Sin imagen IBERFIT publicada'],
    ['Revisión humana',summary.awaitingHumanReview||0,'QA automático superado'],
    ['En proceso',Number(summary.queued||0)+Number(summary.regenerating||0)+Number(summary.generating||0),'Cola, regeneración o generación'],
    ['Con incidencia',Number(summary.failed||0)+Number(summary.blocked||0) ,'Generaciones fallidas o intentos agotados'],
  ];
  return cells.map(([label,value,note])=>`<article><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
}
function applyInventoryFilters(root){
  const route=root.querySelector?.('[data-admin-media-review-route]');if(!route)return 0;
  const query=String(route.querySelector?.('[data-media-inventory-search]')?.value||'').trim().toLowerCase();
  const filter=String(route.querySelector?.('[data-media-inventory-filter]')?.value||'all');
  const rows=[...(route.querySelectorAll?.('[data-media-inventory-item]')||[])];
  let visible=0;
  for(const row of rows){
    const matchQuery=!query||String(row.getAttribute?.('data-media-search')||'').includes(query);
    const matchFilter=filter==='all'||String(row.getAttribute?.('data-media-group')||'')===filter;
    row.hidden=!(matchQuery&&matchFilter);
    if(!row.hidden)visible+=1;
  }
  const live=route.querySelector?.('[data-media-inventory-visible]');
  if(live)live.textContent=`${visible} de ${rows.length} ejercicios visibles`;
  return visible;
}
function renderInto(root,{status='loading',summary={},candidates=[],inventory=[],error=null}={}){
  const route=root.querySelector?.('[data-admin-media-review-route]');if(!route)return false;
  const reviewList=route.querySelector?.('[data-media-review-list]'),inventoryList=route.querySelector?.('[data-media-inventory-list]'),summaryNode=route.querySelector?.('[data-media-control-summary]'),live=route.querySelector?.('[data-media-review-live]');
  const reviewCount=route.querySelector?.('[data-media-review-count]'),inventoryCount=route.querySelector?.('[data-media-inventory-count]');
  if(!reviewList||!inventoryList||!summaryNode)return false;
  if(status==='loading'){
    reviewList.setAttribute('aria-busy','true');inventoryList.setAttribute('aria-busy','true');
    reviewList.innerHTML='<div class="m26-admin-panel m26-media-review-loading" aria-hidden="true"><span></span><span></span><span></span></div>';
    inventoryList.innerHTML='<div class="m26-admin-panel m26-media-review-loading" aria-hidden="true"><span></span><span></span><span></span></div>';
    summaryNode.innerHTML='';if(live)live.textContent='Cargando estado de Media Factory…';return true;
  }
  reviewList.setAttribute('aria-busy','false');inventoryList.setAttribute('aria-busy','false');
  if(status==='error'){reviewList.innerHTML=errorMarkup(error);inventoryList.innerHTML='';summaryNode.innerHTML='';if(live)live.textContent='No fue posible cargar Centro de Media.';return true;}
  summaryNode.innerHTML=summaryMarkup(summary);
  reviewList.innerHTML=candidates.length?candidates.map(candidateMarkup).join(''):emptyMarkup();
  inventoryList.innerHTML=inventory.length?inventory.map(inventoryMarkup).join(''):'<div class="m26-admin-panel m26-media-review-empty"><h3>Sin inventario disponible</h3></div>';
  if(reviewCount)reviewCount.textContent=`${candidates.length} pendiente${candidates.length===1?'':'s'}`;
  if(inventoryCount)inventoryCount.textContent=`${inventory.length} ejercicios`;
  applyInventoryFilters(root);
  if(live)live.textContent=`${Number(summary.approvedPublished||0)} aprobadas · ${Number(summary.pendingCatalog||0)} pendientes · ${candidates.length} esperando revisión humana.`;
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
    try{const response=await service.listMediaReview();if(turn!==generation||!active())return false;renderInto(root,{status:'ready',summary:response?.summary||{},candidates:Array.isArray(response?.candidates)?response.candidates:[],inventory:Array.isArray(response?.inventory)?response.inventory:[]});return true;}
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
  function onFilter(event){if(!event.target?.closest?.('[data-media-inventory-search],[data-media-inventory-filter]'))return;applyInventoryFilters(root);}
  function sync(){const area=String(store.getState()?.activeArea||'');if(area===lastArea){if(area===AREA&&active()&&root.querySelector?.('[data-admin-media-review-route]')&&!root.querySelector?.('[data-media-review-job],.m26-media-review-empty,.m26-media-review-error,.m26-media-review-loading'))void load();return;}lastArea=area;if(active())queueMicrotask(()=>load({force:true}));else generation++;}
  return Object.freeze({mount(){root.addEventListener('submit',onSubmit);root.addEventListener('click',onClick);root.addEventListener('input',onFilter);root.addEventListener('change',onFilter);unsubscribe=store.subscribe(sync);sync();},sync,destroy(){generation++;unsubscribe?.();unsubscribe=null;root.removeEventListener('submit',onSubmit);root.removeEventListener('click',onClick);root.removeEventListener('input',onFilter);root.removeEventListener('change',onFilter);}});
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
    try{const response=await service.listMediaReview();if(turn!==generation||!route())return false;renderInto(documentLike,{status:'ready',summary:response?.summary||{},candidates:Array.isArray(response?.candidates)?response.candidates:[],inventory:Array.isArray(response?.inventory)?response.inventory:[]});return true;}
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
  function onFilter(event){if(!event.target?.closest?.('[data-media-inventory-search],[data-media-inventory-filter]'))return;applyInventoryFilters(documentLike);}
  function onPopState(){
    queueMicrotask(()=>{
      if(mediaPath()){const button=mediaNav();if(button&&!route())button.click?.();return;}
      if(route()){const button=documentLike.querySelector?.(`[data-m26-area="${previousArea}"]`)||documentLike.querySelector?.('[data-m26-area="admin-inicio"]');button?.click?.();}
    });
  }
  function mount(){
    ensureMediaReviewStyle(documentLike);globalLike.addEventListener?.(SERVICE_EVENT,onService);globalLike.addEventListener?.('popstate',onPopState);documentLike.addEventListener('submit',onSubmit);documentLike.addEventListener('click',onClick,true);documentLike.addEventListener('input',onFilter);documentLike.addEventListener('change',onFilter);
    const Observer=globalLike.MutationObserver;if(typeof Observer==='function'){observer=new Observer(()=>queueMicrotask(sync));observer.observe(documentLike.documentElement||documentLike.body,{childList:true,subtree:true});}
    sync();return true;
  }
  function destroy(){generation++;observer?.disconnect?.();observer=null;globalLike.removeEventListener?.(SERVICE_EVENT,onService);globalLike.removeEventListener?.('popstate',onPopState);documentLike.removeEventListener('submit',onSubmit);documentLike.removeEventListener('click',onClick,true);documentLike.removeEventListener('input',onFilter);documentLike.removeEventListener('change',onFilter);}
  return Object.freeze({mount,destroy,sync,load});
}
export function installAdminMediaReviewDomBridge({globalLike=globalThis,documentLike=globalLike?.document}={}){
  if(!documentLike?.addEventListener)return null;
  const existing=globalLike?.[BRIDGE_KEY];if(existing?.destroy)return existing;
  const bridge=createAdminMediaReviewDomBridge({globalLike,documentLike});bridge?.mount?.();try{globalLike[BRIDGE_KEY]=bridge;}catch{}return bridge;
}

installAdminMediaReviewDomBridge();

export const __mediaReviewInternals=Object.freeze({candidateMarkup,inventoryMarkup,mediaFailureContext,summaryMarkup,applyInventoryFilters,renderInto,friendly,actionInput,setPending,ensureMediaReviewStyle,rootPath,SERVICE_EVENT,BRIDGE_KEY});