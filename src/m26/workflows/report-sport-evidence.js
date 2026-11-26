// Life & Performance 360: conservative, owner-scoped workout evidence.
import {exerciseMeasurementProfile} from '../exercises/measurement-profiles.js';
import {observedSet,observedLoadKg} from '../domain/evidence-signal.js';
import {sessionExecutionId,sessionExecutionClientId,sessionExecutionIsCompleted,sessionExecutionIsConfirmed} from '../domain/session-execution-truth.js';
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
    if(!observedSet(row))continue;
    const id=clean(val(row,'exerciseId','exercise_id','exerciseName','name'),100);
    if(!id)continue;
    const reps=finite(val(row,'reps','repetitions'),0,500);
    const kg=observedLoadKg(row,{max:1500});
    const rpe=finite(row.rpe,1,10);
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
// Real M26 executions store observed measurements inside results per set.
// A planSnapshot is used ONLY to classify the exercise and cannot supply results.
function classifiedResultRows(source,{limit=16,strict=false}={}){
  const snapshot=source?.planSnapshot||source?.plan_snapshot;
  if(!snapshot||String(snapshot.sessionId||'')!==String(source?.sessionId||'')
    ||!Array.isArray(snapshot.blocks))return [];
  const results=source?.results;
  const observed=Array.isArray(results)?results:
    results&&typeof results==='object'?Object.values(results):[];
  const rows=[];
  for(const row of observed){
    if(!observedSet(row))continue;
    const exerciseId=clean(row.exerciseId||row.exercise_id,160);
    if(!exerciseId)continue;
    const matching=snapshot.blocks.filter(block=>(block?.type==='exercise'
      &&String(block.exerciseId||'')===exerciseId)
      ||(Array.isArray(block?.exerciseIds)&&block.exerciseIds.some(id=>String(id)===exerciseId)));
    if(strict&&matching.length!==1)continue;
    const block=matching[0];
    if(!block)continue; // no valid prescription/exercise identity
    const grouped=block?.prescriptions?.[exerciseId]||{};
    const raw=block.type==='exercise'?block:grouped;
    const queue=Array.isArray(source.queue)?source.queue.find(x=>
      String(x?.exerciseId||'')===exerciseId):null;
    const profile=exerciseMeasurementProfile({
      id:exerciseId,
      name_es:raw.name||raw.name_es||raw.exerciseName||block.name||'',
      measurementProfile:raw.measurementProfile||queue?.prescription?.measurementProfile,
    });
    rows.push({row,exerciseId,profile,
      name:clean(raw.name||raw.exerciseName||block.name||'Ejercicio',65)});
    if(rows.length>=limit)break;
  }
  return rows;
}
function measuredLoad(row){return observedLoadKg(row,{max:1500});}

function verifiedSetEvidence(source){
  const rows=classifiedResultRows(source);
  const result=[];
  for(const {row,exerciseId,profile,name} of rows){
    const set=Number.isSafeInteger(row.setNumber)&&row.setNumber>0
      ?' · Serie '+row.setNumber:'';
    const label=rows.length>1?name+set+' · ':'';
    const duration=finite(row.seconds,0,86400);
    if(profile.sport==='running'){
      const km=finite(row.distanceKm,0,1000);
      if(km!==null&&km>0)
        result.push(item(label+'Distancia realizada',km+' km'));
      if(duration!==null&&duration>0)
        result.push(item(label+'Duración registrada',durationText(duration)));
      if(km!==null&&km>0&&duration!==null&&duration>0){
        const pace=paceText(duration,km);
        if(pace)result.push(item(label+'Ritmo observado',pace+' min/km'));
      }
    }else if(profile.sport==='swimming'){
      const metres=finite(row.distanceM,0,100000);
      if(metres!==null&&metres>0)
        result.push(item(label+'Distancia acuática realizada',metres+' m'));
      if(duration!==null&&duration>0)
        result.push(item(label+'Duración registrada',durationText(duration)));
      if(metres!==null&&metres>0&&duration!==null&&duration>0){
        const pace=paceText(duration,metres/100);
        if(pace)result.push(item(label+'Tiempo observado por 100 m',
          pace+' min/100 m (puede incluir pausas)'));
      }
    }else if(!profile.cardio&&profile.kind!=='carry'){
      const reps=finite(row.reps,0,500);
      const kg=measuredLoad(row);
      const rpe=finite(row.rpe,1,10);
      const pieces=[];
      if(reps!==null)pieces.push(reps+' rep');
      if(kg!==null)pieces.push(kg+' kg (base por implemento no especificada)');
      if(rpe!==null)pieces.push('RPE '+rpe+'/10');
      if(pieces.length)result.push(item(name+set,pieces.join(' · ')));
    }
    if(result.length>=8)break;
  }
  return Object.freeze(result.slice(0,8));
}
/** Returns only recorded measurements of this verified owner, never prescribed targets. */
export function buildPostSessionSportEvidence(record,{clientId}={}){
  const id=clean(clientId,160);
  const source=bodyOf(record);
  const owner=clean(val(source,'clientId','client_id','clienteId','cliente_id'),160);
  if(!id||owner!==id)return Object.freeze([]);
  const canonicalSetRows=verifiedSetEvidence(source);
  if(canonicalSetRows.length)return canonicalSetRows;
  // Legacy completed summaries with explicitly recorded top-level measurements.
  // Never substitute planned targets if the observed set is absent.
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

// Period aggregates describe recorded work only. No best-pace or fitness inference
// across distances, intervals, terrain, stroke, equipment or timing protocols.
function pairedDistance(km,m){
 if(km!==null&&m!==null&&Math.abs(km*1000-m)>.01)return null;
 return m??(km===null?null:km*1000);
}
export function summarizePeriodSportEvidence(executions,{clientId}={}){
 const owner=String(clientId||'').trim();if(!owner)return [];
 const groups=new Map(),seen=new Set();
 const add=(sport,id,distance,seconds)=>{
  if(!['running','swimming'].includes(sport)||distance===null||distance<=0)return;
  let g=groups.get(sport);if(!g){g={sport,sessions:new Set(),rows:0,metres:0,pairedRows:0,pairedMetres:0,pairedSeconds:0};groups.set(sport,g);}
  g.sessions.add(id);g.rows++;g.metres+=distance;
  if(seconds!==null&&seconds>0){g.pairedRows++;g.pairedMetres+=distance;g.pairedSeconds+=seconds;}
 };
 for(const record of executions??[]){
  const id=sessionExecutionId(record),source=bodyOf(record);
  if(!id||seen.has(id)||sessionExecutionClientId(record)!==owner||sessionExecutionClientId(source)!==owner||!sessionExecutionIsCompleted(record,{allowDatedFallback:false})||!sessionExecutionIsConfirmed(record))continue;
  seen.add(id);
  const raw=source.results??source.setResults??source.set_results;
  const hasRows=Array.isArray(raw)?raw.length>0:raw&&typeof raw==='object'&&Object.keys(raw).length>0;
  if(hasRows){
   // Only unambiguous snapshot-classified, explicitly numbered sets.
   // Duplicate exercise/set coordinates are excluded rather than summed.
   const coordinates=new Map();
   for(const row of Array.isArray(raw)?raw:Object.values(raw)){
    if(!row||typeof row!=='object')continue;
    const key=JSON.stringify([String(row.exerciseId??row.exercise_id??''),row.setNumber??row.set_number]);
    coordinates.set(key,(coordinates.get(key)||0)+1);
   }
   for(const {row,profile} of classifiedResultRows({...source,results:raw},{limit:Infinity,strict:true})){
    const number=row.setNumber??row.set_number;
    const key=JSON.stringify([String(row.exerciseId??row.exercise_id??''),number]);
    if(!Number.isSafeInteger(number)||number<1||coordinates.get(key)!==1)continue;
    const km=finite(row.distanceKm,0,1000),m=finite(row.distanceM,0,100000);
    if((row.distanceKm!=null&&km===null)||(row.distanceM!=null&&m===null))continue;
    add(profile.sport,id,pairedDistance(km,m),finite(row.seconds,0,86400));
   }
   continue; // never add a whole-session summary on top of set measurements
  }
  const metrics=source.metrics&&typeof source.metrics==='object'?source.metrics:{};
  const rawKm=val(source,'distanceKm','actualDistanceKm')??val(metrics,'distanceKm');
  const rawM=val(source,'distanceMeters','distanceM','actualDistanceMeters')??val(metrics,'distanceMeters','distanceM');
  const km=finite(rawKm,0,1000),m=finite(rawM,0,100000);
  if((rawKm!==null&&km===null)||(rawM!==null&&m===null))continue;
  add(sportOf(source),id,pairedDistance(km,m),finite(val(source,'durationSeconds','elapsedSeconds','actualDurationSeconds')??val(metrics,'durationSeconds','elapsedSeconds'),0,86400));
 }
 return [...groups.values()].sort((a,b)=>a.sport.localeCompare(b.sport)).map(g=>Object.freeze({sport:g.sport,sessions:g.sessions.size,rows:g.rows,metres:g.metres,pairedRows:g.pairedRows,pairedMetres:g.pairedMetres,pairedSeconds:g.pairedSeconds}));
}
export function periodSportEvidence(executions,options){
 return summarizePeriodSportEvidence(executions,options).map(g=>{
  const running=g.sport==='running',dist=m=>Number((running?m/1000:m).toFixed(running?3:1))+(running?' km':' m');
  const pace=paceText(g.pairedSeconds,g.pairedMetres/(running?1000:100));
  return Object.freeze({label:running?'Running · distancia registrada':'Natación · distancia registrada',text:dist(g.metres)+' en '+g.sessions+' sesiones con distancia medida; '+g.rows+' registros de distancia.'+(g.pairedRows?' Tiempo registrado: '+durationText(g.pairedSeconds)+' sobre '+dist(g.pairedMetres)+' ('+g.pairedRows+'/'+g.rows+' registros con distancia y tiempo).':'')+(pace?' Ritmo global de esos registros: '+pace+(running?' min/km':' min/100 m')+'. Puede incluir pausas; no compara rendimiento.':''),source:'sessionExecutions',quality:'registrada'});
 });
}
