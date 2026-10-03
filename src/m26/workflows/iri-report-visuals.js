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

function marker(label,x,y,value,unit=''){
  if(!finite(value))return '';
  return `<g class="iri-body-marker"><circle cx="${x}" cy="${y}" r="7"/><circle cx="${x}" cy="${y}" r="2.2"/><text x="${x+11}" y="${y-2}">${esc(label)}</text><text x="${x+11}" y="${y+10}" class="iri-body-marker-value">${esc(fmt(value,1)+unit)}</text></g>`;
}

export function renderMobilityMap(mobility={}){
  const ankle=mobility?.ankle||{},posterior=mobility?.posteriorChain||{};
  const markers=[
    marker('Tobillo izq.',72,260,ankle.leftBest,' cm'),
    marker('Tobillo der.',148,260,ankle.rightBest,' cm'),
    marker('Cadena post. izq.',78,178,posterior.leftBest,' cm'),
    marker('Cadena post. der.',142,178,posterior.rightBest,' cm'),
  ].filter(Boolean).join('');
  const labelText=markers?'Mapa funcional con marcadores únicamente en zonas con mediciones registradas':'Mapa funcional sin mediciones cuantitativas disponibles';
  return `<figure class="iri-body-map"><figcaption>Mapa funcional</figcaption><svg viewBox="0 0 220 300" role="img" aria-label="${esc(labelText)}"><g class="iri-body-outline"><circle cx="110" cy="34" r="18"/><path d="M110 52 L110 142 M80 82 L140 82 M80 82 L63 143 M140 82 L157 143 M110 142 L78 214 M110 142 L142 214 M78 214 L72 278 M142 214 L148 278"/></g>${markers}</svg><p>Los marcadores aparecen sólo cuando existe una medición real. Una ausencia no se transforma en cero ni en hallazgo.</p></figure>`;
}

function strengthItem(label,value,unit,note,icon){
  const shown=finite(value)?fmt(value,Number(value)%1?1:0)+unit:'No realizado / sin dato';
  return `<article class="iri-strength-pattern"><div class="iri-strength-icon" aria-hidden="true">${icon}</div><div><span>${esc(label)}</span><strong>${esc(shown)}</strong>${note?`<small>${esc(note)}</small>`:''}</div></article>`;
}

export function renderStrengthPatterns(strength={}){
  const lower=strength?.lowerBody?.skipped?null:(strength?.chairStand?.repetitions??strength?.squat60?.repetitions);
  const lowerLabel=finite(strength?.chairStand?.repetitions)?'Silla 30 s':'Sentadilla libre 60 s';
  const push=strength?.push||{},trx=strength?.trxRow||{},core=strength?.core||{};
  const iconLower='<svg viewBox="0 0 40 40"><path d="M9 31h22M14 31V20h12v11M20 8v12M14 14h12"/></svg>';
  const iconPush='<svg viewBox="0 0 40 40"><path d="M7 29h26M10 24l20-8M13 15l8 5M27 12l-8-4"/></svg>';
  const iconPull='<svg viewBox="0 0 40 40"><path d="M7 8h26M11 8l8 13M29 8l-8 13M14 27h12M20 21v9"/></svg>';
  const iconCore='<svg viewBox="0 0 40 40"><path d="M7 29h26M10 24h20M13 24l5-11M27 24l-5-11"/></svg>';
  return `<section class="iri-strength-patterns" aria-label="Resultados de fuerza por patrones">${strengthItem(strength?.lowerBody?.skipped?'Tren inferior · no realizado':lowerLabel,lower,' rep',strength?.lowerBody?.skipped?strength?.lowerBody?.skipReason:'',iconLower)}${strengthItem(push?.skipped?'Empuje · no realizado':'Empuje',push?.skipped?null:push.repetitions,' rep',push?.skipped?push.skipReason:push.variant,iconPush)}${strengthItem(trx?.skipped?'Tracción · TRX · no realizada':'Tracción · TRX',trx?.skipped?null:trx.repetitions,' rep',trx?.skipped?trx.skipReason:(finite(trx.handleHeightCm)?'Asas '+fmt(trx.handleHeightCm)+' cm':''),iconPull)}${strengthItem(core?.skipped?'Estabilidad de tronco · no realizada':'Estabilidad de tronco',core?.skipped?null:core.frontPlankSeconds,' s',core?.skipped?core.skipReason:core.quality,iconCore)}</section>`;
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

function iriPhotoSvg(photo,landmarks={},measurements={}){
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
  const dots=Object.keys(points).map((key)=>{const p=point(key);return p?`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${Math.max(5,Math.min(width,height)*.008).toFixed(1)}"/>`:'';}).join('');
  const rows=Array.isArray(measurements?.metrics)?measurements.metrics.filter((item)=>item?.view===view):[];
  const metricText=rows.slice(0,3).map((item)=>`${item.label}: ${fmt(item.value,1)}°`).join(' · ');
  return `<figure><svg class="iri-photo-figure-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Fotogrametría · ${esc(PHOTO_VIEW_LABELS[view])}"><image href="${esc(photo.url)}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" referrerpolicy="no-referrer"></image><g class="iri-photo-overlay">${lines}${dots}</g></svg><figcaption><div><strong>${esc(PHOTO_VIEW_LABELS[view])}</strong><span>${photo.capturedAt?esc(String(photo.capturedAt).slice(0,10)):''}</span></div>${metricText?`<small>${esc(metricText)}</small>`:''}</figcaption></figure>`;
}

export function renderPhotogrammetryReport(report={}){
  const photos=Array.isArray(report?.photos)?report.photos.filter((item)=>item?.url&&PHOTO_VIEW_LABELS[item?.view]):[];
  const quality=report?.quality||{};
  if(!photos.length){
    const detail=report?.reason==='consent'?'No hay consentimiento fotográfico activo para incorporar imágenes.':'No hay capturas disponibles para incorporar a este informe.';
    return `<section class="iri-photo-report-empty"><span>Fotogrametría</span><h3>No incorporada</h3><p>${esc(detail)}</p><small>La ausencia de fotografías no se transforma en un hallazgo ni modifica la puntuación funcional.</small></section>`;
  }
  const signals=Array.isArray(report?.interpretation?.reproducibleSignals)?report.interpretation.reproducibleSignals:[];
  const differences=Array.isArray(report?.interpretation?.observations)?report.interpretation.observations.filter((item)=>item?.kind==='bilateral_difference'):[];
  const findings=[
    ...signals.slice(0,2).map((item)=>`${item.label}: ${item.direction} · frontal ${fmt(item.frontDeg,1)}° · posterior ${fmt(item.backDeg,1)}°`),
    ...differences.slice(0,2).map((item)=>`${item.label}: diferencia ${fmt(item.differenceDeg,1)}°`),
  ];
  return `<div class="iri-photo-report"><div class="iri-photo-report-grid">${photos.map((photo)=>iriPhotoSvg(photo,report?.landmarks||{},report?.measurements||{})).join('')}</div><div class="iri-photo-report-reading"><div><span>Calidad del registro</span><strong>${esc(quality.level==='completa'?'Completa y validada':quality.level==='parcial'?'Parcial':quality.level==='capturas_sin_analisis'?'Capturas sin análisis validado':'Registro disponible')}</strong><small>${esc(`${Number(quality.capturedViews||photos.length)} vistas capturadas · ${Number(quality.analyzedViews||0)} analizadas`)}</small></div>${findings.length?`<ul>${findings.map((item)=>`<li>${esc(item)}</li>`).join('')}</ul>`:'<p>Sin señales geométricas reproducibles destacadas en el análisis validado.</p>'}</div><p class="iri-photo-safety"><strong>Lectura geométrica orientativa.</strong> Una captura estática no define una postura ideal, lesión ni diagnóstico. Se interpreta junto con síntomas, movilidad, fuerza, técnica y repetibilidad.</p></div>`;
}

export function renderSignatureSlot(coachName='Entrenador IBERFIT',signatureUrl=''){
  const image=signatureUrl?`<img class="iri-signature-image" src="${esc(signatureUrl)}" alt="Firma de ${esc(coachName||'Entrenador IBERFIT')}">`:'<div class="iri-signature-line" aria-hidden="true"></div>';
  return `<div class="iri-signature-slot" aria-label="Firma del entrenador"><span>Firma del entrenador</span>${image}<strong>${esc(coachName||'Entrenador IBERFIT')}</strong></div>`;
}
