// Pure Signature Elite graph contract. Mirrored in the Edge bundle; CI checks byte parity.
// Existing approved evidence fields carry the dated readings, not live re-queries.
const DAY=86400000;
const METRICS=Object.freeze({
  'Volumen comparable':{source:'sessionExecutions',unit:'kg·rep',min:0,max:1e12},
  'Energía':{source:'checkins',unit:'/10',min:0,max:10},
  'Sueño':{source:'checkins',unit:'/10',min:0,max:10},
  'Estrés':{source:'checkins',unit:'/10',min:0,max:10},
  'Dolor':{source:'checkins',unit:'/10',min:0,max:10},
  'Fatiga':{source:'checkins',unit:'/10',min:0,max:10},
  'Motivación':{source:'checkins',unit:'/10',min:0,max:10},
});
function day(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(value))return null;
  const n=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n:null;
}
export function buildDatedTrendEvidence(label,readings,start,end){
  if(!Object.hasOwn(METRICS,label)||day(start)===null||day(end)===null||start>end)return null;
  const metric=METRICS[label],groups=new Map();
  for(const row of readings??[]){
    if(day(row?.date)===null||row.date<start||row.date>end||typeof row.value!=='number'||!Number.isFinite(row.value)||row.value<metric.min||row.value>metric.max)continue;
    const a=groups.get(row.date)||{sum:0,n:0};a.sum+=row.value;a.n++;groups.set(row.date,a);
  }
  const all=[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>({date,value:Math.round(v.sum/v.n*100)/100}));
  if(all.length<3)return null;
  // Exact daily means, selected evenly over the observed date range by rank;
  // no smoothing, interpolation or fabricated zeros. Always preserve endpoints.
  const n=Math.min(10,all.length);
  const shown=Array.from({length:n},(_,i)=>all[Math.round(i*(all.length-1)/(n-1))]);
  const text=metric.unit+' | '+shown.length+' de '+all.length+' días registrados | '+shown.map(p=>p.date+': '+p.value).join('; ');
  if(text.length>500)return null;
  return Object.freeze({label:'Tendencia: '+label,text,source:metric.source,quality:'registrada'});
}
const WELLBEING_CODES=Object.freeze({E:'Energía',S:'Sueño',T:'Estrés',D:'Dolor',F:'Fatiga',M:'Motivación'});
export const WELLBEING_BUNDLE_LABEL='Tendencias de bienestar';
function decodeWellbeingBundle(row,start,end){
 const from=day(start),to=day(end),length=(to-from)/DAY+1;
 if(from===null||to===null||length<1||length>366||row?.label!==WELLBEING_BUNDLE_LABEL||row.source!=='checkins'||typeof row.text!=='string'||row.text.length>500||!row.text.startsWith('v1|'))return [];
 const chunks=row.text.slice(3).split('|');if(chunks.length<2||chunks.length>6)return [];
 const result=[],seen=new Set();
 for(const chunk of chunks){
  const match=chunk.match(/^([ESTDFM]):([1-9][0-9]{0,2}):([0-9a-z=,.]+)$/u);if(!match||seen.has(match[1]))return [];
  seen.add(match[1]);const label=WELLBEING_CODES[match[1]],total=Number(match[2]),raw=match[3].split(',');
  if(raw.length<3||raw.length>10||total<raw.length||total>length)return [];
  let previous=-1;const points=[];
  for(const token of raw){const a=token.match(/^([0-9a-z]{1,2})=([0-9a-z]{1,2})$/u);if(!a)return [];const offset=Number.parseInt(a[1],36),hundredths=Number.parseInt(a[2],36);if(offset.toString(36)!==a[1]||hundredths.toString(36)!==a[2]||offset<=previous||offset>=length||hundredths>1000)return [];previous=offset;points.push(new Date(from+offset*DAY).toISOString().slice(0,10)+': '+hundredths/100);}
  result.push({label:'Tendencia: '+label,source:'checkins',quality:'registrada',text:'/10 | '+points.length+' de '+total+' días registrados | '+points.join('; ')});
 }
 return result;
}
export function buildWellbeingBundle(evidence,start,end){
 const from=day(start),to=day(end);if(from===null||to===null||to<from||(to-from)/DAY>=366)return null;
 const series=readDatedTrends(evidence,start,end).filter(s=>s.unit==='/10');if(series.length<2)return null;
 const codes=Object.fromEntries(Object.entries(WELLBEING_CODES).map(([a,b])=>[b,a]));
 const text='v1|'+series.map(s=>codes[s.label]+':'+s.total+':'+s.points.map(p=>((p.time-from)/DAY).toString(36)+'='+Math.round(p.value*100).toString(36)).join(',')).join('|');
 if(text.length>500)return null;
 const result=Object.freeze({label:WELLBEING_BUNDLE_LABEL,text,source:'checkins',quality:'registrada'});
 return decodeWellbeingBundle(result,start,end).length===series.length?result:null;
}
export function wellbeingBundleDescription(evidence,start,end){
 const rows=(evidence??[]).filter(r=>r?.label===WELLBEING_BUNDLE_LABEL),decoded=rows.length===1?decodeWellbeingBundle(rows[0],start,end):[];
 if(!decoded.length)return 'Registro de tendencias no interpretable; requiere revisión.';
 const series=readDatedTrends(evidence,start,end).filter(s=>s.unit==='/10');
 if(series.length!==decoded.length)return 'Registro de tendencias no interpretable; requiere revisión.';
 return series.map(s=>s.label+': '+s.points.length+' de '+s.total+' días registrados').join(' · ')+'. Variables independientes, escala de 0 a 10.';
}
export function readDatedTrends(evidence,start,end){
  const from=day(start),to=day(end);
  if(from===null||to===null||from>to)return [];
  const result=[],seen=new Set();
  const rows=Array.isArray(evidence)?evidence:[];
  const bundles=rows.filter(r=>r?.label===WELLBEING_BUNDLE_LABEL);
  const expanded=bundles.length===1?decodeWellbeingBundle(bundles[0],start,end):[];
  const candidates=[...rows.filter(r=>r?.label!==WELLBEING_BUNDLE_LABEL),...expanded];
  const counts=new Map();for(const r of candidates)counts.set(r?.label,(counts.get(r?.label)||0)+1);
  for(const row of candidates){
    if(counts.get(row?.label)!==1)continue;
    if(typeof row?.label!=='string'||!row.label.startsWith('Tendencia: '))continue;
    const label=row.label.slice(11);
    if(!Object.hasOwn(METRICS,label)||seen.has(label))continue;
    const m=METRICS[label];if(row.source!==m.source||typeof row.text!=='string'||row.text.length>500)continue;
    const parts=row.text.split(' | ');
    if(parts.length!==3||parts[0]!==m.unit)continue;
    const count=parts[1].match(/^(\d+) de (\d+) días registrados$/u);
    if(!count)continue;
    const n=Number(count[1]),total=Number(count[2]),raw=parts[2].split('; ');
    if(n<3||n>10||n!==raw.length||!Number.isSafeInteger(total)||total<n||total>(to-from)/DAY+1)continue;
    const points=raw.map(s=>{const a=s.match(/^(\d{4}-\d{2}-\d{2}): (\d+(?:\.\d{1,2})?)$/u);return a?{date:a[1],time:day(a[1]),value:Number(a[2])}:null;});
    if(points.some((p,i)=>!p||p.time===null||p.time<from||p.time>to||p.value<m.min||p.value>m.max||(i&&points[i-1].time>=p.time)))continue;
    seen.add(label);result.push({label,unit:m.unit,points,total,from,to});
  }
  return result;
}
export function trendGeometry(series,{width=400,height=100}={}){
  const {points,from,to}=series,values=points.map(p=>p.value);
  const min=0,max=series.unit==='/10'?10:Math.max(1,Math.ceil(Math.max(...values)/100)*100);
  const span=Math.max(DAY,to-from),gapDays=Math.max(3,Math.min(45,Math.ceil(span/DAY/8)));
  const coords=points.map(p=>({...p,x:(p.time-from)/span*width,y:height-(p.value-min)/(max-min)*height}));
  const segments=[];for(let i=1;i<coords.length;i++)if((coords[i].time-coords[i-1].time)/DAY<=gapDays)segments.push([coords[i-1],coords[i]]);
  return {coords,segments,min,max,gapDays};
}

// Compact, reversible encoding of exact observed civil days inside existing
// approved evidence. No identifiers, inferred sessions or live data lookups.
export function buildTrainingCalendarEvidence(dates,start,end){
 const from=day(start),to=day(end),length=(to-from)/DAY+1;
 if(from===null||to===null||!Number.isSafeInteger(length)||length<1||length>366)return null;
 const observed=new Set((dates??[]).filter(d=>day(d)!==null&&d>=start&&d<=end));
 if(!observed.size)return null;
 const bits=Array.from({length},(_,i)=>observed.has(new Date(from+i*DAY).toISOString().slice(0,10))?'1':'0').join('');
 const hex=Array.from({length:Math.ceil(length/4)},(_,i)=>Number.parseInt(bits.slice(i*4,i*4+4).padEnd(4,'0'),2).toString(16)).join('');
 return Object.freeze({label:'Calendario de entrenamiento',text:'Días con entrenamiento confirmado: '+observed.size+' de '+length+'. Registro diario v1: '+hex,source:'sessionExecutions',quality:'confirmada'});
}
export function readTrainingCalendar(evidence,start,end,activitySeries=[]){
 const from=day(start),to=day(end),length=(to-from)/DAY+1;
 if(from===null||to===null||!Number.isSafeInteger(length)||length<1||length>366)return null;
 const candidates=(evidence??[]).filter(r=>r?.label==='Calendario de entrenamiento'&&r.source==='sessionExecutions');
 if(candidates.length!==1)return null;
 const a=String(candidates[0].text??'').match(/^Días con entrenamiento confirmado: (\d+) de (\d+)\. Registro diario v1: ([0-9a-f]+)$/u);
 if(!a||Number(a[2])!==length||a[3].length!==Math.ceil(length/4))return null;
 const full=[...a[3]].map(c=>Number.parseInt(c,16).toString(2).padStart(4,'0')).join('');
 if(/1/u.test(full.slice(length)))return null;
 const bits=full.slice(0,length),count=[...bits].filter(c=>c==='1').length;
 if(count!==Number(a[1])||!count)return null;
 const declared=(evidence??[]).find(r=>r?.label==='Días con entrenamiento confirmado'&&r.source==='sessionExecutions');
 if(declared&&String(declared.text)!==String(count))return null;
 const offset=(new Date(from).getUTCDay()+6)%7,months=new Map(),weeks=new Set();
 const cells=[...bits].map((b,i)=>{
  const date=new Date(from+i*DAY).toISOString().slice(0,10),week=Math.floor((offset+i)/7),weekday=(offset+i)%7,active=b==='1',month=date.slice(0,7);
  let m=months.get(month);if(!m){m={month,week,days:0,active:0};months.set(month,m);}m.days++;if(active){m.active++;weeks.add(week);}
  return {date,week,weekday,active};
 });
 if(activitySeries.length){
  // Each active day needs at least one confirmed session in its own bucket.
  if(cells.some(c=>c.active&&!activitySeries.some(r=>r.from<=c.date&&r.to>=c.date)))return null;
  if(activitySeries.some(r=>cells.filter(c=>c.active&&c.date>=r.from&&c.date<=r.to).length>r.count))return null;
  if(activitySeries.some(r=>r.count>0&&!cells.some(c=>c.active&&c.date>=r.from&&c.date<=r.to)))return null;
 }
 let longest=0,run=0,prev=-2;
 for(const w of [...weeks].sort((a,b)=>a-b)){run=w===prev+1?run+1:1;longest=Math.max(longest,run);prev=w;}
 return {cells,count,length,columns:Math.ceil((offset+length)/7),months:[...months.values()],weeks:weeks.size,longest};
}
export function calendarDescription(calendar){
 return calendar.count+' días con entrenamiento confirmado de '+calendar.length+' días del periodo; '+calendar.weeks+' semanas naturales con registros, '+calendar.longest+' consecutivas (semanas de lunes a domingo, extremos posiblemente parciales).';
}
