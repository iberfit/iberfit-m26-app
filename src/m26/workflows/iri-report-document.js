import {firstSessionCompletion} from './iri-first-session.js';
import {scoreIriPerformance} from '../norms/iri-scoring.js';
import {iriExternalReportAppUrl} from './iri-external-report-controller.js';
import {
  renderEffortCurve,
  renderFunctionalProfile,
  renderMobilityMap,
  renderPhotogrammetryReport,
  renderSignatureSlot,
  renderStrengthPatterns,
} from './iri-report-visuals.js';


function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function clean(value,max=4000){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function label(value,fallback='Sin registro'){const text=clean(value,1200);return text||fallback;}
function excerpt(value,max=420,fallback='Sin registro'){const text=clean(value,4000);if(!text)return fallback;if(text.length<=max)return text;const slice=text.slice(0,Math.max(0,max-1));const lastSpace=slice.lastIndexOf(' ');const cutoff=lastSpace>=Math.floor(max*.65)?lastSpace:slice.length;return `${slice.slice(0,cutoff).trimEnd()}…`;}
function distinctText(primary,secondary){const first=clean(primary,1200).toLocaleLowerCase('es');const second=clean(secondary,1200);return second&&second.toLocaleLowerCase('es')!==first?second:'';}
function number(value,digits=0){const n=Number(value);return Number.isFinite(n)?n.toLocaleString('es-ES',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';}
function finiteValue(value){return value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));}
function dateLabel(value,fallback='Sin fecha'){
  const raw=clean(value,64);
  if(!raw)return fallback;
  const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/u);
  const dmy=raw.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/u);
  const parts=iso?{year:Number(iso[1]),month:Number(iso[2]),day:Number(iso[3])}:dmy?{year:Number(dmy[3]),month:Number(dmy[2]),day:Number(dmy[1])}:null;
  if(!parts)return raw;
  const daysInMonth=new Date(Date.UTC(parts.year,parts.month,0)).getUTCDate();
  if(parts.year<1900||parts.year>2200||parts.month<1||parts.month>12||parts.day<1||parts.day>daysInMonth)return fallback;
  const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parts.day} de ${months[parts.month-1]} de ${parts.year}`;
}
function yesNo(value){return value===true?'Sí':value===false?'No':'Sin registro';}
function fileSize(value){const n=Number(value);if(!Number.isFinite(n)||n<0)return '—';if(n<1024)return `${number(n)} B`;if(n<1024*1024)return `${number(n/1024,1)} KB`;return `${number(n/(1024*1024),1)} MB`;}
function safeList(value){return Array.isArray(value)?value.map((item)=>clean(item,600)).filter(Boolean):[];}
function listItems(items=[],limit=6){const safe=safeList(items).slice(0,limit);return safe.length?safe.map((item)=>`<li>${escapeHtml(item)}</li>`).join(''):'<li>Sin registro</li>';}
function metric(title,value,note=''){return `<article class="metric"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong>${note?`<small>${escapeHtml(note)}</small>`:''}</article>`;}
function card(title,body,extra=''){return `<section class="card ${extra}"><h3>${escapeHtml(title)}</h3>${body}</section>`;}
function row(title,value){return `<p><span>${escapeHtml(title)}</span><strong>${escapeHtml(label(value))}</strong></p>`;}
function widthClass(value){const normalized=String(value??'').trim().replace('%','').replace('.', '_').replace(/[^0-9_]/gu,'');return normalized?`col-w-${normalized}`:'';}
function percentWidthClass(value){const numeric=Number(value);const bounded=Number.isFinite(numeric)?Math.max(0,Math.min(100,Math.round(numeric))):0;return `w-pct-${bounded}`;}
function compactTable(headers,rows,widths=[]){const colgroup=widths.length?`<colgroup>${widths.map((width)=>`<col class="${widthClass(width)}">`).join('')}</colgroup>`:'';return `<table>${colgroup}<thead><tr>${headers.map((item)=>`<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.map((values)=>`<tr>${values.map((value)=>`<td>${escapeHtml(label(value,'—'))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
function page({number,title,eyebrow='INFORME IRI',content,logoUrl,cover=false,internal=false,annex=false}){
  const sectionMatch=String(eyebrow||'').match(/^(\d{2})\s*·\s*(.+)$/u);
  const sectionNumber=sectionMatch?.[1]||String(number).padStart(2,'0');
  const sectionLabel=sectionMatch?.[2]||String(eyebrow||'INFORME IRI');
  const watermark=!cover?`<img class="watermark premium-watermark" src="${escapeHtml(logoUrl)}" alt="" aria-hidden="true">`:'';
  const header=cover?'':`<header class="premium-header"><span class="section-index">${escapeHtml(sectionNumber)}</span><div class="section-copy"><p>${escapeHtml(sectionLabel)}</p><h1>${escapeHtml(title)}</h1></div></header>`;
  const pageCount=internal?`Página ${number}`:`${String(number).padStart(2,'0')}`;
  return `<section class="pdf-page m26-premium-report-v3 report-page-${number}${cover?' cover':''}${internal?' internal':''}${annex?' annex':''}">${watermark}${header}<main><div class="report-page-content">${content}</div></main><footer><span><b>IBERFIT</b> · Diagnóstico, planificación, control y seguimiento</span><span>${pageCount}</span></footer></section>`;
}
function ratioBar(labelText,value,max=100,note='',suffix=''){const numeric=Number(value);const width=Number.isFinite(numeric)&&max>0?Math.max(0,Math.min(100,(numeric/max)*100)):0;return `<div class="bar-row"><div><span>${escapeHtml(labelText)}</span>${note?`<small>${escapeHtml(note)}</small>`:''}</div><div class="bar-track"><i class="${percentWidthClass(width)}"></i></div><strong>${Number.isFinite(numeric)?escapeHtml(number(numeric,numeric%1?1:0)+suffix):'—'}</strong></div>`;}
function symmetryRow(name,left,right,unit=''){const l=Number(left),r=Number(right),max=Math.max(l||0,r||0,1);const leftWidth=Number.isFinite(l)?Math.min(100,l/max*100):0;const rightWidth=Number.isFinite(r)?Math.min(100,r/max*100):0;return `<div class="symmetry-row"><span>${escapeHtml(name)}</span><div class="side left"><b>${Number.isFinite(l)?escapeHtml(number(l,1)+unit):'—'}</b><i class="${percentWidthClass(leftWidth)}"></i></div><div class="body-dot"></div><div class="side right"><i class="${percentWidthClass(rightWidth)}"></i><b>${Number.isFinite(r)?escapeHtml(number(r,1)+unit):'—'}</b></div></div>`;}
function chartPoint(value,index,min,max,width=460,height=170,total=3){const safe=Number(value);if(!Number.isFinite(safe))return null;const x=42+index*((width-84)/Math.max(1,total-1));const y=20+(max-safe)*((height-50)/(max-min||1));return {x,y,value:safe,index};}
function heartRateChart(cardio={}){const series=[['Reposo',cardio.restingHr],['Final',cardio.finalHr],['1 min',cardio.oneMinuteHr],['2 min',cardio.twoMinuteHr]].filter(([,value])=>finiteValue(value));const valid=series.map(([,value])=>Number(value));if(valid.length<2)return '<div class="chart-empty">Datos insuficientes para representar la recuperación.</div>';const min=Math.max(30,Math.floor(Math.min(...valid)/10)*10-10),max=Math.min(240,Math.ceil(Math.max(...valid)/10)*10+10);const points=series.map(([,value],index)=>chartPoint(value,index,min,max,460,170,series.length));const path=points.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' ');return `<svg class="line-chart" viewBox="0 0 460 190" role="img" aria-label="Recuperación de frecuencia cardiaca"><line x1="42" y1="20" x2="42" y2="150"/><line x1="42" y1="150" x2="420" y2="150"/><path d="${path}"/>${points.map((point,index)=>`<circle cx="${point.x}" cy="${point.y}" r="5"/><text x="${point.x}" y="${point.y-12}" text-anchor="middle">${point.value}</text><text x="${point.x}" y="173" text-anchor="middle">${escapeHtml(series[index][0])}</text>`).join('')}<text x="8" y="27">${max}</text><text x="8" y="150">${min}</text></svg>`;}
function cardioProtocolLabel(cardio={}){
  const protocol=String(cardio?.protocol||'');
  if(protocol==='1msts-standard')return '1MSTS · 60 segundos';
  if(protocol==='ymca-3min-standard')return 'YMCA Step Test · 3 minutos';
  if(protocol==='treadmill-3min-field')return 'Cinta · 3 minutos · recuperación individual';
  if(protocol==='iberfit-3min-adapted')return 'Step 3 min adaptado · histórico';
  return 'Protocolo no identificado';
}
function cardioProtocolReady(cardio={}){
  if(cardio?.skipped)return false;
  const protocol=String(cardio?.protocol||'');
  if(cardio?.valid!==true)return false;
  if(protocol==='1msts-standard'){
    return Number(cardio?.durationSeconds)===60&&finiteValue(cardio?.repetitions);
  }
  if(protocol==='ymca-3min-standard'){
    return Number(cardio?.durationSeconds)===180&&
      finiteValue(cardio?.stepHeightCm)&&Math.abs(Number(cardio.stepHeightCm)-30.5)<=0.05&&
      Number(cardio?.cadenceBpm)===96&&
      finiteValue(cardio?.finalHr)&&finiteValue(cardio?.oneMinuteHr);
  }
  if(protocol==='treadmill-3min-field'){
    return Number(cardio?.durationSeconds)===180&&finiteValue(cardio?.speedKmh)&&finiteValue(cardio?.inclinePercent)&&
      finiteValue(cardio?.finalHr)&&finiteValue(cardio?.oneMinuteHr)&&Boolean(cardio?.locomotionMode)&&Boolean(cardio?.recoveryMode);
  }
  if(protocol==='iberfit-3min-adapted'){
    return Number(cardio?.durationSeconds)===180&&
      finiteValue(cardio?.stepHeightCm)&&finiteValue(cardio?.cadenceBpm)&&
      finiteValue(cardio?.finalHr)&&finiteValue(cardio?.oneMinuteHr);
  }
  return false;
}
function cardioResultDetail(cardio={}){
  const protocol=String(cardio?.protocol||'');
  if(protocol==='1msts-standard'){
    const chair=finiteValue(cardio?.chairHeightCm)?` · silla ${number(cardio.chairHeightCm,1)} cm`:'';
    return `${number(cardio?.repetitions)} repeticiones en 60 s${chair}`;
  }
  if(protocol==='treadmill-3min-field'){
    const hrr1=finiteValue(cardio?.deltaOneMinute)?` · recuperación 1 min ${number(cardio.deltaOneMinute)} lpm`:'';
    const hrr2=finiteValue(cardio?.deltaTwoMinute)?` · recuperación 2 min ${number(cardio.deltaTwoMinute)} lpm`:'';
    return `${number(cardio?.speedKmh,1)} km/h · ${number(cardio?.inclinePercent,1)}% · FC final ${number(cardio?.finalHr)} lpm${hrr1}${hrr2}`;
  }
  if(['ymca-3min-standard','iberfit-3min-adapted'].includes(protocol)){
    const delta=finiteValue(cardio?.deltaOneMinute)?` · recuperación 1 min ${number(cardio.deltaOneMinute)} lpm`:'';
    return `FC final ${number(cardio?.finalHr)} lpm${delta}`;
  }
  return 'Sin resultado interpretable';
}
function cardioProtocolNote(cardio={}){
  const protocol=String(cardio?.protocol||'');
  if(protocol==='1msts-standard')return 'Las repeticiones son el resultado principal; la FC es complementaria y opcional.';
  if(protocol==='ymca-3min-standard')return 'Comparar sólo con YMCA realizado a 30,5 cm, 96 bpm y 180 s.';
  if(protocol==='treadmill-3min-field')return 'Referencia inicial individual: repetir la misma velocidad, inclinación y recuperación. La recuperación de frecuencia cardiaca a 1 y 2 minutos es descriptiva; no se aplican puntos de corte pronósticos de otros protocolos.';
  if(protocol==='iberfit-3min-adapted')return 'Registro histórico: no equivale a YMCA y no utiliza sus baremos.';
  return 'No comparar con otros protocolos.';
}
function evidenceStatus(labelText,status,detail,note=''){
  const tone=status==='Registrado'||status==='Válido'?'complete':status==='No evaluado'?'skipped':'pending';
  return `<article class="evidence-item is-${tone}"><div><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(status)}</strong></div><p>${escapeHtml(detail)}</p>${note?`<small>${escapeHtml(note)}</small>`:''}</article>`;
}
function domainEvidenceGrid(draft){
  const body=draft.bodyComposition||{},mobility=draft.mobility||{},strength=draft.strength||{},cardio=draft.cardio||{};
  const bodyCount=[body.weightKg,body.bodyFatPercent,body.leanMassKg,body.muscleMassKg,body.bodyWaterPercent,body.waistCm,body.visceralFatLevel].filter((value)=>value!==null&&value!==undefined&&value!=='').length;
  const mobilityCount=[
    mobility.ankle?.skipped?null:mobility.ankle?.leftBest,
    mobility.ankle?.skipped?null:mobility.ankle?.rightBest,
    mobility.posteriorChain?.skipped?null:mobility.posteriorChain?.leftBest,
    mobility.posteriorChain?.skipped?null:mobility.posteriorChain?.rightBest,
    mobility.hipRotation?.skipped?null:mobility.hipRotation?.result,
    mobility.assistedSquat?.skipped?null:mobility.assistedSquat?.depth,
  ].filter((value)=>value!==null&&value!==undefined&&value!=='').length;
  const validStrength=[
    strength.lowerBody?.skipped?false:strength.chairStand?.valid,
    strength.lowerBody?.skipped?false:strength.squat60?.valid,
    strength.push?.skipped?false:strength.push?.valid,
    strength.trxRow?.skipped?false:strength.trxRow?.valid,
    strength.core?.skipped?false:strength.core?.frontPlankSeconds!==null&&strength.core?.frontPlankSeconds!==undefined,
  ].filter((value)=>value===true).length;
  const cardioReady=cardioProtocolReady(cardio);
  const bodyState=body.skipped?'No evaluado':bodyCount?'Registrado':'Pendiente';
  const mobilityState=mobility.skipped?'No evaluado':mobilityCount?'Registrado':'Pendiente';
  const strengthState=strength.skipped?'No evaluado':validStrength?'Registrado':'Pendiente';
  const cardioState=cardio.skipped?'No evaluado':cardioReady?'Válido':'Pendiente';
  return `<div class="domain-evidence">${evidenceStatus('Composición corporal',bodyState,body.skipped?label(body.skipReason,'Motivo no registrado'):`${bodyCount} mediciones objetivas`,body.method?`Método: ${label(body.method)}`:'Método pendiente')}${evidenceStatus('Movilidad y movimiento',mobilityState,mobility.skipped?label(mobility.skipReason,'Motivo no registrado'):`${mobilityCount} resultados u observaciones estructuradas`,'Se interpreta rango, simetría, técnica y síntomas')}${evidenceStatus('Fuerza por patrones',strengthState,strength.skipped?label(strength.skipReason,'Motivo no registrado'):`${validStrength} protocolos marcados como válidos`,'Las variantes no se mezclan entre sí')}${evidenceStatus('Capacidad de esfuerzo',cardioState,cardio.skipped?label(cardio.skipReason,'Motivo no registrado'):cardioReady?cardioResultDetail(cardio):'Falta una prueba válida y completa',cardioProtocolNote(cardio))}</div>`;
}
function coverageScore(draft){return firstSessionCompletion(draft).percent;}
function clientTestExplanation({title,observed,importance,result,decision}){return `<section class="client-test-explanation"><h3>${escapeHtml(title)}</h3><div><p><span>Qué observamos</span><strong>${escapeHtml(label(observed))}</strong></p><p><span>Por qué importa</span><strong>${escapeHtml(label(importance))}</strong></p><p><span>Resultado</span><strong>${escapeHtml(label(result))}</strong></p><p><span>Decisión</span><strong>${escapeHtml(label(decision))}</strong></p></div></section>`;}
function protocolUsage(record={}){if(record.valid===false)return 'No interpretable';if(record.normEligible===true)return 'Baremado';if(record.valid===true&&record.trackingComparable===true)return 'Referencia inicial comparable';if(record.valid===true)return 'Referencia inicial';return 'Sin confirmar';}
function protocolTraceRows(records=[]){return (Array.isArray(records)?records:[]).map((record)=>[record.testName,record.side==='left'?'Izquierda':record.side==='right'?'Derecha':record.side==='bilateral'?'Bilateral':'—',record.variant,record.configuration,record.protocolVersion,record.valid===true?'Válida':record.valid===false?'No válida':'Sin confirmar',protocolUsage(record),[record.adaptationReason,record.stopReason].filter(Boolean).join(' · ')||'—']);}

function strengthRows(draft){const s=draft.strength||{};return [
  ['Silla 30 s',s.lowerBody?.skipped?null:s.chairStand?.repetitions,' rep',40,s.lowerBody?.skipped?`No realizado: ${label(s.lowerBody?.skipReason)}`:'Protocolo estandarizado'],
  ['Sentadilla libre 60 s',s.lowerBody?.skipped?null:s.squat60?.repetitions,' rep',60,s.lowerBody?.skipped?`No realizada: ${label(s.lowerBody?.skipReason)}`:s.squat60?.depthCriterion?`Profundidad: ${s.squat60.depthCriterion}`:'Referencia inicial individual'],
  [`Empuje · ${s.push?.skipped?'no realizado':label(s.push?.variant,'variante')}`,s.push?.skipped?null:s.push?.repetitions,' rep',35,s.push?.skipped?`Motivo: ${label(s.push?.skipReason)}`:s.push?.supportHeightCm?`Apoyo ${number(s.push.supportHeightCm)} cm`:''],
  ['Remo TRX',s.trxRow?.skipped?null:s.trxRow?.repetitions,' rep',35,s.trxRow?.skipped?`No realizado: ${label(s.trxRow?.skipReason)}`:s.trxRow?.handleHeightCm?`Asas ${number(s.trxRow.handleHeightCm)} cm`:'Referencia individual'],
  ['Plancha frontal',s.core?.skipped?null:s.core?.frontPlankSeconds,' s',180,s.core?.skipped?`No realizada: ${label(s.core?.skipReason)}`:'Calidad técnica registrada'],
  ['Plancha lateral izquierda',s.core?.skipped?null:s.core?.sidePlankLeftSeconds,' s',180,s.core?.skipped?'No realizada':''],
  ['Plancha lateral derecha',s.core?.skipped?null:s.core?.sidePlankRightSeconds,' s',180,s.core?.skipped?'No realizada':''],
];}
function compositionDonut(body={}){const fat=Number(body.bodyFatPercent);const fatPct=Number.isFinite(fat)?Math.max(0,Math.min(100,fat)):0;const circumference=251.33;const dash=(circumference*fatPct/100).toFixed(2);const gap=(circumference-Number(dash)).toFixed(2);return `<svg class="donut-svg" viewBox="0 0 120 120" role="img" aria-label="Porcentaje de grasa corporal"><circle cx="60" cy="60" r="40" class="donut-base"/><circle cx="60" cy="60" r="40" class="donut-value" stroke-dasharray="${dash} ${gap}" transform="rotate(-90 60 60)"/><circle cx="60" cy="60" r="27" class="donut-center"/><text x="60" y="58" text-anchor="middle" class="donut-number">${Number.isFinite(fat)?number(fat,1)+'%':'—'}</text><text x="60" y="75" text-anchor="middle" class="donut-label">grasa</text></svg>`;}
function completionPanel(completion,draft){const valid=[draft.strength?.chairStand?.valid,draft.strength?.push?.valid,draft.strength?.trxRow?.valid,draft.cardio?.valid].filter((value)=>value===true).length;const scoring=scoreIriPerformance(draft);const global=scoring.global||{};return `<section class="completion-panel"><div><span>Completitud del proceso</span><strong>${completion.percent}%</strong><small>${completion.complete} de ${completion.total} etapas</small></div><div><span>Puntuación funcional IRI</span><strong>${global.available?number(global.score10,1)+'/10':'—'}</strong><small>${global.available?global.coverage.scoredDomains+'/3 dominios puntuables':'Cobertura insuficiente'}</small></div><div><span>Confianza de la nota</span><strong>${global.confidence==='high'?'Alta':global.confidence==='moderate'?'Moderada':'Insuficiente'}</strong><small>Composición y fotogrametría no alteran esta nota</small></div></section>`;}
function domainScorePanel(draft){
  const scoring=scoreIriPerformance(draft);const domains=scoring.domainScores||{};
  const item=(key,labelText)=>{
    const domain=domains[key]||{};const score=domain.score10;
    const detail=key==='mobility'
      ?domain.tests?.map((test)=>test.scored?`${test.side==='left'?'Izq.':test.side==='right'?'Der.':'Bilateral'} ${number(test.grade10,1)}/10 · ${test.percentileLabel||test.category?.label||''}`:'').filter(Boolean).join(' · ')
      :domain.tests?.[0]?.scored?`${domain.tests[0].percentileLabel||domain.tests[0].category?.label||'Referencia compatible'}`:domain.note||'Sin baremo compatible';
    return `<article class="metric"><span>${escapeHtml(labelText)}</span><strong>${score===null||score===undefined?'—':escapeHtml(number(score,1)+'/10')}</strong><small>${escapeHtml(detail||'Sin nota disponible')}</small></article>`;
  };
  return `<section class="metrics iri-domain-scores">${item('mobility','Movilidad')}${item('strength','Fuerza funcional')}${item('cardio','Capacidad funcional')}</section>`;
}

function clientIriExternalReportComplement(draft,report,appOrigin){
  if(!report||report.visibleToClient!==true||clean(report.assessmentId,80)!==clean(draft.assessmentId,80))return '';
  const href=iriExternalReportAppUrl(draft.assessmentId,{origin:appOrigin});
  const format=report.mimeType==='application/pdf'?'PDF':report.mimeType==='image/jpeg'?'JPEG':report.mimeType==='image/png'?'PNG':'';
  if(!format)return '';
  const embedded=Array.isArray(report?.printPreview?.pages)&&report.printPreview.pages.length>0;
  const detail=embedded?` · ${report.printPreview.pages.length} ${report.printPreview.pages.length===1?'página incorporada':'páginas incorporadas'} al informe`:' · documento vinculado; previsualización no incorporada';
  return card('Documento complementario',`<div class="iri-complement"><p class="iri-complement-kicker">Informe de bioimpedancia</p><p>Este documento complementa los resultados de composición corporal del Diagnóstico IRI.</p><small>${escapeHtml(format)} · versión ${escapeHtml(report.version||1)}${escapeHtml(detail)}</small><a class="iri-complement-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Abrir documento original</a></div>`,'soft');
}

function clientIriExternalReportPages(draft,report,logoUrl,startNumber,appOrigin){
  if(!report||report.visibleToClient!==true||clean(report.assessmentId,80)!==clean(draft.assessmentId,80))return [];
  const previewPages=Array.isArray(report?.printPreview?.pages)?report.printPreview.pages.filter(Boolean).slice(0,4):[];
  if(!previewPages.length)return [];
  const href=iriExternalReportAppUrl(draft.assessmentId,{origin:appOrigin});
  const format=report.mimeType==='application/pdf'?'PDF':report.mimeType==='image/jpeg'?'JPEG':report.mimeType==='image/png'?'PNG':'Documento';
  const totalOriginal=Number(report?.printPreview?.totalPages||previewPages.length);
  return previewPages.map((src,index)=>page({
    number:startNumber+index,
    title:'Informe de bioimpedancia',
    eyebrow:'DOCUMENTO COMPLEMENTARIO · BIOIMPEDANCIA',
    logoUrl,
    content:`<div class="iri-bioimp-page"><div class="iri-bioimp-meta"><div><span>Documento original</span><strong>${escapeHtml(format)} · versión ${escapeHtml(report.version||1)}</strong></div><div><span>Página incorporada</span><strong>${index+1} de ${totalOriginal}</strong></div></div><figure><img src="${escapeHtml(src)}" alt="Informe de bioimpedancia · página ${index+1}" referrerpolicy="no-referrer"></figure>${report?.printPreview?.truncated&&index===previewPages.length-1?`<p class="method-note">El documento original contiene ${totalOriginal} páginas. Por seguridad de maquetación se incorporan las primeras ${previewPages.length}; el archivo original permanece disponible desde IBERFIT.</p>`:''}<a class="iri-complement-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Abrir documento original en IBERFIT</a></div>`
  }));
}
function coachIriExternalReportPages(draft,report,logoUrl,startNumber,appOrigin){
  if(!report||clean(report.assessmentId,80)!==clean(draft.assessmentId,80))return [];
  const previewPages=Array.isArray(report?.printPreview?.pages)?report.printPreview.pages.filter(Boolean).slice(0,4):[];
  if(!previewPages.length)return [];
  const href=iriExternalReportAppUrl(draft.assessmentId,{origin:appOrigin});
  const format=report.mimeType==='application/pdf'?'PDF':report.mimeType==='image/jpeg'?'JPEG':report.mimeType==='image/png'?'PNG':'Documento';
  const totalOriginal=Number(report?.printPreview?.totalPages||previewPages.length);
  return previewPages.map((src,index)=>page({
    number:startNumber+index,
    title:'Bioimpedancia · documento original',
    eyebrow:'ANEXO TÉCNICO · BIOIMPEDANCIA',
    logoUrl,
    internal:true,
    annex:true,
    content:`<div class="iri-bioimp-page"><div class="iri-bioimp-meta"><div><span>Archivo vinculado al IRI</span><strong>${escapeHtml(format)} · versión ${escapeHtml(report.version||1)}</strong></div><div><span>Página incorporada</span><strong>${index+1} de ${totalOriginal}</strong></div></div><figure><img src="${escapeHtml(src)}" alt="Bioimpedancia · página ${index+1}" referrerpolicy="no-referrer"></figure><p class="method-note">Documento técnico incorporado desde el archivo privado vinculado a esta evaluación. Su visibilidad para el cliente se gestiona de forma independiente.</p><a class="iri-complement-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">Abrir documento original en IBERFIT</a></div>`
  }));
}

function bodyCompositionView(body={}){
  const weight=finiteValue(body.weightKg)?Number(body.weightKg):null;
  const fatPercent=finiteValue(body.bodyFatPercent)?Number(body.bodyFatPercent):null;
  const explicitFat=finiteValue(body.fatMassKg)?Number(body.fatMassKg):null;
  const muscle=finiteValue(body.muscleMassKg)?Number(body.muscleMassKg):null;
  const rawLean=finiteValue(body.leanMassKg)?Number(body.leanMassKg):null;
  const calculatedFat=weight!==null&&fatPercent!==null?Number((weight*fatPercent/100).toFixed(1)):null;
  const fatMass=explicitFat??calculatedFat;
  const calculatedLean=weight!==null&&fatMass!==null?Number((weight-fatMass).toFixed(1)):null;
  const rawLeanPlausible=rawLean!==null&&(weight===null||rawLean<=weight)&&(muscle===null||rawLean>=muscle);
  return Object.freeze({
    fatMassKg:fatMass,
    leanMassKg:rawLeanPlausible?rawLean:calculatedLean,
    leanMassDerived:!rawLeanPlausible&&calculatedLean!==null,
    rawLeanInconsistent:rawLean!==null&&!rawLeanPlausible,
  });
}
function hasPhotogrammetryReport(report={}){
  return report?.available===true&&Array.isArray(report?.photos)&&report.photos.some((item)=>clean(item?.url,4000));
}

function reportCover({clientName,date,coachName,logoUrl,internal,clientId='',iriOnly=false}){return page({number:1,cover:true,internal,logoUrl,title:'',content:`<img class="cover-watermark" src="${escapeHtml(logoUrl)}" alt="" aria-hidden="true"><div class="cover-accent" aria-hidden="true"></div><div class="cover-lockup"><img class="cover-isotipo" src="${escapeHtml(logoUrl)}" alt="Isotipo oficial IBERFIT"><div><span>IBERFIT</span><small>${internal?'DOSSIER TÉCNICO':'INFORME DE RENDIMIENTO INICIAL'}</small></div></div><span class="cover-document-mark">${internal?'DOSSIER<br>TÉCNICO':'INFORME<br>IRI'}</span><div class="cover-copy"><p>${iriOnly?'EVALUACIÓN INDEPENDIENTE · SOLO IRI':internal?'EVIDENCIA · INTERPRETACIÓN · TRAZABILIDAD':'DIAGNÓSTICO · CRITERIO · DIRECCIÓN'}</p><h1>${internal?'Expediente IRI':'Tu punto<br>de partida.'}</h1><div class="gold-line"></div><span class="cover-claim">${internal?'Toda la evidencia técnica de la evaluación, ordenada para decidir.':'Una fotografía clara de dónde estás hoy y qué merece atención primero.'}</span></div><div class="cover-person"><span>PERSONA EVALUADA</span><strong>${escapeHtml(clientName)}</strong><p>${escapeHtml(dateLabel(date,'Fecha no disponible'))} · ${escapeHtml(coachName)}</p></div><div class="cover-data"><div><span>Documento</span><strong>${iriOnly?'IRI independiente':internal?'Uso interno Coach / Admin':'Diagnóstico IRI'}</strong></div>${internal?`<div><span>Expediente</span><strong>${escapeHtml(label(clientId,'Sin identificador'))}</strong></div>`:''}<div class="cover-service"><span>IBERFIT</span><strong>Entrenamiento personal con criterio · diagnóstico · planificación · control · seguimiento</strong></div></div>`});}
function clientPages(draft,context){
  const {clientName,coachName,logoUrl,signatureUrl='',externalReport,appOrigin,photogrammetryReport=null,iriOnly=false}=context;
  const p=draft.personProfile||{},i=draft.interview||{},b=draft.bodyComposition||{},m=draft.mobility||{},s=draft.strength||{},c=draft.cardio||{},d=draft.diagnosis||{};
  const completion=firstSessionCompletion(draft);const scoring=scoreIriPerformance(draft);const pages=[];
  pages.push(reportCover({clientName,date:draft.assessmentDate,coachName,logoUrl,internal:false,iriOnly}));
  pages.push(page({number:2,title:'Tu punto de partida',eyebrow:'01 · SÍNTESIS',logoUrl,content:`<div class="editorial-intro"><p class="lead">Este informe ordena lo que sabemos hoy sobre tu punto de partida y separa con claridad lo medido, lo interpretable y lo que todavía requiere seguimiento.</p><p class="coverage-note">Cobertura del proceso: <strong>${completion.complete}/${completion.total}</strong> etapas · Puntuación funcional IRI: ${scoring.global?.available?`<strong>${number(scoring.global.score10,1)}/10</strong> con ${scoring.global.coverage.scoredDomains}/3 dominios puntuables`:'no emitida por cobertura insuficiente'}. Este diagnóstico representa la referencia inicial; el seguimiento y la evolución se registran por separado.</p></div><div class="summary-editorial">${renderFunctionalProfile(scoring)}<div class="summary-copy"><section><span>Fortaleza principal</span><h2>${escapeHtml(safeList(d.strengths)[0]||'Fortaleza pendiente de interpretación')}</h2></section><section><span>Principal oportunidad</span><h2>${escapeHtml(safeList(d.priorities)[0]||'Prioridad pendiente de interpretación')}</h2></section><section class="summary-caution"><span>Lectura IBERFIT</span><p>Resultados objetivos, contexto y criterio profesional se leen juntos para definir prioridades útiles, sin convertir datos incomparables en una puntuación artificial.</p></section></div></div>`}));
  pages.push(page({number:3,title:'Contexto y objetivos',eyebrow:'02 · TU CONTEXTO',logoUrl,content:`<p class="lead">Comprender tu realidad permite planificar con más precisión y continuidad.</p><div class="context-grid">${card('Objetivo principal',`<p>${escapeHtml(label(p.primaryObjective))}</p>`)}${card('Objetivos secundarios',`<ul>${listItems(p.secondaryObjectives,5)}</ul>`)}${card('Experiencia y actividad actual',`<p><strong>${escapeHtml(label(i.trainingExperience))}</strong></p><p>${escapeHtml(excerpt(i.currentTraining,380,'Sin entrenamiento actual registrado'))}</p>`)}${card('Disponibilidad',`<p><strong>${escapeHtml(label(i.availability))}</strong></p>${distinctText(i.availability,p.preferredSchedule)?`<p>${escapeHtml(distinctText(i.availability,p.preferredSchedule))}</p>`:''}`)}${card('Entorno de entrenamiento',`<p><strong>${escapeHtml(label(p.modality))}</strong></p><p>${escapeHtml(label(p.locationType,'Tipo de lugar por definir'))}</p>`)}${card('Material disponible',`<p>${escapeHtml(safeList(p.equipment).join(' · ')||'Sin registro')}</p>`)}${card('Preferencias',`<p>${escapeHtml(excerpt(i.preferences,460,'Sin preferencias especiales registradas'))}</p>`,'wide')}${card('Consideraciones declaradas',`<p>${escapeHtml(excerpt(i.restrictions,460,'Sin restricciones declaradas'))}</p>`,'wide soft')}</div>`}));
  const bodyView=bodyCompositionView(b);
  pages.push(page({number:4,title:'Composición corporal',eyebrow:'03 · COMPOSICIÓN CORPORAL',logoUrl,content:`<p class="lead">La composición corporal describe el punto de partida medido y las condiciones de esa medición. Se utiliza para seguimiento, no como juicio estético ni como nota funcional.</p><div class="composition-editorial"><div class="composition-hero"><span>${finiteValue(b.bodyFatPercent)?'Grasa corporal':finiteValue(b.weightKg)?'Peso':'Composición'}</span><strong>${finiteValue(b.bodyFatPercent)?number(b.bodyFatPercent,1)+'%':finiteValue(b.weightKg)?number(b.weightKg,1)+' kg':'—'}</strong><small>${escapeHtml(b.method?('Método · '+label(b.method)):'Método no registrado')}</small></div><div class="composition-facts"><p><span>Peso</span><strong>${finiteValue(b.weightKg)?number(b.weightKg,1)+' kg':'—'}</strong></p><p><span>Masa grasa</span><strong>${finiteValue(bodyView.fatMassKg)?number(bodyView.fatMassKg,1)+' kg':'—'}</strong></p><p><span>Masa libre de grasa</span><strong>${finiteValue(bodyView.leanMassKg)?number(bodyView.leanMassKg,1)+' kg':'—'}</strong></p><p><span>Masa muscular</span><strong>${finiteValue(b.muscleMassKg)?number(b.muscleMassKg,1)+' kg':'—'}</strong></p><p><span>Agua corporal</span><strong>${finiteValue(b.bodyWaterPercent)?number(b.bodyWaterPercent,1)+'%':'—'}</strong></p><p><span>Cintura</span><strong>${finiteValue(b.waistCm)?number(b.waistCm,1)+' cm':'—'}</strong></p><p><span>Grasa visceral</span><strong>${finiteValue(b.visceralFatLevel)?number(b.visceralFatLevel):'—'}</strong></p></div></div>${clientIriExternalReportComplement(draft,externalReport,appOrigin)}<div class="composition-context"><span>Condiciones registradas</span><p>${escapeHtml(excerpt(b.measurementConditions,420,'Sin condiciones especiales registradas.'))}</p><small>${escapeHtml(label(b.device,'Equipo no registrado'))}${bodyView.leanMassDerived?' · masa libre de grasa calculada a partir de peso y porcentaje de grasa cuando el valor registrado no era fisiológicamente coherente.':''}</small></div>`}));
  let nextPage=5;
  const bioimpPages=clientIriExternalReportPages(draft,externalReport,logoUrl,nextPage,appOrigin);
  pages.push(...bioimpPages);nextPage+=bioimpPages.length;
  pages.push(page({number:nextPage++,title:'Movimiento y movilidad',eyebrow:'04 · MOVIMIENTO Y MOVILIDAD',logoUrl,content:`<div class="movement-editorial">${renderMobilityMap(m)}<div class="movement-reading"><section><span>Tobillo</span><strong>Izquierda ${finiteValue(m.ankle?.leftBest)?number(m.ankle.leftBest,1)+' cm':'no medido'} · derecha ${finiteValue(m.ankle?.rightBest)?number(m.ankle.rightBest,1)+' cm':'no medido'}</strong><p>${m.ankle?.skipped?escapeHtml('No realizado: '+label(m.ankle.skipReason)):escapeHtml(m.ankle?.pain?('Dolor/síntoma: '+label(m.ankle.pain)):'Sin dolor registrado')}</p></section><section><span>Cadena posterior</span><strong>Izquierda ${finiteValue(m.posteriorChain?.leftBest)?number(m.posteriorChain.leftBest,1)+' cm':'no medido'} · derecha ${finiteValue(m.posteriorChain?.rightBest)?number(m.posteriorChain.rightBest,1)+' cm':'no medido'}</strong></section><section><span>Sentadilla observada</span><strong>${escapeHtml(label(m.assistedSquat?.depth,'No registrada'))}</strong><p>${escapeHtml(m.assistedSquat?.assistanceResponse?('Respuesta a asistencia: '+m.assistedSquat.assistanceResponse):'')}</p></section><section class="movement-coach"><span>Lectura del entrenador</span><p>${escapeHtml(excerpt(d.coachInterpretation,520,'Interpretación pendiente de revisión'))}</p></section></div></div>${clientTestExplanation({title:'Rodilla a pared',observed:'Distancia máxima alcanzada manteniendo el talón apoyado y la rodilla orientada hacia la pared.',importance:'Aporta una referencia de movilidad de tobillo útil para interpretar sentadilla, zancadas y otras tareas.',result:m.ankle?.skipped?'No realizada':`Izquierda ${finiteValue(m.ankle?.leftBest)?number(m.ankle.leftBest,1)+' cm':'no medido'} · derecha ${finiteValue(m.ankle?.rightBest)?number(m.ankle.rightBest,1)+' cm':'no medido'}`,decision:excerpt(d.trainingImplications,360,'Usar el resultado para ajustar selección y progresión de ejercicios.')})}`}));
  if(hasPhotogrammetryReport(photogrammetryReport))pages.push(page({number:nextPage++,title:'Análisis fotogramétrico',eyebrow:'EVIDENCIA VISUAL · REGISTRO FOTOGRÁFICO',logoUrl,content:`<p class="lead">Las vistas consentidas documentan el punto de partida visual y se interpretan junto con movilidad, fuerza, síntomas y repetibilidad. Se muestran todas las capturas incorporadas a esta evaluación.</p>${renderPhotogrammetryReport(photogrammetryReport)}`}));
  pages.push(page({number:nextPage++,title:'Fuerza',eyebrow:'06 · FUERZA POR PATRONES',logoUrl,content:`<p class="lead">Cada prueba conserva su variante y configuración real. Las cifras se presentan como resultados observados; sólo se bareman cuando existe una referencia compatible.</p>${renderStrengthPatterns(s)}<div class="strength-reading"><section><span>Qué significa</span><p>La fuerza se lee por patrones —tren inferior, empuje, tracción y estabilidad— para orientar elecciones de ejercicio sin mezclar variantes distintas.</p></section><section><span>Decisión que apoya</span><p>${escapeHtml(excerpt(d.trainingImplications,520,'Implicaciones pendientes de revisión por el entrenador'))}</p></section></div>`}));
  const clientCardioContent=c.skipped
    ?`<div class="two-col cardio"><div>${card('Capacidad de esfuerzo',`<div class="not-evaluated-panel"><span>NO EVALUADO</span><h3>La prueba no se realizó</h3><p>${escapeHtml(label(c.skipReason,'Motivo no registrado'))}</p></div>`,'chart-card')}</div><div>${card('Qué significa',`<p>No se inventa ningún resultado ni se sustituye la prueba por una estimación.</p><p>La ausencia queda documentada para que el entrenador decida cuándo completarla.</p>`,'highlight')}</div></div>`
    :c.protocol==='1msts-standard'
      ?`<div class="two-col cardio"><div>${card('1MSTS · 60 segundos',`<div class="metrics compact">${metric('Repeticiones',finiteValue(c.repetitions)?number(c.repetitions):'—')}${metric('Silla',finiteValue(c.chairHeightCm)?number(c.chairHeightCm,1)+' cm':'—')}${metric('Esfuerzo percibido',finiteValue(c.rpe)?number(c.rpe,1)+'/10':'—')}</div>${finiteValue(c.finalHr)&&finiteValue(c.oneMinuteHr)?renderEffortCurve(c):'<p class="caption">Frecuencia cardiaca no registrada; no es requisito universal del 1MSTS.</p>'}`,'chart-card')}</div><div>${card('Interpretación',`<div class="mini-list">${row('Protocolo',cardioProtocolLabel(c))}${row('Resultado',cardioResultDetail(c))}${row('Validez',yesNo(c.valid))}${row('Síntomas',excerpt(c.symptoms,420))}</div><p>${escapeHtml(excerpt(d.trainingImplications,440,'La interpretación final será revisada por el entrenador.'))}</p>`)}${card('Comparabilidad',`<p>${escapeHtml(cardioProtocolNote(c))}</p>`,'soft')}</div></div>`
      :c.protocol==='treadmill-3min-field'
        ?`<div class="two-col cardio"><div>${card('Cinta · 3 minutos',`${renderEffortCurve(c)}<div class="metrics compact">${metric('Velocidad',finiteValue(c.speedKmh)?number(c.speedKmh,1)+' km/h':'—')}${metric('Inclinación',finiteValue(c.inclinePercent)?number(c.inclinePercent,1)+'%':'—')}${metric('Recuperación 1 min',finiteValue(c.deltaOneMinute)?number(c.deltaOneMinute)+' lpm':'—')}${metric('Recuperación 2 min',finiteValue(c.deltaTwoMinute)?number(c.deltaTwoMinute)+' lpm':'—')}</div>`,'chart-card')}</div><div>${card('Cómo se realizó',`<div class="mini-list">${row('Modo',c.locomotionMode)}${row('Método de frecuencia cardiaca',c.hrMethod)}${row('Recuperación',c.recoveryMode)}${row('Esfuerzo percibido final',c.rpe!==null?number(c.rpe,1)+'/10':'—')}${row('Validez',yesNo(c.valid))}</div><p>${escapeHtml(cardioProtocolNote(c))}</p>`)}${card('Decisión del entrenador',`<p>${escapeHtml(excerpt(d.trainingImplications,440,'La interpretación final será revisada por el entrenador.'))}</p>`,'soft')}</div></div>`
        :`<div class="two-col cardio"><div>${card(cardioProtocolLabel(c),`${renderEffortCurve(c)}<div class="metrics compact">${metric('FC reposo',c.restingHr!==null?`${number(c.restingHr)} lpm`:'—')}${metric('FC final',c.finalHr!==null?`${number(c.finalHr)} lpm`:'—')}${metric('Recuperación 1 min',c.deltaOneMinute!==null?`${number(c.deltaOneMinute)} lpm`:'—')}</div>`,'chart-card')}</div><div>${card('Registro técnico',`<div class="mini-list">${row('Protocolo',cardioProtocolLabel(c))}${row('Escalón',c.stepHeightCm!==null?number(c.stepHeightCm,1)+' cm':'—')}${row('Cadencia',c.cadenceBpm!==null?number(c.cadenceBpm)+' pulsos/min':'—')}${row('Esfuerzo percibido final',c.rpe!==null?number(c.rpe,1)+'/10':'—')}${row('Validez',yesNo(c.valid))}</div><p>${escapeHtml(cardioProtocolNote(c))}</p>`)}${card('Decisión del entrenador',`<p>${escapeHtml(excerpt(d.trainingImplications,440,'La interpretación final será revisada por el entrenador.'))}</p>`,'soft')}</div></div>`;
  const clientCardioExplanation=c.skipped?'':clientTestExplanation({
    title:cardioProtocolLabel(c),
    observed:c.protocol==='1msts-standard'?'Número de ciclos completos de sentarse y levantarse en 60 segundos.':c.protocol==='treadmill-3min-field'?'Respuesta de frecuencia cardiaca al esfuerzo y durante la recuperación manteniendo velocidad e inclinación registradas.':'Respuesta al protocolo de esfuerzo registrado con su configuración exacta.',
    importance:c.protocol==='1msts-standard'?'Aporta una referencia funcional submáxima reproducible.':c.protocol==='treadmill-3min-field'?'Establece una referencia individual reproducible de esfuerzo y recuperación.':c.protocol==='ymca-3min-standard'?'Permite interpretar la respuesta al protocolo estándar cuando configuración y validez coinciden.':'Documenta la respuesta al esfuerzo sin apropiarse de baremos de otro protocolo.',
    result:cardioResultDetail(c),
    decision:excerpt(d.trainingImplications,420,'Ajustar la progresión a la respuesta funcional observada.'),
  });
  pages.push(page({number:nextPage++,title:'Capacidad de esfuerzo',eyebrow:'07 · CAPACIDAD DE ESFUERZO',logoUrl,content:`${clientCardioContent}${clientCardioExplanation}<p class="method-note">La interpretación respeta el protocolo realizado. La cinta de 3 minutos se presenta como referencia individual y no hereda baremos YMCA ni puntos de corte de otros protocolos.</p>`}));
  const primaryPriority=safeList(d.priorities)[0]||'Prioridad pendiente de revisión';
  const secondPriority=safeList(d.priorities)[1]||'';
  const preservedStrength=safeList(d.strengths)[0]||'Fortaleza pendiente de revisión';
  pages.push(page({number:nextPage++,title:'Tu prioridad',eyebrow:'08 · DECISIÓN',logoUrl,content:`<div class="priority-page"><span>PRIORIDAD PRINCIPAL</span><h2>${escapeHtml(primaryPriority)}</h2><p>${escapeHtml(excerpt(d.trainingImplications,620,'La aplicación práctica será definida a partir de los resultados registrados.'))}</p><div class="priority-support"><section><span>Fortaleza que conviene preservar</span><strong>${escapeHtml(preservedStrength)}</strong></section>${secondPriority?`<section><span>Segunda prioridad</span><strong>${escapeHtml(secondPriority)}</strong></section>`:''}</div></div>`}));
  pages.push(page({number:nextPage++,title:'Cómo leer este IRI',eyebrow:'09 · CLAVES DE LECTURA',logoUrl,content:`<p class="lead">Este documento combina mediciones, observación y criterio profesional. Su valor está en saber qué dato responde a qué pregunta y qué debe repetirse de la misma manera.</p><div class="context-grid"><section class="report-card"><span>Lo medido</span><h3>Resultados del día de evaluación</h3><p>Composición corporal, movilidad, fuerza y capacidad de esfuerzo se presentan con el protocolo y la configuración realmente utilizados.</p></section><section class="report-card"><span>Lo interpretado</span><h3>Criterio del entrenador</h3><p>${escapeHtml(excerpt(d.coachInterpretation,420,'La interpretación profesional queda vinculada a los resultados disponibles.'))}</p></section><section class="report-card"><span>Bioimpedancia</span><h3>${externalReport?'Documento de máquina incorporado':'Sin documento externo incorporado'}</h3><p>${externalReport?'El informe original se conserva como evidencia y puede añadir páginas a este dossier.':'Los valores registrados permanecen disponibles, pero no se presenta un archivo externo que no exista.'}</p></section><section class="report-card"><span>Fotogrametría</span><h3>${hasPhotogrammetryReport(photogrammetryReport)?'Vistas incorporadas':'Sin capturas incorporadas'}</h3><p>${hasPhotogrammetryReport(photogrammetryReport)?'Las fotografías consentidas se muestran en su propia sección y se interpretan junto con el resto de la evaluación.':'La ausencia de fotografías no se convierte en una página vacía ni en una conclusión clínica.'}</p></section><section class="report-card wide soft"><span>Para comparar en el futuro</span><h3>Repetir protocolo, configuración y condiciones</h3><p>Los cambios sólo son directamente comparables cuando la prueba se repite con condiciones suficientemente equivalentes. El seguimiento y la evolución se registran por separado del Diagnóstico IRI inicial.</p></section></div>`}));
  const closingBody=iriOnly
    ?`<div class="closing-page"><span>QUÉ SABEMOS AHORA</span><h2>Tu punto de partida queda documentado.</h2><p>${escapeHtml(excerpt(d.coachInterpretation,720,'El diagnóstico resume los resultados disponibles y las prioridades identificadas.'))}</p><div class="next-step"><span>Siguiente paso</span><strong>Conservar este informe como referencia y decidir, si procede, cómo abordar las prioridades identificadas.</strong><p>Este documento corresponde a un servicio Solo IRI. No implica planificación, frecuencia contractual ni seguimiento de entrenamiento activo.</p></div>${renderSignatureSlot(coachName,signatureUrl)}</div>`
    :`<div class="closing-page"><span>QUÉ SABEMOS AHORA</span><h2>El diagnóstico orienta la planificación.</h2><p>${escapeHtml(excerpt(d.coachInterpretation,620,'La interpretación profesional queda vinculada a este punto de partida.'))}</p><div class="next-step"><span>Impacto sobre la planificación</span><strong>${escapeHtml(excerpt(d.initialPlan,620,'Plan inicial pendiente de definición'))}</strong><p>Frecuencia orientativa registrada: ${escapeHtml(label(d.recommendedFrequency,'Por definir'))}. Próxima revisión: ${escapeHtml(dateLabel(d.reevaluationDate,'Por definir'))}.</p></div>${renderSignatureSlot(coachName,signatureUrl)}</div>`;
  pages.push(page({number:nextPage++,title:'Cierre',eyebrow:'09 · SIGUIENTE PASO',logoUrl,content:closingBody}));
  return pages;
}

function mobilityTrialRows(mobility={}){const ankle=mobility.ankle||{},posterior=mobility.posteriorChain||{};const max=Math.max(ankle.leftTrials?.length||0,ankle.rightTrials?.length||0,posterior.leftTrials?.length||0,posterior.rightTrials?.length||0,3);return Array.from({length:max},(_,index)=>[String(index+1),ankle.leftTrials?.[index]!==undefined?`${number(ankle.leftTrials[index],1)} cm`:'—',ankle.rightTrials?.[index]!==undefined?`${number(ankle.rightTrials[index],1)} cm`:'—',posterior.leftTrials?.[index]!==undefined?`${number(posterior.leftTrials[index],1)} cm`:'—',posterior.rightTrials?.[index]!==undefined?`${number(posterior.rightTrials[index],1)} cm`:'—']);}
function rawDataPages(draft,context,startNumber){
  const external=context.externalReport?{
    id:context.externalReport.id||null,
    assessmentId:context.externalReport.assessmentId||null,
    fileName:context.externalReport.fileName||null,
    mimeType:context.externalReport.mimeType||null,
    sizeBytes:context.externalReport.sizeBytes??null,
    version:context.externalReport.version??null,
    visibleToClient:context.externalReport.visibleToClient===true,
    uploadedAt:context.externalReport.uploadedAt||null,
    previewAvailable:context.externalReport.printPreviewAvailable===true,
  }:null;
  const photo=context.photogrammetryReport?{
    assessmentId:context.photogrammetryReport.assessmentId||null,
    available:context.photogrammetryReport.available===true,
    quality:context.photogrammetryReport.quality||null,
    analysisStatus:context.photogrammetryReport.analysisStatus||null,
    measurements:context.photogrammetryReport.measurements||{},
    interpretation:context.photogrammetryReport.interpretation||null,
    photos:(Array.isArray(context.photogrammetryReport.photos)?context.photogrammetryReport.photos:[]).map((item)=>({
      view:item.view||null,capturedAt:item.capturedAt||null,widthPx:item.widthPx??null,heightPx:item.heightPx??null,
    })),
  }:null;
  const raw=JSON.stringify({
    reportContext:{clientName:context.clientName,coachName:context.coachName,clientId:context.clientId},
    attachments:{bioimpedance:external,photogrammetry:photo},
    draft,
  },null,2);
  const lines=raw.split('\n');const chunks=[];let current=[];let count=0;
  for(const line of lines){const length=line.length+1;if(current.length&&count+length>1500){chunks.push(current.join('\n'));current=[];count=0;}current.push(line);count+=length;}
  if(current.length)chunks.push(current.join('\n'));
  return chunks.map((chunk,index)=>page({number:startNumber+index,title:`Anexo íntegro de datos · ${index+1}/${chunks.length}`,eyebrow:'ANEXO DINÁMICO · TRAZABILIDAD',logoUrl:context.logoUrl,internal:true,annex:true,content:`<p class="annex-intro">Representación completa del borrador normalizado y de la trazabilidad documental segura utilizada para generar este informe. No incluye URLs firmadas ni rutas privadas de almacenamiento.</p><pre class="raw-data">${escapeHtml(chunk)}</pre>`}));
}

function coachPages(draft,context){
  const {clientName,coachName,logoUrl,clientId='',externalReport=null,photogrammetryReport=null,appOrigin}=context;
  const p=draft.personProfile||{},i=draft.interview||{},b=draft.bodyComposition||{},m=draft.mobility||{},s=draft.strength||{},c=draft.cardio||{},d=draft.diagnosis||{};
  const bodyView=bodyCompositionView(b);
  const completion=firstSessionCompletion(draft);const pages=[];
  pages.push(reportCover({clientName,date:draft.assessmentDate,coachName,logoUrl,internal:true,clientId}));
  pages.push(page({number:2,title:'Resumen técnico',eyebrow:'01 · PANORAMA GENERAL DEL IRI',logoUrl,internal:true,content:`<p class="lead">Perfil técnico de primera sesión. Los resultados se interpretan por protocolo, contexto, validez y calidad de dato.</p>${completionPanel(completion,draft)}${domainScorePanel(draft)}<div class="summary-layout internal-summary"><div>${card('Calidad de datos',`<div class="quality">${row('Completitud',completion.percent+'%')}${row('Coherencia',completion.percent===100?'Alta':'Revisar pendientes')}${row('Sexo para baremos',['female','male'].includes(p.sexForNorms)?p.sexForNorms:'Pendiente')}${row('Revisión del entrenador',d.reviewAccepted?'Aceptada':'Pendiente')}</div>`)}${card('Fortalezas',`<ul class="checks">${listItems(d.strengths,6)}</ul>`)}</div>${card('Evidencia y calidad por áreas',`${domainEvidenceGrid(draft)}<p class="caption">Resumen técnico de disponibilidad y validez. La puntuación funcional usa sólo dominios normados compatibles y conserva la trazabilidad del protocolo.</p>`,'chart-card domain-card')}
</div>${card('Prioridades',`<ol class="priorities">${listItems(d.priorities,6)}</ol>`,'wide')}` }));
  pages.push(page({number:3,title:'Identificación, contacto y logística',eyebrow:'02 · EXPEDIENTE',logoUrl,internal:true,content:`<div class="profile-grid">${card('Identificación',`<div class="mini-list">${row('Cliente',clientName)}${row('Expediente',clientId)}${row('Fecha de nacimiento',dateLabel(p.birthDate))}${row('Sexo para baremos',p.sexForNorms)}${row('Identidad de género',p.genderIdentity)}${row('Pronombres',p.pronouns)}</div>`)}${card('Contacto autorizado',`<div class="mini-list">${row('Correo',p.email)}${row('Teléfono',p.phone)}${row('Canal preferido',p.preferredContactChannel)}${row('Horario de contacto',p.preferredContactTime)}${row('Zona horaria',p.timezone)}</div>`)}${card('Logística de entrenamiento',`<div class="mini-list">${row('Modalidad',p.modality)}${row('Dirección',p.trainingAddress)}${row('Comuna',p.commune)}${row('Tipo de lugar',p.locationType)}${row('Punto de encuentro / acceso',p.accessInstructions)}</div>`)}${card('Servicio y emergencia',`<div class="mini-list">${row('Horario preferido',p.preferredSchedule)}${row('Frecuencia semanal',p.weeklyFrequency!==null?number(p.weeklyFrequency):'—')}${row('Duración habitual',p.sessionDurationMinutes!==null?number(p.sessionDurationMinutes)+' min':'—')}${row('Contacto emergencia',p.emergencyContactName)}${row('Relación',p.emergencyContactRelation)}${row('Teléfono emergencia',p.emergencyContactPhone)}</div>`)}</div>`}));
  pages.push(page({number:4,title:'Entrevista inicial completa',eyebrow:'03 · CONTEXTO DE ENTRENAMIENTO',logoUrl,internal:true,content:`<div class="two-col">${card('Objetivos',`<p><strong>Principal:</strong> ${escapeHtml(excerpt(p.primaryObjective,520))}</p><p><strong>Secundarios:</strong> ${escapeHtml(safeList(p.secondaryObjectives).join(' · ')||'Sin registro')}</p>`)}${card('Experiencia y trayectoria',`<p><strong>Nivel:</strong> ${escapeHtml(label(i.trainingExperience))}</p><p>${escapeHtml(excerpt(i.trainingHistory,650))}</p>`)}${card('Entrenamiento actual',`<p>${escapeHtml(excerpt(i.currentTraining,650))}</p>`)}${card('Disponibilidad',`<p>${escapeHtml(excerpt(i.availability,480))}</p><p><strong>Material:</strong> ${escapeHtml(safeList(p.equipment).join(' · ')||'Sin registro')}</p>`)}</div>${card('Preferencias y observaciones de contexto',`<p>${escapeHtml(excerpt(i.preferences,900))}</p>`,'wide highlight')}` }));
  pages.push(page({number:5,title:'Seguridad y condiciones relevantes',eyebrow:'04 · CRIBADO Y PRECAUCIONES',logoUrl,internal:true,content:`<div class="metrics">${metric('Sueño',i.sleepScore!==null?number(i.sleepScore,1)+'/10':'—')}${metric('Estrés',i.stressScore!==null?number(i.stressScore,1)+'/10':'—')}${metric('Energía',i.energyScore!==null?number(i.energyScore,1)+'/10':'—')}</div><div class="two-col">${card('Antecedentes declarados',`<p>${escapeHtml(excerpt(i.healthHistory,720))}</p>`)}${card('Restricciones',`<p>${escapeHtml(excerpt(i.restrictions,720))}</p>`)}${card('Dolor actual',`<p>${escapeHtml(excerpt(i.currentPain,650))}</p>`)}${card('Cribado',`<div class="mini-list">${row('Aceptado',yesNo(i.screeningAccepted))}${row('Notas',excerpt(i.screeningNotes,600))}</div>`)}</div>${card('Pruebas omitidas y motivos',`<div class="mini-list">${row('Composición',b.skipped?b.skipReason:'Realizada')}${row('Movilidad',m.skipped?m.skipReason:'Realizada')}${row('Fuerza',s.skipped?s.skipReason:'Realizada')}${row('Cardio',c.skipped?c.skipReason:'Realizada')}</div>`,'soft')}` }));
  pages.push(page({number:6,title:'Composición corporal completa',eyebrow:'05 · BIOIMPEDANCIA Y MEDICIONES',logoUrl,internal:true,content:`<div class="metrics four">${metric('Peso',b.weightKg!==null?`${number(b.weightKg,1)} kg`:'—')}${metric('Talla',b.heightCm!==null?`${number(b.heightCm,1)} cm`:'—')}${metric('Grasa corporal',b.bodyFatPercent!==null?`${number(b.bodyFatPercent,1)}%`:'—')}${metric('IMC',b.bmi!==undefined?number(b.bmi,1):'—')}</div><div class="two-col"><div>${card('Composición',`${compositionDonut(b)}<div class="mini-list">${row('Masa magra',b.leanMassKg!==null?number(b.leanMassKg,1)+' kg':'—')}${row('Masa muscular',b.muscleMassKg!==null?number(b.muscleMassKg,1)+' kg':'—')}${row('Agua corporal',b.bodyWaterPercent!==null?number(b.bodyWaterPercent,1)+'%':'—')}${row('Cintura',b.waistCm!==null?number(b.waistCm,1)+' cm':'—')}${row('Grasa visceral',b.visceralFatLevel!==null?number(b.visceralFatLevel):'—')}</div>`,'chart-card')}</div><div>${card('Método y condiciones',`<div class="mini-list">${row('Método',b.method)}${row('Equipo',b.device)}${row('Condiciones',excerpt(b.measurementConditions,500))}${row('Observaciones',excerpt(b.notes,500))}</div>`)}${card('Archivo externo',`<div class="mini-list">${row('Nombre',b.attachmentName)}${row('Tipo',b.attachmentType)}${row('Tamaño',fileSize(b.attachmentSize))}${row('Estado',externalReport?'Guardado y vinculado · versión '+externalReport.version:b.attachmentName?'Metadato histórico sin archivo persistido':'Sin archivo persistido')}</div>`,'soft')}</div></div>`}));
  pages.push(page({number:7,title:'Movilidad · resultados objetivos',eyebrow:'06 · MEDICIONES BILATERALES',logoUrl,internal:true,content:`${card('Tres intentos por lado',compactTable(['Intento','Tobillo I','Tobillo D','Cadena posterior I','Cadena posterior D'],mobilityTrialRows(m),['10%','22.5%','22.5%','22.5%','22.5%']),'table-card')}<div class="two-col">${card(m.ankle?.skipped?'Tobillo · no realizado':'Resumen de tobillo',`<div class="mini-list">${m.ankle?.skipped?row('Motivo',m.ankle?.skipReason):row('Mejor izquierda',m.ankle?.leftBest!==null?number(m.ankle.leftBest,1)+' cm':'—')}${row('Mejor derecha',m.ankle?.rightBest!==null?number(m.ankle.rightBest,1)+' cm':'—')}${row('Asimetría',m.ankle?.asymmetryCm!==null?number(m.ankle.asymmetryCm,1)+' cm':'—')}${row('Dolor',m.ankle?.pain)}${row('Compensación',excerpt(m.ankle?.compensation,420))}</div>`)}${card(m.posteriorChain?.skipped?'Cadena posterior · no realizada':'Resumen de cadena posterior',`<div class="mini-list">${m.posteriorChain?.skipped?row('Motivo',m.posteriorChain?.skipReason):row('Mejor izquierda',m.posteriorChain?.leftBest!==null?number(m.posteriorChain.leftBest,1)+' cm':'—')}${row('Mejor derecha',m.posteriorChain?.rightBest!==null?number(m.posteriorChain.rightBest,1)+' cm':'—')}${row('Asimetría',m.posteriorChain?.asymmetryCm!==null?number(m.posteriorChain.asymmetryCm,1)+' cm':'—')}${row('Dolor',m.posteriorChain?.pain)}</div>`)}</div>`}));
  pages.push(page({number:8,title:'Movilidad · observación estructurada',eyebrow:'07 · PATRONES Y COMPENSACIONES',logoUrl,internal:true,content:`<div class="two-col">${card('Thomas modificado',`<div class="mini-list">${row('Izquierda',m.modifiedThomas?.left)}${row('Derecha',m.modifiedThomas?.right)}${row('Control pélvico',m.modifiedThomas?.pelvicControl)}${row('Dolor',m.modifiedThomas?.pain)}</div>`)}${card(m.hipRotation?.skipped?'Rotación de cadera · no realizada':'Rotación de cadera',`<div class="mini-list">${m.hipRotation?.skipped?row('Motivo',m.hipRotation?.skipReason):row('Resultado',m.hipRotation?.result)}${row('Dolor',m.hipRotation?.pain)}${row('Compensación',excerpt(m.hipRotation?.compensation,520))}</div>`)}${card(m.assistedSquat?.skipped?'Sentadilla observacional · no realizada':'Sentadilla asistida',`<div class="mini-list">${m.assistedSquat?.skipped?row('Motivo',m.assistedSquat?.skipReason):row('Profundidad',m.assistedSquat?.depth)}${row('Talones',m.assistedSquat?.heels)}${row('Rodillas',m.assistedSquat?.knees)}${row('Tronco',m.assistedSquat?.trunk)}${row('Desplazamiento lateral',m.assistedSquat?.lateralShift)}${row('Respuesta a asistencia',m.assistedSquat?.assistanceResponse)}${row('Dolor',m.assistedSquat?.pain)}</div>`,'wide')}${card('Observaciones completas',`<p>${escapeHtml(excerpt(m.notes,1000))}</p>`,'wide highlight')}</div>`}));
  pages.push(page({number:9,title:'Fuerza · tren inferior y cadena posterior',eyebrow:'08 · RESULTADOS Y PROTOCOLOS',logoUrl,internal:true,content:`<div class="protocol-strip"><span>Registro de variante</span><span>Configuración del material</span><span>Validez por prueba</span><span>Sin baremo incompatible</span></div><div class="two-col">${card(s.lowerBody?.skipped?'Tren inferior · no realizado':'Silla 30 segundos',`<div class="mini-list">${s.lowerBody?.skipped?row('Motivo',s.lowerBody?.skipReason):row('Repeticiones',s.chairStand?.repetitions!==null?number(s.chairStand.repetitions):'—')}${row('Altura de silla',s.chairStand?.chairHeightCm!==null?number(s.chairStand.chairHeightCm,1)+' cm':'—')}${row('Válida',yesNo(s.chairStand?.valid))}${row('Notas',excerpt(s.chairStand?.notes,560))}</div>`)}${card(s.lowerBody?.skipped?'Sentadilla libre · no realizada':'Sentadilla libre 60 s',`<div class="mini-list">${s.lowerBody?.skipped?row('Motivo',s.lowerBody?.skipReason):row('Repeticiones',s.squat60?.repetitions!==null?number(s.squat60.repetitions):'—')}${row('Profundidad',s.squat60?.depthCriterion)}${row('Base',s.squat60?.stance)}${row('Válida',yesNo(s.squat60?.valid))}${row('Notas',excerpt(s.squat60?.notes,560))}</div>`)}${card('Cadena posterior',`<div class="mini-list">${row('Protocolo',s.posteriorChain?.protocol)}${row('Tiempo',s.posteriorChain?.seconds!==null?number(s.posteriorChain.seconds)+' s':'—')}${row('Equipo compatible',yesNo(s.posteriorChain?.equipmentCompatible))}${row('Motivo no realizada',excerpt(s.posteriorChain?.notPerformedReason,560))}${row('Dolor',s.posteriorChain?.pain)}</div>`)}</div>${card('Observaciones generales de fuerza',`<p>${escapeHtml(excerpt(s.notes,1000))}</p>`,'highlight')}` }));
  pages.push(page({number:10,title:'Fuerza · empuje, tracción y tronco',eyebrow:'09 · CONFIGURACIÓN Y VALIDEZ',logoUrl,internal:true,content:`<div class="two-col">${card(s.push?.skipped?'Empuje · no realizado':'Empuje',`<div class="mini-list">${s.push?.skipped?row('Motivo',s.push?.skipReason):row('Variante',s.push?.variant)}${row('Repeticiones',s.push?.repetitions!==null?number(s.push.repetitions):'—')}${row('Altura de apoyo',s.push?.supportHeightCm!==null?number(s.push.supportHeightCm,1)+' cm':'—')}${s.push?.skipped?row('Estado','No realizado'):row('Válida',yesNo(s.push?.valid))}${row('Notas',excerpt(s.push?.notes,560))}</div>`)}${card(s.trxRow?.skipped?'Remo TRX · no realizado':'Remo TRX',`<div class="mini-list">${s.trxRow?.skipped?row('Motivo',s.trxRow?.skipReason):row('Repeticiones',s.trxRow?.repetitions!==null?number(s.trxRow.repetitions):'—')}${row('Altura de asas',s.trxRow?.handleHeightCm!==null?number(s.trxRow.handleHeightCm,1)+' cm':'—')}${row('Talones al anclaje',s.trxRow?.heelDistanceCm!==null?number(s.trxRow.heelDistanceCm,1)+' cm':'—')}${row('Ángulo corporal',s.trxRow?.bodyAngleDeg!==null?number(s.trxRow.bodyAngleDeg,1)+'°':'—')}${row('Posición',s.trxRow?.position)}${s.trxRow?.skipped?row('Estado','No realizado'):row('Válida',yesNo(s.trxRow?.valid))}${row('Notas',excerpt(s.trxRow?.notes,520))}</div>`)}${card(s.core?.skipped?'Tronco y estabilidad · no realizado':'Tronco y estabilidad',`<div class="mini-list">${s.core?.skipped?row('Motivo',s.core?.skipReason):row('Plancha frontal',s.core?.frontPlankSeconds!==null?number(s.core.frontPlankSeconds)+' s':'—')}${row('Lateral izquierda',s.core?.sidePlankLeftSeconds!==null?number(s.core.sidePlankLeftSeconds)+' s':'—')}${row('Lateral derecha',s.core?.sidePlankRightSeconds!==null?number(s.core.sidePlankRightSeconds)+' s':'—')}${row('Diferencia lateral',s.core?.sidePlankLeftSeconds!==null&&s.core?.sidePlankRightSeconds!==null?number(Math.abs(s.core.sidePlankLeftSeconds-s.core.sidePlankRightSeconds))+' s':'—')}${row('Calidad',s.core?.quality)}${row('Dolor',s.core?.pain)}</div>`,'wide')}</div>`}));
  const coachCardioContent=c.skipped
    ?`${card('Prueba no realizada',`<div class="not-evaluated-panel"><span>NO EVALUADO</span><h3>Sin medición de capacidad de esfuerzo</h3><p>${escapeHtml(label(c.skipReason,'Motivo no registrado'))}</p></div>`,'highlight')}${card('Trazabilidad de la ausencia',`<div class="mini-list">${row('Estado','No evaluado')}${row('Motivo',c.skipReason)}${row('Baremo','No aplicado')}${row('Clasificación','No emitida')}</div>`,'soft')}`
    :c.protocol==='1msts-standard'
      ?`<div class="protocol-strip"><span>1MSTS estándar</span><span>Silla ${finiteValue(c.chairHeightCm)?number(c.chairHeightCm,1)+' cm':'—'}</span><span>60 s</span><span>${finiteValue(c.repetitions)?number(c.repetitions)+' rep':'Repeticiones pendientes'}</span></div><div class="two-col"><div>${card('Resultado funcional',`<div class="metrics compact">${metric('Repeticiones',finiteValue(c.repetitions)?number(c.repetitions):'—')}${metric('Esfuerzo percibido (RPE)',finiteValue(c.rpe)?number(c.rpe,1)+'/10':'—')}${metric('Validez',c.valid?'Sí':'No')}</div>${finiteValue(c.finalHr)&&finiteValue(c.oneMinuteHr)?renderEffortCurve(c):'<p class="caption">FC no registrada: dato opcional para este protocolo.</p>'}`,'chart-card')}</div><div>${card('Registro técnico',`<div class="mini-list">${row('Configuración',c.configuration)}${row('Síntomas',excerpt(c.symptoms,420))}${row('Motivo de detención',excerpt(c.stopReason,420))}${row('Notas',excerpt(c.notes,520))}</div><p>${escapeHtml(cardioProtocolNote(c))}</p>`)}</div></div>`
      :c.protocol==='treadmill-3min-field'
        ?`<div class="protocol-strip"><span>Cinta 3 min</span><span>${finiteValue(c.speedKmh)?number(c.speedKmh,1)+' km/h':'—'}</span><span>${finiteValue(c.inclinePercent)?number(c.inclinePercent,1)+'% inclinación':'—'}</span><span>${c.durationSeconds!==null?number(c.durationSeconds)+' s':'Duración pendiente'}</span></div><div class="two-col"><div>${card('Recuperación de frecuencia cardiaca',`${renderEffortCurve(c)}<div class="metrics compact">${metric('FC final',c.finalHr!==null?number(c.finalHr)+' lpm':'—')}${metric('Recuperación 1 min',c.deltaOneMinute!==null?number(c.deltaOneMinute)+' lpm':'—')}${metric('Recuperación 2 min',c.deltaTwoMinute!==null?number(c.deltaTwoMinute)+' lpm':'—')}</div>`,'chart-card')}</div><div>${card('Registro técnico',`<div class="mini-list">${row('Modo',c.locomotionMode)}${row('Método FC',c.hrMethod)}${row('Recuperación',c.recoveryMode)}${row('FC +1 min',c.oneMinuteHr!==null?number(c.oneMinuteHr)+' lpm':'—')}${row('FC +2 min',c.twoMinuteHr!==null?number(c.twoMinuteHr)+' lpm':'—')}${row('Esfuerzo percibido (RPE)',c.rpe!==null?number(c.rpe,1)+'/10':'—')}${row('Válida',yesNo(c.valid))}${row('Síntomas',excerpt(c.symptoms,420))}</div><p>${escapeHtml(cardioProtocolNote(c))}</p>`)}</div></div>`
        :`<div class="protocol-strip"><span>${escapeHtml(cardioProtocolLabel(c))}</span><span>Escalón ${c.stepHeightCm!==null?number(c.stepHeightCm,1)+' cm':'—'}</span><span>${c.cadenceBpm!==null?number(c.cadenceBpm)+' pulsos/min':'Cadencia pendiente'}</span><span>${c.durationSeconds!==null?number(c.durationSeconds)+' s':'Duración pendiente'}</span></div><div class="two-col"><div>${card('Recuperación de frecuencia cardiaca',`${renderEffortCurve(c)}<div class="metrics compact">${metric('FC reposo',c.restingHr!==null?number(c.restingHr)+' lpm':'—')}${metric('FC final',c.finalHr!==null?number(c.finalHr)+' lpm':'—')}${metric('ΔFC 1 min',c.deltaOneMinute!==null?number(c.deltaOneMinute)+' lpm':'—')}</div>`,'chart-card')}</div><div>${card('Registro técnico',`<div class="mini-list">${row('FC al minuto',c.oneMinuteHr!==null?number(c.oneMinuteHr)+' lpm':'—')}${row('Esfuerzo percibido (RPE)',c.rpe!==null?number(c.rpe,1)+'/10':'—')}${row('Válida',yesNo(c.valid))}${row('Síntomas',excerpt(c.symptoms,420))}${row('Motivo de detención',excerpt(c.stopReason,420))}</div><p>${escapeHtml(cardioProtocolNote(c))}</p>`)}</div></div>`;
  pages.push(page({number:11,title:'Capacidad de esfuerzo',eyebrow:'10 · CAPACIDAD FUNCIONAL / CARDIORRESPIRATORIA',logoUrl,internal:true,content:coachCardioContent}));
  pages.push(page({number:12,title:'Diagnóstico por dominios',eyebrow:'11 · COBERTURA, VALIDEZ Y LIMITACIONES',logoUrl,internal:true,content:`<div class="two-col">${card('Composición corporal',`<p>${b.skipped?'No realizada: '+escapeHtml(label(b.skipReason)):escapeHtml(`Mediciones registradas: ${[b.weightKg,b.bodyFatPercent,b.leanMassKg,b.muscleMassKg,b.waistCm].filter((value)=>value!==null).length}. Interpretación descriptiva.`)}</p>`)}${card('Movilidad',`<p>${m.skipped?'No realizada: '+escapeHtml(label(m.skipReason)):escapeHtml(`Tobillo: asimetría ${number(m.ankle?.asymmetryCm,1)} cm. Cadena posterior: ${number(m.posteriorChain?.asymmetryCm,1)} cm.`)}</p>`)}${card('Fuerza',`<p>${s.skipped?'No realizada: '+escapeHtml(label(s.skipReason)):escapeHtml(`Silla, empuje, TRX y tronco registrados. Variantes y validez conservadas individualmente.`)}</p>`)}${card('Capacidad de esfuerzo',`<p>${c.skipped?'No realizada: '+escapeHtml(label(c.skipReason)):escapeHtml(`Protocolo ${cardioProtocolLabel(c)}. ${cardioResultDetail(c)}. Validez: ${yesNo(c.valid)}.`)}</p>`)}</div>${card('Justificación del resultado global',`<p>La puntuación funcional IRI se calcula únicamente cuando existen al menos dos dominios con baremos compatibles. La composición corporal y la fotogrametría se mantienen fuera de la nota; cada resultado conserva protocolo, sexo, edad, cobertura y limitaciones.</p>`,'highlight')}${card('Fuentes y baremos',`<div class="mini-list">${row('Sexo para baremos',p.sexForNorms)}${row('Fecha evaluación',dateLabel(draft.assessmentDate))}${row('Motor',draft.schema||draft.firstSessionSchema||'iberfit-iri-first-session-v1')}${row('Motor de baremos',scoreIriPerformance(draft).engineVersion)}${row('Cobertura normativa', scoreIriPerformance(draft).global.coverage.scoredDomains+'/3 dominios puntuables')}${row('Protocolos adaptados', 'Referencia individual; no se mezclan con el protocolo estándar')}</div>`,'soft')}` }));
  pages.push(page({number:13,title:'Interpretación y planificación',eyebrow:'12 · DECISIÓN DEL COACH',logoUrl,internal:true,content:`${card('Interpretación completa del entrenador',`<p>${escapeHtml(excerpt(d.coachInterpretation,1100))}</p>`,'highlight')}${card('Implicaciones para el entrenamiento',`<p>${escapeHtml(excerpt(d.trainingImplications,1050))}</p><ul class="checks">${listItems(d.priorities,6)}</ul>`)}<div class="two-col">${card('Plan inicial',`<p>${escapeHtml(excerpt(d.initialPlan,760))}</p><div class="mini-list">${row('Frecuencia recomendada',d.recommendedFrequency)}</div>`)}${card('Reevaluación y control',`<div class="mini-list">${row('Fecha',dateLabel(d.reevaluationDate,'Por definir'))}${row('Revisión aceptada',yesNo(d.reviewAccepted))}${row('Actualización del borrador',dateLabel(draft.updatedAt?.slice?.(0,10)))}${row('Criterio', 'Repetir protocolos comparables y documentar cambios')}</div>`)}</div>${card('Trazabilidad',`<div class="mini-list">${row('Esquema',draft.schema||'iberfit-iri-first-session-v1')}${row('Cliente',clientId)}${row('Completitud',completion.complete+'/'+completion.total)}${row('Advertencia','Evaluación de rendimiento; no sustituye una evaluación clínica')}${row('Anexo íntegro','Incluido a continuación con todos los campos normalizados')}</div>`,'soft')}` }));
  pages.push(page({number:14,title:'Trazabilidad de protocolos',eyebrow:'13 · VERSIONES Y COMPARABILIDAD',logoUrl,internal:true,content:`${card('Registro por prueba',compactTable(['Prueba','Lado','Variante','Configuración','Versión','Validez','Uso','Adaptación o suspensión'],protocolTraceRows(draft.protocolRecords||[]),['13%','6%','11%','20%','12%','8%','12%','18%']),'table-card')}<p class="caption">Una reevaluación solo se considera directamente comparable cuando coinciden la versión, la variante y la configuración registrada.</p>`}));
  let nextAnnexPage=15;
  if(hasPhotogrammetryReport(photogrammetryReport))pages.push(page({number:nextAnnexPage++,title:'Fotogrametría · registro técnico',eyebrow:'ANEXO TÉCNICO · FOTOGRAMETRÍA',logoUrl,internal:true,annex:true,content:`<p class="lead">Registro visual privado del punto de partida. Se muestran todas las capturas consentidas y, cuando existen, los puntos y mediciones validados por el entrenador.</p>${renderPhotogrammetryReport(photogrammetryReport)}`}));
  const bioimpedanceAnnex=coachIriExternalReportPages(draft,externalReport,logoUrl,nextAnnexPage,appOrigin);
  pages.push(...bioimpedanceAnnex);nextAnnexPage+=bioimpedanceAnnex.length;
  pages.push(...rawDataPages(draft,context,nextAnnexPage));
  return pages;
}

const REPORT_TOKEN_IMPORTS="@import url('/src/m26/design/tokens.css');\n@import url('/src/m26/design/typography.css');\n";
const REPORT_CSS=REPORT_TOKEN_IMPORTS;
const PREMIUM_RC36_CSS='';
const REPORT_DYNAMIC_CSS='';
const REPORT_STYLESHEET=REPORT_TOKEN_IMPORTS;
const REPORT_FIT_LEVELS=Object.freeze([100,98,96,94]);
export function buildIriReportHtml({draft,variant='client',clientName='Cliente IBERFIT',coachName='Coach IBERFIT',clientId='',logoUrl='/public/isotipo-iberfit.png',signatureUrl='',stylesheetHref='',externalReport=null,photogrammetryReport=null,appOrigin=undefined,iriOnly=false}={}){
  if(!draft||!['client','coach'].includes(variant))throw new Error('M26_IRI_REPORT_DOCUMENT_INVALID');
  const context={clientName:clean(clientName,160)||'Cliente IBERFIT',coachName:clean(coachName,160)||'Coach IBERFIT',clientId:clean(clientId,200),logoUrl,signatureUrl:clean(signatureUrl,2000),externalReport,photogrammetryReport,appOrigin,iriOnly:Boolean(iriOnly)};
  const pages=variant==='client'?clientPages(draft,context):coachPages(draft,context);
  if(variant==='client'&&pages.length<10)throw new Error('M26_IRI_REPORT_CLIENT_PAGE_COUNT');
  if(variant==='coach'&&pages.length<16)throw new Error('M26_IRI_REPORT_COACH_PAGE_COUNT');
  const title=`Informe IRI IBERFIT · ${variant==='client'?'Cliente':'Coach / Admin'} · ${context.clientName}`;
  const externalStylesheet=clean(stylesheetHref,2048);
  const stylesheetHrefSafe=externalStylesheet||'/m26/iri-report.css?v=m26-iri-report-premium-v1';
  const stylesheet=`<link rel="stylesheet" href="${escapeHtml(stylesheetHrefSafe)}" data-iri-report-stylesheet>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>${stylesheet}</head><body>${pages.join('')}</body></html>`;
}

function reportStylesheetUrl(locationLike=globalThis.location){
  const origin=clean(locationLike?.origin,512);
  if(!/^https?:\/\//u.test(origin))throw new Error('M26_IRI_REPORT_ORIGIN_UNAVAILABLE');
  const url=new URL('/m26/iri-report.css?v=m26-iri-report-premium-v1',origin);
  if(url.origin!==origin)throw new Error('M26_IRI_REPORT_STYLESHEET_ORIGIN_INVALID');
  return url.href;
}
function directIriReportHtml(html,variant){
  const toolbar=`<nav class="iri-report-toolbar" aria-label="Acciones del informe"><span data-iri-report-status>Cargando y ajustando el informe a A4…</span><button type="button" data-iri-report-print disabled>Imprimir o guardar como PDF</button><button type="button" data-iri-report-close>Cerrar</button></nav>`;
  return String(html).replace('<body>',`<body>${toolbar}`);
}
function reportPageNumber(page,index){
  const match=String(page?.className||'').match(/(?:^|\s)report-page-(\d+)(?:\s|$)/u);
  return Number(match?.[1])||index+1;
}
function reportPageContentFits(page,index=0){
  if(!page||String(page.className||'').split(/\s+/u).includes('cover'))return true;
  const content=page.querySelector?.('.report-page-content');
  const footer=page.querySelector?.('footer');
  if(!content||!footer||typeof content.getBoundingClientRect!=='function'||typeof footer.getBoundingClientRect!=='function')return false;
  const contentRect=content.getBoundingClientRect();
  const footerRect=footer.getBoundingClientRect();
  const pageRect=typeof page.getBoundingClientRect==='function'?page.getBoundingClientRect():null;
  const verticalOk=Number.isFinite(contentRect.bottom)&&Number.isFinite(footerRect.top)&&contentRect.bottom<=footerRect.top-6;
  const horizontalOk=!pageRect||!Number.isFinite(contentRect.right)||!Number.isFinite(pageRect.right)||contentRect.right<=pageRect.right+1;
  return verticalOk&&horizontalOk&&reportPageNumber(page,index)>0;
}
function clearReportFitClass(page){
  if(!page?.classList)return;
  for(const level of REPORT_FIT_LEVELS)page.classList.remove(`iri-report-fit-${level}`);
}
function fitLevelForRatio(ratio){
  const safe=Number.isFinite(Number(ratio))?Math.min(1,Math.max(0,Number(ratio)))*0.985:0;
  return REPORT_FIT_LEVELS.find((level)=>level/100<=safe)||REPORT_FIT_LEVELS.at(-1);
}
function fitReportPages(popup,doc){
  const pages=Array.from(doc?.querySelectorAll?.('.pdf-page')||[]);
  const fitted=[];
  for(const [index,page] of pages.entries()){
    clearReportFitClass(page);
    if(String(page?.className||'').split(/\s+/u).includes('cover'))continue;
    const content=page.querySelector?.('.report-page-content');
    const footer=page.querySelector?.('footer');
    if(!content||!footer||typeof content.getBoundingClientRect!=='function'||typeof footer.getBoundingClientRect!=='function')continue;
    const contentRect=content.getBoundingClientRect();
    const footerRect=footer.getBoundingClientRect();
    const available=Math.max(0,footerRect.top-contentRect.top-8);
    const required=Math.max(Number(content.scrollHeight)||0,Number(contentRect.height)||0,1);
    if(required>available+1){
      const level=fitLevelForRatio(available/required);
      if(level<100){page.classList?.add?.(`iri-report-fit-${level}`);fitted.push({page:reportPageNumber(page,index),level});}
    }
  }
  const failed=pages.map((page,index)=>({page,index})).filter(({page,index})=>!reportPageContentFits(page,index)).map(({page,index})=>reportPageNumber(page,index));
  return {ok:failed.length===0,failed,fitted};
}
function reportLayoutReady(popup,doc){
  const pages=Array.from(doc?.querySelectorAll?.('.pdf-page')||[]);
  if(!pages.length||typeof popup?.getComputedStyle!=='function')return false;
  const dimensionsOk=pages.every((page)=>{
    const style=popup.getComputedStyle(page);
    const width=Number.parseFloat(style?.width||'0');
    const height=Number.parseFloat(style?.height||'0');
    return style?.position==='relative'&&Number.isFinite(width)&&width>=700&&Number.isFinite(height)&&height>=1050;
  });
  return dimensionsOk&&pages.every((page,index)=>reportPageContentFits(page,index));
}
function waitForReportAssets(doc){
  const fontsReady=doc?.fonts?.ready&&typeof doc.fonts.ready.then==='function'?doc.fonts.ready:Promise.resolve();
  const assets=Array.from(doc?.querySelectorAll?.('img,svg image')||[]);
  const assetsReady=Promise.all(assets.map((asset)=>{
    if(asset?.tagName?.toLowerCase?.()==='img'&&asset.complete)return Promise.resolve();
    return new Promise((resolve)=>{
      let timer=null;const done=()=>{if(timer!==null)clearTimeout(timer);resolve();};
      asset?.addEventListener?.('load',done,{once:true});
      asset?.addEventListener?.('error',done,{once:true});
      timer=setTimeout(done,5000);
    });
  }));
  return Promise.all([fontsReady,assetsReady]);
}
function bindDirectIriReportWindow(popup){
  const doc=popup?.document;if(!doc?.querySelector)throw new Error('M26_IRI_REPORT_WINDOW_UNAVAILABLE');
  const stylesheet=doc.querySelector('[data-iri-report-stylesheet]');
  const printButton=doc.querySelector('[data-iri-report-print]');
  const closeButton=doc.querySelector('[data-iri-report-close]');
  const status=doc.querySelector('[data-iri-report-status]');
  if(!stylesheet||!printButton||!closeButton||!status)throw new Error('M26_IRI_REPORT_CONTROLS_UNAVAILABLE');
  const setState=(state,message)=>{
    if(doc.documentElement?.dataset)doc.documentElement.dataset.iriReportState=state;
    status.textContent=message;
  };
  let verification=null;
  const verifyAndEnable=()=>{
    if(verification)return verification;
    verification=(async()=>{
      printButton.disabled=true;
      setState('fitting','Ajustando todas las páginas al formato A4…');
      await waitForReportAssets(doc);
      const schedule=typeof popup.requestAnimationFrame==='function'?popup.requestAnimationFrame.bind(popup):(callback)=>setTimeout(callback,0);
      await new Promise((resolve)=>schedule(()=>schedule(resolve)));
      const fit=fitReportPages(popup,doc);
      await new Promise((resolve)=>schedule(()=>schedule(resolve)));
      if(!fit.ok||!reportLayoutReady(popup,doc)){
        printButton.disabled=true;
        const pages=fit.failed.length?` Páginas: ${fit.failed.join(', ')}.`:'';
        setState('error',`El contenido no cabe con calidad en A4.${pages} Cierra esta ventana y vuelve a abrir el informe.`);
        return false;
      }
      printButton.disabled=false;
      setState('ready','Informe A4 listo · En «Más ajustes», desactiva «Encabezados y pies de página».');
      popup.focus?.();
      return true;
    })().finally(()=>{verification=null;});
    return verification;
  };
  stylesheet.addEventListener?.('load',verifyAndEnable,{once:true});
  stylesheet.addEventListener?.('error',()=>{
    printButton.disabled=true;
    setState('error','No se pudo cargar el diseño. Cierra esta ventana y vuelve a abrir el informe.');
  },{once:true});
  if(stylesheet.sheet)void verifyAndEnable();
  printButton.addEventListener?.('click',async()=>{
    if(printButton.disabled||doc.documentElement?.dataset?.iriReportState!=='ready')return;
    printButton.disabled=true;
    setState('preparing','Verificando el ajuste A4 antes de imprimir…');
    try{
      await waitForReportAssets(doc);
      const fit=fitReportPages(popup,doc);
      if(!fit.ok||!reportLayoutReady(popup,doc))throw new Error(`M26_IRI_REPORT_LAYOUT_NOT_READY:${fit.failed.join(',')}`);
      popup.focus?.();
      popup.print?.();
      setState('ready','Informe A4 listo · En «Más ajustes», desactiva «Encabezados y pies de página».');
    }catch{
      setState('error','No se pudo asegurar el ajuste A4. Cierra esta ventana y vuelve a abrir el informe.');
    }finally{
      printButton.disabled=doc.documentElement?.dataset?.iriReportState!=='ready';
    }
  });
  closeButton.addEventListener?.('click',()=>popup.close?.());
}
function mountIriReportDocument(popup,html){
  const doc=popup?.document;
  const Parser=popup?.DOMParser||doc?.defaultView?.DOMParser||globalThis.DOMParser;
  if(!doc?.documentElement||typeof Parser!=='function'||typeof doc.importNode!=='function'||typeof doc.replaceChild!=='function')throw new Error('M26_IRI_REPORT_POPUP_BLOCKED');
  const parsed=new Parser().parseFromString(String(html||''),'text/html');
  if(!parsed?.documentElement)throw new Error('M26_IRI_REPORT_RENDER_FAILED');
  const imported=doc.importNode(parsed.documentElement,true);
  doc.replaceChild(imported,doc.documentElement);
  return doc;
}
export function prepareIriReportPrintTarget(openWindow=globalThis.open){
  if(typeof openWindow!=='function')return null;
  const popup=openWindow('about:blank','_blank');
  if(!popup)return null;
  try{popup.opener=null;}catch{}
  return popup;
}
export function openIriReportPrint({draft,variant='client',clientName,coachName,clientId,logoUrl,signatureUrl='',externalReport=null,photogrammetryReport=null,iriOnly=false,printTarget=null,openWindow=globalThis.open,locationLike=globalThis.location}={}){
  const stylesheetHref=reportStylesheetUrl(locationLike);
  const html=buildIriReportHtml({draft,variant,clientName,coachName,clientId,logoUrl,signatureUrl,stylesheetHref,externalReport,photogrammetryReport,appOrigin:locationLike?.origin,iriOnly});
  const pageCount=(html.match(/class="pdf-page(?:\s|")/gu)||[]).length;
  if(variant==='client'&&pageCount<10)throw new Error('M26_IRI_REPORT_CLIENT_PAGE_COUNT');
  if(variant==='coach'&&pageCount<16)throw new Error('M26_IRI_REPORT_COACH_PAGE_COUNT');
  const popup=printTarget||prepareIriReportPrintTarget(openWindow);
  if(!popup?.document)throw new Error('M26_IRI_REPORT_POPUP_BLOCKED');
  try{
    mountIriReportDocument(popup,directIriReportHtml(html,variant));
    bindDirectIriReportWindow(popup);
  }catch(error){try{popup.close?.();}catch{}throw error;}
  return {ok:true,variant,pages:pageCount,mode:'direct-window'};
}

export const __iriReportInternals=Object.freeze({escapeHtml,clean,label,excerpt,distinctText,number,dateLabel,heartRateChart,coverageScore,bodyCompositionView,hasPhotogrammetryReport,clientIriExternalReportComplement,REPORT_CSS,PREMIUM_RC36_CSS,REPORT_DYNAMIC_CSS,REPORT_STYLESHEET,REPORT_FIT_LEVELS,widthClass,percentWidthClass,reportStylesheetUrl,directIriReportHtml,reportPageNumber,reportPageContentFits,fitLevelForRatio,fitReportPages,reportLayoutReady,waitForReportAssets,bindDirectIriReportWindow,mountIriReportDocument,rawDataPages});
