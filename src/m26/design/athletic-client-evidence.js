// U52 — only confirmed owner-scoped training and check-in data. No IRI synthesis.
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const score=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=10;
const whole=v=>Number.isSafeInteger(v)&&v>=0?v:null;
function dial(name,value){
 if(!score(value))return '';
 const circumference=Number((2*Math.PI*31).toFixed(2));
 const actual=Number((circumference*value/10).toFixed(2));
 return `<li class="m26-athletic-dial"><svg viewBox="0 0 80 80" role="img" aria-label="${esc(name)}: ${esc(value)} de 10" focusable="false"><circle class="m26-athletic-track" cx="40" cy="40" r="31"/><circle class="m26-athletic-value" cx="40" cy="40" r="31" stroke-dasharray="${actual} ${circumference}" transform="rotate(-90 40 40)"/><text x="40" y="46" text-anchor="middle">${esc(value)}</text></svg><strong>${esc(name)}</strong></li>`;
}
function dateLabel(value){
 if(!value)return '';
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return '';
 try{return new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Santiago'}).format(date);}catch{return '';}
}
// Every SVG point is a confirmed, strictly comparable completed execution.
// The x axis is actual time, the y axis starts at zero. No smoothed curves,
// invented data, fake targets, animated offsets or unverified interpolation.
function comparableVolumeChart(summary){
 const input=summary?.comparableVolumeSeries;
 if(!Array.isArray(input)||input.length<2||input.length>16||
    typeof summary?.volumeDelta!=='number'||!Number.isFinite(summary.volumeDelta))return '';
 const series=input.map((p)=>{
   const d=new Date(p?.date);
   const time=d.getTime();
   const volume=p?.volume;
   return {time,volume,date:Number.isFinite(time)?dateLabel(p.date):''};
 });
 if(series.some(p=>!Number.isFinite(p.time)||typeof p.volume!=='number'||
    !Number.isFinite(p.volume)||p.volume<=0)||series.some((p,i)=>i&&p.time<series[i-1].time))return '';
 const max=Math.max(...series.map(p=>p.volume));
 if(!(max>0))return '';
 const origin=series[0].time,last=series[series.length-1].time;
 const x0=38,x1=346,y0=141,y1=22;
 const points=series.map((p,i)=>({
   ...p,
   x:Number((x0+(last>origin?(p.time-origin)/(last-origin):i/(series.length-1))*(x1-x0)).toFixed(2)),
   y:Number((y0-(p.volume/max)*(y0-y1)).toFixed(2)),
 }));
 const line=points.map(p=>`${p.x},${p.y}`).join(' ');
 const area=`${x0},${y0} ${line} ${points[points.length-1].x},${y0}`;
 const dots=points.map((p,i)=>`${i===points.length-1?`<circle class="m26-athletic-chart-last-halo" cx="${p.x}" cy="${p.y}" r="8"/>`:''}<circle class="m26-athletic-chart-dot" cx="${p.x}" cy="${p.y}" r="${i===points.length-1?4.5:3}"><title>${esc(p.date)}: ${esc(p.volume)} kg × repeticiones</title></circle>`).join('');
 return `<figure class="m26-athletic-chart" data-verified-volume-chart>
   <figcaption><div><span class="m26-athletic-chart-kicker">FUERZA · REGISTROS COMPARABLES</span><strong>Volumen por sesión</strong></div><span class="m26-athletic-chart-last">Último <strong>${esc(Number(points[points.length-1].volume.toFixed(1)))}</strong> kg·rep</span><small>${series.length} ejecuciones confirmadas</small></figcaption>
   <svg viewBox="0 0 370 180" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Volumen confirmado, de ${esc(points[0].volume)} a ${esc(points[points.length-1].volume)} kg por repeticiones, con ${series.length} sesiones comparables" focusable="false">
    <line class="m26-athletic-chart-grid" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y0}"/>
    <line class="m26-athletic-chart-grid" x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}"/>
    <line class="m26-athletic-chart-grid" x1="${x0}" y1="${Number((y0-(y0-y1)*.25).toFixed(2))}" x2="${x1}" y2="${Number((y0-(y0-y1)*.25).toFixed(2))}"/>
    <line class="m26-athletic-chart-grid m26-athletic-chart-midline" x1="${x0}" y1="${Number((y0-(y0-y1)*.5).toFixed(2))}" x2="${x1}" y2="${Number((y0-(y0-y1)*.5).toFixed(2))}"/>
    <line class="m26-athletic-chart-grid" x1="${x0}" y1="${Number((y0-(y0-y1)*.75).toFixed(2))}" x2="${x1}" y2="${Number((y0-(y0-y1)*.75).toFixed(2))}"/>
    <text class="m26-athletic-chart-tick" x="33" y="${Number((y0-(y0-y1)*.5+4).toFixed(2))}" text-anchor="end">${esc(Number((max*.5).toFixed(1)))}</text>
    <text class="m26-athletic-chart-tick" x="33" y="${y1+4}" text-anchor="end">${esc(Number(max.toFixed(1)))}</text>
    <text class="m26-athletic-chart-tick" x="33" y="${y0+4}" text-anchor="end">0</text>
    <polygon class="m26-athletic-chart-area" points="${area}"/>
    <polyline class="m26-athletic-chart-line" points="${line}"/>
    ${dots}
    <text class="m26-athletic-chart-date" x="${x0}" y="169">${esc(points[0].date)}</text>
    <text class="m26-athletic-chart-date" x="${x1}" y="169" text-anchor="end">${esc(points[points.length-1].date)}</text>
   </svg>
   <small class="m26-athletic-chart-source">Carga registrada × repeticiones · kg·rep · escala desde cero. Solo ejercicios y variantes comparables.</small>
  </figure>`;
}

export function renderAthleticClientEvidence(summary){
 if(!summary||typeof summary!=='object')return '';
 const sessions=whole(summary.completedSessions),planned=whole(summary.plannedSessions),checkins=whole(summary.checkins);
 const adherence=typeof summary.adherence==='number'&&summary.adherence>=0&&summary.adherence<=1&&Number.isFinite(summary.adherence)?Math.round(summary.adherence*100):null;
 const delta=typeof summary.volumeDelta==='number'&&Number.isFinite(summary.volumeDelta)?summary.volumeDelta:null;
 const latest=summary.latestCheckin&&typeof summary.latestCheckin==='object'?summary.latestCheckin:null;
 const dials=latest?[dial('Energía',latest.energy),dial('Sueño',latest.sleep),dial('Estrés',latest.stress),dial('Motivación',latest.motivation)].filter(Boolean):[];
 const trained=sessions!==null&&sessions>0,registered=checkins!==null&&checkins>0&&dials.length>0;
 if(!trained&&!registered)return '';
 const facts=[];
 if(trained)facts.push(`<div class="m26-athletic-fact"><strong>${esc(sessions)}</strong><span>Sesiones completadas</span></div>`);
 if(trained&&adherence!==null&&planned!==null&&planned>0)facts.push(`<div class="m26-athletic-fact"><strong>${esc(adherence)}%</strong><span>Adherencia confirmada</span><meter min="0" max="100" value="${esc(adherence)}" aria-label="Adherencia confirmada: ${esc(adherence)} por ciento"></meter></div>`);
 if(trained&&delta!==null)facts.push(`<div class="m26-athletic-fact" data-trend="${delta>0?'up':delta<0?'down':'stable'}"><strong>${delta>0?'+':''}${esc(Number(delta.toFixed(1)))}%</strong><span>Volumen comparable</span></div>`);
 if(registered)facts.push(`<div class="m26-athletic-fact"><strong>${esc(checkins)}</strong><span>Registros de bienestar</span></div>`);
 const when=dateLabel(summary.latestCheckinAt);
 return `<section class="m26-athletic-evidence" aria-label="Tu progreso confirmado" data-client-confirmed-evidence>
 <header class="m26-athletic-evidence-head"><div><p class="m26-eyebrow">Evolución real</p><h2>Tu progreso</h2><small>Registros confirmados · últimos 28 días</small></div><button type="button" data-m26-area="progreso">Ver mi progreso <span aria-hidden="true">↗</span></button></header>
 <div class="m26-athletic-facts">${facts.join('')}</div>
 ${comparableVolumeChart(summary)}
 ${registered?`<div class="m26-athletic-wellbeing"><div class="m26-athletic-wellbeing-head"><strong>Bienestar registrado</strong><small>Último registro${when?' · '+esc(when):''}</small></div><ul class="m26-athletic-dials">${dials.join('')}</ul></div>`:''}
 </section>`;
}
