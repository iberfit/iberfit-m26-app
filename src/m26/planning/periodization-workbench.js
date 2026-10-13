import {civilDateInTimeZone,parseCivilDate,parseDateValue} from '../domain/civil-date.js';
import {confirmedSessionExecutionsForClient,sessionExecutionDate,sessionExecutionId} from '../domain/session-execution-truth.js';
import {recordsForClient} from '../modules/domain-selectors.js';
const unwrap=x=>x?.body&&typeof x.body==='object'&&!Array.isArray(x.body)?{...x,...x.body}:x||{};
const val=(x,...fields)=>fields.map(k=>x?.[k]).find(v=>v!==null&&v!==undefined&&v!=='')??null;
const finite=(x,min=0,max=1000000)=>{
  if(x===null||x===undefined||x==='')return null;
  const s=String(x).trim().replace(',','.');
  if(!/^\d+(?:\.\d+)?$/u.test(s))return null;
  const n=Number(s);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
};
const dayMs=iso=>{const d=parseCivilDate(iso);return d?Date.UTC(d.year,d.month-1,d.day):null;};
const isoOf=x=>x?civilDateInTimeZone(parseDateValue(x)):null;
const escape=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const fmt=(n,{decimals=0}={})=>n===null||!Number.isFinite(n)?'—':new Intl.NumberFormat('es-CL',{maximumFractionDigits:decimals}).format(n);
function volumeOf(execution){
  const record=unwrap(execution);
  const rows=record.results&&typeof record.results==='object'?Object.values(record.results):[];
  let known=0,valid=0;
  for(const row of rows){
    if(!row||typeof row!=='object')continue;
    const reps=finite(val(row,'reps','actualReps'),0,10000);
    // Exact kg units only: never infer kilograms from an unlabelled number or lb.
    const raw=String(val(row,'loadKg','load_kg')??'');
    const label=String(row.load??'').trim();
    const direct=finite(raw,0,10000);
    const match=label.match(/^(\d+(?:[.,]\d+)?)\s*kg$/iu);
    const kg=direct??(match?finite(match[1],0,10000):null);
    if(reps!==null&&kg!==null){known+=kg*reps;valid+=1;}
  }
  return valid?{kgReps:Math.round(known),sets:valid}:null;
}
function recordId(x){return String(val(unwrap(x),'id','entityId','entity_id')||'').trim();}
function appointmentDate(x){return val(unwrap(x),'startAt','start_at','scheduledAt','scheduled_at');}
function isConfirmedAppointment(x){const status=String(val(unwrap(x),'status','estado')||'').trim().toLowerCase();return ['confirmada','confirmed'].includes(status);}
export function buildPeriodizationSnapshot(state,clientId,{cycle,now=new Date()}={}){
  const safeId=String(clientId||'').trim(),c=unwrap(cycle);
  if(!safeId||String(val(c,'clientId','client_id')||'')!==safeId)return null;
  const start=dayMs(String(val(c,'startDate','start_date')||'').slice(0,10));
  const end=dayMs(String(val(c,'endDate','end_date')||'').slice(0,10));
  if(start===null||end===null||end<start)return null;
  const span=Math.ceil((end-start+86400000)/604800000);
  if(span<1||span>104)return null;
  const weeks=Array.from({length:span},(_,i)=>({
    index:i+1,start:new Date(start+i*604800000).toISOString().slice(0,10),
    end:new Date(Math.min(end,start+(i+1)*604800000-86400000)).toISOString().slice(0,10),
    scheduledIds:new Set(),executedIds:new Set(),rpes:[],volumes:[],knownSets:0,
  }));
  const weekOf=date=>{const ms=dayMs(date);if(ms===null||ms<start||ms>end)return null;return weeks[Math.floor((ms-start)/604800000)]??null;};
  for(const appointment of recordsForClient(state,'appointments',safeId)){
    if(!isConfirmedAppointment(appointment))continue;
    const w=weekOf(isoOf(appointmentDate(appointment)));
    const id=recordId(appointment);if(w&&id)w.scheduledIds.add(id);
  }
  for(const execution of confirmedSessionExecutionsForClient(state,safeId,{requireDate:true})){
    const item=unwrap(execution),id=sessionExecutionId(item),date=isoOf(sessionExecutionDate(item)),w=weekOf(date);
    if(!w||!id||w.executedIds.has(id))continue;
    w.executedIds.add(id);
    const rpe=finite(val(item.feedback,'sessionRpe','session_rpe'),1,10);
    if(rpe!==null)w.rpes.push(rpe);
    const volume=volumeOf(item);
    if(volume){w.volumes.push(volume.kgReps);w.knownSets+=volume.sets;}
  }
  const finalized=weeks.map(w=>Object.freeze({
    index:w.index,start:w.start,end:w.end,
    scheduled:w.scheduledIds.size,completed:w.executedIds.size,
    rpe:w.rpes.length?Math.round(w.rpes.reduce((a,b)=>a+b,0)/w.rpes.length*10)/10:null,
    strengthVolume:w.knownSets?Math.round(w.volumes.reduce((a,b)=>a+b,0)):null,
    strengthSets:w.knownSets,
  }));
  const blocks=[];
  for(let i=0;i<finalized.length;i+=4){
    const group=finalized.slice(i,i+4);
    blocks.push(Object.freeze({
      index:blocks.length+1,start:group[0].start,end:group.at(-1).end,
      weeks:Object.freeze(group),
      scheduled:group.reduce((n,w)=>n+w.scheduled,0),
      completed:group.reduce((n,w)=>n+w.completed,0),
    }));
  }
  const today=isoOf(now),week=weekOf(today)?.index??null;
  return Object.freeze({
    clientId:safeId,cycleName:String(val(c,'name','nombre')||'Ciclo de entrenamiento').slice(0,120),
    goal:String(val(c,'goal','objetivo')||'').slice(0,500),start:new Date(start).toISOString().slice(0,10),
    end:new Date(end).toISOString().slice(0,10),currentWeek:week,
    weeklyFrequency:finite(val(c,'weeklyFrequency','weekly_frequency'),1,14),
    weeks:Object.freeze(finalized),blocks:Object.freeze(blocks),
    completed:finalized.reduce((n,w)=>n+w.completed,0),
    scheduled:finalized.reduce((n,w)=>n+w.scheduled,0),
    evidence:'confirmed-only',chartMetric:'completedExecutions',
  });
}
export function renderPeriodizationBoard(snapshot,{role='coach',compact=false}={}){
  if(!snapshot)return '';
  const coach=['coach','admin'].includes(String(role||'').trim().toLowerCase());
  const max=Math.max(1,...snapshot.weeks.map(w=>w.completed));
  const bars=snapshot.weeks.map(w=>'<div class="m28-week" aria-label="Semana '+w.index+': '+w.completed+' sesiones confirmadas; '+w.scheduled+' citas confirmadas">'
    +'<meter class="m28-week-bar" min="0" max="'+max+'" value="'+w.completed+'" aria-hidden="true"></meter>'
    +'<small>'+w.index+'</small></div>').join('');
  const parts=snapshot.blocks.map(b=>'<div class="m28-block"><strong>Bloque '+b.index+'</strong>'
    +'<span>'+escape(b.start)+' — '+escape(b.end)+'</span>'
    +'<small>'+b.completed+' sesiones realizadas · '+b.scheduled+' citas confirmadas</small></div>').join('');
  const weekly=snapshot.currentWeek?snapshot.weeks[snapshot.currentWeek-1]:null;
  const selected=weekly?'<span>Semana actual '+weekly.index+' de '+snapshot.weeks.length+'</span>'
    :'<span>Fuera de las fechas del ciclo</span>';
  const totals='<div class="m28-period-stats"><span><strong>'+fmt(snapshot.completed)+'</strong> sesiones realizadas</span>'
    +'<span><strong>'+fmt(snapshot.scheduled)+'</strong> citas confirmadas</span>'
    +'<span><strong>'+snapshot.weeks.length+'</strong> semanas</span></div>';
  const actions=coach&&!compact?'<div class="m26-inline-actions"><button type="button" data-m26-area="sesion">Preparar sesión</button><button type="button" data-m26-area="agenda">Asignar en agenda</button><button type="button" data-m26-area="progreso">Ver evolución</button></div>':'';
  const overview=compact?'':'<div class="m28-block-grid">'+parts+'</div>';
  const detailed=coach&&!compact?'<details class="m28-period-week-detail"><summary>Cargas y RPE por semana · evidencias confirmadas</summary>'
    +'<div class="m28-week-rows">'+snapshot.weeks.map(w=>'<div><strong>S'+w.index+'</strong><span>'+w.completed+' sesiones</span>'
      +'<span>RPE '+(w.rpe===null?'—':fmt(w.rpe,{decimals:1}))+'</span>'
      +'<span>Fuerza '+(w.strengthVolume===null?'Sin kg verificables':fmt(w.strengthVolume)+' kg·rep')+'</span></div>').join('')+'</div></details>':'';
  return '<section class="m26-panel m28-periodization" data-m28-periodization aria-label="Periodización del ciclo">'
    +'<div class="m26-panel-heading"><div><p class="m26-eyebrow">Planificación por bloques</p><h2>'+escape(snapshot.cycleName)+'</h2>'
    +'<p>'+escape(snapshot.start)+' — '+escape(snapshot.end)+' · '+selected+'</p></div></div>'
    +totals+'<div class="m28-week-chart" role="img" aria-label="Sesiones terminadas y confirmadas por semana">'
    +bars+'</div><p class="m26-data-footnote">Cada bloque contiene hasta cuatro semanas desde el inicio del ciclo. Barras: sesiones ejecutadas y confirmadas, no carga fisiológica. Citas y ejecuciones son conteos independientes; no se equiparan sin vínculo verificado.</p>'
    +overview+detailed+actions+'</section>';
}
