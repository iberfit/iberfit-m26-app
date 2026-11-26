/* M44 private print preview. PDF bytes are produced by the browser's print-to-PDF flow,
 * never represented as a server-issued or published report by this module. */
import {readDatedTrends,trendGeometry,readTrainingCalendar,calendarDescription} from './report-trend-contract.js';
const TYPES=Object.freeze({
  'post-session':'Informe post-sesión',
  weekly:'Resumen semanal',
  monthly:'Informe mensual',
  quarterly:'Informe trimestral',
  'year-in-iberfit':'Tu año en IBERFIT',
});
const EDITORIAL=Object.freeze({
  'post-session':['Tu sesión en perspectiva','Resultados registrados y contexto para preparar el siguiente entrenamiento.'],
  weekly:['Tu semana de entrenamiento','La actividad confirmada, lo que conviene revisar y cómo dar continuidad al proceso.'],
  monthly:['Un mes de seguimiento','Los registros del periodo, sus comparaciones y las decisiones que merecen una revisión profesional.'],
  quarterly:['El ciclo en perspectiva','Continuidad, evidencia comparable y prioridades para la siguiente etapa.'],
  'year-in-iberfit':['Tu recorrido, tus resultados','El entrenamiento realizado, los cambios observados y las prioridades de la siguiente etapa.'],
});
const TRUSTED_SOURCES=Object.freeze({
  sessionExecutions:'Sesiones IBERFIT confirmadas',
  'session_execution':'Sesión IBERFIT confirmada',
  'session_execution_period':'Historial de sesiones confirmadas',
  appointments:'Citas verificadas',
  'appointments+sessionExecutions':'Citas verificadas y sesiones IBERFIT confirmadas',
  checkins:'Registros de bienestar',
  trainingCycles:'Planificación publicada IBERFIT',
  'canonical-store':'Historial canónico IBERFIT',
  wearableDailySummaries:'Datos de dispositivo, solo contexto',
});
function esc(value){
  return String(value??'').replace(/[<>&"']/g,(c)=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
}
function clean(value,max=2500){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function paragraphs(value,max=2500){
  const text=String(value??'').slice(0,max).replace(/\r\n?/g,'\n').trim();
  return text ? text.split(/\n{2,}/).map((p)=>'<p>'+esc(p.replace(/\n/g,' '))+'</p>').join(''):'<p class="m44-empty">Interpretación profesional pendiente.</p>';
}
function dateLabel(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return 'Fecha pendiente';
  const date=new Date(Date.UTC(+match[1],+match[2]-1,+match[3]));
  if(Number.isNaN(+date)||date.toISOString().slice(0,10)!==match[0])return 'Fecha pendiente';
  return new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date);
}
function dayMonth(value){return value.slice(8,10)+'/'+value.slice(5,7);}
function validateActivitySeries(series,start,end){
  if(!Array.isArray(series)||series.length>13)return false;
  return series.every((row,index)=>row&&dateLabel(row.from)!=='Fecha pendiente'&&dateLabel(row.to)!=='Fecha pendiente'&&row.from>=start&&row.to<=end&&row.from<=row.to&&Number.isSafeInteger(row.count)&&row.count>=0&&(!index||series[index-1].to<row.from));
}
function activityGraphic(series){
  const values=series.map(row=>row.count);
  const maximum=Math.max(1,...values);
  const left=36,right=648,baseline=210,top=35;
  const slot=(right-left)/series.length;
  const columns=series.map((row,index)=>{
    const value=Math.max(0,row.count);
    const height=value/maximum*(baseline-top);
    const x=left+slot*index+slot*.19;
    const y=baseline-height;
    const width=Math.min(40,slot*.62);
    const label=row.from===row.to?dateLabel(row.from):dateLabel(row.from)+' — '+dateLabel(row.to);
    // Dates remain legible directly on the graph. The accessible HTML table
    // below supplies full years and both endpoints where labels are compact.
    const tick=dayMonth(row.from);
    return '<g><rect class="m44-activity-bar" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+width.toFixed(1)+'" height="'+height.toFixed(1)+'" rx="2"/>'+
      '<text class="m44-activity-value" x="'+(x+width/2).toFixed(1)+'" y="'+Math.max(19,y-8).toFixed(1)+'" text-anchor="middle">'+value+'</text>'+
      '<text class="m44-activity-date" x="'+(x+width/2).toFixed(1)+'" y="229" text-anchor="middle">'+esc(tick)+'</text>'+
      '<title>'+esc(label)+': '+value+' sesiones confirmadas</title></g>';
  }).join('');
  const grid='<text class="m44-activity-axis-label" x="28" y="'+(baseline+4)+'" text-anchor="end">0</text><text class="m44-activity-axis-label" x="28" y="'+(top+4)+'" text-anchor="end">'+maximum+'</text><line x1="'+left+'" y1="'+baseline+'" x2="'+right+'" y2="'+baseline+'" class="m44-activity-baseline"/>'+
    '<line x1="'+left+'" y1="'+top+'" x2="'+right+'" y2="'+top+'" class="m44-activity-guide"/>';
  return '<figure class="m44-activity-chart"><figcaption>Sesiones IBERFIT completadas y confirmadas</figcaption>'+
    '<svg viewBox="0 0 682 240" role="img" aria-label="Histograma de '+series.length+' periodos con una escala que empieza en cero. '+series.map(row=>esc(row.from)+' a '+esc(row.to)+': '+row.count).join('; ')+'">'+grid+columns+'</svg>'+
    '<p>Escala vertical desde 0 hasta '+maximum+' sesiones confirmadas por periodo. Las fechas abreviadas se desarrollan en la tabla. La barra muestra actividad confirmada, no el esfuerzo ni una tasa de adherencia.</p></figure>';
}
function activityTable(series){
  return '<table class="m44-activity-table"><caption>Detalle accesible del ritmo de entrenamiento</caption><thead><tr><th scope="col">Periodo</th><th scope="col">Sesiones confirmadas</th></tr></thead><tbody>'+
    series.map(row=>'<tr><td>'+esc(dateLabel(row.from))+' — '+esc(dateLabel(row.to))+'</td><td>'+row.count+'</td></tr>').join('')+'</tbody></table>';
}
function chunkEditorial(value,firstLimit,nextLimit=firstLimit){
  const source=clean(value,2500);
  if(!source)return [''];
  const chunks=[];
  let rest=source,limit=firstLimit;
  while(rest.length>limit){
    let end=rest.lastIndexOf(' ',limit);
    if(end<Math.floor(limit*.5))end=limit;
    chunks.push(rest.slice(0,end).trim());
    rest=rest.slice(end).trim();
    limit=nextLimit;
  }
  if(rest)chunks.push(rest);
  return chunks;
}
function evidenceList(rows,offset=0){
  return rows.map((item,index)=>{
    const source=TRUSTED_SOURCES[item.source]||clean(item.source,100);
    return '<li class="m44-evidence-item"><div class="m44-evidence-number">'+String(offset+index+1).padStart(2,'0')+'</div><div><h3>'+esc(clean(item.label,120))+'</h3><p>'+esc(clean(item.text,500))+'</p><small>Fuente: '+esc(source)+
      (item.quality?' · Calidad declarada: '+esc(clean(item.quality,60)):'')+'</small></div></li>';
  }).join('');
}
function eliteTrendGraphic(series){
  const g=trendGeometry(series,{width:570,height:106}),x=48,y=16;
  const fmt=n=>new Intl.NumberFormat('es-CL',{maximumFractionDigits:2}).format(n);
  const grid=[0,.5,1].map(r=>'<line x1="'+x+'" y1="'+(y+106*r)+'" x2="'+(x+570)+'" y2="'+(y+106*r)+'" stroke="#d0d6ca"/><text x="42" y="'+(y+106*r+3)+'" text-anchor="end">'+esc(fmt(g.max*(1-r)))+'</text>').join('');
  const paths=g.segments.map(([a,b])=>'<line x1="'+(x+a.x)+'" y1="'+(y+a.y)+'" x2="'+(x+b.x)+'" y2="'+(y+b.y)+'" stroke="#234638" stroke-width="2.5" stroke-dasharray="4 2"/>').join('');
  const points=g.coords.map((p,i)=>'<circle cx="'+(x+p.x)+'" cy="'+(y+p.y)+'" r="3.3" fill="'+(i===g.coords.length-1?'#ad813c':'#234638')+'"><title>'+esc(p.date+': '+fmt(p.value)+' '+series.unit)+'</title></circle>').join('');
  const a=series.points[0],b=series.points.at(-1);
  return '<figure class="m44-elite-trend"><figcaption>'+esc(series.label)+' <small>'+esc(series.unit)+'</small></figcaption><div class="m44-elite-endpoints"><b>'+esc(fmt(a.value))+'</b><span>Primera medición · '+esc(a.date)+'</span><b>'+esc(fmt(b.value))+'</b><span>Última medición · '+esc(b.date)+'</span></div><svg viewBox="0 0 640 146" role="img" aria-label="'+esc(series.label+': '+series.points.map(p=>p.date+' '+p.value).join('; '))+'">'+grid+paths+points+'<text x="48" y="140">'+esc(new Date(series.from).toISOString().slice(0,10))+'</text><text x="618" y="140" text-anchor="end">'+esc(new Date(series.to).toISOString().slice(0,10))+'</text></svg><p>'+series.points.length+' de '+series.total+' días registrados · medias diarias. Las líneas discontinuas orientan la lectura; no representan mediciones entre puntos. Huecos superiores a '+g.gapDays+' días no se unen.</p></figure>';
}
function calendarGraphic(c){
 const step=11.1,x=28,y=22;
 const cells=c.cells.map(p=>'<rect x="'+(x+p.week*step).toFixed(1)+'" y="'+(y+p.weekday*step).toFixed(1)+'" width="9.1" height="9.1" rx="1.1" fill="'+(p.active?'#234638':'#e1e6da')+'"><title>'+esc(p.date)+(p.active?' · entrenamiento confirmado':' · sin sesión confirmada')+'</title></rect>').join('');
 const monthLabels=c.months.map(m=>'<text x="'+(x+m.week*step).toFixed(1)+'" y="13">'+esc(m.month.slice(5))+'</text>').join('');
 const labels=['L','M','X','J','V','S','D'].map((v,i)=>'<text x="15" y="'+(y+i*step+7).toFixed(1)+'" text-anchor="end">'+v+'</text>').join('');
 return '<figure class="m44-training-calendar"><figcaption>Tu calendario de entrenamiento</figcaption><div class="m44-calendar-totals"><strong>'+c.count+' días</strong><span>'+c.weeks+' semanas con registros · '+c.longest+' consecutivas</span></div><svg viewBox="0 0 640 107" role="img" aria-label="'+esc(calendarDescription(c))+'">'+monthLabels+labels+cells+'</svg><p>Verde: día con al menos una sesión confirmada. Claro: sin sesión confirmada; no demuestra inactividad.</p><table class="m44-calendar-months"><caption>Días confirmados por mes (meses parciales incluidos)</caption><tbody>'+Array.from({length:Math.ceil(c.months.length/4)},(_,i)=>'<tr>'+c.months.slice(i*4,i*4+4).map(m=>'<td><small>'+esc(m.month)+'</small><b>'+m.active+' / '+m.days+'</b></td>').join('')+'</tr>').join('')+'</tbody></table></figure>';
}
function privateTechnicalPages(detail){
  if(!detail)return [];
  const fmt=v=>v==null?'—':esc(typeof v==='number'?v.toLocaleString('es-CL',{maximumFractionDigits:2}):v);
  const counts=[['Sesiones confirmadas',detail.sessions],['Ejercicios identificados',detail.exercises],['Series con alguna medición',detail.observedRows],['Sesiones sin series medibles',detail.emptySessions],['Filas explícitamente excluidas',detail.omittedRows]];
  const names={load:'Carga con unidad',reps:'Repeticiones',seconds:'Duración',distance:'Distancia',rpe:'RPE',rir:'RIR'};
  const metrics=counts.map(([k,v])=>'<tr><th scope="row">'+esc(k)+'</th><td>'+fmt(v)+'</td></tr>').join('');
  const coverage=Object.entries(names).map(([key,label])=>'<tr><th scope="row">'+esc(label)+'</th><td>'+fmt(detail.coverage[key])+'</td><td>'+fmt(detail.observedRows)+'</td></tr>').join('');
  const result=[{title:detail.role==='admin'?'Control interno del expediente':'Cobertura técnica del entrenamiento',inner:'<p class="m44-internal-label">USO INTERNO IBERFIT · NO ENVIAR AL CLIENTE</p><p class="m44-evidence-context">Consulta de registros disponibles en este expediente y ventana. No es una certificación de integridad del historial remoto ni una nueva publicación.</p><table class="m44-tech-table"><caption>Inventario de evidencia</caption><tbody>'+metrics+'</tbody></table><table class="m44-tech-table"><caption>Cobertura de mediciones por serie</caption><thead><tr><th>Variable</th><th>Registradas</th><th>Series medibles</th></tr></thead><tbody>'+coverage+'</tbody></table><p class="m44-subtle-note">Se muestran '+fmt(detail.details.length)+' de '+fmt(detail.observedRows)+' series medibles. '+(detail.limited?'Detalle limitado a las 360 series más recientes; el recuento cubre todas las series disponibles de la ventana. Consulta el historial para el resto.':'Detalle completo de las series medibles disponibles en esta consulta.')+' Ausente no equivale a cero.</p>'}];
  const goal=detail.objective;
  if(goal)result.push({title:'Objetivo vigente y contexto de planificación',inner:'<p class="m44-internal-label">USO INTERNO IBERFIT · NO ENVIAR AL CLIENTE</p><div class="m44-cycle-objective"><span>OBJETIVO PUBLICADO</span><h3>'+fmt(goal.goal)+'</h3><p>'+fmt(goal.cycleName)+' · '+fmt(goal.start)+' — '+fmt(goal.end)+(goal.weeklyFrequency!==null?' · '+fmt(goal.weeklyFrequency)+' sesiones por semana acordadas':'')+'</p></div><p class="m44-evidence-context">Los registros de ejecución del informe se deben contrastar con el objetivo y su criterio de evaluación. No se deduce cumplimiento de la intención por el transcurso del tiempo, frecuencia o carga.</p>'});
  const sports=detail.sportSummary??[];
  if(sports.length){const rows=sports.map(s=>{const running=s.sport==='running',unit=running?' km':' m',dist=m=>fmt(running?m/1000:m)+unit;return '<tr><th scope="row">'+(running?'Running':'Natación')+'</th><td>'+fmt(s.sessions)+'</td><td>'+dist(s.metres)+'</td><td>'+fmt(s.pairedRows)+' / '+fmt(s.rows)+'</td><td>'+dist(s.pairedMetres)+'</td><td>'+fmt(s.pairedSeconds)+' s</td></tr>';}).join('');result.push({title:'Resistencia · carga externa registrada',inner:'<p class="m44-internal-label">USO INTERNO IBERFIT · NO ENVIAR AL CLIENTE</p><table class="m44-tech-table"><caption>Distancia por disciplina y cobertura del tiempo</caption><thead><tr><th>Disciplina</th><th>Sesiones</th><th>Distancia</th><th>Con tiempo</th><th>Distancia pareada</th><th>Tiempo pareado</th></tr></thead><tbody>'+rows+'</tbody></table><p class="m44-subtle-note">Tiempo y distancia pareados proceden de los mismos registros. No se suman resúmenes de sesión con sus series ni se equiparan intervalos, terrenos, estilos o protocolos.</p>'});}
  const endurance=detail.sportComparisons??[];
  for(let i=0;i<endurance.length;i+=2){
    const charts=endurance.slice(i,i+2).map(c=>{
      const distance=c.sport==='running'?fmt(c.metres/1000)+' km':fmt(c.metres)+' m';
      const duration=s=>Math.floor(Math.round(s)/60)+':'+String(Math.round(s)%60).padStart(2,'0');
      const points=c.points.map(p=>({date:p.date,time:Date.parse(p.date+'T00:00:00Z'),value:p.seconds}));
      const series={label:c.exercise+' · '+distance+' · tiempo registrado',unit:'s',points,total:c.days,from:Date.parse(detail.periodStart+'T00:00:00Z'),to:Date.parse(detail.periodEnd+'T00:00:00Z')};
      const context=(c.kind==='intervals'?'Intervalos completados: '+fmt(c.intervals):'Trabajo continuo prescrito')+(c.pool?' · Piscina prescrita: '+fmt(c.pool)+' m':'')+' · Serie '+fmt(c.setNumber)+' de '+fmt(c.sets)+' · descanso prescrito '+fmt(c.rest)+' s';
      return eliteTrendGraphic(series)+'<p class="m44-subtle-note">'+fmt(duration(c.first.seconds))+' → '+fmt(duration(c.last.seconds))+' (min:s), '+fmt(c.observations)+' registros en '+fmt(c.days)+' días. '+context+'.</p>';
    }).join('');
    result.push({title:'Resistencia · distancia y prescripción comparables',inner:'<p class="m44-internal-label">USO INTERNO IBERFIT · NO ENVIAR AL CLIENTE</p><p class="m44-evidence-context">'+fmt(endurance.length)+' de '+fmt(detail.sportComparisonTotal)+' grupos elegibles. Medias diarias de tiempo registrado; no certifica terreno, pausas, estilo ni rendimiento fisiológico equivalente.</p>'+charts});
  }
  const overview=detail.exerciseSummary??[],comparisons=detail.loadComparisons??[];
  for(let i=0;i<overview.length;i+=12){
    const rows=overview.slice(i,i+12).map(r=>'<tr><td>'+fmt(r.exercise)+'<small>'+fmt(r.first)+' — '+fmt(r.last)+'</small></td><td>'+fmt(r.exposures)+'</td><td>'+fmt(r.rows)+'</td><td>'+fmt(r.loadRows)+'</td><td>'+fmt(r.rpeRows)+'</td><td>'+fmt(r.rirRows)+'</td></tr>').join('');
    result.push({title:'Inventario por ejercicio',inner:'<p class="m44-internal-label">USO INTERNO IBERFIT · NO ENVIAR AL CLIENTE</p><table class="m44-tech-table m44-exercise-inventory"><caption>'+fmt(overview.length)+' de '+fmt(detail.exerciseSummaryTotal)+' ejercicios identificados · cobertura por variable</caption><thead><tr><th>Ejercicio / fechas</th><th>Sesiones</th><th>Series</th><th>Carga</th><th>RPE</th><th>RIR</th></tr></thead><tbody>'+rows+'</tbody></table><p class="m44-subtle-note">Los recuentos incluyen todas las series medibles de cada ejercicio, aunque el anexo de series tenga un límite de impresión. No se agregan cargas de protocolos diferentes.</p>'});
  }
  for(let i=0;i<comparisons.length;i+=2){
    const cards=comparisons.slice(i,i+2).map(c=>{
      const p=c.points,lo=Date.parse(p[0].date+'T00:00:00Z'),hi=Date.parse(p.at(-1).date+'T00:00:00Z'),maximum=Math.max(1,c.bestKg);
      const xy=p.map(x=>({x:34+(Date.parse(x.date+'T00:00:00Z')-lo)/(hi-lo)*550,y:100-x.kg/maximum*82}));
      const dots=xy.map((v,j)=>'<circle cx="'+v.x+'" cy="'+v.y+'" r="3.2" fill="#234638"><title>'+fmt(p[j].date)+': '+fmt(p[j].kg)+' kg</title></circle>').join('');
      const segments=xy.slice(1).map((v,j)=>{const gap=(Date.parse(p[j+1].date)-Date.parse(p[j].date))/86400000;return gap>45?'':'<line x1="'+xy[j].x+'" y1="'+xy[j].y+'" x2="'+v.x+'" y2="'+v.y+'" stroke="#234638" stroke-width="2" stroke-dasharray="4 3"/>';}).join('');
      const effort=q=>'RPE '+fmt(q.rpe)+' / RIR '+fmt(q.rir);
      return '<section class="m44-exercise-analysis"><h3>'+fmt(c.exercise)+' · '+fmt(c.reps)+' rep.</h3><p class="m44-subtle-note">Variante: '+fmt(c.protocol[0])+' · equipo: '+fmt(c.protocol[1])+' · base: '+fmt(c.protocol[2])+' · lado: '+fmt(c.protocol[3])+'</p><div class="m44-tech-compare"><div><small>Primera · '+fmt(c.first.date)+'</small><b>'+fmt(c.first.kg)+' kg</b><span>'+effort(c.first)+'</span></div><div><small>Última · '+fmt(c.last.date)+'</small><b>'+fmt(c.last.kg)+' kg</b><span>'+effort(c.last)+'</span></div><div><small>Variación de carga</small><b>'+fmt(c.change)+' kg</b><span>'+fmt(c.percent)+(c.percent===null?'':' %')+' · máximo '+fmt(c.bestKg)+' kg</span></div></div><svg viewBox="0 0 610 120" role="img" aria-label="'+fmt(p.map(x=>x.date+': '+x.kg+' kg').join('; '))+'"><line x1="34" y1="100" x2="584" y2="100" stroke="#bfc9bf"/><line x1="34" y1="18" x2="584" y2="18" stroke="#bfc9bf"/><text x="28" y="21" text-anchor="end">'+fmt(maximum)+'</text><text x="28" y="103" text-anchor="end">0</text>'+segments+dots+'<text x="34" y="116">'+fmt(p[0].date)+'</text><text x="584" y="116" text-anchor="end">'+fmt(p.at(-1).date)+'</text></svg><p class="m44-subtle-note">'+fmt(p.length)+' de '+fmt(c.dates)+' días observados. Máxima carga registrada a igual número de repeticiones y contexto explícito. No es una estimación de 1RM ni un juicio de rendimiento.</p><p class="m44-subtle-note">'+fmt(c.milestoneCount??0)+' nuevos máximos del periodo desde el primer registro comparable'+(c.milestones?.length?': '+c.milestones.slice(-2).map(m=>fmt(m.date)+' · '+fmt(m.kg)+' kg').join('; '):'')+'. No equivale a un récord histórico.</p></section>';
    }).join('');
    result.push({title:'Comparaciones de carga por ejercicio',inner:'<p class="m44-internal-label">USO INTERNO IBERFIT · NO ENVIAR AL CLIENTE</p><p class="m44-evidence-context">'+fmt(comparisons.length)+' de '+fmt(detail.loadComparisonTotal)+' grupos elegibles. Las fechas sin datos no se estiman y los huecos superiores a 45 días no se unen.</p>'+cards});
  }
  const effortComparisons=detail.effortComparisons??[];
  for(let i=0;i<effortComparisons.length;i+=2){
    const charts=effortComparisons.slice(i,i+2).map(c=>{
      const points=c.points.map(p=>({...p,time:Date.parse(p.date+'T00:00:00Z')}));
      const label=c.exercise+' · '+fmt(c.kg)+' kg · '+fmt(c.reps)+' rep. · '+c.metric.toUpperCase();
      const series={label,unit:'/10',points,total:c.days,from:Date.parse(detail.periodStart+'T00:00:00Z'),to:Date.parse(detail.periodEnd+'T00:00:00Z')};
      return eliteTrendGraphic(series)+'<p class="m44-subtle-note">'+fmt(c.series)+' series con medición válida en '+fmt(c.days)+' días. Variante: '+fmt(c.protocol[0])+' · equipo: '+fmt(c.protocol[1])+' · base: '+fmt(c.protocol[2])+' · lado: '+fmt(c.protocol[3])+'. Misma carga y repeticiones; no controla por sí solo descanso, técnica ni fatiga previa.</p>';
    }).join('');
    result.push({title:'Esfuerzo a carga equivalente',inner:'<p class="m44-internal-label">USO INTERNO IBERFIT · NO ENVIAR AL CLIENTE</p><p class="m44-evidence-context">'+fmt(effortComparisons.length)+' de '+fmt(detail.effortComparisonTotal)+' grupos elegibles. RPE y RIR se analizan por separado; no se infiere una mejora de fuerza.</p>'+charts});
  }
  if(!effortComparisons.length)result[0].inner+='<p class="m44-subtle-note">Esfuerzo comparable: se requieren al menos tres fechas con mediciones válidas y misma carga, repeticiones y contexto de ejercicio.</p>';
  if(!comparisons.length)result[0].inner+='<p class="m44-subtle-note">Comparación de carga: no hay dos días con el mismo ejercicio, repeticiones y contexto explícito completo. Se conservan los registros descriptivos.</p>';
  const perPage=12;
  for(let i=0;i<detail.details.length;i+=perPage){
    const rows=detail.details.slice(i,i+perPage).map(r=>'<tr><td>'+fmt(r.date)+'<small>'+fmt(r.session)+'</small></td><td>'+fmt(r.exercise)+'<small>Serie '+fmt(r.set)+'</small></td><td>'+fmt(r.load)+'</td><td>'+fmt(r.reps)+'</td><td>'+fmt(r.seconds)+'</td><td>'+fmt(r.distance)+'</td><td>'+fmt(r.rpe)+'</td><td>'+fmt(r.rir)+'</td></tr>').join('');
    result.push({title:'Detalle de ejecución · '+(i+1)+'–'+Math.min(i+perPage,detail.details.length),inner:'<p class="m44-internal-label">USO INTERNO IBERFIT · NO ENVIAR AL CLIENTE</p><div class="m44-tech-scroll"><table class="m44-tech-table m44-tech-sets"><caption>Series observadas · orden de sesión más reciente</caption><thead><tr><th>Fecha / sesión</th><th>Ejercicio / serie</th><th>Carga</th><th>Rep.</th><th>s</th><th>Dist.</th><th>RPE</th><th>RIR</th></tr></thead><tbody>'+rows+'</tbody></table></div><p class="m44-subtle-note">Unidades y valores registrados. No se han estimado datos ausentes ni equiparado variantes, implementos o protocolos.</p>'});
  }
  return result;
}
function footer(page,total){
  return '<footer class="m44-foot"><span><b>IBERFIT</b> · Diagnóstico, planificación, control y seguimiento</span><span>'+page+' / '+total+'</span></footer>';
}
function page(index,total,eyebrow,title,inner){
  return '<section class="m44-sheet m44-interior" aria-label="Página '+index+' de '+total+'"><header class="m44-page-head"><span class="m44-page-index">'+String(index-1).padStart(2,'0')+'</span><div><p class="m44-kicker">'+esc(eyebrow)+'</p><h2>'+esc(title)+'</h2></div></header><main class="m44-page-content">'+inner+'</main>'+footer(index,total)+'</section>';
}
export function buildEvolutionReportHtml({report,clientName='Cliente IBERFIT',coachName='Equipo IBERFIT',stylesheetHref='/m26/evolution-report.css?v=m44-elite-5',publicationStatus='draft',audience='internal',technicalDetail=null}={}){
  if(!report||report.ready!==true||!Object.hasOwn(TYPES,report.id)||!Array.isArray(report.evidence)||!report.evidence.length)
    throw new Error('M44_REPORT_PREVIEW_EVIDENCE_REQUIRED');
  if(!report.periodStart||!report.periodEnd||dateLabel(report.periodStart)==='Fecha pendiente'||dateLabel(report.periodEnd)==='Fecha pendiente'||report.periodStart>report.periodEnd)
    throw new Error('M44_REPORT_PREVIEW_PERIOD_INVALID');
  if(!String(stylesheetHref).startsWith('/m26/evolution-report.css?')&&!/^https:\/\/[a-z0-9.-]+\/m26\/evolution-report\.css\?/i.test(String(stylesheetHref)))
    throw new Error('M44_REPORT_PREVIEW_STYLESHEET_UNTRUSTED');
  const lines=report.evidence.filter((item)=>item&&clean(item.label,120)&&clean(item.text,500)&&clean(item.source,120));
  if(lines.length!==report.evidence.length||lines.length>12)throw new Error('M44_REPORT_PREVIEW_EVIDENCE_INVALID');
  const name=clean(clientName,130)||'Cliente IBERFIT',coach=clean(coachName,130)||'Equipo IBERFIT';
  const title=clean(report.title,140)||TYPES[report.id];
  if(!['draft','published'].includes(publicationStatus))throw new Error('M44_REPORT_DOCUMENT_STATUS_INVALID');
  const published=publicationStatus==='published';
  if(!['client','internal'].includes(audience))throw Error('M44_REPORT_AUDIENCE_INVALID');
  const clientView=published||audience==='client';
  const technicalPages=!clientView&&technicalDetail&&['coach','admin'].includes(technicalDetail.role)&&technicalDetail.periodStart===report.periodStart&&technicalDetail.periodEnd===report.periodEnd?privateTechnicalPages(technicalDetail):[];
  // An evidence sheet must accommodate actual explanation lengths. Six rows
  // of 500 characters do not fit A4 even if the source count is valid.
  // Use a conservative per-page reading budget; never scale text down or
  // silently discard evidence to make a page fit.
  const maxRows=6,evidenceBudget=28;
  const evidenceCost=item=>2+
    Math.ceil(clean(item.text,500).length/75)+
    Math.ceil(clean(item.label,120).length/65)+
    Math.ceil(clean(item.source,120).length/80);
  const calendar=report.id==='year-in-iberfit'?readTrainingCalendar(lines,report.periodStart,report.periodEnd,report.activitySeries??[]):null;
  const displayLines=lines.map(row=>row.label==='Calendario de entrenamiento'?{...row,text:calendar?calendarDescription(calendar):'Registro diario no interpretable; requiere revisión.'}:row);
  const evidenceChunks=[];
  let currentChunk=[],budgetUsed=0;
  for(const item of displayLines){
    const cost=evidenceCost(item);
    if(currentChunk.length&&(currentChunk.length>=maxRows||budgetUsed+cost>evidenceBudget)){
      evidenceChunks.push(currentChunk);
      currentChunk=[];budgetUsed=0;
    }
    currentChunk.push(item);budgetUsed+=cost;
  }
  if(currentChunk.length)evidenceChunks.push(currentChunk);
  const activitySeries=report.activitySeries??[];
  if(!validateActivitySeries(activitySeries,report.periodStart,report.periodEnd))throw new Error('M44_REPORT_PREVIEW_ACTIVITY_INVALID');
  const showActivity=report.id!=='post-session'&&activitySeries.length>=2;
  // Length-limited reading sections. The full interpretation must remain
  // visible in the PDF, never merely truncated by overflow:hidden.
  const summaryText=clean(report.summary,2500);
  const summaryChunks=summaryText.length<=750?[report.summary]:chunkEditorial(summaryText,590,950);
  const coachText=clientView?'':clean(report.coachComment,2500);
  const longDecision=clean(report.conclusions,2500).length+coachText.length+
    clean(report.recommendations,2500).length>900;
  const decisionSections=[];
  if(longDecision){
    for(const text of chunkEditorial(report.conclusions,960))decisionSections.push({kind:'conclusions',text});
    if(!clientView&&coachText)
      for(const text of chunkEditorial(coachText,900))decisionSections.push({kind:'coach',text});
    for(const text of chunkEditorial(report.recommendations,960))decisionSections.push({kind:'next',text});
  }
  const trends=readDatedTrends(lines,report.periodStart,report.periodEnd);
  const trendPages=Math.ceil(trends.length/2);
  const total=1+summaryChunks.length+evidenceChunks.length+(showActivity?1:0)+(calendar?1:0)+trendPages+
    (longDecision?decisionSections.length:1)+technicalPages.length;
  const pages=[];
  const decisionEnd=total-technicalPages.length;
  const summaryMetrics=[];
  const countEvidence=(labels,source)=>lines.find(item=>labels.includes(item.label)&&item.source===source&&/^\d+$/u.test(item.text));
  const sessionCount=countEvidence(['Sesiones confirmadas','Sesiones ejecutadas','Sesiones del último año'],'sessionExecutions');
  const trainingDays=countEvidence(['Días con entrenamiento confirmado'],'sessionExecutions');
  const booked=lines.find(item=>item.label==='Constancia'&&item.source==='appointments+sessionExecutions')?.text.match(/^(\d+) de (\d+) citas programadas cumplidas/u);
  const checkins=lines.find(item=>item.label==='Bienestar'&&item.source==='checkins')?.text.match(/^(\d+) registros? en el periodo/u);
  const fmt=n=>new Intl.NumberFormat('es-CL',{maximumFractionDigits:1}).format(n);
  if(sessionCount)summaryMetrics.push([fmt(Number(sessionCount.text)),'Sesiones confirmadas']);
  if(booked&&Number(booked[2])>0&&Number(booked[1])<=Number(booked[2]))summaryMetrics.push([fmt(100*Number(booked[1])/Number(booked[2]))+'%','Citas cumplidas']);
  else if(trainingDays)summaryMetrics.push([fmt(Number(trainingDays.text)),'Días con entrenamiento']);
  if(checkins)summaryMetrics.push([fmt(Number(checkins[1])),'Registros de bienestar']);
  if(summaryMetrics.length<3&&trainingDays&&!summaryMetrics.some(m=>m[1]==='Días con entrenamiento'))summaryMetrics.push([fmt(Number(trainingDays.text)),'Días con entrenamiento']);
  const volume=lines.find(item=>item.label==='Volumen comparable'&&item.source==='sessionExecutions')?.text.match(/\((\d+) y (\d+) sesiones; medias (\d+(?:\.\d+)?) y (\d+(?:\.\d+)?) kg·rep\)/u);
  const comparable=volume?volume.slice(1).map(Number):null;
  const volumeGraphic=comparable&&comparable.every(Number.isFinite)&&comparable[0]>0&&comparable[1]>0&&Math.max(comparable[2],comparable[3])>0?
    '<figure class="m44-volume-compare"><figcaption>Trabajo de fuerza comparable</figcaption>'+[0,1].map(i=>'<div class="m44-volume-row"><span>'+ (i?'Grupo reciente':'Grupo anterior')+'<small>'+comparable[i]+' sesiones</small></span><svg class="m44-volume-track" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="10" class="m44-volume-bg"/><rect width="'+(100*comparable[i+2]/Math.max(comparable[2],comparable[3])).toFixed(2)+'" height="10" class="m44-volume-fill"/></svg><b>'+esc(fmt(comparable[i+2]))+' kg·rep</b></div>').join('')+'<p>Media de carga × repeticiones; más trabajo no equivale a mejor rendimiento.</p></figure>':'';
  const goalRow=lines.find(r=>r.label==='Objetivo del ciclo vigente'&&r.source==='trainingCycles');
  const goalGraphic=goalRow?'<section class="m44-cycle-objective"><span>TU OBJETIVO ACORDADO</span><p>'+esc(goalRow.text)+'</p></section>':'';
  const summaryBand=summaryMetrics.length?'<div class="m44-summary-metrics">'+summaryMetrics.map(([v,label])=>'<div><strong>'+esc(v)+'</strong><span>'+esc(label)+'</span></div>').join('')+'</div>':'';
  pages.push('<section class="m44-sheet m44-cover" aria-label="Portada del informe">'+
    '<div class="m44-cover-accent" aria-hidden="true"></div>'+
    '<div class="m44-brand"><img src="/public/isotipo-iberfit.png" alt="" width="66" height="66"><div><strong>IBERFIT</strong><small>ENTRENAMIENTO PERSONAL CON CRITERIO</small></div></div>'+
    '<p class="m44-cover-category">'+(clientView?'EVOLUCIÓN · TU SEGUIMIENTO':'EVOLUCIÓN · DOCUMENTO DE TRABAJO INTERNO')+'</p>'+
    '<h1>'+esc(TYPES[report.id])+'<span>'+esc(EDITORIAL[report.id][0])+'</span></h1>'+
    '<p class="m44-cover-description">'+esc(EDITORIAL[report.id][1])+'</p>'+
    '<div class="m44-cover-rule" aria-hidden="true"></div>'+
    '<div class="m44-cover-meta"><div><span>Preparado para</span><strong>'+esc(name)+'</strong></div><div><span>Periodo analizado</span><strong>'+esc(dateLabel(report.periodStart))+' — '+esc(dateLabel(report.periodEnd))+'</strong></div><div><span>Revisión profesional</span><strong>'+esc(coach)+'</strong></div></div>'+
    '<div class="m44-cover-bottom"><span>'+(published?'CONSULTA DE INFORME PUBLICADO EN PLATAFORMA':clientView?'BORRADOR PRIVADO · VERSIÓN CLIENTE SIN PUBLICAR':'BORRADOR PRIVADO · USO INTERNO · NO ENVIAR AL CLIENTE')+'</span><span>IBERFIT · INFORME DE EVOLUCIÓN</span></div></section>');
  pages.push(page(2,total,'01 · LA LECTURA','Qué hemos hecho',
    '<p class="m44-section-lead">'+esc(title===TYPES[report.id]?'El periodo en contexto':title)+'</p>'+summaryBand+
    '<div class="m44-prose m44-report-summary">'+paragraphs(summaryChunks[0],2500)+'</div>'+
    '<div class="m44-period-line"><div><span>Desde</span><strong>'+esc(dateLabel(report.periodStart))+'</strong></div><div><span>Hasta</span><strong>'+esc(dateLabel(report.periodEnd))+'</strong></div><div><span>Tipo de seguimiento</span><strong>'+esc(TYPES[report.id])+'</strong></div></div>'+
    volumeGraphic+goalGraphic+'<div class="m44-reading-rule"><span>Cómo interpretar estos resultados</span><p>Los hechos describen lo que está confirmado; las conclusiones y próximos pasos corresponden a la revisión del coach. Un cambio de carga, volumen o frecuencia no implica por sí mismo una mejora funcional.</p></div>'));
  for(let i=1;i<summaryChunks.length;i++){
    pages.push(page(2+i,total,'01 · LA LECTURA','El periodo en detalle',
      '<p class="m44-section-lead">La lectura, continuación '+i+'</p>'+
      '<div class="m44-prose m44-report-summary">'+paragraphs(summaryChunks[i],2500)+'</div>'));
  }
  if(showActivity){
    const sum=activitySeries.reduce((total,row)=>total+row.count,0);
    pages.push(page(2+summaryChunks.length,total,'02 · CONTINUIDAD','El ritmo del periodo',
      '<p class="m44-section-lead">Lo que muestra el calendario</p>'+
      '<p class="m44-evidence-context">Distribución de las sesiones confirmadas dentro del periodo analizado. Esta visualización ayuda a identificar continuidad o interrupciones en el registro; no califica por sí sola adherencia ni rendimiento.</p>'+
      activityGraphic(activitySeries)+activityTable(activitySeries)+
      '<p class="m44-subtle-note">Total representado: '+sum+' sesiones confirmadas. Los periodos sin registros se muestran como cero sesiones <em>confirmadas</em>, no como inactividad demostrada.</p>'));
  }
  const calendarStart=2+summaryChunks.length+(showActivity?1:0);
  if(calendar)pages.push(page(calendarStart,total,'CONTINUIDAD','Un año, día a día',calendarGraphic(calendar)));
  const trendStart=calendarStart+(calendar?1:0);
  for(let i=0;i<trendPages;i++)pages.push(page(trendStart+i,total,'TENDENCIAS','Evolución registrada',trends.slice(i*2,i*2+2).map(eliteTrendGraphic).join('')));
  const firstEvidencePage=trendStart+trendPages;
  let evidenceOffset=0;
  for(let i=0;i<evidenceChunks.length;i++){
    const chunk=evidenceChunks[i];
    const offset=evidenceOffset;
    evidenceOffset+=chunk.length;
    const idx=firstEvidencePage+i;
    pages.push(page(idx,total,showActivity?'03 · EVIDENCIA':'02 · EVIDENCIA','Resultados verificables',
      '<p class="m44-section-lead">Lo que podemos afirmar</p>'+
      '<p class="m44-evidence-context">Cada dato se acompaña de su procedencia. Cuando falta una medición o un protocolo comparable, no se completa por estimación.</p>'+
      '<ol class="m44-evidence-list" start="'+String(1+offset)+'">'+evidenceList(chunk,offset)+'</ol>'+
      '<p class="m44-subtle-note">Esta relación registra evidencias; no equivale a una clasificación automática del estado de salud ni a una recomendación individual.</p>'));
  }

  const method='<div class="m44-method"><h3>Transparencia del informe</h3><p>Fuente principal: '+
    esc(TRUSTED_SOURCES[report.sourceType]||'Evidencia canónica IBERFIT')+
    '. Ventana: '+esc(dateLabel(report.periodStart))+' a '+esc(dateLabel(report.periodEnd))+
    '. '+(published?'Esta copia de lectura procede del informe visible en la plataforma. No constituye por sí sola un artefacto PDF firmado o archivado.':'Este documento es una previsualización; no confirma aprobación, publicación ni entrega.')+
    ' La evidencia de diagnóstico IRI inicial se mantiene separada de la evolución.</p>'+
    '<p>Los datos de dispositivos, si se utilizan, deben mostrar procedencia, frescura y calidad y nunca sustituir una sesión confirmada.</p></div>';
  if(!longDecision){
    pages.push(page(decisionEnd,total,showActivity?'04 · CRITERIO PROFESIONAL':'03 · CRITERIO PROFESIONAL','Decidir el siguiente paso',
    '<div class="m44-decision"><span>INTERPRETACIÓN PROFESIONAL</span><div class="m44-prose">'+paragraphs(report.conclusions,2500)+'</div></div>'+
    (clientView?'':'<div class="m44-coach-voice"><span>NOTA PRIVADA DEL COACH</span><div class="m44-prose">'+paragraphs(report.coachComment,2500)+'</div><strong>'+esc(coach)+'</strong></div>')+
    '<div class="m44-next"><span>PRÓXIMO PASO PROPUESTO</span><div class="m44-prose">'+paragraphs(report.recommendations,2500)+'</div></div>'+
    '<div class="m44-method"><h3>Transparencia del informe</h3><p>Fuente principal: '+esc(TRUSTED_SOURCES[report.sourceType]||'Evidencia canónica IBERFIT')+'. Ventana: '+esc(dateLabel(report.periodStart))+' a '+esc(dateLabel(report.periodEnd))+'. '+(published?'Esta copia de lectura procede del informe visible en la plataforma. No constituye por sí sola un artefacto PDF firmado o archivado.':'Este documento es una previsualización; no confirma aprobación, publicación ni entrega.')+' La evidencia de diagnóstico IRI inicial se mantiene separada de la evolución.</p><p>Los datos de dispositivos, si se utilizan, deben mostrar procedencia, frescura y calidad y nunca sustituir una sesión confirmada.</p></div>'));
  }else{
    let documentPage=firstEvidencePage+evidenceChunks.length;
    for(let i=0;i<decisionSections.length;i++){
      const section=decisionSections[i];
      const last=i===decisionSections.length-1;
      const heading=section.kind==='conclusions'?'La interpretación':
        section.kind==='coach'?'La mirada del Coach':'El siguiente paso';
      const eyebrow=section.kind==='conclusions'?'CRITERIO PROFESIONAL':
        section.kind==='coach'?'NOTA PROFESIONAL PRIVADA':'PROPUESTA DE CONTINUIDAD';
      const body=section.kind==='coach'?
        '<div class="m44-coach-voice"><span>'+eyebrow+'</span><div class="m44-prose">'+paragraphs(section.text,2500)+'</div><strong>'+esc(coach)+'</strong></div>':
        '<div class="m44-decision"><span>'+eyebrow+'</span><div class="m44-prose">'+paragraphs(section.text,2500)+'</div></div>';
      pages.push(page(documentPage++,total,'CRITERIO PROFESIONAL',heading,
        '<p class="m44-section-lead">'+(i?'La lectura continúa':'Una decisión con contexto')+'</p>'+
        body+(last?method:'')));
    }
  }
  for(let i=0;i<technicalPages.length;i++){const p=technicalPages[i];pages.push(page(decisionEnd+i+1,total,'ANEXO TÉCNICO PRIVADO',p.title,p.inner));}
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Vista previa IBERFIT · '+esc(name)+'</title><link rel="stylesheet" href="'+esc(stylesheetHref)+'" data-m44-report-css></head><body class="'+(clientView?'m44-audience-client':'m44-audience-internal')+'"><nav class="m44-toolbar" aria-label="Acciones de la vista previa"><span data-m44-print-status>Verificando diseño A4…</span><button type="button" data-m44-print disabled>Imprimir o guardar como PDF</button><button type="button" data-m44-close>Cerrar</button></nav>'+pages.join('')+'</body></html>';
}
function pageOverflow(doc){
  return [...doc.querySelectorAll('.m44-sheet')].some((page)=>{
    const content=page.querySelector('.m44-page-content');
    const footer=page.querySelector('.m44-foot');
    if(!content||!footer)return Number(page.scrollHeight)>Number(page.clientHeight)+2;
    // Bounding rectangles alone miss clipped content in flex layouts.
    // Compare the full scroll height as well as the A4 footer boundary.
    return Number(content.scrollHeight)>Number(content.clientHeight)+2
      ||content.getBoundingClientRect().bottom>footer.getBoundingClientRect().top-8;
  });
}
async function verifyA4Layout(doc,popup,scope){
  // Mobile screen mode deliberately reflows sheets for readability. Check the
  // actual 210×297 mm desktop/print geometry in an off-screen viewport instead.
  if(!popup.matchMedia?.('(max-width: 825px)')?.matches)return !pageOverflow(doc);
  const frame=doc.createElement('iframe');
  frame.className='m44-layout-preflight';
  frame.setAttribute('aria-hidden','true');
  frame.setAttribute('tabindex','-1');
  doc.body.append(frame);
  try{
    const target=frame.contentDocument;
    if(!target?.head||!target?.body)return false;
    const link=target.createElement('link');
    link.rel='stylesheet';link.href=doc.querySelector('[data-m44-report-css]')?.href||'';
    target.head.append(link);
    target.body.replaceChildren(...[...doc.querySelectorAll('.m44-sheet')].map((page)=>target.importNode(page,true)));
    await Promise.race([
      new Promise((resolve)=>{if(link.sheet){resolve();return;}link.addEventListener('load',resolve,{once:true});link.addEventListener('error',resolve,{once:true});}),
      new Promise((resolve)=>scope.setTimeout(resolve,5000)),
    ]);
    if(!link.sheet)return false;
    await Promise.race([target.fonts?.ready||Promise.resolve(),new Promise(resolve=>scope.setTimeout(resolve,3000))]);
    const pages=[...target.querySelectorAll('.m44-sheet')];
    const geometries=pages.every(page=>{
      const styles=frame.contentWindow?.getComputedStyle(page);
      const height=parseFloat(styles?.height||'0'),width=parseFloat(styles?.width||'0');
      return height>=1050&&width>=740;
    });
    return geometries&&!pageOverflow(target);
  }finally{frame.remove();}
}
export function openEvolutionReportPreview({report,clientName,coachName,publicationStatus='draft',audience='internal',technicalDetail=null,scope=globalThis}={}){
  const origin=String(scope.location?.origin||'');
  if(!/^https?:\/\/[^/]+$/i.test(origin))throw new Error('M44_REPORT_PREVIEW_ORIGIN_REQUIRED');
  const html=buildEvolutionReportHtml({report,clientName,coachName,publicationStatus,audience,technicalDetail,stylesheetHref:origin+'/m26/evolution-report.css?v=m44-elite-5'});
  const popup=scope.open?.('about:blank','_blank');
  if(!popup?.document)throw new Error('M44_REPORT_PREVIEW_POPUP_BLOCKED');
  try{
    popup.opener=null;
    const parsed=new popup.DOMParser().parseFromString(html,'text/html');
    popup.document.replaceChild(popup.document.importNode(parsed.documentElement,true),popup.document.documentElement);
    const doc=popup.document;
    const print=doc.querySelector('[data-m44-print]');
    const close=doc.querySelector('[data-m44-close]');
    const status=doc.querySelector('[data-m44-print-status]');
    const stylesheet=doc.querySelector('[data-m44-report-css]');
    let ready=false;
    const finish=async()=>{
      await Promise.race([doc.fonts?.ready||Promise.resolve(),new Promise((resolve)=>scope.setTimeout(resolve,3000))]);
      const logo=doc.querySelector('.m44-brand img');
      if(logo&&!logo.complete)await Promise.race([new Promise(resolve=>{logo.addEventListener('load',resolve,{once:true});logo.addEventListener('error',resolve,{once:true});}),new Promise(resolve=>scope.setTimeout(resolve,3000))]);
      if(!await verifyA4Layout(doc,popup,scope)){status.textContent='El contenido no cabe con seguridad en A4. Ajusta las notas antes de imprimir.';print.disabled=true;return;}
      ready=true;print.disabled=false;status.textContent=publicationStatus==='published'?'Copia de consulta del informe publicado · A4 verificado':'Vista previa privada · diseño A4 verificado';
    };
    stylesheet.addEventListener('load',()=>{void finish().catch(()=>{status.textContent='No se pudo validar el diseño.';});},{once:true});
    stylesheet.addEventListener('error',()=>{status.textContent='No se pudo cargar el diseño. No se puede imprimir.';},{once:true});
    if(stylesheet.sheet)void finish().catch(()=>{});
    print.addEventListener('click',async()=>{
      if(!ready)return;
      print.disabled=true;
      try{
        if(!await verifyA4Layout(doc,popup,scope)){
          ready=false;status.textContent='El ajuste A4 requiere revisión.';return;
        }
        popup.print();
      }catch{
        ready=false;status.textContent='No pudimos verificar el documento para imprimir.';
      }finally{print.disabled=!ready;}
    });
    close.addEventListener('click',()=>popup.close());
    popup.focus?.();
  }catch(error){try{popup.close?.();}catch{}throw error;}
  return Object.freeze({ok:true,mode:publicationStatus==='published'?'published-client-readonly':'private-a4-preview',published:publicationStatus==='published',downloaded:false});
}
export const __m44EvolutionReportTestables=Object.freeze({dateLabel,pageOverflow,esc,clean});
