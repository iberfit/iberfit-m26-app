import {
  IRI_PHOTO_CONSENT_VERSION,
  IRI_PHYSICAL_CONSENT_VERSION,
  createIriPhotogrammetryService,
  friendlyIriPhotoError,
  inspectIriPhotoFile,
  iriPhotoCaptureQuality,
  iriPhotoObjectPath,
  latestIriConsent,
  resolveIriPhotogrammetryContext,
} from './iri-photogrammetry-service.js';
import {
  IRI_PHOTO_LANDMARKS,
  IRI_PHOTO_VIEWS,
  calculatePhotogrammetryMeasurements,
  normalizeManualLandmarks,
  photogrammetryDataQuality,
  validateManualLandmarks,
} from './iri-photogrammetry.js';

const VIEW_LABELS=Object.freeze({
  front:'Frontal',
  back:'Posterior',
  left:'Lateral izquierda',
  right:'Lateral derecha',
});
const LANDMARK_LABELS=Object.freeze({
  shoulderLeft:'Referencia hombro izquierda',
  shoulderRight:'Referencia hombro derecha',
  pelvisLeft:'Referencia pelvis izquierda',
  pelvisRight:'Referencia pelvis derecha',
  ear:'Referencia oreja',
  shoulder:'Referencia hombro',
  hip:'Referencia cadera',
  ankle:'Referencia tobillo',
});
const ALL_VIEWS=Object.freeze([...IRI_PHOTO_VIEWS]);

function clean(value,max=1000){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max);
}
function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
}
function granted(consent,type,version){
  return Boolean(consent&&consent.consentType===type&&consent.status==='granted'&&consent.documentVersion===version);
}
function captureIds(latest={}){
  return Object.fromEntries(ALL_VIEWS.map((view)=>[view,latest?.[view]?.id||null]));
}
function analysisCaptureId(analysis,view){
  const key={front:'frontCaptureId',back:'backCaptureId',left:'leftCaptureId',right:'rightCaptureId'}[view];
  return analysis?.[key]||null;
}
export function iriPhotoAnalysisMatchesCapture(analysis,capture,view){
  if(!analysis||!capture)return false;
  return analysisCaptureId(analysis,view)===capture.id;
}
export function landmarksForLatestCaptures(analysis,latest={}){
  const source=normalizeManualLandmarks(analysis?.validatedLandmarks||{});
  const out={};
  for(const view of ALL_VIEWS){
    if(latest?.[view]&&iriPhotoAnalysisMatchesCapture(analysis,latest[view],view)&&source?.[view]){
      out[view]={...source[view]};
    }
  }
  return out;
}
function uuidV4(cryptoLike=globalThis.crypto){
  if(typeof cryptoLike?.randomUUID==='function')return cryptoLike.randomUUID();
  const bytes=new Uint8Array(16);
  if(typeof cryptoLike?.getRandomValues!=='function')throw new Error('M26_IRI_PHOTO_UUID_UNAVAILABLE');
  cryptoLike.getRandomValues(bytes);bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=[...bytes].map((v)=>v.toString(16).padStart(2,'0'));
  return `${hex.slice(0,4).join('')}-${hex.slice(4,6).join('')}-${hex.slice(6,8).join('')}-${hex.slice(8,10).join('')}-${hex.slice(10).join('')}`;
}
function formatDate(value){
  if(!value)return 'Sin fecha';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Santiago'}).format(date);
}
function captureQualityCopy(capture){
  if(!capture)return 'Sin captura';
  const quality=iriPhotoCaptureQuality(capture);
  return quality.level==='good'
    ?`${capture.widthPx}×${capture.heightPx} px · resolución adecuada`
    :`${capture.widthPx}×${capture.heightPx} px · revisar encuadre/calidad`;
}
function qualityLabel(quality){
  if(quality.level==='completa')return '4 vistas · análisis validado';
  if(quality.level==='parcial')return `${quality.analyzedViews}/${quality.capturedViews} vistas analizadas`;
  if(quality.level==='capturas_sin_analisis')return `${quality.capturedViews} vistas capturadas · sin análisis validado`;
  return 'Sin fotogrametría';
}
function pointMarkup(view,key,point){
  const label=LANDMARK_LABELS[key]||key;
  const x=Math.max(0,Math.min(1,Number(point.x)||0))*1000;
  const y=Math.max(0,Math.min(1,Number(point.y)||0))*1000;
  return `<g class="m26-photo-point" data-iri-photo-point="${escapeHtml(view)}:${escapeHtml(key)}" data-x="${Number(point.x)}" data-y="${Number(point.y)}" transform="translate(${x} ${y})" tabindex="0" role="button" aria-label="${escapeHtml(label)}. Mueve con flechas o arrastra."><circle class="m26-photo-point-hit" r="60"></circle><circle class="m26-photo-point-core" r="16"></circle></g>`;
}
function markerButtons(view,landmarks={}){
  return IRI_PHOTO_LANDMARKS[view].map((key)=>{
    const exists=Boolean(landmarks?.[view]?.[key]);
    return `<button type="button" class="m26-photo-landmark-chip${exists?' is-set':''}" data-iri-photo-mark="${escapeHtml(view)}:${escapeHtml(key)}" aria-pressed="false">${escapeHtml(LANDMARK_LABELS[key]||key)}${exists?' · marcada':''}</button>`;
  }).join('');
}
function metricRows(measurements={}){
  const rows=Array.isArray(measurements?.metrics)?measurements.metrics:[];
  if(!rows.length)return '<p class="m26-photo-empty">Aún no hay medidas geométricas.</p>';
  return `<div class="m26-photo-metrics">${rows.map((item)=>`<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}°</strong><small>${escapeHtml(VIEW_LABELS[item.view]||item.view)}</small></div>`).join('')}</div>`;
}

export function createIriPhotogrammetryController({
  root,
  store,
  runtime,
  getToken=async()=>null,
  isOnline=()=>globalThis.navigator?.onLine!==false,
  onDiagnostic=()=>{},
}={}){
  if(!root?.addEventListener||!store?.getState)throw new Error('M26_IRI_PHOTO_CONTROLLER_REQUIRED');
  const service=createIriPhotogrammetryService({runtime});
  let mounted=false,observer=null,loadScheduled=false,busy=false;
  let contextKey='',remote=null,signedUrls={},landmarks={},activeMarker=null;

  function context(){return resolveIriPhotogrammetryContext(store.getState());}
  function host(){return root.querySelector?.('[data-iri-photogrammetry-host]')||null;}
  function status(message,kind='info'){
    const node=host()?.querySelector?.('[data-iri-photo-status]');if(!node)return;
    node.textContent=String(message||'');node.dataset.status=kind;
  }
  function syncPhysicalConsentControl(){
    const control=root.querySelector?.('[name="physicalAssessmentConsent"]');
    if(!control)return;
    const active=granted(remote?.physicalConsent,'physical_assessment',IRI_PHYSICAL_CONSENT_VERSION);
    if(active){control.checked=true;control.dataset.remoteConsent='granted';}
    else delete control.dataset.remoteConsent;
  }
  function currentQuality(){
    const captures=Object.values(remote?.latestCaptures||{});
    const validation=validateManualLandmarks(landmarks,ALL_VIEWS.filter((view)=>remote?.latestCaptures?.[view]));
    return photogrammetryDataQuality({
      captures,
      landmarks,
      validated:remote?.analysis?.status==='validated'&&validation.ok&&ALL_VIEWS.every((view)=>iriPhotoAnalysisMatchesCapture(remote?.analysis,remote?.latestCaptures?.[view],view)),
    });
  }
  function photoConsentActive(){
    return granted(remote?.photographyConsent,'photography',IRI_PHOTO_CONSENT_VERSION);
  }
  function pendingForView(view){
    return (remote?.captures||[])
      .filter((item)=>item.view===view&&item.status==='pending_upload')
      .sort((a,b)=>String(b.capturedAt||b.createdAt||'').localeCompare(String(a.capturedAt||a.createdAt||'')))[0]||null;
  }
  function dimensionsForLatest(latest=remote?.latestCaptures||{}){
    return Object.fromEntries(ALL_VIEWS.flatMap((view)=>{
      const capture=latest?.[view];
      return capture&&Number(capture.widthPx)>0&&Number(capture.heightPx)>0
        ?[[view,{widthPx:Number(capture.widthPx),heightPx:Number(capture.heightPx)}]]
        :[];
    }));
  }
  function captureCard(view){
    const capture=remote?.latestCaptures?.[view]||null;
    const pending=pendingForView(view);
    const url=signedUrls[view]||'';
    const points=landmarks?.[view]||{};
    const photoAllowed=photoConsentActive();
    return `<article class="m26-photo-view" data-iri-photo-view="${view}">
      <div class="m26-photo-view-head"><div><p class="m26-eyebrow">${escapeHtml(VIEW_LABELS[view])}</p><h4>${capture?'Original protegido':'Captura pendiente'}</h4></div><span class="m26-photo-state">${escapeHtml(capture?captureQualityCopy(capture):pending?'Subida incompleta':'Sin foto')}</span></div>
      <div class="m26-photo-stage" data-iri-photo-stage="${view}" tabindex="${url?'0':'-1'}" aria-label="${escapeHtml(VIEW_LABELS[view])}. ${url?'Activa un punto y pulsa sobre la imagen para marcarlo.':'Sin fotografía activa.'}">
        ${url?`<div class="m26-photo-canvas" data-iri-photo-canvas="${view}"><img src="${escapeHtml(url)}" alt="Vista ${escapeHtml(VIEW_LABELS[view].toLowerCase())} para análisis privado" referrerpolicy="no-referrer" draggable="false"><svg class="m26-photo-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="false">${Object.entries(points).map(([key,point])=>pointMarkup(view,key,point)).join('')}</svg></div>`:'<div class="m26-photo-placeholder"><span>Sin vista activa</span><small>El original no se publica en el informe.</small></div>'}
      </div>
      <div class="m26-photo-view-actions">
        <label class="m26-photo-file ${photoAllowed?'':'is-disabled'}">Tomar o elegir foto
          <input type="file" accept="image/jpeg,image/png" capture="environment" data-iri-photo-file="${view}" ${photoAllowed?'':'disabled'} aria-disabled="${photoAllowed?'false':'true'}">
        </label>
        ${pending?`<button type="button" data-iri-photo-recover="${escapeHtml(pending.id)}" data-view="${view}">Recuperar subida</button>`:''}
      </div>
      ${capture?`<p class="m26-photo-meta">Capturada ${escapeHtml(formatDate(capture.capturedAt))} · SHA-256 ${escapeHtml(capture.sha256.slice(0,10))}…</p>`:''}
      ${url?`<div class="m26-photo-landmarks"><p><strong>Referencias visuales.</strong> No representan acromion, EIAS ni otros puntos anatómicos exactos sin validación profesional.</p><div>${markerButtons(view,landmarks)}</div></div>`:''}
    </article>`;
  }
  function render(){
    const node=host();if(!node)return;
    const ctx=context();
    if(!ctx.canManage||!ctx.assessmentId){node.innerHTML='<p class="m26-photo-empty">La fotogrametría está disponible únicamente para Coach/Admin sobre un IRI inicial válido.</p>';return;}
    if(!remote){
      node.innerHTML='<div class="m26-photo-loading" role="status">Cargando evidencia fotográfica privada…</div>';return;
    }
    const physical=granted(remote.physicalConsent,'physical_assessment',IRI_PHYSICAL_CONSENT_VERSION);
    const photo=photoConsentActive();
    const quality=currentQuality();
    const measurements=calculatePhotogrammetryMeasurements(landmarks,{dimensionsByView:dimensionsForLatest()});
    const allCaptured=ALL_VIEWS.every((view)=>Boolean(remote.latestCaptures?.[view]));
    const allMarked=validateManualLandmarks(landmarks,ALL_VIEWS).ok;
    const canValidate=photo&&allCaptured&&allMarked&&!busy;
    const pendingCount=(remote.captures||[]).filter((item)=>item.status==='pending_upload').length;
    node.innerHTML=`<section class="m26-photo-shell" data-iri-photo-loaded="true">
      <header class="m26-photo-intro">
        <div><p class="m26-eyebrow">Fotogrametría privada · opcional</p><h3>Cuatro vistas, geometría reproducible y validación del Coach</h3><p>El original se conserva sin editar. El análisis derivado guarda puntos y medidas por separado. No emite diagnóstico clínico.</p></div>
        <span class="m26-photo-quality" data-quality="${escapeHtml(quality.level)}">${escapeHtml(qualityLabel(quality))}</span>
      </header>
      <section class="m26-photo-consents" aria-label="Consentimientos IRI">
        <article><div><strong>Evaluación física</strong><small>${physical?'Consentimiento registrado':'Se registrará al validar la etapa de entrevista.'}</small></div><span class="${physical?'is-ok':'is-pending'}">${physical?'Registrado':'Pendiente'}</span></article>
        <article><div><strong>Fotografías privadas</strong><small>Uso exclusivo Coach/Admin para este IRI. No se incluyen en el informe por defecto.</small></div>
          <div class="m26-photo-consent-actions">
            <span class="${photo?'is-ok':'is-pending'}">${photo?'Autorizadas':'Sin autorización'}</span>
            <button type="button" data-iri-photo-consent="${photo?'revoke':'grant'}" ${busy?'disabled':''}>${photo?'Revocar nuevas consultas':'Autorizar fotografías'}</button>
          </div>
        </article>
      </section>
      <div class="m26-photo-guidance"><strong>Para repetir la captura con criterio</strong><ul><li>Cuerpo completo y pies visibles.</li><li>Cámara vertical y nivelada, sin inclinación deliberada.</li><li>Distancia y altura de cámara reproducibles.</li><li>Fondo limpio, iluminación suficiente y postura relajada.</li><li>Frontal, posterior, lateral izquierda y lateral derecha.</li></ul></div>
      ${pendingCount?`<p class="m26-photo-notice is-warning">${pendingCount} subida${pendingCount===1?'':'s'} preparada${pendingCount===1?'':'s'} pendiente${pendingCount===1?'':'s'} de finalizar. Puedes recuperarla sin sobrescribir el original.</p>`:''}
      <div class="m26-photo-grid">${ALL_VIEWS.map(captureCard).join('')}</div>
      <section class="m26-photo-analysis">
        <div class="m26-photo-analysis-head"><div><p class="m26-eyebrow">Análisis derivado</p><h4>Medidas geométricas orientativas</h4><p>Los ángulos se calculan exclusivamente desde los puntos que el Coach coloca y valida.</p></div><span>Revisión ${Number(remote.analysis?.revision||0)}</span></div>
        ${metricRows(measurements)}
        <div class="m26-photo-analysis-actions">
          <button type="button" data-iri-photo-analysis="draft" ${photo&&!busy?'':'disabled'}>Guardar borrador</button>
          <button type="button" class="m26-primary-action" data-iri-photo-analysis="validate" ${canValidate?'':'disabled'}>Validar análisis de 4 vistas</button>
        </div>
        <p class="m26-photo-notice">Calidad: ${escapeHtml(qualityLabel(quality))}. ${allCaptured?'Las 4 vistas están presentes.':'Faltan vistas.'} ${allMarked?'Todos los puntos requeridos están marcados.':'Faltan referencias visuales.'}</p>
        <p class="m26-photo-safety"><strong>Sin diagnóstico automático.</strong> Una asimetría geométrica no equivale por sí sola a patología, lesión ni indicación terapéutica.</p>
      </section>
      <p data-iri-photo-status role="status" aria-live="polite"></p>
    </section>`;
    syncPhysicalConsentControl();
    positionPoints();
  }
  function positionPoints(){
    for(const point of root.querySelectorAll?.('[data-iri-photo-point]')||[]){
      const x=Math.max(0,Math.min(1,Number(point.dataset.x)||0))*1000;
      const y=Math.max(0,Math.min(1,Number(point.dataset.y)||0))*1000;
      point.setAttribute?.('transform',`translate(${x} ${y})`);
    }
  }
  function scheduleLoad(){
    if(loadScheduled)return;loadScheduled=true;
    queueMicrotask(()=>{loadScheduled=false;void load().catch((error)=>{onDiagnostic('iri-photogrammetry-load',error);render();status(friendlyIriPhotoError(error),'error');});});
  }
  async function signedUrlsFor(remoteState,token){
    if(!granted(remoteState.photographyConsent,'photography',IRI_PHOTO_CONSENT_VERSION))return {};
    const entries=await Promise.all(ALL_VIEWS.map(async(view)=>{
      const capture=remoteState.latestCaptures?.[view];if(!capture)return [view,''];
      try{return [view,await service.signedUrl(token,{objectPath:capture.objectPath})];}
      catch(error){onDiagnostic('iri-photogrammetry-sign',error);return [view,''];}
    }));
    return Object.fromEntries(entries);
  }
  async function load({force=false}={}){
    const node=host();if(!node)return null;
    const ctx=context();const key=`${ctx.role}:${ctx.clientId||''}:${ctx.assessmentId||''}`;
    if(!ctx.canManage||!ctx.assessmentId){contextKey=key;remote=null;signedUrls={};landmarks={};render();return null;}
    if(!force&&remote&&contextKey===key){
      const node=host();
      if(node&&!node.querySelector?.('[data-iri-photo-loaded="true"]'))render();
      return remote;
    }
    contextKey=key;remote=null;signedUrls={};landmarks={};render();
    const token=await getToken();
    const next=await service.state(token,{assessmentId:ctx.assessmentId});
    if(contextKey!==key)return null;
    remote=next;
    landmarks=landmarksForLatestCaptures(next.analysis,next.latestCaptures);
    signedUrls=await signedUrlsFor(next,token);
    if(contextKey!==key)return null;
    render();return remote;
  }
  async function ensurePhysicalConsent({clientId,assessmentId,accepted,note=''}={}){
    if(!accepted)throw new Error('M26_IRI_PHYSICAL_CONSENT_REQUIRED');
    const ctx=context();
    if(!ctx.canManage||ctx.clientId!==clientId||ctx.assessmentId!==assessmentId)throw new Error('M26_IRI_PHOTO_SCOPE_MISMATCH');
    if(!isOnline())throw new Error('M26_IRI_PHOTO_OFFLINE');
    const token=await getToken();
    let snapshot=remote&&contextKey===`${ctx.role}:${ctx.clientId}:${ctx.assessmentId}`?remote:await service.state(token,{assessmentId});
    const active=latestIriConsent(snapshot.consents,'physical_assessment');
    if(granted(active,'physical_assessment',IRI_PHYSICAL_CONSENT_VERSION))return Object.freeze({ok:true,kind:'already-granted'});
    const result=await service.recordConsent(token,{clientId,assessmentId,consentType:'physical_assessment',status:'granted',documentVersion:IRI_PHYSICAL_CONSENT_VERSION,note});
    await load({force:true});return result;
  }
  async function setPhotoConsent(action){
    const ctx=context();if(!ctx.canManage||!ctx.assessmentId)throw new Error('M26_IRI_PHOTO_SCOPE_MISMATCH');
    if(!isOnline())throw new Error('M26_IRI_PHOTO_OFFLINE');
    const token=await getToken();
    const statusValue=action==='grant'?'granted':'revoked';
    await service.recordConsent(token,{clientId:ctx.clientId,assessmentId:ctx.assessmentId,consentType:'photography',status:statusValue,documentVersion:IRI_PHOTO_CONSENT_VERSION,note:statusValue==='granted'?'Uso privado para fotogrametría IRI.':'Consentimiento fotográfico revocado.'});
    await load({force:true});
  }
  async function uploadView(input){
    const ctx=context(),view=clean(input?.dataset?.iriPhotoFile,20);
    if(!ctx.canManage||!ctx.assessmentId||!ALL_VIEWS.includes(view))throw new Error('M26_IRI_PHOTO_SCOPE_MISMATCH');
    if(!isOnline())throw new Error('M26_IRI_PHOTO_OFFLINE');
    if(!photoConsentActive())throw new Error('M26_IRI_V4_PHOTOGRAPHY_CONSENT_REQUIRED');
    const file=input?.files?.[0];if(!file)throw new Error('M26_IRI_PHOTO_FILE_REQUIRED');
    status(`Comprobando original ${VIEW_LABELS[view].toLowerCase()}…`,'pending');
    const inspected=await inspectIriPhotoFile(file);
    const pending=(remote?.captures||[]).find((item)=>
      item.view===view&&item.status==='pending_upload'&&item.sha256===inspected.sha256&&
      item.sizeBytes===inspected.sizeBytes&&item.mimeType===inspected.mimeType&&
      item.widthPx===inspected.widthPx&&item.heightPx===inspected.heightPx
    );
    const captureId=pending?.id||uuidV4();
    const objectPath=pending?.objectPath||iriPhotoObjectPath(ctx.clientId,ctx.assessmentId,view,captureId,inspected.mimeType);
    const metadata={
      captureId,clientId:ctx.clientId,assessmentId:ctx.assessmentId,view,
      ...inspected,source:'upload',capturedAt:new Date().toISOString(),objectPath,
    };
    const token=await getToken();
    const prepared=await service.prepareCapture(token,metadata);
    if(prepared.status==='active'){await load({force:true});return;}
    status(`Subiendo original ${VIEW_LABELS[view].toLowerCase()} sin sobrescritura…`,'pending');
    await service.uploadOriginal(token,{objectPath,file});
    await service.finalizeCapture(token,{captureId,clientId:ctx.clientId,assessmentId:ctx.assessmentId});
    input.value='';
    await load({force:true});
    status(`${VIEW_LABELS[view]} guardada como original inmutable.`,'success');
  }
  async function recoverCapture(captureId){
    const ctx=context();if(!ctx.canManage||!ctx.assessmentId)throw new Error('M26_IRI_PHOTO_SCOPE_MISMATCH');
    const token=await getToken();
    await service.finalizeCapture(token,{captureId,clientId:ctx.clientId,assessmentId:ctx.assessmentId});
    await load({force:true});status('Subida recuperada y activada.','success');
  }
  function setPoint(view,key,x,y){
    if(!ALL_VIEWS.includes(view)||!IRI_PHOTO_LANDMARKS[view]?.includes(key))return false;
    const nx=Math.max(0,Math.min(1,Number(x))),ny=Math.max(0,Math.min(1,Number(y)));
    if(!Number.isFinite(nx)||!Number.isFinite(ny))return false;
    landmarks={...landmarks,[view]:{...(landmarks[view]||{}),[key]:{x:nx,y:ny}}};
    return true;
  }
  function stagePoint(stage,event){
    const rect=stage?.getBoundingClientRect?.();if(!rect?.width||!rect?.height)return null;
    return {x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height};
  }
  function activateMarker(value){
    const [view,key]=String(value||'').split(':');
    if(!ALL_VIEWS.includes(view)||!IRI_PHOTO_LANDMARKS[view]?.includes(key))return;
    activeMarker={view,key};
    for(const button of root.querySelectorAll?.('[data-iri-photo-mark]')||[]){
      const active=button.dataset.iriPhotoMark===`${view}:${key}`;
      button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',active?'true':'false');
    }
    status(`Marca “${LANDMARK_LABELS[key]}” sobre la vista ${VIEW_LABELS[view].toLowerCase()}.`,'info');
  }
  function handleStageClick(event){
    if(!activeMarker)return false;
    const stage=event.target.closest?.('[data-iri-photo-stage]');if(!stage||stage.dataset.iriPhotoStage!==activeMarker.view)return false;
    const canvas=stage.querySelector?.('[data-iri-photo-canvas]');if(!canvas)return false;
    const point=stagePoint(canvas,event);if(!point)return false;
    setPoint(activeMarker.view,activeMarker.key,point.x,point.y);activeMarker=null;render();status('Referencia visual actualizada. Guarda o valida el análisis cuando esté completo.','success');return true;
  }
  function pointKey(event){
    const button=event.target.closest?.('[data-iri-photo-point]');if(!button)return false;
    const [view,key]=String(button.dataset.iriPhotoPoint||'').split(':');const point=landmarks?.[view]?.[key];if(!point)return false;
    const delta=event.shiftKey ? 0.01 : 0.003;let dx=0,dy=0;
    if(event.key==='ArrowLeft')dx=-delta;else if(event.key==='ArrowRight')dx=delta;else if(event.key==='ArrowUp')dy=-delta;else if(event.key==='ArrowDown')dy=delta;else return false;
    event.preventDefault();setPoint(view,key,point.x+dx,point.y+dy);render();return true;
  }
  function startPointDrag(event){
    const button=event.target.closest?.('[data-iri-photo-point]');if(!button)return false;
    const [view,key]=String(button.dataset.iriPhotoPoint||'').split(':');
    const canvas=button.closest?.('[data-iri-photo-canvas]');if(!canvas)return false;
    event.preventDefault();button.setPointerCapture?.(event.pointerId);
    const move=(moveEvent)=>{const point=stagePoint(canvas,moveEvent);if(point){setPoint(view,key,point.x,point.y);button.dataset.x=String(point.x);button.dataset.y=String(point.y);button.setAttribute?.('transform',`translate(${Math.max(0,Math.min(1,point.x))*1000} ${Math.max(0,Math.min(1,point.y))*1000})`);}}
    const end=()=>{button.removeEventListener('pointermove',move);button.removeEventListener('pointerup',end);button.removeEventListener('pointercancel',end);render();};
    button.addEventListener('pointermove',move);button.addEventListener('pointerup',end);button.addEventListener('pointercancel',end);
    return true;
  }
  async function saveAnalysis(validate){
    const ctx=context();if(!ctx.canManage||!ctx.assessmentId)throw new Error('M26_IRI_PHOTO_SCOPE_MISMATCH');
    if(!photoConsentActive())throw new Error('M26_IRI_V4_PHOTOGRAPHY_CONSENT_REQUIRED');
    const latest=remote?.latestCaptures||{};const ids=captureIds(latest);
    const available=ALL_VIEWS.filter((view)=>latest[view]);
    const check=validateManualLandmarks(landmarks,validate?ALL_VIEWS:available);
    if(validate&&(!ALL_VIEWS.every((view)=>latest[view])||!check.ok))throw new Error('M26_IRI_PHOTO_ANALYSIS_INCOMPLETE');
    const normalized=normalizeManualLandmarks(landmarks);
    const measurements=calculatePhotogrammetryMeasurements(normalized,{dimensionsByView:dimensionsForLatest(latest)});
    const token=await getToken();
    await service.saveAnalysis(token,{
      clientId:ctx.clientId,assessmentId:ctx.assessmentId,baseRevision:Number(remote?.analysis?.revision||0),
      captureIds:ids,validatedLandmarks:normalized,measurements,validate,
    });
    await load({force:true});status(validate?'Análisis validado por el Coach.':'Borrador de análisis guardado.','success');
  }

  async function onClick(event){
    const consent=event.target.closest?.('[data-iri-photo-consent]');
    const recover=event.target.closest?.('[data-iri-photo-recover]');
    const mark=event.target.closest?.('[data-iri-photo-mark]');
    const analysis=event.target.closest?.('[data-iri-photo-analysis]');
    if(mark){event.preventDefault();activateMarker(mark.dataset.iriPhotoMark);return;}
    if(handleStageClick(event)){event.preventDefault();return;}
    if(!consent&&!recover&&!analysis)return;
    event.preventDefault();if(busy)return;busy=true;render();
    try{
      if(consent)await setPhotoConsent(consent.dataset.iriPhotoConsent);
      else if(recover)await recoverCapture(recover.dataset.iriPhotoRecover);
      else if(analysis)await saveAnalysis(analysis.dataset.iriPhotoAnalysis==='validate');
    }catch(error){onDiagnostic('iri-photogrammetry-action',error);render();status(friendlyIriPhotoError(error),'error');}
    finally{busy=false;render();}
  }
  async function onChange(event){
    const input=event.target.closest?.('[data-iri-photo-file]');if(!input)return;
    if(busy)return;busy=true;render();
    try{await uploadView(input);}
    catch(error){onDiagnostic('iri-photogrammetry-upload',error);render();status(friendlyIriPhotoError(error),'error');}
    finally{busy=false;render();}
  }
  function onPointerDown(event){startPointDrag(event);}
  function onKeyDown(event){pointKey(event);}
  function mount(){
    if(mounted)return;
    root.addEventListener('click',onClick);
    root.addEventListener('change',onChange);
    root.addEventListener('pointerdown',onPointerDown);
    root.addEventListener('keydown',onKeyDown);
    if(typeof MutationObserver==='function'){
      observer=new MutationObserver(()=>scheduleLoad());
      observer.observe(root,{childList:true,subtree:true});
    }
    scheduleLoad();mounted=true;
  }
  function destroy(){
    if(!mounted)return;observer?.disconnect?.();observer=null;
    root.removeEventListener('click',onClick);root.removeEventListener('change',onChange);
    root.removeEventListener('pointerdown',onPointerDown);root.removeEventListener('keydown',onKeyDown);
    mounted=false;remote=null;signedUrls={};landmarks={};activeMarker=null;contextKey='';
  }
  return Object.freeze({mount,destroy,load,ensurePhysicalConsent});
}

export const __iriPhotogrammetryControllerInternals=Object.freeze({
  clean,escapeHtml,granted,captureIds,analysisCaptureId,uuidV4,formatDate,captureQualityCopy,qualityLabel,
});
