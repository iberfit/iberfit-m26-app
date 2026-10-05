function esc(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function finite(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));}
function clamp(value,min=0,max=100){if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):null;}
function fmt(value,digits=0){const n=Number(value);return Number.isFinite(n)?n.toLocaleString('es-ES',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';}

const DOMAIN_LABELS=Object.freeze({mobility:'Movilidad',strength:'Fuerza funcional',cardio:'Capacidad funcional'});

export function renderFunctionalProfile(scoring={}){
  const domains=['mobility','strength','cardio'].map((key)=>({key,label:DOMAIN_LABELS[key],score:clamp(scoring?.domainScores?.[key]?.score100),detail:scoring?.domainScores?.[key]}));
  const available=domains.filter((item)=>item.score!==null);
  if(available.length===3){
    const cx=120,cy=104,r=72;
    const axis=domains.map((item,index)=>{const angle=-Math.PI/2+index*(Math.PI*2/3);return {item,x:cx+Math.cos(angle)*r,y:cy+Math.sin(angle)*r,angle};});
    const points=axis.map(({item,angle})=>{const rr=r*(item.score/100);return `${(cx+Math.cos(angle)*rr).toFixed(1)},${(cy+Math.sin(angle)*rr).toFixed(1)}`;}).join(' ');
    const axes=axis.map(({x,y})=>`<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="iri-profile-axis"/>`).join('');
    const labels=axis.map(({item,x,y},index)=>`<g><text x="${x.toFixed(1)}" y="${(y+(index===0?-7:15)).toFixed(1)}" text-anchor="middle" class="iri-profile-label">${esc(item.label)}</text><text x="${x.toFixed(1)}" y="${(y+(index===0?7:29)).toFixed(1)}" text-anchor="middle" class="iri-profile-value">${esc(fmt(item.score/10,1))}/10</text></g>`).join('');
    return `<figure class="iri-functional-profile"><figcaption>Perfil funcional normalizado</figcaption><svg viewBox="0 0 240 210" role="img" aria-label="Perfil funcional normalizado de movilidad, fuerza funcional y capacidad funcional"><circle cx="${cx}" cy="${cy}" r="${r}" class="iri-profile-grid"/><circle cx="${cx}" cy="${cy}" r="${r/2}" class="iri-profile-grid"/>${axes}<polygon points="${points}" class="iri-profile-shape"/>${labels}</svg><p>Compara únicamente los dominios que el motor IRI expresa en una escala normalizada compatible. La composición corporal y la fotogrametría no alteran esta puntuación.</p></figure>`;
  }
  return `<figure class="iri-functional-profile is-partial"><figcaption>Perfil funcional disponible</figcaption><div class="iri-profile-list">${domains.map((item)=>`<div><span>${esc(item.label)}</span><strong>${item.score===null?'No puntuable':esc(fmt(item.score/10,1)+'/10')}</strong><i aria-hidden="true"><b class="w-pct-${item.score===null?0:Math.round(item.score)}"></b></i></div>`).join('')}</div><p>La cobertura actual no permite construir un perfil completo sin fingir comparabilidad. Los dominios ausentes permanecen como no puntuables. La composición corporal y la fotogrametría no alteran esta puntuación.</p></figure>`;
}

function bilateralValue(value){
  return finite(value)?fmt(value,1)+' cm':'—';
}
function bilateralPercent(value,max){
  const n=Number(value);
  return Number.isFinite(n)&&max>0?Math.max(0,Math.min(100,Math.round(n/max*100))):0;
}
function bilateralRow(label,left,right,note=''){
  const l=Number(left),r=Number(right);
  const max=Math.max(Number.isFinite(l)?l:0,Number.isFinite(r)?r:0,10);
  return `<article class="iri-bilateral-row"><span>${esc(label)}</span><div class="iri-bilateral-values"><strong>Izquierda ${esc(bilateralValue(left))}</strong><strong>Derecha ${esc(bilateralValue(right))}</strong></div><div class="iri-bilateral-axis" aria-hidden="true"><i class="iri-bilateral-left w-pct-${bilateralPercent(left,max)}"></i><b></b><i class="iri-bilateral-right w-pct-${bilateralPercent(right,max)}"></i></div>${note?`<small>${esc(note)}</small>`:''}</article>`;
}
export function renderMobilityMap(mobility={}){
  const ankle=mobility?.ankle||{},posterior=mobility?.posteriorChain||{};
  const ankleDiff=finite(ankle.leftBest)&&finite(ankle.rightBest)?Math.abs(Number(ankle.leftBest)-Number(ankle.rightBest)):null;
  const posteriorDiff=finite(posterior.leftBest)&&finite(posterior.rightBest)?Math.abs(Number(posterior.leftBest)-Number(posterior.rightBest)):null;
  const ankleNote=ankleDiff===null?'Sin comparación bilateral':ankleDiff===0?'Equilibrio idéntico entre lados':ankleDiff<=1?'Diferencia muy pequeña entre lados':`Diferencia de ${fmt(ankleDiff,1)} cm entre lados`;
  const posteriorNote=posteriorDiff===null?'Sin comparación bilateral':posteriorDiff===0?'Equilibrio idéntico entre lados':posteriorDiff<=1?`Diferencia pequeña: ${fmt(posteriorDiff,1)} cm`:`Diferencia de ${fmt(posteriorDiff,1)} cm entre lados`;
  return `<figure class="iri-mobility-comparison"><figcaption>Comparación bilateral</figcaption><div>${bilateralRow('Tobillo · rodilla a pared',ankle.leftBest,ankle.rightBest,ankleNote)}${bilateralRow('Cadena posterior',posterior.leftBest,posterior.rightBest,posteriorNote)}</div><p>La comparación muestra diferencias entre lados sin convertirlas automáticamente en un problema.</p></figure>`;
}
function strengthVariantLabel(value){
  const raw=String(value??'').trim().toLowerCase();
  if(raw==='knees'||raw==='knee'||raw.includes('rodilla'))return 'Rodillas apoyadas';
  if(raw==='standard'||raw==='full'||raw.includes('completa'))return 'Variante estándar';
  if(raw==='incline'||raw.includes('inclin'))return 'Con apoyo elevado';
  return String(value??'').trim();
}
function strengthQualityLabel(value){
  const raw=String(value??'').trim().toLowerCase();
  if(raw==='good'||raw==='buena'||raw.includes('buena'))return 'Buena calidad técnica';
  if(raw==='fair'||raw.includes('aceptable'))return 'Calidad técnica aceptable';
  return String(value??'').trim();
}
function strengthItem(index,label,value,unit,note){
  const shown=finite(value)?fmt(value,Number(value)%1?1:0)+unit:'No realizado / sin dato';
  return `<article class="iri-strength-pattern"><span class="iri-strength-index">${String(index).padStart(2,'0')}</span><div><span>${esc(label)}</span><strong>${esc(shown)}</strong>${note?`<small>${esc(note)}</small>`:''}</div></article>`;
}

export function renderStrengthPatterns(strength={}){
  const lower=strength?.lowerBody?.skipped?null:(strength?.chairStand?.repetitions??strength?.squat60?.repetitions);
  const lowerLabel=finite(strength?.chairStand?.repetitions)?'Silla · 30 s':'Sentadilla libre · 60 s';
  const push=strength?.push||{},trx=strength?.trxRow||{},core=strength?.core||{};
  return `<section class="iri-strength-patterns" aria-label="Resultados de fuerza por patrones">${strengthItem(1,strength?.lowerBody?.skipped?'Tren inferior · no realizado':lowerLabel,lower,' rep',strength?.lowerBody?.skipped?strength?.lowerBody?.skipReason:'Capacidad de trabajo del tren inferior')}${strengthItem(2,push?.skipped?'Empuje · no realizado':'Empuje',push?.skipped?null:push.repetitions,' rep',push?.skipped?push.skipReason:strengthVariantLabel(push.variant))}${strengthItem(3,trx?.skipped?'Tracción · TRX · no realizada':'Tracción · TRX',trx?.skipped?null:trx.repetitions,' rep',trx?.skipped?trx.skipReason:(finite(trx.handleHeightCm)?'Asas a '+fmt(trx.handleHeightCm)+' cm del suelo':''))}${strengthItem(4,core?.skipped?'Estabilidad de tronco · no realizada':'Estabilidad de tronco',core?.skipped?null:core.frontPlankSeconds,' s',core?.skipped?core.skipReason:strengthQualityLabel(core.quality))}</section>`;
}
export function renderEffortCurve(cardio={}){
  const series=[['Reposo',cardio.restingHr],['Final',cardio.finalHr],['1 min',cardio.oneMinuteHr],['2 min',cardio.twoMinuteHr]].filter(([,value])=>finite(value));
  if(series.length<2)return '<div class="iri-effort-empty">Datos insuficientes para representar la recuperación.</div>';
  const values=series.map(([,value])=>Number(value));
  const min=Math.max(30,Math.floor(Math.min(...values)/10)*10-10),max=Math.min(240,Math.ceil(Math.max(...values)/10)*10+10);
  const pts=series.map(([,value],index)=>({x:40+index*(340/Math.max(1,series.length-1)),y:24+(max-Number(value))*(126/Math.max(1,max-min)),value:Number(value)}));
  let path=`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for(let i=1;i<pts.length;i+=1){const prev=pts[i-1],cur=pts[i],mx=(prev.x+cur.x)/2;path+=` C ${mx.toFixed(1)} ${prev.y.toFixed(1)}, ${mx.toFixed(1)} ${cur.y.toFixed(1)}, ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;}
  return `<figure class="iri-effort-curve"><svg viewBox="0 0 420 190" role="img" aria-label="Curva de frecuencia cardiaca y recuperación"><line x1="40" y1="150" x2="380" y2="150" class="iri-effort-axis"/><path d="${path}" class="iri-effort-path"/>${pts.map((point,index)=>`<g><circle cx="${point.x}" cy="${point.y}" r="4.5"/><text x="${point.x}" y="${point.y-12}" text-anchor="middle" class="iri-effort-value">${point.value}</text><text x="${point.x}" y="173" text-anchor="middle" class="iri-effort-label">${esc(series[index][0])}</text></g>`).join('')}</svg></figure>`;
}


const PHOTO_VIEW_LABELS=Object.freeze({front:'Frontal',back:'Posterior',left:'Lateral izquierda',right:'Lateral derecha'});

function iriMetricValue(item={}){
  const value=Number(item?.value);
  if(!Number.isFinite(value))return '—';
  return `${fmt(value,1)}${item?.unit==='cm'?' cm':'°'}`;
}
function iriPhotoSvg(photo,landmarks={},measurements={},calibration={}){
  const width=Number(photo?.widthPx)>0?Number(photo.widthPx):1000;
  const height=Number(photo?.heightPx)>0?Number(photo.heightPx):1500;
  const view=photo?.view;
  const points=landmarks?.[view]||{};
  const point=(key)=>{
    const p=points?.[key];if(!p||!Number.isFinite(Number(p.x))||!Number.isFinite(Number(p.y)))return null;
    return {x:Math.max(0,Math.min(1,Number(p.x)))*width,y:Math.max(0,Math.min(1,Number(p.y)))*height};
  };
  const pairs=view==='front'||view==='back'
    ?[['shoulderLeft','shoulderRight'],['pelvisLeft','pelvisRight']]
    :[['ear','shoulder'],['shoulder','hip'],['hip','ankle']];
  const lines=pairs.map(([a,b])=>{const p1=point(a),p2=point(b);return p1&&p2?`<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}"/>`:'';}).join('');
  const dots=Object.keys(points).map((key)=>{const p=point(key);return p?`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${Math.max(3,Math.min(width,height)*.0045).toFixed(1)}"/>`:'';}).join('');
  const scale=calibration?.[view];
  const scaleLine=scale?.pointA&&scale?.pointB
    ?`<g class="iri-photo-scale"><line x1="${Number(scale.pointA.x)*width}" y1="${Number(scale.pointA.y)*height}" x2="${Number(scale.pointB.x)*width}" y2="${Number(scale.pointB.y)*height}"/><text x="${((Number(scale.pointA.x)+Number(scale.pointB.x))/2)*width}" y="${((Number(scale.pointA.y)+Number(scale.pointB.y))/2)*height}" text-anchor="middle">${esc(fmt(scale.knownLengthCm,1))} cm</text></g>`
    :'';
  const rows=Array.isArray(measurements?.metrics)?measurements.metrics.filter((item)=>item?.view===view):[];
  const metricText=rows.slice(0,5).map((item)=>`${item.label}: ${iriMetricValue(item)}`).join(' · ');
  return `<figure><svg class="iri-photo-figure-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Fotogrametría · ${esc(PHOTO_VIEW_LABELS[view])}"><image href="${esc(photo.url)}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" referrerpolicy="no-referrer"></image><g class="iri-photo-overlay">${scaleLine}${lines}${dots}</g></svg><figcaption><div><strong>${esc(PHOTO_VIEW_LABELS[view])}</strong><span>${photo.capturedAt?esc(String(photo.capturedAt).slice(0,10)):''}</span></div>${metricText?`<small>${esc(metricText)}</small>`:''}</figcaption></figure>`;
}

export function renderPhotogrammetryReport(report={}){
  const photos=Array.isArray(report?.photos)?report.photos.filter((item)=>item?.url&&PHOTO_VIEW_LABELS[item?.view]):[];
  const quality=report?.quality||{};
  const measurementRows=Array.isArray(report?.measurements?.metrics)?report.measurements.metrics:[];
  const support=report?.decisionSupport||{};
  const supportFindings=Array.isArray(support?.findings)?support.findings:[];
  const signals=Array.isArray(report?.interpretation?.reproducibleSignals)?report.interpretation.reproducibleSignals:[];
  const differences=Array.isArray(report?.interpretation?.observations)?report.interpretation.observations.filter((item)=>item?.kind==='bilateral_difference'):[];
  const findings=[
    ...supportFindings.slice(0,3).map((item)=>`${item.title}: ${item.meaning}`),
    ...signals.slice(0,2).map((item)=>`${item.label}: ${item.direction} · frontal ${fmt(item.frontDeg,1)}° · posterior ${fmt(item.backDeg,1)}°`),
    ...differences.slice(0,2).map((item)=>`${item.label}: diferencia ${fmt(item.differenceDeg,1)}°`),
  ];
  const meta=`<div class="iri-photo-report-reading"><div><span>Calidad del registro</span><strong>${esc(quality.level==='completa'?'Completa y validada':quality.level==='parcial'?'Parcial':quality.level==='capturas_sin_analisis'?'Capturas sin análisis validado':'Registro disponible')}</strong><small>${esc(`${Number(quality.capturedViews||photos.length)} vistas capturadas · ${Number(quality.analyzedViews||0)} analizadas · ${Number(quality.calibratedViews||0)} calibradas`)}</small></div><div><span>Trazabilidad</span><strong>Revisión ${esc(String(report?.analysisRevision||'—'))}</strong><small>${esc(report?.protocolVersion||'Protocolo histórico')}</small></div>${findings.length?`<ul>${findings.map((item)=>`<li>${esc(item)}</li>`).join('')}</ul>`:'<p>No aparece un patrón postural claro que se repita entre las distintas vistas.</p>'}</div>`;
  if(!photos.length){
    const permissionBlocked=report?.reason==='report-permission'||report?.photosAllowed===false;
    const detail=report?.reason==='consent'
      ?'No hay consentimiento fotográfico activo para consultar las capturas.'
      :permissionBlocked
        ?'El análisis técnico está disponible, pero las fotografías no están autorizadas para aparecer en este informe Cliente.'
        :'No hay capturas disponibles para incorporar a este documento.';
    return `<section class="iri-photo-report iri-photo-report-without-images"><div class="iri-photo-report-empty"><span>Fotogrametría</span><h3>Análisis sin imágenes publicadas</h3><p>${esc(detail)}</p><small>${measurementRows.length?'Las medidas y la lectura validada se conservan sin exponer el original.':'La ausencia de fotografías no se transforma en un hallazgo.'}</small></div>${meta}<p class="iri-photo-safety"><strong>Una foto es una referencia, no un diagnóstico.</strong> La interpretación cobra valor cuando también se relaciona con movilidad, fuerza y movimiento.</p></section>`;
  }
  return `<div class="iri-photo-report"><div class="iri-photo-report-grid">${photos.map((photo)=>iriPhotoSvg(photo,report?.landmarks||{},report?.measurements||{},report?.calibration||{})).join('')}</div>${meta}<p class="iri-photo-safety"><strong>Una foto es una referencia, no un diagnóstico.</strong> La interpretamos junto con movilidad, fuerza, técnica, síntomas y evolución.</p></div>`;
}

export function renderSignatureSlot(coachName='Entrenador IBERFIT',signatureUrl=''){
  const image=signatureUrl?`<img class="iri-signature-image" src="${esc(signatureUrl)}" alt="Firma de ${esc(coachName||'Entrenador IBERFIT')}">`:'<div class="iri-signature-line" aria-hidden="true"></div>';
  return `<div class="iri-signature-slot" aria-label="Firma del entrenador"><span>Firma del entrenador</span>${image}<strong>${esc(coachName||'Entrenador IBERFIT')}</strong></div>`;
}
