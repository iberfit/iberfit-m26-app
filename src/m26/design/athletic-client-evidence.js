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
 ${registered?`<div class="m26-athletic-wellbeing"><div class="m26-athletic-wellbeing-head"><strong>Bienestar registrado</strong><small>Último registro${when?' · '+esc(when):''}</small></div><ul class="m26-athletic-dials">${dials.join('')}</ul></div>`:''}
 </section>`;
}
