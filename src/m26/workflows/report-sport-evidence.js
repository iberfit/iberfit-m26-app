// Life & Performance 360: conservative, owner-scoped workout evidence.
// Only canonical confirmed session executions may call this projector.
const clean=(x,max=100)=>String(x??'').trim().replace(/\s+/g,' ').slice(0,max);
const finite=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max?x:null;
const val=(r,...keys)=>{for(const key of keys){const x=r?.[key];if(x!==undefined&&x!==null&&x!=='')return x;}return null;};
const bodyOf=(r)=>r?.body&&typeof r.body==='object'&&!Array.isArray(r.body)?{...r,...r.body}:r||{};
function item(label,value){
  return Object.freeze({label,text:clean(value,160),source:'sessionExecutions',quality:'registrada'});
}
function durationText(seconds){
  const s=Math.round(seconds);
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return (h?h+' h ':'')+m+' min'+(sec?' '+sec+' s':'');
}
function paceText(totalSeconds,units){
  const seconds=Math.round(totalSeconds/units);
  if(!Number.isFinite(seconds)||seconds<=0||seconds>3600)return null;
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
function sportOf(record){
  const normalized=clean(val(record,'sport','sportType','sessionType','modality','tipo'),60).toLowerCase();
  if(/running|correr|carrera|trote/.test(normalized))return 'running';
  if(/nataci[oó]n|swim|piscina/.test(normalized))return 'swimming';
  if(/fuerza|strength|resistance/.test(normalized))return 'strength';
  if(/mixt|mixed|multisport|multideporte/.test(normalized))return 'mixed';
  return 'unknown';
}
function exerciseRows(record){
  const raw=record?.results;
  const rows=Array.isArray(raw)?raw:raw&&typeof raw==='object'?Object.values(raw):[];
  const records=[];
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row))continue;
    const id=clean(val(row,'exerciseId','exercise_id','exerciseName','name'),100);
    if(!id)continue;
    const reps=finite(val(row,'reps','repetitions'),0,500);
    const kg=finite(val(row,'loadKg','weightKg'),0,1500);
    const rpe=finite(row.rpe,0,10);
    if(reps===null&&kg===null&&rpe===null)continue;
    const name=clean(val(row,'exerciseName','name')||'Ejercicio registrado',65);
    const basis=clean(val(row,'loadBasis','loadUnit'),40).toLowerCase();
    const weightBasis=['per_dumbbell','per-dumbbell','por_mancuerna'].includes(basis)
      ?'por mancuerna'
      :'base por implemento no especificada';
    const parts=[];
    if(reps!==null)parts.push(reps+' rep');
    if(kg!==null)parts.push(kg+' kg ('+weightBasis+')');
    if(rpe!==null)parts.push('RPE '+rpe+'/10');
    records.push(item(name,parts.join(' · ')));
    if(records.length>=4)break; // bounded PDF evidence, no automatic aggregation
  }
  return records;
}
/** Returns only recorded measurements of this verified owner, never prescribed targets. */
export function buildPostSessionSportEvidence(record,{clientId}={}){
  const id=clean(clientId,160);
  const source=bodyOf(record);
  const owner=clean(val(source,'clientId','client_id','clienteId','cliente_id'),160);
  if(!id||owner!==id)return Object.freeze([]);
  const sport=sportOf(source);
  const metrics=source?.metrics&&typeof source.metrics==='object'&&!Array.isArray(source.metrics)
    ?source.metrics:{};
  const output=[];
  const km=finite(val(source,'distanceKm','actualDistanceKm')??val(metrics,'distanceKm'),0,1000);
  const meters=finite(val(source,'distanceMeters','distanceM','actualDistanceMeters')??val(metrics,'distanceMeters','distanceM'),0,100000);
  const seconds=finite(val(source,'durationSeconds','elapsedSeconds','actualDurationSeconds')??val(metrics,'durationSeconds','elapsedSeconds'),0,86400);
  if(sport==='running'){
    const distance=km!==null?km:meters!==null?meters/1000:null;
    if(distance!==null&&distance>0)output.push(item('Distancia realizada',Number(distance.toFixed(3))+' km'));
    if(seconds!==null&&seconds>0)output.push(item('Duración registrada',durationText(seconds)));
    if(distance!==null&&distance>0&&seconds!==null&&seconds>0){
      const pace=paceText(seconds,distance);
      if(pace)output.push(item('Ritmo global registrado',pace+' min/km'));
    }
  }else if(sport==='swimming'){
    const distance=meters!==null?meters:km!==null?km*1000:null;
    if(distance!==null&&distance>0)output.push(item('Distancia acuática realizada',Number(distance.toFixed(1))+' m'));
    if(seconds!==null&&seconds>0)output.push(item('Duración total registrada',durationText(seconds)));
    if(distance!==null&&distance>0&&seconds!==null&&seconds>0){
      const pace=paceText(seconds,distance/100);
      if(pace)output.push(item('Tiempo global por 100 m',pace+' min/100 m (puede incluir pausas)'));
    }
  }
  // A mixed session cannot inherit pace or distance without a specific sport leg.
  // A load is never automatically multiplied by dumbbells or summed with bodyweight.
  if(sport==='strength'||sport==='mixed'||sport==='unknown')output.push(...exerciseRows(source));
  return Object.freeze(output.slice(0,8));
}
