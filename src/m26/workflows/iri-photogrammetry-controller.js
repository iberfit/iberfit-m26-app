import {
  IRI_PHOTO_CONSENT_VERSION,
  IRI_PHOTO_REPORT_PERMISSION_VERSION,
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
  normalizeManualLandmarks,
  validateManualLandmarks,
} from './iri-photogrammetry.js';
import {
  calculatePhotogrammetryMeasurementsV2,
  interpretPhotogrammetryMeasurementsV2,
  normalizePhotoCalibrations,
  photogrammetryDataQualityV2,
  photogrammetryOverlaySegmentsV2,
} from './iri-photogrammetry-v2.js';
import {buildIriPhotogrammetryDecisionSupport} from './iri-evidence-engine.js';

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
export function iriPhotoMutationRequiresReload(records,hostNode){
  if(!hostNode)return true;
  return Array.from(records||[]).some((record)=>{
    const target=record?.target;
    return Boolean(target)&&target!==hostNode&&!hostNode.contains?.(target);
  });
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
  return `<g class="m26-photo-point" data-iri-photo-point="${escapeHtml(view)}:${escapeHtml(key)}" data-x="${Number(point.x)}" data-y="${Number(point.y)}" transform="translate(${x} ${y})" tabindex="0" role="button" aria-label="${escapeHtml(label)}. Mueve con flechas o arrastra."><circle class="m26-photo-point-hit" r="54"></circle><circle class="m26-photo-point-core" r="8"></circle></g>`;
}
function markerButtons(view,landmarks={}){
  return IRI_PHOTO_LANDMARKS[view].map((key)=>{
    const exists=Boolean(landmarks?.[view]?.[key]);
    return `<button type="button" class="m26-photo-landmark-chip${exists?' is-set':''}" data-iri-photo-mark="${escapeHtml(view)}:${escapeHtml(key)}" aria-pressed="false">${escapeHtml(LANDMARK_LABELS[key]||key)}${exists?' · marcada':''}</button>`;
  }).join('');
}
function interpretationRows(interpretation={}){
  if(!interpretation?.available)return '<p class="m26-photo-notice">Cuando completes y valides las cuatro vistas, aquí aparecerá una lectura sencilla de lo que muestran las fotos.</p>';
  const signals=Array.isArray(interpretation.reproducibleSignals)?interpretation.reproducibleSignals:[];
  const differences=(Array.isArray(interpretation.observations)?interpretation.observations:[]).filter((item)=>item?.kind==='bilateral_difference');
  const signalHtml=signals.length
    ?signals.map((item)=>`<article class="m26-photo-finding"><span>Patrón que se repite</span><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.direction)} · frontal ${Number(item.frontDeg).toFixed(1)}° · posterior ${Number(item.backDeg).toFixed(1)}°</p><small>${escapeHtml(item.message)}</small></article>`).join('')
    :'<article class="m26-photo-finding"><span>Sin un patrón que se repita</span><strong>Las pequeñas inclinaciones no aparecen igual en frontal y posterior.</strong><p>En conjunto, estas fotos no muestran una asimetría que se repita de forma clara.</p></article>';
  const differenceHtml=differences.map((item)=>`<article class="m26-photo-finding"><span>Comparación entre lados</span><strong>${escapeHtml(item.label)}</strong><p>Diferencia de ${Number(item.differenceDeg).toFixed(1)}° entre ambas vistas laterales.</p></article>`).join('');
  return `<div class="m26-photo-findings">${signalHtml}${differenceHtml}</div><p class="m26-photo-notice">Estas medidas describen la postura de este momento. Nos sirven como referencia inicial y se interpretan junto con movilidad, fuerza y movimiento. Sin diagnóstico médico automático.</p>`;
}

function metricValue(item={}){
  const value=Number(item?.value);
  if(!Number.isFinite(value))return '—';
  const unit=item?.unit==='cm'?' cm':'°';
  return `${value.toFixed(1)}${unit}`;
}
function metricRows(measurements={}){
  const rows=Array.isArray(measurements?.metrics)?measurements.metrics:[];
  if(!rows.length)return '<p class="m26-photo-empty">Aún no hay medidas geométricas.</p>';
  return `<div class="m26-photo-metrics">${rows.map((item)=>`<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(metricValue(item))}</strong><small>${escapeHtml(VIEW_LABELS[item.view]||item.view)} · ${item.kind==='calibrated_geometry'?'calibrada':'angular'}</small></div>`).join('')}</div>`;
}
const SEGMENT_METRICS=Object.freeze({
  shoulders:Object.freeze(['shoulderTilt','shoulderHeightDifference']),
  pelvis:Object.freeze(['pelvisTilt','pelvisHeightDifference']),
  head:Object.freeze(['headOffset','earShoulderHorizontal']),
  trunk:Object.freeze(['trunkInclination','shoulderHipHorizontal']),
  lowerAxis:Object.freeze(['bodyAxis']),
});
function segmentValue(view,id,measurements={}){
  const rows=Array.isArray(measurements?.metrics)?measurements.metrics:[];
  const suffixes=SEGMENT_METRICS[id]||[];
  return rows.filter((item)=>item?.view===view&&suffixes.some((suffix)=>String(item.id||'').endsWith(`.${suffix}`)))
    .map(metricValue).filter((value)=>value!=='—').join(' · ');
}
function overlayMarkup(view,landmarks,measurements,calibrationByView={}){
  const segments=photogrammetryOverlaySegmentsV2(view,landmarks);
  const segmentHtml=segments.map((segment)=>{
    const x1=segment.a.x*1000,y1=segment.a.y*1000,x2=segment.b.x*1000,y2=segment.b.y*1000;
    const label=segmentValue(view,segment.id,measurements);
    const mx=(x1+x2)/2,my=(y1+y2)/2;
    return `<g class="m26-photo-segment" data-iri-photo-segment="${escapeHtml(view)}:${escapeHtml(segment.id)}" data-from="${escapeHtml(segment.from)}" data-to="${escapeHtml(segment.to)}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line><text x="${mx}" y="${my-18}" text-anchor="middle" data-iri-photo-segment-value>${escapeHtml(label)}</text></g>`;
  }).join('');
  const calibration=calibrationByView?.[view];
  const calibrationHtml=calibration
    ?`<g class="m26-photo-calibration-line" data-iri-photo-calibration-line="${escapeHtml(view)}"><line x1="${calibration.pointA.x*1000}" y1="${calibration.pointA.y*1000}" x2="${calibration.pointB.x*1000}" y2="${calibration.pointB.y*1000}"></line><text x="${((calibration.pointA.x+calibration.pointB.x)/2)*1000}" y="${((calibration.pointA.y+calibration.pointB.y)/2)*1000-18}" text-anchor="middle">${escapeHtml(Number(calibration.knownLengthCm).toFixed(1))} cm · referencia</text></g>`
    :'';
  return calibrationHtml+segmentHtml;
}
function decisionRows(support={}){
  if(!support?.available)return '<p class="m26-photo-notice">La lectura integrada se habilita al validar las cuatro vistas.</p>';
  const findings=Array.isArray(support.findings)?support.findings:[];
  if(!findings.length)return '<p class="m26-photo-notice">No aparece ningún patrón que necesite cambiar el entrenamiento por sí solo.</p>';
  return `<div class="m26-photo-findings">${findings.map((item)=>`<article class="m26-photo-finding"><span>${item.support==='multi_source'?'Coincide con otras pruebas':'Dato de esta evaluación'}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.meaning)}</p><small>${escapeHtml(item.action)}</small></article>`).join('')}</div>`;
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
  let mounted=false,observer=null,loadScheduled=false,loadInFlight=null,loadInFlightKey='',busy=false;
  let contextKey='',remote=null,signedUrls={},landmarks={},calibrationByView={},activeMarker=null,calibrationMarker=null,activeView='front';

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
    return photogrammetryDataQualityV2({
      captures,
      landmarks,
      calibrationByView,
      validated:remote?.analysis?.status==='validated'&&validation.ok&&ALL_VIEWS.every((view)=>iriPhotoAnalysisMatchesCapture(remote?.analysis,remote?.latestCaptures?.[view],view)),
    });
  }
  function currentAssessmentDraft(){
    const state=store.getState()||{};
    const assessmentId=context().assessmentId;
    const record=(state?.collections?.iriAssessments||[]).find((item)=>String(item?.id||item?.body?.id||'')===String(assessmentId||''))||{};
    const body=record?.body&&typeof record.body==='object'?record.body:record;
    return body?.firstSessionDraft||body?.first_session_draft||body?.firstSession||body;
  }
  function currentMeasurements(latest=remote?.latestCaptures||{}){
    return calculatePhotogrammetryMeasurementsV2(landmarks,{
      dimensionsByView:dimensionsForLatest(latest),
      calibrationByView,
    });
  }
  function currentDecisionSupport(measurements=currentMeasurements(),quality=currentQuality()){
    return buildIriPhotogrammetryDecisionSupport({measurements,quality,draft:currentAssessmentDraft()});
  }
  function reportPermissionActive(){
    return remote?.reportPermission?.status==='granted';
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
    const measurements=currentMeasurements();
    const calibration=calibrationByView?.[view]||null;
    return `<article class="m26-photo-view${activeView===view?' is-active':''}" data-iri-photo-view="${view}" data-active="${activeView===view?'true':'false'}" aria-hidden="${activeView===view?'false':'true'}">
      <div class="m26-photo-view-head"><div><p class="m26-eyebrow">${escapeHtml(VIEW_LABELS[view])}</p><h4>${capture?'Original protegido':'Captura pendiente'}</h4></div><span class="m26-photo-state">${escapeHtml(capture?captureQualityCopy(capture):pending?'Subida incompleta':'Sin foto')}</span></div>
      <div class="m26-photo-stage" data-iri-photo-stage="${view}" tabindex="${url?'0':'-1'}" aria-label="${escapeHtml(VIEW_LABELS[view])}. ${url?'Activa una referencia o una calibración y pulsa sobre la imagen.':'Sin fotografía activa.'}">
        ${url?`<div class="m26-photo-canvas" data-iri-photo-canvas="${view}"><img src="${escapeHtml(url)}" alt="Vista ${escapeHtml(VIEW_LABELS[view].toLowerCase())} para análisis privado" referrerpolicy="no-referrer" draggable="false"><svg class="m26-photo-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="false">${overlayMarkup(view,landmarks,measurements,calibrationByView)}${Object.entries(points).map(([key,point])=>pointMarkup(view,key,point)).join('')}</svg></div>`:'<div class="m26-photo-placeholder"><span>Sin vista activa</span><small>El original permanece privado.</small></div>'}
      </div>
      <div class="m26-photo-view-actions">
        <label class="m26-photo-file ${photoAllowed?'':'is-disabled'}">Tomar o elegir foto
          <input type="file" accept="image/jpeg,image/png" capture="environment" data-iri-photo-file="${view}" ${photoAllowed?'':'disabled'} aria-disabled="${photoAllowed?'false':'true'}">
        </label>
        ${pending?`<button type="button" data-iri-photo-recover="${escapeHtml(pending.id)}" data-view="${view}">Recuperar subida</button>`:''}
      </div>
      ${capture?`<p class="m26-photo-meta">Capturada ${escapeHtml(formatDate(capture.capturedAt))} · SHA-256 ${escapeHtml(capture.sha256.slice(0,10))}…</p>`:''}
      ${url?`<div class="m26-photo-landmarks"><p><strong>Puntos y líneas.</strong> Coloca las referencias y la app actualiza ángulos y segmentos. El Coach valida el resultado.</p><div>${markerButtons(view,landmarks)}</div></div>
      <div class="m26-photo-calibration">
        <div><strong>Escala física opcional</strong><small>Para obtener centímetros, coloca una regla/objeto de longitud conocida en el mismo plano que la persona.</small></div>
        <label>Longitud real <input type="number" min="1" max="300" step="0.1" inputmode="decimal" data-iri-photo-calibration-length="${view}" value="${calibration?escapeHtml(calibration.knownLengthCm):''}" placeholder="cm"> cm</label>
        <button type="button" data-iri-photo-calibrate="${view}">${calibration?'Recalibrar':'Marcar 2 puntos de escala'}</button>
        <span>${calibration?`Calibrada con ${escapeHtml(Number(calibration.knownLengthCm).toFixed(1))} cm`:'Sin escala: sólo ángulos'}</span>
      </div>`:''}
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
    const measurements=currentMeasurements();
    const interpretation=interpretPhotogrammetryMeasurementsV2(measurements,{quality});
    const decisionSupport=currentDecisionSupport(measurements,quality);
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
        <article><div><strong>Fotografías privadas</strong><small>Autoriza captura, almacenamiento privado y análisis técnico para este IRI.</small></div>
          <div class="m26-photo-consent-actions">
            <span class="${photo?'is-ok':'is-pending'}">${photo?'Autorizadas':'Sin autorización'}</span>
            <button type="button" data-iri-photo-consent="${photo?'revoke':'grant'}" ${busy?'disabled':''}>${photo?'Revocar nuevas consultas':'Autorizar fotografías'}</button>
          </div>
        </article>
        <article><div><strong>Fotos en informe Cliente</strong><small>Permiso independiente: el análisis puede existir sin publicar las imágenes en el documento entregable.</small></div>
          <div class="m26-photo-consent-actions">
            <span class="${reportPermissionActive()?'is-ok':'is-pending'}">${reportPermissionActive()?'Permitidas':'No permitidas'}</span>
            <button type="button" data-iri-photo-report-permission="${reportPermissionActive()?'revoke':'grant'}" ${photo&&!busy?'':'disabled'}>${reportPermissionActive()?'No incluir fotos':'Permitir fotos en informe'}</button>
          </div>
        </article>
      </section>
      <div class="m26-photo-guidance"><strong>Para repetir la captura con criterio</strong><ul><li>Cuerpo completo y pies visibles.</li><li>Cámara vertical y nivelada, sin inclinación deliberada.</li><li>Distancia y altura de cámara reproducibles.</li><li>Fondo limpio, iluminación suficiente y postura relajada.</li><li>Frontal, posterior, lateral izquierda y lateral derecha.</li></ul></div>
      <nav class="m26-photo-view-selector" aria-label="Vistas de fotogrametría">
        ${ALL_VIEWS.map((view)=>`<button type="button" data-iri-photo-view-select="${view}" aria-pressed="${activeView===view?'true':'false'}" class="${activeView===view?'is-active':''}"><span>${escapeHtml(VIEW_LABELS[view])}</span><small>${remote.latestCaptures?.[view]?'Capturada':'Pendiente'}</small></button>`).join('')}
      </nav>
      ${pendingCount?`<p class="m26-photo-notice is-warning">${pendingCount} subida${pendingCount===1?'':'s'} preparada${pendingCount===1?'':'s'} pendiente${pendingCount===1?'':'s'} de finalizar. Puedes recuperarla sin sobrescribir el original.</p>`:''}
      <div class="m26-photo-grid">${ALL_VIEWS.map(captureCard).join('')}</div>
      <section class="m26-photo-analysis">
        <div class="m26-photo-analysis-head"><div><p class="m26-eyebrow">Análisis derivado · v2</p><h4>Ángulos, distancias calibradas y evidencia cruzada</h4><p>Los ángulos nacen de los puntos validados. Los centímetros sólo aparecen cuando existe una escala física explícita.</p></div><span data-iri-analysis-revision="${Number(remote.analysisV2?.revision||0)}">Motor v2 · revisión ${Number(remote.analysisV2?.revision||0)}</span></div>
        ${metricRows(measurements)}
        <div class="m26-photo-interpretation"><p class="m26-eyebrow">Qué vemos en las fotos</p>${interpretationRows(interpretation)}</div>
        <div class="m26-photo-interpretation"><p class="m26-eyebrow">Qué significa para el entrenamiento</p>${decisionRows(decisionSupport)}</div>
        <div class="m26-photo-analysis-actions">
          <button type="button" data-iri-photo-analysis="draft" ${photo&&!busy?'':'disabled'}>Guardar borrador</button>
          <button type="button" class="m26-primary-action" data-iri-photo-analysis="validate" ${canValidate?'':'disabled'}>Validar análisis de 4 vistas</button>
        </div>
        <p class="m26-photo-notice">Calidad: ${escapeHtml(qualityLabel(quality))}. ${allCaptured?'Las 4 vistas están presentes.':'Faltan vistas.'} ${allMarked?'Todos los puntos requeridos están marcados.':'Faltan referencias visuales.'}</p>
        <p class="m26-photo-safety"><strong>Una foto no decide el plan por sí sola.</strong> IBERFIT usa estas medidas como una referencia más, junto con movilidad, fuerza, movimiento y evolución. Una diferencia postural aislada no significa lesión ni enfermedad. <strong>Sin diagnóstico médico automático.</strong></p>
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
  function positionOverlay(view){
    const measurements=currentMeasurements();
    for(const group of root.querySelectorAll?.(`[data-iri-photo-segment^="${view}:"]`)||[]){
      const from=landmarks?.[view]?.[group.dataset.from],to=landmarks?.[view]?.[group.dataset.to];
      if(!from||!to)continue;
      const line=group.querySelector?.('line'),label=group.querySelector?.('[data-iri-photo-segment-value]');
      const x1=from.x*1000,y1=from.y*1000,x2=to.x*1000,y2=to.y*1000;
      line?.setAttribute?.('x1',x1);line?.setAttribute?.('y1',y1);line?.setAttribute?.('x2',x2);line?.setAttribute?.('y2',y2);
      if(label){label.setAttribute?.('x',(x1+x2)/2);label.setAttribute?.('y',(y1+y2)/2-18);label.textContent=segmentValue(view,String(group.dataset.iriPhotoSegment||'').split(':')[1],measurements);}
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
    if(!ctx.canManage||!ctx.assessmentId){contextKey=key;remote=null;signedUrls={};landmarks={};calibrationByView={};render();return null;}
    if(!force&&remote&&contextKey===key){
      const currentHost=host();
      if(currentHost&&!currentHost.querySelector?.('[data-iri-photo-loaded="true"]'))render();
      return remote;
    }
    if(!force&&loadInFlight&&loadInFlightKey===key)return loadInFlight;
    if(force&&loadInFlight&&loadInFlightKey===key){
      try{await loadInFlight;}catch{}
    }
    const run=(async()=>{
      contextKey=key;remote=null;signedUrls={};landmarks={};calibrationByView={};render();
      const token=await getToken();
      const next=await service.state(token,{assessmentId:ctx.assessmentId});
      if(contextKey!==key)return null;
      remote=next;
      landmarks=landmarksForLatestCaptures(next.analysis,next.latestCaptures);
      calibrationByView=normalizePhotoCalibrations(next.analysisV2?.calibration||{});
      signedUrls=await signedUrlsFor(next,token);
      if(contextKey!==key)return null;
      render();return remote;
    })();
    loadInFlight=run;loadInFlightKey=key;
    try{return await run;}
    finally{
      if(loadInFlight===run){loadInFlight=null;loadInFlightKey='';}
    }
  }
  async function clientSnapshotForPdf(assessmentId,{audience='client'}={}){
    const requested=clean(assessmentId,80);
    const targetAudience=audience==='coach'?'coach':'client';
    const ctx=context();
    if(!requested||!ctx.canManage||ctx.assessmentId!==requested)throw new Error('M26_IRI_PHOTO_SCOPE_MISMATCH');
    if(!isOnline())throw new Error('M26_IRI_PHOTO_OFFLINE');
    const token=await getToken();
    const snapshot=await service.state(token,{assessmentId:requested});
    if(!granted(snapshot.photographyConsent,'photography',IRI_PHOTO_CONSENT_VERSION)){
      return Object.freeze({assessmentId:requested,available:false,reason:'consent',photos:Object.freeze([]),photosAllowed:false,quality:Object.freeze({level:'sin_datos',capturedViews:0,analyzedViews:0,validated:false}),interpretation:null,decisionSupport:null});
    }
    const latest=snapshot.latestCaptures||{};
    const linkedLandmarks=landmarksForLatestCaptures(snapshot.analysis,latest);
    const linkedCalibration=normalizePhotoCalibrations(snapshot.analysisV2?.calibration||{});
    const validation=validateManualLandmarks(linkedLandmarks,ALL_VIEWS.filter((view)=>latest?.[view]));
    const validated=Boolean(
      snapshot.analysis?.status==='validated'&&validation.ok&&ALL_VIEWS.every((view)=>iriPhotoAnalysisMatchesCapture(snapshot.analysis,latest?.[view],view))
    );
    const quality=photogrammetryDataQualityV2({captures:Object.values(latest),landmarks:linkedLandmarks,calibrationByView:linkedCalibration,validated});
    const measurements=snapshot.analysis?.measurements&&typeof snapshot.analysis.measurements==='object'?structuredClone(snapshot.analysis.measurements):{};
    const interpretation=interpretPhotogrammetryMeasurementsV2(measurements,{quality});
    const decisionSupport=snapshot.analysisV2?.decisionSupport&&typeof snapshot.analysisV2.decisionSupport==='object'
      ?structuredClone(snapshot.analysisV2.decisionSupport)
      :buildIriPhotogrammetryDecisionSupport({measurements,quality,draft:currentAssessmentDraft()});
    const photosAllowed=targetAudience==='coach'||snapshot.reportPermission?.status==='granted';
    const urls=photosAllowed?await signedUrlsFor(snapshot,token):{};
    const photos=photosAllowed?ALL_VIEWS.flatMap((view)=>{
      const capture=latest?.[view],url=urls?.[view];
      if(!capture||!url)return [];
      return [Object.freeze({
        view,url,capturedAt:capture.capturedAt||capture.createdAt||null,
        widthPx:Number(capture.widthPx)||null,heightPx:Number(capture.heightPx)||null,
      })];
    }):[];
    return Object.freeze({
      assessmentId:requested,
      available:Boolean(snapshot.analysis||photos.length),
      reason:photos.length?'':photosAllowed?'analysis-only':'report-permission',
      audience:targetAudience,
      photosAllowed,
      photos:Object.freeze(photos),
      landmarks:structuredClone(linkedLandmarks),
      calibration:structuredClone(linkedCalibration),
      quality,
      analysisStatus:snapshot.analysis?.status||null,
      analysisRevision:Number(snapshot.analysisV2?.revision||snapshot.analysis?.revision||0),
      protocolVersion:snapshot.analysisV2?.protocolVersion||snapshot.analysis?.protocolVersion||null,
      measurements,
      interpretation,
      decisionSupport,
    });
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
  async function setReportPermission(action){
    const ctx=context();if(!ctx.canManage||!ctx.assessmentId)throw new Error('M26_IRI_PHOTO_SCOPE_MISMATCH');
    if(!isOnline())throw new Error('M26_IRI_PHOTO_OFFLINE');
    if(!photoConsentActive())throw new Error('M26_IRI_V4_PHOTOGRAPHY_CONSENT_REQUIRED');
    const statusValue=action==='grant'?'granted':'revoked';
    const token=await getToken();
    await service.recordReportPermission(token,{
      clientId:ctx.clientId,assessmentId:ctx.assessmentId,status:statusValue,
      documentVersion:IRI_PHOTO_REPORT_PERMISSION_VERSION,
      note:statusValue==='granted'?'Autorizada la inclusión de fotografías IRI en el informe Cliente.':'Fotografías excluidas del informe Cliente.',
    });
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
    calibrationMarker=null;
    activeMarker={view,key};
    for(const button of root.querySelectorAll?.('[data-iri-photo-mark]')||[]){
      const active=button.dataset.iriPhotoMark===`${view}:${key}`;
      button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',active?'true':'false');
    }
    status(`Marca “${LANDMARK_LABELS[key]}” sobre la vista ${VIEW_LABELS[view].toLowerCase()}.`,'info');
  }
  function beginCalibration(button){
    const view=String(button?.dataset?.iriPhotoCalibrate||'');
    if(!ALL_VIEWS.includes(view))return false;
    const card=button.closest?.('[data-iri-photo-view]');
    const input=card?.querySelector?.(`[data-iri-photo-calibration-length="${view}"]`);
    const knownLengthCm=Number(input?.value);
    if(!Number.isFinite(knownLengthCm)||knownLengthCm<1||knownLengthCm>300){
      status('Introduce una longitud real entre 1 y 300 cm antes de marcar la escala.','error');return false;
    }
    activeMarker=null;
    calibrationMarker={view,knownLengthCm,pointA:null};
    status(`Calibración ${VIEW_LABELS[view].toLowerCase()}: marca el primer extremo de la referencia de ${knownLengthCm.toFixed(1)} cm.`,'info');
    return true;
  }
  function handleStageClick(event){
    const stage=event.target.closest?.('[data-iri-photo-stage]');if(!stage)return false;
    const canvas=stage.querySelector?.('[data-iri-photo-canvas]');if(!canvas)return false;
    const point=stagePoint(canvas,event);if(!point)return false;
    if(calibrationMarker&&stage.dataset.iriPhotoStage===calibrationMarker.view){
      if(!calibrationMarker.pointA){
        calibrationMarker={...calibrationMarker,pointA:point};
        status('Primer extremo marcado. Marca ahora el segundo extremo de la referencia conocida.','info');
      }else{
        if(calibrationMarker.pointA.x===point.x&&calibrationMarker.pointA.y===point.y){status('Los dos puntos de calibración deben ser distintos.','error');return true;}
        calibrationByView={...calibrationByView,[calibrationMarker.view]:{
          knownLengthCm:calibrationMarker.knownLengthCm,
          pointA:calibrationMarker.pointA,
          pointB:point,
          label:'Referencia física',
        }};
        calibrationMarker=null;render();status('Escala calibrada. Las medidas lineales en centímetros ya están disponibles para esta vista.','success');
      }
      return true;
    }
    if(!activeMarker||stage.dataset.iriPhotoStage!==activeMarker.view)return false;
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
    const move=(moveEvent)=>{const point=stagePoint(canvas,moveEvent);if(point){setPoint(view,key,point.x,point.y);button.dataset.x=String(point.x);button.dataset.y=String(point.y);button.setAttribute?.('transform',`translate(${Math.max(0,Math.min(1,point.x))*1000} ${Math.max(0,Math.min(1,point.y))*1000})`);positionOverlay(view);}}
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
    const measurements=currentMeasurements(latest);
    const quality=photogrammetryDataQualityV2({captures:Object.values(latest),landmarks:normalized,calibrationByView,validated:Boolean(validate)});
    const decisionSupport=buildIriPhotogrammetryDecisionSupport({measurements,quality,draft:currentAssessmentDraft()});
    const token=await getToken();
    await service.saveAnalysisV2(token,{
      clientId:ctx.clientId,assessmentId:ctx.assessmentId,baseRevision:Number(remote?.analysisV2?.revision||0),
      captureIds:ids,validatedLandmarks:normalized,calibration:calibrationByView,measurements,decisionSupport,validate,
    });
    await load({force:true});status(validate?'Análisis v2 validado por el Coach y conservado como nueva revisión.':'Nueva revisión de borrador v2 guardada.','success');
  }

  async function onClick(event){
    const viewSelect=event.target.closest?.('[data-iri-photo-view-select]');
    if(viewSelect){
      event.preventDefault();
      const view=String(viewSelect.dataset.iriPhotoViewSelect||'');
      if(ALL_VIEWS.includes(view)){activeView=view;render();status(`Vista ${VIEW_LABELS[view].toLowerCase()} activa.`,'info');}
      return;
    }
    const consent=event.target.closest?.('[data-iri-photo-consent]');
    const reportPermission=event.target.closest?.('[data-iri-photo-report-permission]');
    const calibrate=event.target.closest?.('[data-iri-photo-calibrate]');
    const recover=event.target.closest?.('[data-iri-photo-recover]');
    const mark=event.target.closest?.('[data-iri-photo-mark]');
    const analysis=event.target.closest?.('[data-iri-photo-analysis]');
    if(mark){event.preventDefault();activateMarker(mark.dataset.iriPhotoMark);return;}
    if(calibrate){event.preventDefault();beginCalibration(calibrate);return;}
    if(handleStageClick(event)){event.preventDefault();return;}
    if(!consent&&!reportPermission&&!recover&&!analysis)return;
    event.preventDefault();if(busy)return;busy=true;render();
    try{
      if(consent)await setPhotoConsent(consent.dataset.iriPhotoConsent);
      else if(reportPermission)await setReportPermission(reportPermission.dataset.iriPhotoReportPermission);
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
      observer=new MutationObserver((records)=>{
        if(iriPhotoMutationRequiresReload(records,host()))scheduleLoad();
      });
      observer.observe(root,{childList:true,subtree:true});
    }
    scheduleLoad();mounted=true;
  }
  function destroy(){
    if(!mounted)return;observer?.disconnect?.();observer=null;
    root.removeEventListener('click',onClick);root.removeEventListener('change',onChange);
    root.removeEventListener('pointerdown',onPointerDown);root.removeEventListener('keydown',onKeyDown);
    mounted=false;remote=null;signedUrls={};landmarks={};calibrationByView={};activeMarker=null;calibrationMarker=null;contextKey='';loadInFlight=null;loadInFlightKey='';
  }
  return Object.freeze({mount,destroy,load,ensurePhysicalConsent,clientSnapshotForPdf});
}

export const __iriPhotogrammetryControllerInternals=Object.freeze({
  clean,escapeHtml,granted,captureIds,analysisCaptureId,uuidV4,formatDate,captureQualityCopy,qualityLabel,
});
