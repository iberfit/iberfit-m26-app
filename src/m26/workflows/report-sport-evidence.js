// Life & Performance 360: conservative, owner-scoped workout evidence.
import {exerciseMeasurementProfile,EXERCISE_METRIC_FIELDS} from '../exercises/measurement-profiles.js';
import {reportCivilDate} from '../domain/civil-date.js';
import {observedSet,observedLoadKg,evidenceNumber,observedLoadBasisLabel} from '../domain/evidence-signal.js';
import {sessionExecutionId,sessionExecutionClientId,sessionExecutionIsCompleted,sessionExecutionIsConfirmed,sessionExecutionCompletionDate,readOriginalExecutionPrescription} from '../domain/session-execution-truth.js';
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
const DISTANCE_SPORTS=new Set(['running','swimming','cycling','walking','rowing','ski','elliptical']);
export const SPORT_REPORT_LABELS=Object.freeze({running:'Carrera',swimming:'Natación',cycling:'Ciclismo',walking:'Caminata',rowing:'Remo',ski:'Ergómetro de esquí',elliptical:'Elíptica'});
function sportOf(record){
  const normalized=clean(val(record,'sport','sportType','sessionType','modality','tipo'),60).toLowerCase();
  if(/running|correr|carrera|trote/.test(normalized))return 'running';
  if(/nataci[oó]n|swim|piscina/.test(normalized))return 'swimming';
  if(/ciclis|biciclet|cycling|rodillo|spinning/.test(normalized))return 'cycling';
  if(/caminata|walking|senderismo/.test(normalized))return 'walking';
  if(/remo indoor|remo erg[oó]metro|rowing/.test(normalized))return 'rowing';
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
    const rir=finite(row.rir,0,10);
    if(reps===null&&kg===null&&rpe===null&&rir===null)continue;
    const name=clean(val(row,'exerciseName','name')||'Ejercicio registrado',65);
    const weightBasis=observedLoadBasisLabel(row);
    const parts=[];
    if(reps!==null)parts.push(reps+' rep');
    if(kg!==null)parts.push(kg+' kg ('+weightBasis+')');
    if(rpe!==null)parts.push('RPE '+rpe+'/10');
    if(rir!==null)parts.push('RIR '+rir);
    records.push(item(name,parts.join(' · ')));
    if(records.length>=4)break; // bounded PDF evidence, no automatic aggregation
  }
  return records;
}
// Real M26 executions store observed measurements inside results per set.
// The original prescription classifies exercises; measurements come only from results.
function classifiedResultRows(source,{limit=16,strict=false,snapshot=null}={}){
  if(!snapshot)return [];
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
    const originalQueue=Array.isArray(snapshot.queue)?snapshot.queue:[];
    const queue=originalQueue.find(x=>String(x?.exerciseId||'')===exerciseId&&String(x?.blockId||'')===String(block.id||''))||null;
    const profile=exerciseMeasurementProfile({
      id:exerciseId,
      name_es:raw.name||raw.name_es||raw.exerciseName||block.name||'',
      measurementProfile:raw.measurementProfile||queue?.prescription?.measurementProfile,
    });
    rows.push({row,exerciseId,profile,block,prescription:raw,
      name:clean(raw.name||raw.exerciseName||block.name||'Ejercicio',65)});
    if(rows.length>=limit)break;
  }
  return rows;
}
function measuredLoad(row){return observedLoadKg(row,{max:1500});}

function verifiedSetEvidence(source,snapshot){
  const rows=classifiedResultRows(source,{strict:true,limit:Infinity,snapshot});
  const coordinates=new Map();
  for(const {row,exerciseId} of rows){const number=row.setNumber??row.set_number;if(!Number.isSafeInteger(number)||number<1)continue;const key=JSON.stringify([exerciseId,number]);coordinates.set(key,(coordinates.get(key)||0)+1);}
  const result=[];
  for(const {row,exerciseId,profile,name} of rows){
    const number=row.setNumber??row.set_number;
    if(Number.isSafeInteger(number)&&number>0&&coordinates.get(JSON.stringify([exerciseId,number]))!==1)continue;
    if(row.exerciseId!=null&&row.exercise_id!=null&&String(row.exerciseId)!==String(row.exercise_id))continue;
    if(row.setNumber!=null&&row.set_number!=null&&row.setNumber!==row.set_number)continue;
    const set=Number.isSafeInteger(row.setNumber)&&row.setNumber>0
      ?' · Serie '+row.setNumber:'';
    const label=rows.length>1?name+set+' · ':'';
    const duration=finite(row.seconds,0,86400);
    if(profile.sport==='running'){
      const metres=validatedDistance(row.distanceKm,row.distanceM);
      const km=metres===null?null:metres/1000;
      if(km!==null&&km>0)
        result.push(item(label+'Distancia realizada',km+' km'));
      if(duration!==null&&duration>0)
        result.push(item(label+'Duración registrada',durationText(duration)));
      if(km!==null&&km>0&&duration!==null&&duration>0){
        const pace=paceText(duration,km);
        if(pace)result.push(item(label+'Ritmo observado',pace+' min/km'));
      }
    }else if(profile.sport==='swimming'){
      const metres=validatedDistance(row.distanceKm,row.distanceM);
      if(metres!==null&&metres>0)
        result.push(item(label+'Distancia acuática realizada',metres+' m'));
      if(duration!==null&&duration>0)
        result.push(item(label+'Duración registrada',durationText(duration)));
      if(metres!==null&&metres>0&&duration!==null&&duration>0){
        const pace=paceText(duration,metres/100);
        if(pace)result.push(item(label+'Tiempo observado por 100 m',
          pace+' min/100 m (puede incluir pausas)'));
      }
    }else if(profile.cardio&&DISTANCE_SPORTS.has(profile.sport)){
      const metres=pairedDistance(finite(row.distanceKm,0,1000),finite(row.distanceM,0,100000));
      const validDistance=(row.distanceKm==null||finite(row.distanceKm,0,1000)!==null)&&(row.distanceM==null||finite(row.distanceM,0,100000)!==null);
      if(validDistance&&metres!==null&&metres>0)result.push(item(label+'Distancia realizada',Number((metres/1000).toFixed(3))+' km'));
      if(duration!==null&&duration>0)result.push(item(label+'Duración registrada',durationText(duration)));
      if(validDistance&&metres>0&&duration>0)result.push(item(label+'Velocidad global registrada',Number((metres*3.6/duration).toFixed(2))+' km/h (puede incluir pausas)'));
      for(const [key,title,unit,min,max] of [['avgHeartRateBpm','Frecuencia cardíaca media','lpm',1,300],['powerWatts','Potencia registrada','W',0,2500],['cadenceRpm','Cadencia registrada','rpm',0,250]]){
        const v=finite(row[key],min,max);if(v!==null)result.push(item(label+title,v+' '+unit));
      }
    }else if(!profile.cardio&&profile.kind!=='carry'){
      const reps=finite(row.reps,0,500);
      const kg=measuredLoad(row);
      const rpe=finite(row.rpe,1,10);
      const rir=finite(row.rir,0,10);
      const pieces=[];
      if(reps!==null)pieces.push(reps+' rep');
      if(kg!==null)pieces.push(kg+' kg ('+observedLoadBasisLabel(row)+')');
      if(rpe!==null)pieces.push('RPE '+rpe+'/10');
      if(rir!==null)pieces.push('RIR '+rir);
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
  const owners=[record,record?.body].flatMap(r=>['clientId','client_id','clienteId','cliente_id'].map(k=>r?.[k])).filter(v=>v!=null&&v!=='');
  if(!id||owner!==id||owners.some(v=>typeof v!=='string'||v.trim()!==id))return Object.freeze([]);
  const original=readOriginalExecutionPrescription(record);
  if(original.kind==='invalid')return Object.freeze([]);
  const canonicalSetRows=verifiedSetEvidence(source,original.snapshot);
  if(canonicalSetRows.length)return canonicalSetRows;
  const raw=source.results??source.setResults??source.set_results;
  const hasRows=Array.isArray(raw)?raw.length>0:raw&&typeof raw==='object'&&Object.keys(raw).length>0;
  if(hasRows&&original.kind!=='absent')return Object.freeze([]);
  // Legacy completed summaries with explicitly recorded top-level measurements.
  // Never substitute planned targets if the observed set is absent.
  const sport=sportOf(source);
  const metrics=source?.metrics&&typeof source.metrics==='object'&&!Array.isArray(source.metrics)
    ?source.metrics:{};
  const output=[];
  const km=val(source,'distanceKm','actualDistanceKm')??val(metrics,'distanceKm');
  const meters=val(source,'distanceMeters','distanceM','actualDistanceMeters')??val(metrics,'distanceMeters','distanceM');
  const measuredDistance=validatedDistance(km,meters);
  const seconds=finite(val(source,'durationSeconds','elapsedSeconds','actualDurationSeconds')??val(metrics,'durationSeconds','elapsedSeconds'),0,86400);
  if(sport==='running'){
    const distance=measuredDistance===null?null:measuredDistance/1000;
    if(distance!==null&&distance>0)output.push(item('Distancia realizada',Number(distance.toFixed(3))+' km'));
    if(seconds!==null&&seconds>0)output.push(item('Duración registrada',durationText(seconds)));
    if(distance!==null&&distance>0&&seconds!==null&&seconds>0){
      const pace=paceText(seconds,distance);
      if(pace)output.push(item('Ritmo global registrado',pace+' min/km'));
    }
  }else if(sport==='swimming'){
    const distance=measuredDistance;
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
function validatedDistance(rawKm,rawM){
 const km=finite(rawKm,0,1000),m=finite(rawM,0,100000);
 if((rawKm!=null&&km===null)||(rawM!=null&&m===null))return null;
 return pairedDistance(km,m);
}
function pairedDistance(km,m){
 if(km!==null&&m!==null&&Math.abs(km*1000-m)>.01)return null;
 return m??(km===null?null:km*1000);
}
// Compare recorded duration only at identical measured distance, exercise,
// set position and explicit original prescription. This is contextual work
// evidence, not proof of equal actual terrain, stroke, pauses or physiology.
function enduranceProtocol({row,profile,block,prescription:p},distance){
 if(!DISTANCE_SPORTS.has(profile.sport)||!['endurance','intervals'].includes(profile.kind)||!p||!block)return null;
 const number=(v,min,max,integer=false)=>evidenceNumber(v,{min,max,integer});
 const sets=number(block.type==='exercise'?block.sets:block.rounds,1,100,true),rest=number(p.restSeconds,0,3600);
 if(sets===null||rest===null||row.setNumber>sets)return null;
 const targets=[];
 for(const [key,descriptor] of Object.entries(EXERCISE_METRIC_FIELDS)){
  const raw=p[key];
  if(raw===undefined||raw===null||raw===''){targets.push(null);continue;}
  if(descriptor.maxLength){if(typeof raw!=='string'||!raw.trim()||raw.trim().length>descriptor.maxLength)return null;targets.push(raw.trim());continue;}
  const v=number(raw,0,descriptor.max,key==='intervalRepetitions');if(v===null)return null;targets.push(v);
 }
 const target=key=>targets[Object.keys(EXERCISE_METRIC_FIELDS).indexOf(key)];
 if(profile.sport==='swimming'&&!(target('poolLengthM')>=15&&target('poolLengthM')<=100))return null;
 if(profile.kind==='intervals'){
  const count=target('intervalRepetitions');
  if(!Number.isSafeInteger(count)||count<1||!(target('intervalWorkSeconds')>0)||target('intervalRecoverySeconds')===null||row.intervalsCompleted!==count)return null;
 }else if(!(target('plannedDistanceKm')>0||target('plannedDistanceM')>0||target('plannedDurationMinutes')>0))return null;
 const effort=p.targetRpe==null||p.targetRpe===''?null:number(p.targetRpe,1,10);
 if(p.targetRpe!=null&&p.targetRpe!==''&&effort===null)return null;
 return {key:JSON.stringify([profile.sport,profile.kind,block.type,sets,rest,effort,row.setNumber,distance,targets]),kind:profile.kind,sets,rest,intervals:profile.kind==='intervals'?target('intervalRepetitions'):null,pool:profile.sport==='swimming'?target('poolLengthM'):null};
}
function sportComparisons(groups){
 const comparisons=[];
 for(const g of groups.values()){
  const days=[...g.days].sort(([a],[b])=>a.localeCompare(b)).map(([date,v])=>({date,seconds:Math.round(v.seconds/v.count*100)/100,count:v.count}));
  if(days.length<3)continue;
  const points=days.length<=10?days:Array.from({length:10},(_,i)=>days[Math.round(i*(days.length-1)/9)]);
  comparisons.push({...g.context,days:days.length,observations:days.reduce((n,d)=>n+d.count,0),first:days[0],last:days.at(-1),points});
 }
 return comparisons.sort((a,b)=>b.days-a.days||a.sport.localeCompare(b.sport)||a.exercise.localeCompare(b.exercise)||a.metres-b.metres||a.setNumber-b.setNumber||a.protocolKey.localeCompare(b.protocolKey));
}
export function buildPeriodSportProjection(executions,{clientId}={}){
 const owner=String(clientId||'').trim();if(!owner)return {summary:[],comparisons:[],measurements:[]};
 const groups=new Map(),comparisonGroups=new Map(),measured=new Map(),seen=new Set();
 const add=(sport,id,distance,seconds)=>{
  if(!DISTANCE_SPORTS.has(sport)||distance===null||distance<=0)return;
  let g=groups.get(sport);if(!g){g={sport,sessions:new Set(),rows:0,metres:0,pairedRows:0,pairedMetres:0,pairedSeconds:0};groups.set(sport,g);}
  g.sessions.add(id);g.rows++;g.metres+=distance;
  if(seconds!==null&&seconds>0){g.pairedRows++;g.pairedMetres+=distance;g.pairedSeconds+=seconds;}
 };
 for(const record of executions??[]){
  const id=sessionExecutionId(record),source=bodyOf(record);
  if(!id||seen.has(id)||sessionExecutionClientId(record)!==owner||sessionExecutionClientId(source)!==owner||!sessionExecutionIsCompleted(record,{allowDatedFallback:false})||!sessionExecutionIsConfirmed(record))continue;
  seen.add(id);
  const historical=readOriginalExecutionPrescription(record);
  if(historical.kind==='invalid')continue;
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
   for(const entry of classifiedResultRows({...source,results:raw},{limit:Infinity,strict:true,snapshot:historical.snapshot})){
    const {row,profile,exerciseId,name}=entry;
    const number=row.setNumber??row.set_number;
    const key=JSON.stringify([String(row.exerciseId??row.exercise_id??''),number]);
    if(!Number.isSafeInteger(number)||number<1||coordinates.get(key)!==1)continue;
    const km=finite(row.distanceKm,0,1000),m=finite(row.distanceM,0,100000);
    if((row.distanceKm!=null&&km===null)||(row.distanceM!=null&&m===null))continue;
    const distance=pairedDistance(km,m),seconds=finite(row.seconds,0,86400);
    add(profile.sport,id,distance,seconds);
    if(DISTANCE_SPORTS.has(profile.sport)){
      for(const [field,label,unit,min,max] of [['avgHeartRateBpm','Frecuencia cardíaca media','lpm',1,300],['powerWatts','Potencia','W',0,2500],['cadenceRpm','Cadencia','rpm',0,250],['elevationGainM','Desnivel positivo','m',0,15000]]){
        const v=finite(row[field],min,max);if(v===null)continue;
        const metricKey=profile.sport+':'+field;let g=measured.get(metricKey);if(!g){g={sport:profile.sport,label,unit,field,count:0,min:v,max:v};measured.set(metricKey,g);}g.count++;g.min=Math.min(g.min,v);g.max=Math.max(g.max,v);
      }
    }
    const completion=sessionExecutionCompletionDate(record);
    const date=completion?reportCivilDate(completion):null;
    if(!date||!source.sessionId||distance===null||distance<=0||seconds===null||seconds<=0||row.setNumber!==number)continue;
    const protocol=enduranceProtocol(entry,distance);
    if(!protocol)continue;
    const comparisonKey=JSON.stringify([exerciseId,protocol.key]);
    let g=comparisonGroups.get(comparisonKey);
    if(!g){g={context:{sport:profile.sport,exercise:name,metres:distance,setNumber:number,kind:protocol.kind,sets:protocol.sets,rest:protocol.rest,intervals:protocol.intervals,pool:protocol.pool,protocolKey:protocol.key},days:new Map()};comparisonGroups.set(comparisonKey,g);}
    const d=g.days.get(date)||{seconds:0,count:0};d.seconds+=seconds;d.count++;g.days.set(date,d);
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
 const summary=[...groups.values()].sort((a,b)=>a.sport.localeCompare(b.sport)).map(g=>Object.freeze({sport:g.sport,sessions:g.sessions.size,rows:g.rows,metres:g.metres,pairedRows:g.pairedRows,pairedMetres:g.pairedMetres,pairedSeconds:g.pairedSeconds}));
 return {summary,comparisons:sportComparisons(comparisonGroups),measurements:[...measured.values()].sort((a,b)=>a.sport.localeCompare(b.sport)||a.field.localeCompare(b.field))};
}
export function summarizePeriodSportEvidence(executions,options){return buildPeriodSportProjection(executions,options).summary;}
export function periodSportEvidence(executions,options){
 const {summary,comparisons,measurements}=buildPeriodSportProjection(executions,options);
 return summary.map(g=>{
  const aquatic=g.sport==='swimming',speed=g.sport==='cycling'||g.sport==='rowing'||g.sport==='ski'||g.sport==='elliptical',dist=m=>Number((aquatic?m:m/1000).toFixed(aquatic?1:3))+(aquatic?' m':' km');
  const pace=speed?null:paceText(g.pairedSeconds,g.pairedMetres/(aquatic?100:1000));
  let text=dist(g.metres)+' en '+g.sessions+' sesiones con distancia medida; '+g.rows+' registros de distancia.'+(g.pairedRows?' Tiempo registrado: '+durationText(g.pairedSeconds)+' sobre '+dist(g.pairedMetres)+' ('+g.pairedRows+'/'+g.rows+' registros con distancia y tiempo).':'')+(pace?' Ritmo global de esos registros: '+pace+(aquatic?' min/100 m':' min/km')+'. Puede incluir pausas; no compara rendimiento.':'')+(speed&&g.pairedSeconds>0?' Velocidad global: '+Number((g.pairedMetres*3.6/g.pairedSeconds).toFixed(2))+' km/h; puede incluir pausas.':'');
  const c=comparisons.find(x=>x.sport===g.sport);
  if(c){const extra=' Misma distancia ('+dist(c.metres)+') y prescripción de '+c.exercise+': '+durationText(c.first.seconds)+' ('+c.first.date+') a '+durationText(c.last.seconds)+' ('+c.last.date+'); '+c.days+' días medidos. No verifica condiciones reales.';if(text.length+extra.length<=500)text+=extra;}
  for(const metric of measurements.filter(m=>m.sport===g.sport)){const extra=' '+metric.label+': '+metric.min+(metric.min!==metric.max?'–'+metric.max:'')+' '+metric.unit+' ('+metric.count+' registros).';if(text.length+extra.length<=500)text+=extra;}
  return Object.freeze({label:SPORT_REPORT_LABELS[g.sport]+' · distancia registrada',text,source:'sessionExecutions',quality:'registrada'});
 });
}
