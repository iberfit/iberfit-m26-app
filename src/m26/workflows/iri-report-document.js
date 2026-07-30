import {firstSessionCompletion} from './iri-first-session.js';

const PALETTE=Object.freeze({
  ivory:'#faf6ed',
  paper:'#fffdf8',
  forest:'#082218',
  forestText:'#183328',
  forestSoft:'#315246',
  gold:'#b9944f',
  goldLight:'#d9bf82',
  muted:'#64736b',
  line:'#dfd2ba',
});

function escapeHtml(value){return String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
function clean(value,max=4000){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);}
function label(value,fallback='Sin registro'){const text=clean(value,1200);return text||fallback;}
function excerpt(value,max=420,fallback='Sin registro'){const text=clean(value,4000);if(!text)return fallback;return text.length>max?`${text.slice(0,Math.max(0,max-1)).trimEnd()}…`:text;}
function number(value,digits=0){const n=Number(value);return Number.isFinite(n)?n.toLocaleString('es-ES',{minimumFractionDigits:digits,maximumFractionDigits:digits}):'—';}
function dateLabel(value){if(!value)return 'Sin fecha';const date=new Date(`${String(value).slice(0,10)}T12:00:00Z`);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date):String(value);}
function yesNo(value){return value===true?'Sí':value===false?'No':'Sin registro';}
function fileSize(value){const n=Number(value);if(!Number.isFinite(n)||n<0)return '—';if(n<1024)return `${number(n)} B`;if(n<1024*1024)return `${number(n/1024,1)} KB`;return `${number(n/(1024*1024),1)} MB`;}
function safeList(value){return Array.isArray(value)?value.map((item)=>clean(item,600)).filter(Boolean):[];}
function listItems(items=[],limit=6){const safe=safeList(items).slice(0,limit);return safe.length?safe.map((item)=>`<li>${escapeHtml(item)}</li>`).join(''):'<li>Sin registro</li>';}
function metric(title,value,note=''){return `<article class="metric"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong>${note?`<small>${escapeHtml(note)}</small>`:''}</article>`;}
function card(title,body,extra=''){return `<section class="card ${extra}"><h3>${escapeHtml(title)}</h3>${body}</section>`;}
function row(title,value){return `<p><span>${escapeHtml(title)}</span><strong>${escapeHtml(label(value))}</strong></p>`;}
function compactTable(headers,rows,widths=[]){const colgroup=widths.length?`<colgroup>${widths.map((width)=>`<col style="width:${escapeHtml(width)}">`).join('')}</colgroup>`:'';return `<table>${colgroup}<thead><tr>${headers.map((item)=>`<th>${escapeHtml(item)}</th>`).join('')}</tr></thead><tbody>${rows.map((values)=>`<tr>${values.map((value)=>`<td>${escapeHtml(label(value,'—'))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
function page({number,title,eyebrow='INFORME IRI',content,logoUrl,cover=false,internal=false,annex=false}){
  const sectionMatch=String(eyebrow||'').match(/^(\d{2})\s*·\s*(.+)$/u);
  const sectionNumber=sectionMatch?.[1]||String(number).padStart(2,'0');
  const sectionLabel=sectionMatch?.[2]||String(eyebrow||'INFORME IRI');
  const watermark=!cover?`<img class="watermark premium-watermark" src="${escapeHtml(logoUrl)}" alt="" aria-hidden="true">`:'';
  const ornaments=!cover?'<i class="page-orbit page-orbit-one" aria-hidden="true"></i><i class="page-orbit page-orbit-two" aria-hidden="true"></i>':'';
  const header=cover?'':`<header class="premium-header"><div class="section-tab"><span class="section-index">${escapeHtml(sectionNumber)}</span><div class="section-copy"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(sectionLabel)}</p></div></div></header>`;
  const pageCount=internal?`Página ${number}`:`${String(number).padStart(2,'0')} / 07`;
  return `<section class="pdf-page m26-premium-report-v2${cover?' cover':''}${internal?' internal':''}${annex?' annex':''}">${ornaments}${watermark}${header}<main>${content}</main><footer><span><b>IBERFIT</b> · Diagnóstico, planificación, control y seguimiento</span><span>${pageCount}</span></footer></section>`;
}
function ratioBar(labelText,value,max=100,note='',suffix=''){const numeric=Number(value);const width=Number.isFinite(numeric)&&max>0?Math.max(0,Math.min(100,(numeric/max)*100)):0;return `<div class="bar-row"><div><span>${escapeHtml(labelText)}</span>${note?`<small>${escapeHtml(note)}</small>`:''}</div><div class="bar-track"><i style="width:${width.toFixed(1)}%"></i></div><strong>${Number.isFinite(numeric)?escapeHtml(number(numeric,numeric%1?1:0)+suffix):'—'}</strong></div>`;}
function symmetryRow(name,left,right,unit=''){const l=Number(left),r=Number(right),max=Math.max(l||0,r||0,1);return `<div class="symmetry-row"><span>${escapeHtml(name)}</span><div class="side left"><b>${Number.isFinite(l)?escapeHtml(number(l,1)+unit):'—'}</b><i style="width:${Number.isFinite(l)?Math.min(100,l/max*100):0}%"></i></div><div class="body-dot"></div><div class="side right"><i style="width:${Number.isFinite(r)?Math.min(100,r/max*100):0}%"></i><b>${Number.isFinite(r)?escapeHtml(number(r,1)+unit):'—'}</b></div></div>`;}
function chartPoint(value,index,min,max,width=460,height=170,total=3){const safe=Number(value);if(!Number.isFinite(safe))return null;const x=42+index*((width-84)/Math.max(1,total-1));const y=20+(max-safe)*((height-50)/(max-min||1));return {x,y,value:safe,index};}
function heartRateChart(cardio={}){const series=[['Reposo',cardio.restingHr],['Final',cardio.finalHr],['1 min',cardio.oneMinuteHr],['2 min',cardio.twoMinuteHr]].filter(([,value])=>Number.isFinite(Number(value)));const valid=series.map(([,value])=>Number(value));if(valid.length<2)return '<div class="chart-empty">Datos insuficientes para representar la recuperación.</div>';const min=Math.max(30,Math.floor(Math.min(...valid)/10)*10-10),max=Math.min(240,Math.ceil(Math.max(...valid)/10)*10+10);const points=series.map(([,value],index)=>chartPoint(value,index,min,max,460,170,series.length));const path=points.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' ');return `<svg class="line-chart" viewBox="0 0 460 190" role="img" aria-label="Recuperación de frecuencia cardiaca"><line x1="42" y1="20" x2="42" y2="150"/><line x1="42" y1="150" x2="420" y2="150"/><path d="${path}"/>${points.map((point,index)=>`<circle cx="${point.x}" cy="${point.y}" r="5"/><text x="${point.x}" y="${point.y-12}" text-anchor="middle">${point.value}</text><text x="${point.x}" y="173" text-anchor="middle">${escapeHtml(series[index][0])}</text>`).join('')}<text x="8" y="27">${max}</text><text x="8" y="150">${min}</text></svg>`;}
function evidenceStatus(labelText,status,detail,note=''){
  const tone=status==='Registrado'||status==='Válido'?'complete':status==='No realizada'?'skipped':'pending';
  return `<article class="evidence-item is-${tone}"><div><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(status)}</strong></div><p>${escapeHtml(detail)}</p>${note?`<small>${escapeHtml(note)}</small>`:''}</article>`;
}
function domainEvidenceGrid(draft){
  const body=draft.bodyComposition||{},mobility=draft.mobility||{},strength=draft.strength||{},cardio=draft.cardio||{};
  const bodyCount=[body.weightKg,body.bodyFatPercent,body.leanMassKg,body.muscleMassKg,body.bodyWaterPercent,body.waistCm,body.visceralFatLevel].filter((value)=>value!==null&&value!==undefined&&value!=='').length;
  const mobilityCount=[mobility.ankle?.leftBest,mobility.ankle?.rightBest,mobility.posteriorChain?.leftBest,mobility.posteriorChain?.rightBest,mobility.hipRotation?.result,mobility.assistedSquat?.depth].filter((value)=>value!==null&&value!==undefined&&value!=='').length;
  const validStrength=[strength.chairStand?.valid,strength.push?.valid,strength.trxRow?.valid].filter((value)=>value===true).length;
  const cardioReady=cardio.valid===true&&Number.isFinite(Number(cardio.finalHr))&&Number.isFinite(Number(cardio.oneMinuteHr));
  const bodyState=body.skipped?'No realizada':bodyCount?'Registrado':'Pendiente';
  const mobilityState=mobility.skipped?'No realizada':mobilityCount?'Registrado':'Pendiente';
  const strengthState=strength.skipped?'No realizada':validStrength?'Registrado':'Pendiente';
  const cardioState=cardio.skipped?'No realizada':cardioReady?'Válido':'Pendiente';
  return `<div class="domain-evidence">${evidenceStatus('Composición corporal',bodyState,body.skipped?label(body.skipReason,'Motivo no registrado'):`${bodyCount} mediciones objetivas`,body.method?`Método: ${label(body.method)}`:'Método pendiente')}${evidenceStatus('Movilidad y movimiento',mobilityState,mobility.skipped?label(mobility.skipReason,'Motivo no registrado'):`${mobilityCount} resultados u observaciones estructuradas`,'Se interpreta rango, simetría, técnica y síntomas')}${evidenceStatus('Fuerza por patrones',strengthState,strength.skipped?label(strength.skipReason,'Motivo no registrado'):`${validStrength} protocolos marcados como válidos`,'Las variantes no se mezclan entre sí')}${evidenceStatus('Cardiorrespiratorio',cardioState,cardio.skipped?label(cardio.skipReason,'Motivo no registrado'):cardioReady?`Recuperación al minuto: ${number(cardio.deltaOneMinute)} lpm`:'Falta una prueba válida y completa','Protocolo y cadencia deben quedar registrados')}</div>`;
}
function coverageScore(draft){return firstSessionCompletion(draft).percent;}
function clientTestExplanation({title,observed,importance,result,decision}){return `<section class="client-test-explanation"><h3>${escapeHtml(title)}</h3><div><p><span>Qué observamos</span><strong>${escapeHtml(label(observed))}</strong></p><p><span>Por qué importa</span><strong>${escapeHtml(label(importance))}</strong></p><p><span>Resultado</span><strong>${escapeHtml(label(result))}</strong></p><p><span>Decisión</span><strong>${escapeHtml(label(decision))}</strong></p></div></section>`;}
function protocolTraceRows(records=[]){return (Array.isArray(records)?records:[]).map((record)=>[record.testName,record.side==='left'?'Izquierda':record.side==='right'?'Derecha':record.side==='bilateral'?'Bilateral':'—',record.variant,record.configuration,record.protocolVersion,record.valid===true?'Válida':record.valid===false?'No válida':'Sin confirmar',[record.adaptationReason,record.stopReason].filter(Boolean).join(' · ')||'—']);}

function strengthRows(draft){const s=draft.strength||{};return [
  ['Silla 30 s',s.chairStand?.repetitions,' rep',40,'Protocolo estandarizado'],
  [`Empuje · ${label(s.push?.variant,'variante')}`,s.push?.repetitions,' rep',35,s.push?.supportHeightCm?`Apoyo ${number(s.push.supportHeightCm)} cm`:''],
  ['Remo TRX',s.trxRow?.repetitions,' rep',35,s.trxRow?.handleHeightCm?`Asas ${number(s.trxRow.handleHeightCm)} cm`:'Referencia individual'],
  ['Plancha frontal',s.core?.frontPlankSeconds,' s',180,'Calidad técnica registrada'],
  ['Plancha lateral izquierda',s.core?.sidePlankLeftSeconds,' s',180,''],
  ['Plancha lateral derecha',s.core?.sidePlankRightSeconds,' s',180,''],
];}
function compositionDonut(body={}){const fat=Number(body.bodyFatPercent);const fatPct=Number.isFinite(fat)?Math.max(0,Math.min(100,fat)):0;const circumference=251.33;const dash=(circumference*fatPct/100).toFixed(2);const gap=(circumference-Number(dash)).toFixed(2);return `<svg class="donut-svg" viewBox="0 0 120 120" role="img" aria-label="Porcentaje de grasa corporal"><circle cx="60" cy="60" r="40" class="donut-base"/><circle cx="60" cy="60" r="40" class="donut-value" stroke-dasharray="${dash} ${gap}" transform="rotate(-90 60 60)"/><circle cx="60" cy="60" r="27" class="donut-center"/><text x="60" y="58" text-anchor="middle" class="donut-number">${Number.isFinite(fat)?number(fat,1)+'%':'—'}</text><text x="60" y="75" text-anchor="middle" class="donut-label">grasa</text></svg>`;}
function completionPanel(completion,draft){const valid=[draft.strength?.chairStand?.valid,draft.strength?.push?.valid,draft.strength?.trxRow?.valid,draft.cardio?.valid].filter((value)=>value===true).length;return `<section class="completion-panel"><div><span>Completitud del proceso</span><strong>${completion.percent}%</strong><small>${completion.complete} de ${completion.total} etapas</small></div><div><span>Protocolos válidos registrados</span><strong>${valid}/4</strong><small>Sin mezclar variantes incompatibles</small></div><div><span>Cobertura normativa</span><strong>No consolidada</strong><small>Solo se aplica con baremo compatible</small></div></section>`;}
function reportCover({clientName,date,coachName,logoUrl,internal,clientId=''}){return page({number:1,cover:true,internal,logoUrl,title:'',content:`<img class="cover-watermark" src="${escapeHtml(logoUrl)}" alt="" aria-hidden="true"><div class="cover-orbit one"></div><div class="cover-orbit two"></div><div class="cover-lockup"><img class="cover-isotipo" src="${escapeHtml(logoUrl)}" alt="Isotipo IBERFIT"><div class="cover-wordmark"><strong>IBERFIT</strong><span>Entrenamiento personal<br>con criterio</span></div></div><div class="cover-copy"><p>${internal?'INFORME IRI · COACH / ADMIN':'INFORME DE EVALUACIÓN IRI'}</p><h1>Índice de<br>Rendimiento<br>IBERFIT</h1><div class="gold-line"></div><span class="cover-claim">Diagnóstico · Planificación · Control · Seguimiento</span></div><div class="cover-data"><div class="cover-data-primary"><span>Cliente</span><strong>${escapeHtml(clientName)}</strong></div><div><span>Fecha de evaluación</span><strong>${escapeHtml(dateLabel(date))}</strong></div><div><span>Entrenador</span><strong>${escapeHtml(coachName)}</strong></div>${internal?`<div><span>Expediente</span><strong>${escapeHtml(label(clientId,'Sin identificador'))}</strong></div>`:''}<div class="cover-tags"><em>${internal?'USO INTERNO':'INFORME CLIENTE'}</em><em>DATOS TRAZABLES</em></div></div>`});}
function clientPages(draft,context){
  const {clientName,coachName,logoUrl}=context;
  const p=draft.personProfile||{},i=draft.interview||{},b=draft.bodyComposition||{},m=draft.mobility||{},s=draft.strength||{},c=draft.cardio||{},d=draft.diagnosis||{};
  const completion=firstSessionCompletion(draft);const pages=[];
  pages.push(reportCover({clientName,date:draft.assessmentDate,coachName,logoUrl,internal:false}));
  pages.push(page({number:2,title:'Tu punto de partida',eyebrow:'01 · RESUMEN EJECUTIVO',logoUrl,content:`<p class="lead">Esta evaluación resume tu situación actual y orienta un plan alineado con tus objetivos.</p>${completionPanel(completion,draft)}<div class="summary-layout"><div>${card('Tus fortalezas',`<ul class="checks">${listItems(d.strengths,3)}</ul>`)}${card('Tus prioridades',`<ol class="priorities">${listItems(d.priorities,3)}</ol>`)}</div>${card('Evidencia por áreas',`${domainEvidenceGrid(draft)}<p class="caption">Cada área muestra datos disponibles, validez y limitaciones. No se calcula una puntuación global ni un percentil universal.</p>`,'chart-card domain-card')}
</div><div class="summary-band"><div><span>Confianza de la evaluación</span><strong>${completion.percent===100&&d.reviewAccepted?'Alta':'En revisión'}</strong></div><div><span>Lectura integrada</span><strong>Sin puntuación global</strong></div><div><span>Próxima revisión</span><strong>${escapeHtml(dateLabel(d.reevaluationDate))}</strong></div></div>`}));
  pages.push(page({number:3,title:'Contexto y objetivos',eyebrow:'02 · TU CONTEXTO',logoUrl,content:`<p class="lead">Comprender tu realidad permite planificar con más precisión y continuidad.</p><div class="context-grid">${card('Objetivo principal',`<p>${escapeHtml(label(p.primaryObjective))}</p>`)}${card('Objetivos secundarios',`<ul>${listItems(p.secondaryObjectives,5)}</ul>`)}${card('Experiencia y actividad actual',`<p><strong>${escapeHtml(label(i.trainingExperience))}</strong></p><p>${escapeHtml(excerpt(i.currentTraining,380,'Sin entrenamiento actual registrado'))}</p>`)}${card('Disponibilidad',`<p><strong>${escapeHtml(label(i.availability))}</strong></p><p>${escapeHtml(label(p.preferredSchedule,'Horario por definir'))}</p>`)}${card('Entorno de entrenamiento',`<p><strong>${escapeHtml(label(p.modality))}</strong></p><p>${escapeHtml(label(p.locationType,'Tipo de lugar por definir'))}</p>`)}${card('Material disponible',`<p>${escapeHtml(safeList(p.equipment).join(' · ')||'Sin registro')}</p>`)}${card('Preferencias',`<p>${escapeHtml(excerpt(i.preferences,460,'Sin preferencias especiales registradas'))}</p>`,'wide')}${card('Consideraciones declaradas',`<p>${escapeHtml(excerpt(i.restrictions,460,'Sin restricciones declaradas'))}</p>`,'wide soft') }</div>`}));
  pages.push(page({number:4,title:'Tu composición actual',eyebrow:'03 · COMPOSICIÓN CORPORAL',logoUrl,content:`<p class="lead">Datos descriptivos obtenidos mediante el método y las condiciones registradas. La bioimpedancia es una estimación para seguimiento y no constituye una puntuación, diagnóstico ni valoración personal.</p><div class="metrics four">${metric('Peso',b.weightKg!==null?`${number(b.weightKg,1)} kg`:'—')}${metric('Grasa corporal',b.bodyFatPercent!==null?`${number(b.bodyFatPercent,1)}%`:'—')}${metric('Masa magra',b.leanMassKg!==null?`${number(b.leanMassKg,1)} kg`:'—')}${metric('Agua corporal',b.bodyWaterPercent!==null?`${number(b.bodyWaterPercent,1)}%`:'—')}</div><div class="two-col composition"><div>${card('Resumen visual',`${compositionDonut(b)}<div class="mini-list">${row('Método',b.method)}${row('Equipo',b.device)}${row('IMC calculado',b.bmi!==undefined?number(b.bmi,1):'—')}</div>`,'chart-card')}</div><div>${card('Medidas complementarias',`<div class="mini-list">${row('Talla',b.heightCm!==null?number(b.heightCm,1)+' cm':'—')}${row('Cintura',b.waistCm!==null?number(b.waistCm,1)+' cm':'—')}${row('Masa muscular',b.muscleMassKg!==null?number(b.muscleMassKg,1)+' kg':'—')}${row('Grasa visceral',b.visceralFatLevel!==null?number(b.visceralFatLevel):'—')}</div>`)}${card('Informe externo',`<p>${b.attachmentName?`Documento registrado: <strong>${escapeHtml(b.attachmentName)}</strong>`:'No se registró un documento externo.'}</p><p class="muted">${escapeHtml(excerpt(b.measurementConditions,300,'Condiciones no registradas'))}</p>`,'soft')}</div></div>`}));
  pages.push(page({number:5,title:'Movimiento y movilidad',eyebrow:'04 · MOVILIDAD',logoUrl,content:`<div class="two-col"><div>${card('Simetría izquierda–derecha',`${symmetryRow('Tobillo',m.ankle?.leftBest,m.ankle?.rightBest,' cm')}${symmetryRow('Cadena posterior',m.posteriorChain?.leftBest,m.posteriorChain?.rightBest,' cm')}<p class="caption">Se muestran los mejores valores registrados por lado.</p>`,'chart-card')}</div><div>${card('Observación estructurada',`<div class="mini-list">${row('Thomas modificado · izquierda',m.modifiedThomas?.left)}${row('Thomas modificado · derecha',m.modifiedThomas?.right)}${row('Rotación de cadera',m.hipRotation?.result)}${row('Sentadilla · profundidad',m.assistedSquat?.depth)}${row('Respuesta a asistencia',m.assistedSquat?.assistanceResponse)}</div>`)}</div></div><div class="two-col">${card('Dolor y compensaciones',`<p><strong>Tobillo:</strong> ${escapeHtml(label(m.ankle?.pain,'Sin dolor registrado'))}</p><p><strong>Cadena posterior:</strong> ${escapeHtml(label(m.posteriorChain?.pain,'Sin dolor registrado'))}</p><p><strong>Compensaciones:</strong> ${escapeHtml(excerpt(m.ankle?.compensation||m.hipRotation?.compensation,360,'Sin compensaciones relevantes registradas'))}</p>`)}${card('Lectura del Coach',`<p>${escapeHtml(excerpt(d.coachInterpretation,430,'Interpretación pendiente de revisión por el Coach'))}</p>`,'highlight')}</div>${clientTestExplanation({title:'Rodilla a pared',observed:'Movilidad del tobillo en apoyo.',importance:'Puede influir en la profundidad y el control de movimientos como la sentadilla.',result:`Izquierda ${number(m.ankle?.leftBest,1)} cm · derecha ${number(m.ankle?.rightBest,1)} cm.`,decision:excerpt(d.trainingImplications,220,'Mantener o mejorar la movilidad con trabajo individualizado.')})}` }));
  pages.push(page({number:6,title:'Fuerza por patrones',eyebrow:'05 · FUERZA',logoUrl,content:`<p class="lead">Cada resultado conserva su variante y configuración. Las pruebas adaptadas se comparan únicamente consigo mismas.</p>${card('Resultados principales',`<div class="bars">${strengthRows(draft).map(([name,value,unit,max,note])=>ratioBar(name,value,max,note,unit)).join('')}</div><p class="caption">Las barras ordenan visualmente los resultados; no representan un baremo universal.</p>`,'chart-card')}<div class="two-col">${card('Calidad y validez',`<div class="mini-list">${row('Silla 30 s válida',yesNo(s.chairStand?.valid))}${row('Empuje válido',yesNo(s.push?.valid))}${row('Remo TRX válido',yesNo(s.trxRow?.valid))}${row('Calidad del core',s.core?.quality)}</div>`)}${card('Prioridad de fuerza',`<p>${escapeHtml(excerpt(d.trainingImplications,430,'Implicaciones pendientes de revisión'))}</p>`,'highlight')}</div>${clientTestExplanation({title:'Fuerza funcional',observed:'Capacidad de levantarse, empujar, traccionar y estabilizar el tronco.',importance:'Ayuda a seleccionar ejercicios, variantes y progresiones adecuadas.',result:`Silla ${number(s.chairStand?.repetitions)} rep · empuje ${number(s.push?.repetitions)} rep · TRX ${number(s.trxRow?.repetitions)} rep.`,decision:excerpt(d.trainingImplications,220,'Progresar con técnica y configuración comparables.')})}` }));
  pages.push(page({number:7,title:'Capacidad cardiorrespiratoria y plan',eyebrow:'06 · CARDIORRESPIRATORIO Y PRÓXIMOS PASOS',logoUrl,content:`<div class="two-col cardio"><div>${card('YMCA · 3 minutos',`${heartRateChart(c)}<div class="metrics compact">${metric('FC reposo',c.restingHr!==null?`${number(c.restingHr)} lpm`:'—')}${metric('FC final',c.finalHr!==null?`${number(c.finalHr)} lpm`:'—')}${metric('Recuperación 1 min',c.deltaOneMinute!==null?`${number(c.deltaOneMinute)} lpm`:'—')}</div>`,'chart-card')}</div><div>${card('Interpretación',`<p>${escapeHtml(excerpt(d.trainingImplications,440,'La interpretación final será revisada por el Coach.'))}</p><div class="mini-list">${row('Protocolo',c.protocol)}${row('Escalón',c.stepHeightCm!==null?number(c.stepHeightCm,1)+' cm':'—')}${row('Cadencia',c.cadenceBpm!==null?number(c.cadenceBpm)+' pulsos/min':'—')}${row('RPE final',c.rpe!==null?number(c.rpe,1)+'/10':'—')}${row('Validez',yesNo(c.valid))}</div>`)}${card('Próxima evaluación',`<p><strong>${escapeHtml(dateLabel(d.reevaluationDate))}</strong></p><p>Revisión del progreso y actualización del perfil IRI.</p>`,'soft')}</div></div>${clientTestExplanation({title:'Step test de 3 minutos',observed:'Respuesta de la frecuencia cardiaca al esfuerzo y durante el primer minuto de recuperación.',importance:'Orienta la dosificación inicial del trabajo cardiorrespiratorio.',result:`FC final ${number(c.finalHr)} lpm · recuperación ${number(c.deltaOneMinute)} lpm.`,decision:excerpt(d.initialPlan,220,'Ajustar intensidad y progresión según tolerancia y evolución.')})}<section class="plan-band"><h3>Plan inicial</h3><p>${escapeHtml(excerpt(d.initialPlan,620,'Plan inicial pendiente'))}</p><div><span>Frecuencia recomendada</span><strong>${escapeHtml(label(d.recommendedFrequency,'Por definir'))}</strong></div></section>`}));
  return pages;
}

function mobilityTrialRows(mobility={}){const ankle=mobility.ankle||{},posterior=mobility.posteriorChain||{};const max=Math.max(ankle.leftTrials?.length||0,ankle.rightTrials?.length||0,posterior.leftTrials?.length||0,posterior.rightTrials?.length||0,3);return Array.from({length:max},(_,index)=>[String(index+1),ankle.leftTrials?.[index]!==undefined?`${number(ankle.leftTrials[index],1)} cm`:'—',ankle.rightTrials?.[index]!==undefined?`${number(ankle.rightTrials[index],1)} cm`:'—',posterior.leftTrials?.[index]!==undefined?`${number(posterior.leftTrials[index],1)} cm`:'—',posterior.rightTrials?.[index]!==undefined?`${number(posterior.rightTrials[index],1)} cm`:'—']);}
function rawDataPages(draft,context,startNumber){const raw=JSON.stringify({reportContext:{clientName:context.clientName,coachName:context.coachName,clientId:context.clientId},draft},null,2);const lines=raw.split('\n');const chunks=[];let current=[];let count=0;for(const line of lines){const length=line.length+1;if(current.length&&count+length>1500){chunks.push(current.join('\n'));current=[];count=0;}current.push(line);count+=length;}if(current.length)chunks.push(current.join('\n'));return chunks.map((chunk,index)=>page({number:startNumber+index,title:`Anexo íntegro de datos · ${index+1}/${chunks.length}`,eyebrow:'ANEXO DINÁMICO · TRAZABILIDAD',logoUrl:context.logoUrl,internal:true,annex:true,content:`<p class="annex-intro">Representación completa del borrador normalizado utilizado para generar este informe. Conserva campos, valores nulos, variantes y observaciones.</p><pre class="raw-data">${escapeHtml(chunk)}</pre>`}));}

function coachPages(draft,context){
  const {clientName,coachName,logoUrl,clientId=''}=context;
  const p=draft.personProfile||{},i=draft.interview||{},b=draft.bodyComposition||{},m=draft.mobility||{},s=draft.strength||{},c=draft.cardio||{},d=draft.diagnosis||{};
  const completion=firstSessionCompletion(draft);const pages=[];
  pages.push(reportCover({clientName,date:draft.assessmentDate,coachName,logoUrl,internal:true,clientId}));
  pages.push(page({number:2,title:'Resumen técnico',eyebrow:'01 · PANORAMA GENERAL DEL IRI',logoUrl,internal:true,content:`<p class="lead">Perfil técnico de primera sesión. Los resultados se interpretan por protocolo, contexto, validez y calidad de dato.</p>${completionPanel(completion,draft)}<div class="summary-layout internal-summary"><div>${card('Calidad de datos',`<div class="quality">${row('Completitud',completion.percent+'%')}${row('Coherencia',completion.percent===100?'Alta':'Revisar pendientes')}${row('Sexo para baremos',['female','male'].includes(p.sexForNorms)?p.sexForNorms:'Pendiente')}${row('Revisión Coach',d.reviewAccepted?'Aceptada':'Pendiente')}</div>`)}${card('Fortalezas',`<ul class="checks">${listItems(d.strengths,6)}</ul>`)}</div>${card('Evidencia y calidad por áreas',`${domainEvidenceGrid(draft)}<p class="caption">Resumen técnico de disponibilidad y validez. La interpretación se realiza por protocolo y contexto, sin índice agregado.</p>`,'chart-card domain-card')}
</div>${card('Prioridades',`<ol class="priorities">${listItems(d.priorities,6)}</ol>`,'wide')}` }));
  pages.push(page({number:3,title:'Identificación, contacto y logística',eyebrow:'02 · EXPEDIENTE',logoUrl,internal:true,content:`<div class="profile-grid">${card('Identificación',`<div class="mini-list">${row('Cliente',clientName)}${row('Expediente',clientId)}${row('Fecha de nacimiento',dateLabel(p.birthDate))}${row('Sexo para baremos',p.sexForNorms)}${row('Identidad de género',p.genderIdentity)}${row('Pronombres',p.pronouns)}</div>`)}${card('Contacto autorizado',`<div class="mini-list">${row('Correo',p.email)}${row('Teléfono',p.phone)}${row('Canal preferido',p.preferredContactChannel)}${row('Horario de contacto',p.preferredContactTime)}${row('Zona horaria',p.timezone)}</div>`)}${card('Logística de entrenamiento',`<div class="mini-list">${row('Modalidad',p.modality)}${row('Dirección',p.trainingAddress)}${row('Comuna',p.commune)}${row('Tipo de lugar',p.locationType)}${row('Punto de encuentro / acceso',p.accessInstructions)}</div>`)}${card('Servicio y emergencia',`<div class="mini-list">${row('Horario preferido',p.preferredSchedule)}${row('Frecuencia semanal',p.weeklyFrequency!==null?number(p.weeklyFrequency):'—')}${row('Duración habitual',p.sessionDurationMinutes!==null?number(p.sessionDurationMinutes)+' min':'—')}${row('Contacto emergencia',p.emergencyContactName)}${row('Relación',p.emergencyContactRelation)}${row('Teléfono emergencia',p.emergencyContactPhone)}</div>`)}</div>`}));
  pages.push(page({number:4,title:'Entrevista inicial completa',eyebrow:'03 · CONTEXTO DE ENTRENAMIENTO',logoUrl,internal:true,content:`<div class="two-col">${card('Objetivos',`<p><strong>Principal:</strong> ${escapeHtml(excerpt(p.primaryObjective,520))}</p><p><strong>Secundarios:</strong> ${escapeHtml(safeList(p.secondaryObjectives).join(' · ')||'Sin registro')}</p>`)}${card('Experiencia y trayectoria',`<p><strong>Nivel:</strong> ${escapeHtml(label(i.trainingExperience))}</p><p>${escapeHtml(excerpt(i.trainingHistory,650))}</p>`)}${card('Entrenamiento actual',`<p>${escapeHtml(excerpt(i.currentTraining,650))}</p>`)}${card('Disponibilidad',`<p>${escapeHtml(excerpt(i.availability,480))}</p><p><strong>Material:</strong> ${escapeHtml(safeList(p.equipment).join(' · ')||'Sin registro')}</p>`)}</div>${card('Preferencias y observaciones de contexto',`<p>${escapeHtml(excerpt(i.preferences,900))}</p>`,'wide highlight')}` }));
  pages.push(page({number:5,title:'Seguridad y condiciones relevantes',eyebrow:'04 · CRIBADO Y PRECAUCIONES',logoUrl,internal:true,content:`<div class="metrics">${metric('Sueño',i.sleepScore!==null?number(i.sleepScore,1)+'/10':'—')}${metric('Estrés',i.stressScore!==null?number(i.stressScore,1)+'/10':'—')}${metric('Energía',i.energyScore!==null?number(i.energyScore,1)+'/10':'—')}</div><div class="two-col">${card('Antecedentes declarados',`<p>${escapeHtml(excerpt(i.healthHistory,720))}</p>`)}${card('Restricciones',`<p>${escapeHtml(excerpt(i.restrictions,720))}</p>`)}${card('Dolor actual',`<p>${escapeHtml(excerpt(i.currentPain,650))}</p>`)}${card('Cribado',`<div class="mini-list">${row('Aceptado',yesNo(i.screeningAccepted))}${row('Notas',excerpt(i.screeningNotes,600))}</div>`)}</div>${card('Pruebas omitidas y motivos',`<div class="mini-list">${row('Composición',b.skipped?b.skipReason:'Realizada')}${row('Movilidad',m.skipped?m.skipReason:'Realizada')}${row('Fuerza',s.skipped?s.skipReason:'Realizada')}${row('Cardio',c.skipped?c.skipReason:'Realizada')}</div>`,'soft')}` }));
  pages.push(page({number:6,title:'Composición corporal completa',eyebrow:'05 · BIOIMPEDANCIA Y MEDICIONES',logoUrl,internal:true,content:`<div class="metrics four">${metric('Peso',b.weightKg!==null?`${number(b.weightKg,1)} kg`:'—')}${metric('Talla',b.heightCm!==null?`${number(b.heightCm,1)} cm`:'—')}${metric('Grasa corporal',b.bodyFatPercent!==null?`${number(b.bodyFatPercent,1)}%`:'—')}${metric('IMC',b.bmi!==undefined?number(b.bmi,1):'—')}</div><div class="two-col"><div>${card('Composición',`${compositionDonut(b)}<div class="mini-list">${row('Masa magra',b.leanMassKg!==null?number(b.leanMassKg,1)+' kg':'—')}${row('Masa muscular',b.muscleMassKg!==null?number(b.muscleMassKg,1)+' kg':'—')}${row('Agua corporal',b.bodyWaterPercent!==null?number(b.bodyWaterPercent,1)+'%':'—')}${row('Cintura',b.waistCm!==null?number(b.waistCm,1)+' cm':'—')}${row('Grasa visceral',b.visceralFatLevel!==null?number(b.visceralFatLevel):'—')}</div>`,'chart-card')}</div><div>${card('Método y condiciones',`<div class="mini-list">${row('Método',b.method)}${row('Equipo',b.device)}${row('Condiciones',excerpt(b.measurementConditions,500))}${row('Observaciones',excerpt(b.notes,500))}</div>`)}${card('Archivo externo',`<div class="mini-list">${row('Nombre',b.attachmentName)}${row('Tipo',b.attachmentType)}${row('Tamaño',fileSize(b.attachmentSize))}${row('Estado',b.attachmentName?'Referencia registrada; persistencia remota pendiente':'Sin archivo')}</div>`,'soft')}</div></div>`}));
  pages.push(page({number:7,title:'Movilidad · resultados objetivos',eyebrow:'06 · MEDICIONES BILATERALES',logoUrl,internal:true,content:`${card('Tres intentos por lado',compactTable(['Intento','Tobillo I','Tobillo D','Cadena posterior I','Cadena posterior D'],mobilityTrialRows(m),['10%','22.5%','22.5%','22.5%','22.5%']),'table-card')}<div class="two-col">${card('Resumen de tobillo',`<div class="mini-list">${row('Mejor izquierda',m.ankle?.leftBest!==null?number(m.ankle.leftBest,1)+' cm':'—')}${row('Mejor derecha',m.ankle?.rightBest!==null?number(m.ankle.rightBest,1)+' cm':'—')}${row('Asimetría',m.ankle?.asymmetryCm!==null?number(m.ankle.asymmetryCm,1)+' cm':'—')}${row('Dolor',m.ankle?.pain)}${row('Compensación',excerpt(m.ankle?.compensation,420))}</div>`)}${card('Resumen de cadena posterior',`<div class="mini-list">${row('Mejor izquierda',m.posteriorChain?.leftBest!==null?number(m.posteriorChain.leftBest,1)+' cm':'—')}${row('Mejor derecha',m.posteriorChain?.rightBest!==null?number(m.posteriorChain.rightBest,1)+' cm':'—')}${row('Asimetría',m.posteriorChain?.asymmetryCm!==null?number(m.posteriorChain.asymmetryCm,1)+' cm':'—')}${row('Dolor',m.posteriorChain?.pain)}</div>`)}</div>`}));
  pages.push(page({number:8,title:'Movilidad · observación estructurada',eyebrow:'07 · PATRONES Y COMPENSACIONES',logoUrl,internal:true,content:`<div class="two-col">${card('Thomas modificado',`<div class="mini-list">${row('Izquierda',m.modifiedThomas?.left)}${row('Derecha',m.modifiedThomas?.right)}${row('Control pélvico',m.modifiedThomas?.pelvicControl)}${row('Dolor',m.modifiedThomas?.pain)}</div>`)}${card('Rotación de cadera',`<div class="mini-list">${row('Resultado',m.hipRotation?.result)}${row('Dolor',m.hipRotation?.pain)}${row('Compensación',excerpt(m.hipRotation?.compensation,520))}</div>`)}${card('Sentadilla asistida',`<div class="mini-list">${row('Profundidad',m.assistedSquat?.depth)}${row('Talones',m.assistedSquat?.heels)}${row('Rodillas',m.assistedSquat?.knees)}${row('Tronco',m.assistedSquat?.trunk)}${row('Desplazamiento lateral',m.assistedSquat?.lateralShift)}${row('Respuesta a asistencia',m.assistedSquat?.assistanceResponse)}${row('Dolor',m.assistedSquat?.pain)}</div>`,'wide')}${card('Observaciones completas',`<p>${escapeHtml(excerpt(m.notes,1000))}</p>`,'wide highlight')}</div>`}));
  pages.push(page({number:9,title:'Fuerza · tren inferior y cadena posterior',eyebrow:'08 · RESULTADOS Y PROTOCOLOS',logoUrl,internal:true,content:`<div class="protocol-strip"><span>Registro de variante</span><span>Configuración del material</span><span>Validez por prueba</span><span>Sin baremo incompatible</span></div><div class="two-col">${card('Silla 30 segundos',`<div class="mini-list">${row('Repeticiones',s.chairStand?.repetitions!==null?number(s.chairStand.repetitions):'—')}${row('Altura de silla',s.chairStand?.chairHeightCm!==null?number(s.chairStand.chairHeightCm,1)+' cm':'—')}${row('Válida',yesNo(s.chairStand?.valid))}${row('Notas',excerpt(s.chairStand?.notes,560))}</div>`)}${card('Cadena posterior',`<div class="mini-list">${row('Protocolo',s.posteriorChain?.protocol)}${row('Tiempo',s.posteriorChain?.seconds!==null?number(s.posteriorChain.seconds)+' s':'—')}${row('Equipo compatible',yesNo(s.posteriorChain?.equipmentCompatible))}${row('Motivo no realizada',excerpt(s.posteriorChain?.notPerformedReason,560))}${row('Dolor',s.posteriorChain?.pain)}</div>`)}</div>${card('Observaciones generales de fuerza',`<p>${escapeHtml(excerpt(s.notes,1000))}</p>`,'highlight')}` }));
  pages.push(page({number:10,title:'Fuerza · empuje, tracción y tronco',eyebrow:'09 · CONFIGURACIÓN Y VALIDEZ',logoUrl,internal:true,content:`<div class="two-col">${card('Empuje',`<div class="mini-list">${row('Variante',s.push?.variant)}${row('Repeticiones',s.push?.repetitions!==null?number(s.push.repetitions):'—')}${row('Altura de apoyo',s.push?.supportHeightCm!==null?number(s.push.supportHeightCm,1)+' cm':'—')}${row('Válida',yesNo(s.push?.valid))}${row('Notas',excerpt(s.push?.notes,560))}</div>`)}${card('Remo TRX',`<div class="mini-list">${row('Repeticiones',s.trxRow?.repetitions!==null?number(s.trxRow.repetitions):'—')}${row('Altura de asas',s.trxRow?.handleHeightCm!==null?number(s.trxRow.handleHeightCm,1)+' cm':'—')}${row('Talones al anclaje',s.trxRow?.heelDistanceCm!==null?number(s.trxRow.heelDistanceCm,1)+' cm':'—')}${row('Posición',s.trxRow?.position)}${row('Válida',yesNo(s.trxRow?.valid))}${row('Notas',excerpt(s.trxRow?.notes,520))}</div>`)}${card('Tronco y estabilidad',`<div class="mini-list">${row('Plancha frontal',s.core?.frontPlankSeconds!==null?number(s.core.frontPlankSeconds)+' s':'—')}${row('Lateral izquierda',s.core?.sidePlankLeftSeconds!==null?number(s.core.sidePlankLeftSeconds)+' s':'—')}${row('Lateral derecha',s.core?.sidePlankRightSeconds!==null?number(s.core.sidePlankRightSeconds)+' s':'—')}${row('Diferencia lateral',s.core?.sidePlankLeftSeconds!==null&&s.core?.sidePlankRightSeconds!==null?number(Math.abs(s.core.sidePlankLeftSeconds-s.core.sidePlankRightSeconds))+' s':'—')}${row('Calidad',s.core?.quality)}${row('Dolor',s.core?.pain)}</div>`,'wide')}</div>`}));
  pages.push(page({number:11,title:'Evaluación cardiorrespiratoria',eyebrow:'10 · YMCA 3 MINUTOS',logoUrl,internal:true,content:`<div class="protocol-strip"><span>${escapeHtml(label(c.protocol))}</span><span>Escalón ${c.stepHeightCm!==null?number(c.stepHeightCm,1)+' cm':'—'}</span><span>${c.cadenceBpm!==null?number(c.cadenceBpm)+' pulsos/min':'Cadencia pendiente'}</span><span>${c.durationSeconds!==null?number(c.durationSeconds)+' s':'Duración pendiente'}</span></div><div class="two-col"><div>${card('Recuperación de frecuencia cardiaca',`${heartRateChart(c)}<div class="metrics compact">${metric('FC reposo',c.restingHr!==null?number(c.restingHr)+' lpm':'—')}${metric('FC final',c.finalHr!==null?number(c.finalHr)+' lpm':'—')}${metric('ΔFC 1 min',c.deltaOneMinute!==null?number(c.deltaOneMinute)+' lpm':'—')}</div>`,'chart-card')}</div><div>${card('Registro técnico',`<div class="mini-list">${row('FC al minuto',c.oneMinuteHr!==null?number(c.oneMinuteHr)+' lpm':'—')}${row('FC a los 2 minutos',c.twoMinuteHr!==null?number(c.twoMinuteHr)+' lpm':'—')}${row('RPE',c.rpe!==null?number(c.rpe,1)+'/10':'—')}${row('Válida',yesNo(c.valid))}${row('Síntomas',excerpt(c.symptoms,420))}${row('Motivo de detención',excerpt(c.stopReason,420))}${row('Notas',excerpt(c.notes,520))}</div>`)}</div></div>`}));
  pages.push(page({number:12,title:'Diagnóstico por dominios',eyebrow:'11 · COBERTURA, VALIDEZ Y LIMITACIONES',logoUrl,internal:true,content:`<div class="two-col">${card('Composición corporal',`<p>${b.skipped?'No realizada: '+escapeHtml(label(b.skipReason)):escapeHtml(`Mediciones registradas: ${[b.weightKg,b.bodyFatPercent,b.leanMassKg,b.muscleMassKg,b.waistCm].filter((value)=>value!==null).length}. Interpretación descriptiva.`)}</p>`)}${card('Movilidad',`<p>${m.skipped?'No realizada: '+escapeHtml(label(m.skipReason)):escapeHtml(`Tobillo: asimetría ${number(m.ankle?.asymmetryCm,1)} cm. Cadena posterior: ${number(m.posteriorChain?.asymmetryCm,1)} cm.`)}</p>`)}${card('Fuerza',`<p>${s.skipped?'No realizada: '+escapeHtml(label(s.skipReason)):escapeHtml(`Silla, empuje, TRX y tronco registrados. Variantes y validez conservadas individualmente.`)}</p>`)}${card('Cardiorrespiratorio',`<p>${c.skipped?'No realizada: '+escapeHtml(label(c.skipReason)):escapeHtml(`Protocolo ${label(c.protocol)}. ΔFC al minuto: ${number(c.deltaOneMinute)} lpm. Validez: ${yesNo(c.valid)}.`)}</p>`)}</div>${card('Justificación del resultado global',`<p>No se calcula una puntuación universal mientras no exista cobertura normativa compatible y consolidada para todos los dominios. El resultado se presenta como perfil por dominios, medidas objetivas, validez y limitaciones.</p>`,'highlight')}${card('Fuentes y baremos',`<div class="mini-list">${row('Sexo para baremos',p.sexForNorms)}${row('Fecha evaluación',dateLabel(draft.assessmentDate))}${row('Motor',draft.schema||draft.firstSessionSchema||'iberfit-iri-first-session-v1')}${row('Cobertura normativa', 'Debe declararse por prueba antes de usar percentiles')}${row('Protocolos adaptados', 'Referencia individual; no se mezclan con el protocolo estándar')}</div>`,'soft')}` }));
  pages.push(page({number:13,title:'Interpretación y planificación',eyebrow:'12 · DECISIÓN DEL COACH',logoUrl,internal:true,content:`${card('Interpretación completa del Coach',`<p>${escapeHtml(excerpt(d.coachInterpretation,1100))}</p>`,'highlight')}${card('Implicaciones para el entrenamiento',`<p>${escapeHtml(excerpt(d.trainingImplications,1050))}</p><ul class="checks">${listItems(d.priorities,6)}</ul>`)}<div class="two-col">${card('Plan inicial',`<p>${escapeHtml(excerpt(d.initialPlan,760))}</p><div class="mini-list">${row('Frecuencia recomendada',d.recommendedFrequency)}</div>`)}${card('Reevaluación y control',`<div class="mini-list">${row('Fecha',dateLabel(d.reevaluationDate))}${row('Revisión aceptada',yesNo(d.reviewAccepted))}${row('Actualización del borrador',dateLabel(draft.updatedAt?.slice?.(0,10)))}${row('Criterio', 'Repetir protocolos comparables y documentar cambios')}</div>`)}</div>${card('Trazabilidad',`<div class="mini-list">${row('Esquema',draft.schema||'iberfit-iri-first-session-v1')}${row('Cliente',clientId)}${row('Completitud',completion.complete+'/'+completion.total)}${row('Advertencia','Evaluación de rendimiento; no sustituye una evaluación clínica')}${row('Anexo íntegro','Incluido a continuación con todos los campos normalizados')}</div>`,'soft')}` }));
  pages.push(page({number:14,title:'Trazabilidad de protocolos',eyebrow:'13 · VERSIONES Y COMPARABILIDAD',logoUrl,internal:true,content:`${card('Registro por prueba',compactTable(['Prueba','Lado','Variante','Configuración','Versión','Validez','Adaptación o suspensión'],protocolTraceRows(draft.protocolRecords||[]),['15%','7%','13%','22%','14%','9%','20%']),'table-card')}<p class="caption">Una reevaluación solo se considera directamente comparable cuando coinciden la versión, la variante y la configuración registrada.</p>`}));
  pages.push(...rawDataPages(draft,context,15));
  return pages;
}

const REPORT_CSS=`
@page{size:A4;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#d7ddd9;color:${PALETTE.forestText};font-family:Inter,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{padding:14mm 0}
.pdf-page{position:relative;width:210mm;height:297mm;margin:0 auto 12mm;overflow:hidden;background:${PALETTE.ivory};padding:16mm 16mm 14mm;box-shadow:0 18px 52px rgba(4,24,16,.22);page-break-after:always}
.pdf-page::before{content:"";position:absolute;inset:0 0 auto 0;height:1.8mm;background:linear-gradient(90deg,${PALETTE.forest},${PALETTE.gold},${PALETTE.forest});opacity:.95}
.pdf-page:last-child{page-break-after:auto}
.pdf-page header{height:25mm;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:.3mm solid ${PALETTE.line};padding-bottom:5mm}
.heading span{font-size:7.2pt;letter-spacing:.16em;color:#86672f;font-weight:800}
.heading h1{margin:2.4mm 0 0;font-family:Georgia,serif;font-weight:500;font-size:22pt;line-height:1.05;color:${PALETTE.forest}}
.header-brand{display:flex;align-items:center;gap:2.6mm;color:${PALETTE.forest};font-family:Georgia,serif;letter-spacing:.12em;font-size:8pt}
.brand-seal{width:15mm;height:15mm;border-radius:50%;display:grid;place-items:center;background:${PALETTE.forest};box-shadow:0 3mm 8mm rgba(8,34,24,.16);border:.45mm solid ${PALETTE.goldLight}}
.brand-seal img{width:10mm;height:10mm;object-fit:contain;filter:drop-shadow(0 .4mm .7mm rgba(0,0,0,.18))}
.pdf-page main{height:237mm;padding-top:8mm;overflow:hidden}
.pdf-page footer{position:absolute;left:16mm;right:16mm;bottom:7mm;display:flex;justify-content:space-between;border-top:.22mm solid ${PALETTE.line};padding-top:2.5mm;font-size:6.6pt;color:${PALETTE.muted}}
.watermark{position:absolute;left:50%;bottom:12mm;width:31mm;height:31mm;object-fit:contain;opacity:.028;transform:translateX(-50%);filter:grayscale(1) brightness(.38) sepia(.22);pointer-events:none}
.cover{padding:0;background:radial-gradient(circle at 82% 12%,rgba(217,191,130,.20),transparent 48mm),linear-gradient(145deg,#0c3021 0%,${PALETTE.forest} 48%,#03130d 100%);color:#fff9e9}
.cover::before{height:2.2mm;background:linear-gradient(90deg,${PALETTE.gold},#f0db9b,${PALETTE.gold})}
.cover main{height:100%;padding:18mm 19mm}
.cover footer{color:#d7d0bd;border-color:rgba(217,191,130,.32)}
.cover-glow{position:absolute;width:92mm;height:92mm;right:-14mm;top:18mm;border-radius:50%;background:radial-gradient(circle,rgba(217,191,130,.18),transparent 68%);filter:blur(1mm)}
.cover-brand{display:flex;align-items:center;gap:6mm;position:relative;z-index:2}
.cover-mark{width:35mm;height:35mm;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,rgba(255,255,255,.09),rgba(255,255,255,.02));border:.6mm solid rgba(217,191,130,.8);box-shadow:0 8mm 22mm rgba(0,0,0,.24),inset 0 0 0 1.4mm rgba(8,34,24,.9)}
.cover-mark img{width:25mm;height:25mm;object-fit:contain;filter:drop-shadow(0 1.2mm 2mm rgba(0,0,0,.35))}
.cover-brand strong{display:block;color:#efd99c;font-family:Georgia,serif;font-size:22pt;letter-spacing:.07em}
.cover-brand span{font-size:7.2pt;letter-spacing:.13em;line-height:1.55;color:#f7eed9}
.cover-copy{margin-top:25mm;width:145mm;position:relative;z-index:2}
.cover-copy>p{font-size:8pt;letter-spacing:.19em;color:#e7ca84;font-weight:800}
.cover-copy h1{margin:5mm 0 6mm;font-family:Georgia,serif;font-size:40pt;line-height:1.04;font-weight:500;color:#fff9e9}
.gold-line{height:.7mm;width:30mm;background:linear-gradient(90deg,${PALETTE.gold},#f0db9b);margin-bottom:11mm}
.cover-copy dl{display:grid;grid-template-columns:1fr 1fr;gap:6mm 10mm;max-width:155mm}
.cover-copy dl div{display:grid;gap:1.5mm;min-width:0}
.cover-copy dt{font-size:6.8pt;color:#cfc5ad;text-transform:uppercase;letter-spacing:.12em}
.cover-copy dd{margin:0;font-family:Georgia,serif;font-size:15pt;color:#efd28b;overflow-wrap:anywhere}
.cover-note{position:absolute;left:19mm;bottom:27mm;width:97mm;padding:5mm;border:.35mm solid rgba(217,191,130,.58);border-radius:3mm;background:linear-gradient(145deg,rgba(20,67,47,.78),rgba(7,30,21,.82));box-shadow:0 5mm 16mm rgba(0,0,0,.18)}
.cover-note strong{font-size:7.3pt;color:#efd28b;letter-spacing:.13em}
.cover-note p{font-size:9pt;line-height:1.46;margin:2mm 0 0;color:#fff9e9}
.cover-orbit{position:absolute;border:.42mm solid rgba(217,191,130,.44);border-radius:50%}
.cover-orbit.one{width:120mm;height:120mm;right:-49mm;top:-33mm}
.cover-orbit.two{width:86mm;height:86mm;right:-38mm;bottom:-28mm}
.lead{font-family:Georgia,serif;font-size:11.5pt;line-height:1.54;color:#44594e;margin:0 0 6mm;max-width:155mm}
.completion-panel{display:grid;grid-template-columns:repeat(3,1fr);gap:3.5mm;background:${PALETTE.forest};color:#fff9e9;padding:5mm;border-radius:3.4mm;box-shadow:0 4mm 13mm rgba(8,34,24,.14);margin-bottom:6mm}
.completion-panel div{padding:1mm 3mm;border-left:.25mm solid rgba(217,191,130,.34);min-width:0}.completion-panel div:first-child{border-left:0}
.completion-panel span{display:block;font-size:6.1pt;text-transform:uppercase;letter-spacing:.1em;color:#d9d3c1}
.completion-panel strong{display:block;margin-top:2mm;font-family:Georgia,serif;font-size:15pt;color:#efd28b;overflow-wrap:anywhere}
.completion-panel small{display:block;margin-top:1.2mm;font-size:6.2pt;line-height:1.3;color:#f3ebd8}
.summary-layout{display:grid;grid-template-columns:.88fr 1.12fr;gap:5mm;align-items:start}
.internal-summary{grid-template-columns:1fr 1fr}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:5mm;align-items:start}
.card{border:.28mm solid ${PALETTE.line};border-radius:3.2mm;background:${PALETTE.paper};padding:4.7mm;margin-bottom:4.5mm;break-inside:avoid;overflow:hidden;box-shadow:0 2.2mm 7mm rgba(37,51,43,.055)}
.card h3{margin:0 0 3.2mm;font-size:7.8pt;color:#344a3f;text-transform:uppercase;letter-spacing:.105em}
.card p{font-size:8.8pt;line-height:1.45;margin:0 0 2.5mm;overflow-wrap:anywhere}.card p:last-child{margin-bottom:0}
.card.highlight{background:linear-gradient(145deg,#f4ead6,#fffdf8);border-color:#cfb273;box-shadow:0 2.4mm 8mm rgba(185,148,79,.10)}
.card.soft{background:#f4f0e7}.card.wide{grid-column:1/-1;flex-basis:100%}.chart-card{padding:4.4mm}.domain-card{min-height:86mm}
.checks,.priorities,.card ul,.card ol{margin:0;padding-left:5mm}.checks li,.priorities li,.card li{font-size:8.3pt;line-height:1.42;margin:0 0 2.2mm;overflow-wrap:anywhere}.checks li::marker{color:#176442}.priorities li::marker{color:#9a6f29;font-weight:800}
.summary-band{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm;padding:4.8mm;border-radius:3mm;background:linear-gradient(135deg,#14392a,${PALETTE.forest});color:#fff9e9;margin-top:5mm}.summary-band div{display:grid;gap:1.4mm}.summary-band span{font-size:6.2pt;color:#d4cdb9;text-transform:uppercase;letter-spacing:.09em}.summary-band strong{font-size:8.5pt;color:#efd28b;overflow-wrap:anywhere}
.plan-band{display:block;margin-top:5mm;padding:5mm;border-radius:3.2mm;background:linear-gradient(135deg,#14392a,${PALETTE.forest});color:#fff9e9;box-shadow:0 4mm 12mm rgba(8,34,24,.13)}.plan-band h3{margin:0 0 2mm;color:#efd28b;font-family:Georgia,serif;font-size:14pt}.plan-band p{font-size:8.7pt;line-height:1.44;max-height:25mm;overflow:hidden}.plan-band span{font-size:6.2pt;color:#d4cdb9;text-transform:uppercase;letter-spacing:.09em}.plan-band strong{display:block;margin-top:1mm;font-size:8.7pt}
.client-test-explanation{margin-top:4mm;padding:4mm;border:.3mm solid #c9a95c;border-radius:3mm;background:linear-gradient(145deg,#f5ead0,#fffdf8)}.client-test-explanation h3{margin:0 0 2.5mm;color:#082218;font-family:Georgia,serif;font-size:12pt}.client-test-explanation>div{display:grid;grid-template-columns:repeat(2,1fr);gap:2.4mm}.client-test-explanation p{display:grid;gap:1mm;margin:0;padding:2.4mm;border-radius:2mm;background:rgba(255,255,255,.68)}.client-test-explanation span{font-size:5.8pt;color:#86672f;text-transform:uppercase;letter-spacing:.08em}.client-test-explanation strong{font-size:7.2pt;line-height:1.35;color:#183328}
.context-grid,.profile-grid{display:flex;flex-wrap:wrap;gap:4.5mm}.context-grid>.card,.profile-grid>.card{flex:1 1 calc(50% - 3mm);min-width:0;margin-bottom:0}.context-grid>.card.wide,.profile-grid>.card.wide{flex-basis:100%}
.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:3.5mm;margin-bottom:5mm}.metrics.four{grid-template-columns:repeat(4,1fr)}.metrics.compact{margin:3.5mm 0 0;gap:2.8mm}
.metric{border:.25mm solid ${PALETTE.line};border-radius:2.8mm;padding:3.6mm;background:${PALETTE.paper};min-height:20mm;display:flex;flex-direction:column;justify-content:center;overflow:hidden;box-shadow:0 1.6mm 5mm rgba(37,51,43,.05)}.metric span{font-size:6.1pt;color:${PALETTE.muted};text-transform:uppercase;letter-spacing:.08em}.metric strong{margin-top:1.7mm;font-family:Georgia,serif;font-size:14pt;color:${PALETTE.forest}}.metric small{font-size:6.2pt;color:${PALETTE.muted};margin-top:1mm}
.mini-list{display:grid;gap:2.2mm}.mini-list p,.quality p{display:flex;justify-content:space-between;gap:4mm;border-bottom:.2mm solid #e9dfce;padding-bottom:1.7mm}.mini-list span,.quality span{font-size:6.8pt;color:#707a73;flex:0 0 41%}.mini-list strong,.quality strong{font-size:7.7pt;text-align:right;max-width:59%;overflow-wrap:anywhere}.muted,.caption{color:${PALETTE.muted}!important}.caption{font-size:6.4pt!important;line-height:1.35!important;margin-top:2mm!important}
.donut-svg{display:block;width:43mm;height:43mm;margin:1mm auto 4mm}.donut-base{fill:none;stroke:${PALETTE.forest};stroke-width:15}.donut-value{fill:none;stroke:${PALETTE.gold};stroke-width:15}.donut-center{fill:${PALETTE.paper}}.donut-number{fill:${PALETTE.forest};font-size:18px;font-family:Georgia,serif}.donut-label{fill:${PALETTE.muted};font-size:9px}
.symmetry-row{display:grid;grid-template-columns:24mm 1fr 5mm 1fr;align-items:center;gap:2mm;margin:3.5mm 0}.symmetry-row>span{font-size:7.2pt;font-weight:800}.side{display:flex;align-items:center;gap:2mm}.side.left{justify-content:flex-end}.side i{height:2.5mm;background:linear-gradient(90deg,${PALETTE.gold},${PALETTE.forestSoft});border-radius:99px;min-width:1mm}.side.right i{background:linear-gradient(90deg,${PALETTE.forestSoft},${PALETTE.gold})}.side b{font-size:6.8pt;min-width:12mm}.body-dot{width:4mm;height:12mm;border-radius:50%;background:#d5d1c7}
.bars{display:grid;gap:2.8mm}.bar-row{display:grid;grid-template-columns:36mm 1fr 17mm;gap:3mm;align-items:center}.bar-row>div:first-child{display:grid}.bar-row span{font-size:6.8pt;font-weight:800}.bar-row small{font-size:5.7pt;color:${PALETTE.muted}}.bar-track{height:3mm;background:#e4e3dc;border-radius:99px;overflow:hidden}.bar-track i{display:block;height:100%;background:linear-gradient(90deg,${PALETTE.forest},#5f8b70);border-radius:99px}.bar-row strong{font-size:6.8pt;text-align:right}
.line-chart{width:100%;height:47mm}.line-chart line{stroke:#c8cec9;stroke-width:1}.line-chart path{stroke:${PALETTE.forest};stroke-width:3;fill:none}.line-chart circle{fill:${PALETTE.forest};stroke:${PALETTE.gold};stroke-width:2}.line-chart text{font-size:10px;fill:#46584e}.chart-empty{height:47mm;display:grid;place-items:center;color:${PALETTE.muted};font-size:8pt}
.domain-evidence{display:grid;grid-template-columns:1fr 1fr;gap:3mm}.evidence-item{min-height:31mm;padding:3.8mm;border:.25mm solid #ded7c8;border-left:1.25mm solid #b5b9b3;border-radius:2.5mm;background:#fffdf8;overflow:hidden}.evidence-item.is-complete{border-left-color:#2d6e50}.evidence-item.is-skipped{border-left-color:#a78145;background:#f7f1e5}.evidence-item.is-pending{border-left-color:#8b9690}.evidence-item>div{display:flex;justify-content:space-between;gap:3mm;align-items:flex-start}.evidence-item span{font-size:6.4pt;color:#64736b;text-transform:uppercase;letter-spacing:.07em}.evidence-item strong{font-size:7pt;color:#183328;text-align:right}.evidence-item p{margin:2.3mm 0 0;font-size:7.4pt;line-height:1.35}.evidence-item small{display:block;margin-top:1.7mm;font-size:6pt;line-height:1.3;color:#64736b}
.protocol-strip{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin-bottom:4.5mm}.protocol-strip span{padding:2.8mm;border:.25mm solid ${PALETTE.line};border-radius:2.4mm;text-align:center;font-size:6.7pt;background:${PALETTE.paper};overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border-bottom:.2mm solid #e3d8c3;padding:2.1mm 1.8mm;text-align:left;font-size:6.9pt;line-height:1.28;overflow-wrap:anywhere;vertical-align:top}th{color:#5f6d65;text-transform:uppercase;letter-spacing:.055em;font-size:5.8pt;background:#f2ebdf}.table-card{padding:3.5mm}
.internal header h1{font-size:20pt}.internal main{font-size:7.8pt}.internal .card{padding:4mm;margin-bottom:3.7mm}.internal .card p{font-size:7.7pt}.internal .metric{min-height:18mm}.internal .profile-grid{gap:3.8mm}.internal .completion-panel{margin-bottom:4.5mm}
.annex-intro{font-size:7.5pt;line-height:1.4;color:${PALETTE.muted};margin:0 0 4mm}.raw-data{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:4mm;border:.25mm solid ${PALETTE.line};border-radius:2.5mm;background:${PALETTE.paper};font:6.3pt/1.36 ui-monospace,SFMono-Regular,Consolas,monospace;color:#243c31;max-height:210mm;overflow:hidden}
@media print{body{padding:0;background:#fff}.pdf-page{margin:0;box-shadow:none}}
`;

const PREMIUM_RC36_CSS=`
/* RC36 V2 · dirección visual IBERFIT ultra premium */
html,body{background:#eee5d3}
body{padding:10mm 0}
.pdf-page.m26-premium-report-v2{
  background:
    radial-gradient(circle at 94% 5%,rgba(231,211,154,.34),transparent 46mm),
    radial-gradient(circle at 4% 96%,rgba(31,90,64,.10),transparent 40mm),
    linear-gradient(180deg,#fffdf7 0%,#f5eedc 100%);
  color:#17342a;
  padding:14mm 13mm 13mm;
  box-shadow:0 7mm 22mm rgba(8,37,26,.14);
}
.pdf-page.m26-premium-report-v2::before{
  height:1.4mm;
  background:linear-gradient(90deg,#08251a 0%,#c9a95c 48%,#08251a 100%);
}
.pdf-page.m26-premium-report-v2 main{height:229mm;padding-top:7mm;overflow:hidden}
.pdf-page.m26-premium-report-v2 footer{left:13mm;right:13mm;bottom:6mm;color:#68796f;border-color:#d8c8a6}
.pdf-page.m26-premium-report-v2 footer b{color:#1f5a40;letter-spacing:.055em}
.premium-header{height:31mm;border:0;padding:0;display:block}
.section-tab{
  width:100%;height:27mm;display:grid;grid-template-columns:18mm minmax(0,1fr);
  align-items:center;gap:5mm;padding:3.2mm 7mm 3.2mm 3.4mm;border-radius:5.5mm;
  background:
    radial-gradient(circle at 92% 50%,rgba(231,211,154,.30),transparent 36mm),
    linear-gradient(105deg,#08251a 0%,#0e3b2a 63%,#234d3a 100%);
  border:.35mm solid rgba(201,169,92,.72);
  box-shadow:0 3mm 9mm rgba(8,37,26,.13);overflow:hidden;
}
.section-index{
  width:16mm;height:16mm;border-radius:4.2mm;display:grid;place-items:center;
  background:linear-gradient(145deg,#e7d39a,#c9a95c);color:#08251a;
  font:800 13pt/1 Inter,Arial,sans-serif;box-shadow:inset 0 .3mm .6mm rgba(255,255,255,.38);
}
.section-copy{min-width:0;overflow:hidden}
.section-copy h1{
  margin:0;color:#fffdf7;font-family:Georgia,serif;font-size:20pt;line-height:1.02;
  font-weight:500;white-space:normal;overflow-wrap:anywhere;word-break:normal;
}
.section-copy p{
  margin:1.5mm 0 0;color:#e7d39a;font:700 6.4pt/1.25 Inter,Arial,sans-serif;
  letter-spacing:.065em;text-transform:uppercase;white-space:normal;
  overflow-wrap:anywhere;word-break:normal;max-width:100%;
}
.premium-watermark{
  left:auto;right:8mm;bottom:10mm;width:48mm;height:48mm;opacity:.034;
  transform:none;filter:grayscale(1) sepia(.55) hue-rotate(78deg) saturate(.9) brightness(.67);
}
.page-orbit{position:absolute;border-radius:50%;pointer-events:none;z-index:0}
.page-orbit-one{width:70mm;height:70mm;right:-37mm;top:-37mm;border:.35mm solid rgba(201,169,92,.18)}
.page-orbit-two{width:53mm;height:53mm;left:-34mm;bottom:-31mm;background:rgba(31,90,64,.035)}
.pdf-page.m26-premium-report-v2 main,.pdf-page.m26-premium-report-v2 header,.pdf-page.m26-premium-report-v2 footer{position:relative;z-index:2}
.card{
  border:.28mm solid #d8c8a6;border-radius:4mm;background:rgba(255,253,248,.94);
  box-shadow:0 2.2mm 6.8mm rgba(35,64,49,.07);overflow:hidden;
}
.card h3{color:#17342a;overflow-wrap:anywhere;word-break:normal}
.card.highlight{background:linear-gradient(145deg,#f4e8c8,#fffdf8);border-color:#c9a95c}
.card.soft{background:linear-gradient(145deg,#f0eadc,#fffdf8)}
.metric{
  position:relative;border-color:#d8c8a6;border-radius:3.8mm;
  background:linear-gradient(155deg,#fffdf8 0%,#f8f1e3 100%);
  box-shadow:0 1.8mm 5.5mm rgba(35,64,49,.065);overflow:hidden;
}
.metric::before{content:"";position:absolute;left:0;right:0;top:0;height:1.2mm;background:linear-gradient(90deg,#08251a,#c9a95c)}
.metric span,.metric strong,.metric small{overflow-wrap:anywhere;word-break:normal}
.completion-panel{
  background:transparent;color:#17342a;padding:0;box-shadow:none;gap:3.2mm;
}
.completion-panel div{
  border:.25mm solid #d8c8a6!important;border-top:1.2mm solid #c9a95c!important;
  border-radius:3.6mm;background:linear-gradient(155deg,#fffdf8,#f6eddb);
  padding:3.7mm;box-shadow:0 1.8mm 5mm rgba(35,64,49,.055);overflow:hidden;
}
.completion-panel span{color:#80652f}
.completion-panel strong{color:#08251a;font-size:14pt;overflow-wrap:anywhere}
.completion-panel small{color:#68796f}
.summary-band,.plan-band{
  background:
    radial-gradient(circle at 93% 0%,rgba(231,211,154,.22),transparent 30mm),
    linear-gradient(135deg,#08251a,#123d2c);
  border:.3mm solid rgba(201,169,92,.58);box-shadow:0 3.5mm 10mm rgba(8,37,26,.12);
}
.summary-band strong,.plan-band h3{color:#e7d39a}
.domain-evidence{gap:3.2mm}
.evidence-item{
  border:.25mm solid #d8c8a6;border-left:1.25mm solid #a7afa9;border-radius:3.2mm;
  background:linear-gradient(150deg,#fffdf8,#f7f0e2);box-shadow:0 1.5mm 4.6mm rgba(35,64,49,.05);
}
.evidence-item.is-complete{border-left-color:#1f5a40}
.evidence-item.is-skipped{border-left-color:#c9a95c;background:#f4e8c8}
.evidence-item strong{color:#08251a}
.donut-base{stroke:#eadfca}.donut-value{stroke:#c9a95c}.donut-center{fill:#fffdf8}
.bar-track{background:#dfe7e1}.bar-track i{background:linear-gradient(90deg,#c9a95c,#e7d39a)}
.line-chart path{stroke:#1f5a40}.line-chart circle{fill:#c9a95c;stroke:#08251a}
.symmetry-row .side i{background:linear-gradient(90deg,#1f5a40,#c9a95c)}
.symmetry-row .side.right i{background:linear-gradient(90deg,#c9a95c,#1f5a40)}
.cover.m26-premium-report-v2{
  padding:0;background:
    radial-gradient(circle at 86% 12%,rgba(231,211,154,.16),transparent 45mm),
    radial-gradient(circle at 76% 76%,rgba(255,253,247,.035),transparent 62mm),
    linear-gradient(145deg,#123d2c 0%,#08251a 56%,#04140e 100%);
  color:#fffdf7;
}
.cover.m26-premium-report-v2 main{height:100%;padding:17mm 17mm}
.cover.m26-premium-report-v2::after{
  content:"";position:absolute;right:-17mm;top:-10mm;width:58mm;height:156mm;
  border-left:.75mm solid #c9a95c;border-radius:50%;transform:rotate(8deg);opacity:.82;
}
.cover-lockup{position:relative;z-index:3;display:flex;align-items:center;gap:5mm;width:100mm;min-height:25mm}
.cover-isotipo{
  display:block;width:22mm;height:25mm;object-fit:contain;object-position:center;
  filter:drop-shadow(0 1.2mm 2.5mm rgba(0,0,0,.20));
}
.cover-wordmark{display:grid;gap:1.1mm;min-width:0}
.cover-wordmark strong{
  color:#fffdf7;font-family:Georgia,serif;font-size:20pt;font-weight:600;
  letter-spacing:.12em;line-height:1;white-space:nowrap;
}
.cover-wordmark span{
  color:#e7d39a;font:700 7.2pt/1.28 Inter,Arial,sans-serif;
  letter-spacing:.025em;white-space:normal;
}
.cover-watermark{
  position:absolute;right:10mm;bottom:32mm;width:64mm;height:64mm;object-fit:contain;
  opacity:.055;filter:grayscale(1) sepia(.45) brightness(1.8);pointer-events:none;
}
.cover-copy{margin-top:22mm;width:152mm;position:relative;z-index:3}
.cover-copy>p{font-size:7.6pt;letter-spacing:.17em;color:#e7d39a;font-weight:800}
.cover-copy h1{
  margin:5mm 0 5mm;color:#fffdf7;font-family:Georgia,serif;font-size:36pt;
  line-height:1.04;font-weight:500;overflow-wrap:anywhere;word-break:normal;
}
.cover-claim{display:block;color:#e7d39a;font-size:7.8pt;letter-spacing:.055em}
.cover-data{
  position:absolute;left:17mm;right:17mm;bottom:28mm;z-index:3;
  display:grid;grid-template-columns:1.2fr .8fr;gap:5mm 8mm;padding:7mm;
  border:.3mm solid rgba(216,200,166,.92);border-radius:5mm;
  background:linear-gradient(145deg,rgba(255,253,248,.98),rgba(244,232,200,.96));
  color:#17342a;box-shadow:0 5mm 18mm rgba(0,0,0,.20);overflow:hidden;
}
.cover-data>div{display:grid;gap:1.2mm;min-width:0}
.cover-data span{font-size:6pt;color:#80652f;text-transform:uppercase;letter-spacing:.1em}
.cover-data strong{font-family:Georgia,serif;font-size:11.5pt;color:#08251a;overflow-wrap:anywhere;word-break:normal}
.cover-data-primary{grid-column:1/-1}
.cover-data-primary strong{font-size:16pt}
.cover-tags{grid-column:1/-1;display:flex!important;flex-direction:row;gap:3mm!important}
.cover-tags em{
  display:inline-flex;align-items:center;min-height:6.5mm;padding:0 3mm;border-radius:99px;
  background:#e4eee7;color:#1f5a40;font:800 5.7pt/1 Inter,Arial,sans-serif;
  letter-spacing:.055em;font-style:normal;white-space:nowrap;
}
.cover-tags em+em{background:#f4e8c8;color:#80652f}
.internal .section-copy h1{font-size:17pt}
.internal .section-copy p{font-size:5.8pt}
.internal .premium-header{height:29mm}
@media print{
  html,body{margin:0!important;padding:0!important;background:#fff}
  .pdf-page.m26-premium-report-v2{width:210mm;height:297mm;margin:0!important;box-shadow:none;break-after:page;page-break-after:always}
  .pdf-page.m26-premium-report-v2:last-child{break-after:auto;page-break-after:auto}
}
`;
export function buildIriReportHtml({draft,variant='client',clientName='Cliente IBERFIT',coachName='Coach IBERFIT',clientId='',logoUrl='/public/isotipo-iberfit.png'}={}){
  if(!draft||!['client','coach'].includes(variant))throw new Error('M26_IRI_REPORT_DOCUMENT_INVALID');
  const context={clientName:clean(clientName,160)||'Cliente IBERFIT',coachName:clean(coachName,160)||'Coach IBERFIT',clientId:clean(clientId,200),logoUrl};
  const pages=variant==='client'?clientPages(draft,context):coachPages(draft,context);
  if(variant==='client'&&pages.length!==7)throw new Error('M26_IRI_REPORT_CLIENT_PAGE_COUNT');
  if(variant==='coach'&&pages.length<13)throw new Error('M26_IRI_REPORT_COACH_PAGE_COUNT');
  const title=`Informe IRI IBERFIT · ${variant==='client'?'Cliente':'Coach / Admin'} · ${context.clientName}`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>${REPORT_CSS}${PREMIUM_RC36_CSS}</style></head><body>${pages.join('')}</body></html>`;
}

export function openIriReportPrint({draft,variant='client',clientName,coachName,clientId,logoUrl,storage=globalThis.localStorage,openWindow=globalThis.open,locationLike=globalThis.location,setTimeoutImpl=globalThis.setTimeout}={}){
  const html=buildIriReportHtml({draft,variant,clientName,coachName,clientId,logoUrl});
  const token=`m26-iri-report-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if(!storage?.setItem)throw new Error('M26_IRI_REPORT_STORAGE_UNAVAILABLE');
  storage.setItem(token,JSON.stringify({html,variant,createdAt:Date.now()}));
  const url=`/m26/iri-report.html#${encodeURIComponent(token)}`;
  const popup=typeof openWindow==='function'?openWindow(url,'_blank'):null;
  if(!popup){
    if(typeof locationLike?.assign==='function'){
      locationLike.assign(url);
      return {ok:true,variant,token,mode:'same-tab'};
    }
    storage.removeItem(token);throw new Error('M26_IRI_REPORT_POPUP_BLOCKED');
  }
  try{popup.opener=null;}catch{}
  if(typeof setTimeoutImpl==='function')setTimeoutImpl(()=>storage.removeItem(token),120_000);
  return {ok:true,variant,token,mode:'popup'};
}

export const __iriReportInternals=Object.freeze({escapeHtml,clean,label,number,dateLabel,heartRateChart,coverageScore,REPORT_CSS,rawDataPages});
