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
export function readDatedTrends(evidence,start,end){
  const from=day(start),to=day(end);
  if(from===null||to===null||from>to)return [];
  const result=[],seen=new Set();
  for(const row of evidence??[]){
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
  const min=series.unit==='/10'?0:0,max=series.unit==='/10'?10:Math.max(1,Math.ceil(Math.max(...values)/100)*100);
  const span=Math.max(DAY,to-from),gapDays=Math.max(3,Math.min(45,Math.ceil(span/DAY/8)));
  const coords=points.map(p=>({...p,x:(p.time-from)/span*width,y:height-(p.value-min)/(max-min)*height}));
  const segments=[];for(let i=1;i<coords.length;i++)if((coords[i].time-coords[i-1].time)/DAY<=gapDays)segments.push([coords[i-1],coords[i]]);
  return {coords,segments,min,max,gapDays};
}
