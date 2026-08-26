import {summarizeWearableData} from '../wearables/normalization.js';
import {parseDateValue} from '../domain/civil-date.js';
function clone(value){return value==null?value:structuredClone(value);}
function arr(value){return Array.isArray(value)?value:[];}
function first(record,...keys){for(const key of keys){const value=record?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return null;}
function clientIdOf(record){return first(record,'clientId','client_id','clienteId','cliente_id');}
function statusOf(record){return String(first(record,'status','estado')||'').trim().toLowerCase();}
function unconfirmedCompletionIds(state){
  const ids=new Set();
  for(const key of ['pendingOperations','conflicts','rejectedOperations']){
    for(const operation of arr(state?.[key])){
      const item=unwrap(operation)||{};
      const type=String(first(item,'type','commandType','command_type')||'').trim().toUpperCase();
      if(type!=='EJECUCION_COMPLETAR')continue;
      const entityId=first(item,'entityId','entity_id','executionId','execution_id');
      if(entityId)ids.add(String(entityId));
    }
  }
  return ids;
}
function executionIsConfirmed(record,unconfirmedIds=new Set()){
  const sync=String(first(record,'syncStatus','sync_status')||'').trim().toLowerCase();
  const id=String(first(record,'id','executionId','execution_id')||'');
  return (!sync||sync==='clean')&&!unconfirmedIds.has(id);
}
function dateOf(record){return first(record,
  'completedAt','completed_at','endedAt','ended_at','recordedAt','recorded_at',
  'assessmentDate','assessment_date','evaluatedAt','evaluated_at','startAt','start_at',
  'scheduledAt','scheduled_at','savedAt','saved_at','createdAt','created_at','date','fecha');}
function safeDate(value){return parseDateValue(value);}
function normalizeNumericString(value){
  let raw=String(value??'').trim().replace(/\s+/g,'');
  if(!raw)return '';
  const match=raw.match(/[-+]?\d[\d.,]*/);if(!match)return '';
  raw=match[0];
  const comma=raw.lastIndexOf(','),dot=raw.lastIndexOf('.');
  if(comma>=0&&dot>=0){const decimal=Math.max(comma,dot),separator=raw[decimal];raw=raw.slice(0,decimal).replace(/[.,]/g,'')+'.'+raw.slice(decimal+1).replace(/[.,]/g,'');if(separator!==','&&separator!=='.')return '';}
  else if(comma>=0)raw=raw.replace(',','.');
  return raw;
}
function number(value){if(typeof value==='number')return Number.isFinite(value)?value:null;const normalized=normalizeNumericString(value);if(!normalized)return null;const n=Number(normalized);return Number.isFinite(n)?n:null;}
function round(value,digits=1){if(!Number.isFinite(value))return null;const p=10**digits;return Math.round(value*p)/p;}
function within(date,from,to){const time=safeDate(date)?.getTime();return Number.isFinite(time)&&time>=from.getTime()&&time<=to.getTime();}
function byDateDesc(a,b){return (safeDate(dateOf(b))?.getTime()||0)-(safeDate(dateOf(a))?.getTime()||0);}
function collection(state,key){return arr(state?.collections?.[key]);}
function forClient(state,key,clientId){return collection(state,key).filter((item)=>clientIdOf(item)===clientId);}
function unwrap(record){return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?{...record,...record.body}:record;}

function rowsFrom(value){
  if(Array.isArray(value))return value.filter((row)=>row&&typeof row==='object'&&!Array.isArray(row));
  if(value&&typeof value==='object')return Object.values(value).filter((row)=>row&&typeof row==='object'&&!Array.isArray(row));
  return [];
}
function setRows(execution){
  const source=unwrap(execution)||{};
  const candidates=[source.results,source.setResults,source.set_results,source.progressSnapshot?.results,source.progress_snapshot?.results,source.feedback?.sets];
  for(const candidate of candidates){const rows=rowsFrom(candidate);if(rows.length)return rows;}
  return [];
}
function rpeValues(execution){return setRows(execution).map((row)=>number(first(row,'rpe','actualRpe','actual_rpe'))).filter(Number.isFinite);}
function volumeOf(execution){
  return setRows(execution).reduce((total,row)=>{
    const reps=number(first(row,'reps','actualReps','actual_reps'));
    const load=number(first(row,'loadKg','load_kg','load','weightKg','weight_kg'));
    return total+(Number.isFinite(reps)&&reps>=0&&Number.isFinite(load)&&load>=0?reps*load:0);
  },0);
}
function checkinValues(record){
  const item=unwrap(record)||{};
  return {
    energy:number(first(item,'energy','energia')),
    sleep:number(first(item,'sleep','sueno','sueño')),
    stress:number(first(item,'stress','estres','estrés')),
    pain:number(first(item,'pain','dolor')),
    fatigue:number(first(item,'fatigue','fatiga')),
    motivation:number(first(item,'motivation','motivacion','motivación')),
  };
}
function average(values){const valid=values.filter(Number.isFinite);return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null;}
function objectiveValue(value){
  if(value===null||value===undefined||value==='')return false;
  if(typeof value==='number')return Number.isFinite(value);
  if(typeof value==='string')return Number.isFinite(number(value));
  if(Array.isArray(value))return value.some(objectiveValue);
  if(typeof value==='object')return Object.values(value).some(objectiveValue);
  return false;
}
function iriDomainCoverage(record){
  const item=unwrap(record)||{};
  const cardiovascular=Number.isFinite(number(first(item,'stepFinalHr','step_final_hr')))&&Number.isFinite(number(first(item,'stepOneMinuteHr','step_one_minute_hr')));
  const bodyComposition=objectiveValue(first(item,'bodyComposition','body_composition'));
  const strength=objectiveValue(first(item,'strengthPatterns','strength_patterns'))||objectiveValue(first(item,'chairStand30s','chair_stand_30s'))||objectiveValue(first(item,'pushUps','push_ups'));
  return [cardiovascular,bodyComposition,strength].filter(Boolean).length;
}
function safePositiveInteger(value,{fallback,min=1,max=3650}={}){const parsed=Number(value);return Number.isInteger(parsed)&&parsed>=min&&parsed<=max?parsed:fallback;}

export function progressWindow({now=new Date(),days=28}={}){
  const end=safeDate(now);if(!end)throw new Error('M26_PROGRESS_NOW_INVALID');
  const safeDays=safePositiveInteger(days,{fallback:28,min:1,max:3650});
  const start=new Date(end);start.setUTCDate(start.getUTCDate()-safeDays);
  return {start,end,days:safeDays};
}

export function computeProgressSummary(state,clientId,{now=new Date(),days=28}={}){
  if(!clientId)return null;
  const window=progressWindow({now,days}),{start,end}=window;
  const appointments=forClient(state,'appointments',clientId).map(unwrap).filter((item)=>within(dateOf(item),start,end));
  const planned=appointments.filter((item)=>!['cancelado','cancelled','anulado','annulled'].includes(statusOf(item)));
  const completedAppointments=planned.filter((item)=>['completado','completed'].includes(statusOf(item)));
  const executionRows=forClient(state,'sessionExecutions',clientId).map(unwrap).filter((item)=>within(dateOf(item),start,end));
  const blockedExecutionIds=unconfirmedCompletionIds(state);
  const executions=executionRows.filter((item)=>executionIsConfirmed(item,blockedExecutionIds));
  const completedExecutions=executions.filter((item)=>['completado','completed','complete'].includes(statusOf(item)));
  const completedIds=new Set(completedExecutions.map((item)=>first(item,'appointmentId','appointment_id')).filter(Boolean));
  const confirmedCompleted=Math.max(completedAppointments.length,completedIds.size,completedExecutions.length);
  const plannedCount=planned.length||completedExecutions.length;
  const adherence=plannedCount?Math.min(1,confirmedCompleted/plannedCount):null;
  const rpes=completedExecutions.flatMap(rpeValues);
  const volumeSeries=completedExecutions
    .map((item)=>({date:safeDate(dateOf(item))?.getTime()||0,volume:volumeOf(item)}))
    .filter((item)=>item.volume>0)
    .sort((a,b)=>a.date-b.date);
  const volumes=volumeSeries.map((item)=>item.volume);
  const split=Math.ceil(volumes.length/2);
  const olderVolume=volumes.length>=2?average(volumes.slice(0,split)):null;
  const recentVolume=volumes.length>=2?average(volumes.slice(split)):null;
  const volumeDelta=Number.isFinite(olderVolume)&&olderVolume>0&&Number.isFinite(recentVolume)?((recentVolume-olderVolume)/olderVolume)*100:null;
  const checkins=forClient(state,'checkins',clientId).map(unwrap).filter((item)=>within(dateOf(item),start,end)).sort(byDateDesc);
  const wearable=summarizeWearableData(forClient(state,'wearableDailySummaries',clientId),{now:end,days:Math.min(7,window.days)});
  const checkinSeries=checkins.map(checkinValues);
  const iri=forClient(state,'iriAssessments',clientId).map(unwrap).sort(byDateDesc);
  const iriCoverage=iri.map(iriDomainCoverage);
  const iriDelta=iriCoverage.length>=2&&iriCoverage[0]>0&&iriCoverage[1]>0?iriCoverage[0]-iriCoverage[1]:null;
  const sortedExecutions=[...completedExecutions].sort(byDateDesc);
  const lastExecution=sortedExecutions[0]||null;
  const lastExecutionRpe=lastExecution?rpeValues(lastExecution):[];
  const latestCheckin=checkins[0]||null;
  const dataPoints=completedExecutions.length+checkins.length+iri.length;
  const dataQuality=dataPoints>=8?'alta':dataPoints>=3?'media':'limitada';
  return Object.freeze({
    clientId,startAt:start.toISOString(),endAt:end.toISOString(),days:window.days,
    plannedSessions:plannedCount,completedSessions:confirmedCompleted,adherence:round(adherence,3),
    averageRpe:round(average(rpes),1),volume:round(average(volumes),1),volumeDelta:round(volumeDelta,1),
    iriCurrent:iri.length?iriCoverage[0]:null,iriPrevious:iri.length>1?iriCoverage[1]:null,iriDelta:round(iriDelta,1),iriAssessmentCount:iri.length,
    checkins:checkins.length,latestCheckin:latestCheckin?clone(checkinValues(latestCheckin)):null,
    checkinAverage:Object.freeze({
      energy:round(average(checkinSeries.map((x)=>x.energy)),1),sleep:round(average(checkinSeries.map((x)=>x.sleep)),1),
      stress:round(average(checkinSeries.map((x)=>x.stress)),1),pain:round(average(checkinSeries.map((x)=>x.pain)),1),
      fatigue:round(average(checkinSeries.map((x)=>x.fatigue)),1),motivation:round(average(checkinSeries.map((x)=>x.motivation)),1),
    }),
    lastExecutionAt:dateOf(lastExecution)||null,lastExecutionRpe:round(average(lastExecutionRpe),1),
    latestCheckinAt:dateOf(latestCheckin)||null,
    unconfirmedExecutions:executionRows.length-executions.length,dataQuality,wearable,
  });
}

export function buildProgressTimeline(state,clientId,{now=new Date(),days=90,limit=24}={}){
  if(!clientId)return [];
  const {start,end}=progressWindow({now,days});
  const safeLimit=safePositiveInteger(limit,{fallback:24,min:1,max:200});
  const rows=[];
  const blockedExecutionIds=unconfirmedCompletionIds(state);
  for(const item of forClient(state,'sessionExecutions',clientId).map(unwrap).filter((item)=>executionIsConfirmed(item,blockedExecutionIds)))if(within(dateOf(item),start,end))rows.push({kind:'execution',date:dateOf(item),title:first(item,'title','sessionTitle','session_title')||'Sesión ejecutada',status:statusOf(item),detail:rpeValues(item).length?`RPE medio ${round(average(rpeValues(item)),1)}`:'Ejecución registrada'});
  for(const item of forClient(state,'iriAssessments',clientId).map(unwrap))if(within(dateOf(item),start,end)){const coverage=iriDomainCoverage(item);rows.push({kind:'iri',date:dateOf(item),title:'Evaluación IRI',status:statusOf(item),detail:coverage?`${coverage} de 3 dominios registrados`:'Evaluación registrada · formato histórico sin dominios comparables'});}
  for(const item of forClient(state,'checkins',clientId).map(unwrap))if(within(dateOf(item),start,end)){
    const values=checkinValues(item);
    const optional=[];
    if(Number.isFinite(values.fatigue))optional.push(`Fatiga ${values.fatigue}`);
    if(Number.isFinite(values.motivation))optional.push(`Motivación ${values.motivation}`);
    const detail=[`Energía ${values.energy??'—'}`,`Sueño ${values.sleep??'—'}`,`Estrés ${values.stress??'—'}`,`Dolor ${values.pain??'—'}`,...optional].join(' · ');
    rows.push({kind:'checkin',date:dateOf(item),title:'Registro de bienestar',status:'registrado',detail});
  }
  return rows.sort((a,b)=>(safeDate(b.date)?.getTime()||0)-(safeDate(a.date)?.getTime()||0)).slice(0,safeLimit).map(clone);
}

// RC70_2_EXERCISE_PROGRESS_BEGIN
function epFirst(record,...keys){
  for(const key of keys){
    const value=record?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
}

function epNumber(value){
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value!=='string')return null;
  const normalized=value.trim().replace(/\s+/g,'').replace(',','.');
  if(!normalized)return null;
  const match=normalized.match(/[-+]?\d+(?:\.\d+)?/);
  if(!match)return null;
  const parsed=Number(match[0]);
  return Number.isFinite(parsed)?parsed:null;
}

function epRound(value,digits=1){
  if(!Number.isFinite(value))return null;
  const power=10**digits;
  return Math.round(value*power)/power;
}

function epAverage(values){
  const valid=values.filter(Number.isFinite);
  return valid.length
    ? valid.reduce((sum,value)=>sum+value,0)/valid.length
    : null;
}

function epExecutionSource(record){
  const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ? record.body
    : null;
  const candidates=[
    record,
    body,
    body?.patch,
    record?.patch,
    record?.progressSnapshot,
    record?.progress_snapshot,
    body?.progressSnapshot,
    body?.progress_snapshot,
  ];
  return candidates.find((item)=>item&&typeof item==='object'&&!Array.isArray(item)&&item.results)||record;
}

function epStatus(record){
  return String(epFirst(record,'status','estado')||'').trim().toLowerCase();
}

function epDate(record){
  return epFirst(
    record,
    'completedAt','completed_at',
    'endedAt','ended_at',
    'recordedAt','recorded_at',
    'createdAt','created_at',
    'date','fecha'
  );
}

function epSafeDate(value){
  const date=value?new Date(value):null;
  return date&&!Number.isNaN(date.getTime())?date:null;
}

function epKnownLoadKg(row){
  const strict=epNumber(epFirst(
    row,
    'loadKg','load_kg',
    'weightKg','weight_kg',
    'kg'
  ));

  if(Number.isFinite(strict)&&strict>=0)return strict;

  const unit=String(epFirst(
    row,
    'loadUnit','load_unit',
    'weightUnit','weight_unit',
    'unit'
  )||'').trim().toLowerCase();

  if([
    'kg','kgs',
    'kilogram','kilograms',
    'kilogramo','kilogramos'
  ].includes(unit)){
    const generic=epNumber(epFirst(
      row,
      'load','weight','carga'
    ));
    return Number.isFinite(generic)&&generic>=0?generic:null;
  }

  const raw=String(epFirst(
    row,
    'load','weight','carga'
  )||'').trim();

  if(!raw)return null;

  const kgMatch=raw.match(
    /([-+]?\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilogramo(?:s)?|kilogram(?:s)?)\b/i
  );

  if(!kgMatch)return null;

  const parsed=Number(
    String(kgMatch[1]).replace(',','.')
  );

  return Number.isFinite(parsed)&&parsed>=0?parsed:null;
}

function epLoadLabel(row){
  const raw=epFirst(
    row,
    'load','weight','carga',
    'loadKg','load_kg',
    'weightKg','weight_kg'
  );

  if(raw===null||raw===undefined||raw==='')return null;

  const unit=String(epFirst(
    row,
    'loadUnit','load_unit',
    'weightUnit','weight_unit',
    'unit'
  )||'').trim();

  const value=String(raw).trim();

  if(!value)return null;

  if(unit&&!value.toLowerCase().includes(unit.toLowerCase())){
    return `${value} ${unit}`.trim();
  }

  const knownKg=epKnownLoadKg(row);

  if(Number.isFinite(knownKg)&&/^\d+(?:[.,]\d+)?$/.test(value)){
    return `${value} kg`;
  }

  return value;
}

function epSessionMap(state){
  const map=new Map();
  for(const session of Array.isArray(state?.collections?.sessions)?state.collections.sessions:[]){
    const id=epFirst(session,'id','sessionId','session_id');
    if(id)map.set(String(id),session);
  }
  return map;
}

function epExerciseMeta(session,exerciseId){
  if(!session||!exerciseId)return null;

  for(const block of Array.isArray(session.blocks)?session.blocks:[]){
    if(
      String(epFirst(block,'exerciseId','exercise_id')||'')===String(exerciseId)
    ){
      return {
        id:String(exerciseId),
        name:String(epFirst(
          block,
          'exerciseName','exercise_name',
          'name','nombre',
          'title','titulo'
        )||exerciseId),
      };
    }

    const nested=[
      ...(Array.isArray(block.exercises)?block.exercises:[]),
      ...(Array.isArray(block.items)?block.items:[]),
    ];

    for(const item of nested){
      if(
        String(epFirst(item,'exerciseId','exercise_id','id')||'')===String(exerciseId)
      ){
        return {
          id:String(exerciseId),
          name:String(epFirst(
            item,
            'exerciseName','exercise_name',
            'name','nombre',
            'title','titulo'
          )||exerciseId),
        };
      }
    }
  }

  return null;
}

function epResultRows(source){
  const candidates=[
    source?.results,
    source?.setResults,
    source?.set_results,
    source?.progressSnapshot?.results,
    source?.progress_snapshot?.results,
  ];

  for(const candidate of candidates){
    if(Array.isArray(candidate)){
      return candidate.filter(
        (row)=>row&&typeof row==='object'&&!Array.isArray(row)
      );
    }

    if(candidate&&typeof candidate==='object'){
      return Object.values(candidate).filter(
        (row)=>row&&typeof row==='object'&&!Array.isArray(row)
      );
    }
  }

  return [];
}

function epTrend(current,previous,{unit='',percent=false}={}){
  if(!Number.isFinite(current)||!Number.isFinite(previous)){
    return Object.freeze({
      direction:'indeterminate',
      delta:null,
      label:'Sin comparación suficiente',
    });
  }

  const rawDelta=current-previous;
  const stable=Math.abs(rawDelta)<0.000001;
  const direction=stable?'stable':rawDelta>0?'up':'down';

  let delta=epRound(rawDelta,1);
  let label;

  if(percent&&previous!==0){
    delta=epRound((rawDelta/Math.abs(previous))*100,1);
    label=stable
      ? 'Estable'
      : `${delta>0?'+':''}${delta}%`;
  }else{
    label=stable
      ? 'Estable'
      : `${delta>0?'+':''}${delta}${unit}`;
  }

  return Object.freeze({
    direction,
    delta,
    label,
  });
}

function epPoint(execution,rows,meta){
  const reps=rows
    .map((row)=>epNumber(epFirst(
      row,
      'reps','actualReps','actual_reps',
      'repetitions','repeticiones'
    )))
    .filter(Number.isFinite);

  const seconds=rows
    .map((row)=>epNumber(epFirst(
      row,
      'seconds','actualSeconds','actual_seconds',
      'durationSeconds','duration_seconds'
    )))
    .filter(Number.isFinite);

  const rpes=rows
    .map((row)=>epNumber(epFirst(
      row,
      'rpe','actualRpe','actual_rpe'
    )))
    .filter(Number.isFinite);

  const rirs=rows
    .map((row)=>epNumber(epFirst(
      row,
      'rir','actualRir','actual_rir'
    )))
    .filter(Number.isFinite);

  const knownLoads=rows
    .map(epKnownLoadKg)
    .filter(Number.isFinite);

  const loadLabels=[
    ...new Set(
      rows.map(epLoadLabel).filter(Boolean)
    ),
  ];

  const knownVolumes=rows
    .map((row)=>{
      const load=epKnownLoadKg(row);
      const rowReps=epNumber(epFirst(
        row,
        'reps','actualReps','actual_reps',
        'repetitions','repeticiones'
      ));

      return Number.isFinite(load)&&Number.isFinite(rowReps)
        ? load*rowReps
        : null;
    })
    .filter(Number.isFinite);

  const at=epSafeDate(
    epFirst(
      execution,
      'completedAt','completed_at',
      'endedAt','ended_at',
      'recordedAt','recorded_at',
      'createdAt','created_at'
    )||
    rows.map(epDate).find(Boolean)
  );

  return Object.freeze({
    executionId:String(epFirst(execution,'id','executionId','execution_id')||''),
    sessionId:String(epFirst(execution,'sessionId','session_id')||''),
    exerciseId:meta.id,
    exerciseName:meta.name,
    at:at?at.toISOString():null,
    setCount:rows.length,
    totalReps:reps.length?reps.reduce((a,b)=>a+b,0):null,
    bestReps:reps.length?Math.max(...reps):null,
    totalSeconds:seconds.length?seconds.reduce((a,b)=>a+b,0):null,
    maxLoadKg:knownLoads.length?Math.max(...knownLoads):null,
    loadLabels:Object.freeze(loadLabels),
    averageRpe:epRound(epAverage(rpes),1),
    averageRir:epRound(epAverage(rirs),1),
    volumeKgReps:knownVolumes.length
      ? epRound(knownVolumes.reduce((a,b)=>a+b,0),1)
      : null,
    knownLoadSets:knownLoads.length,
  });
}

export function buildExerciseLongitudinalProgress(
  state,
  clientId,
  {limitPerExercise=36}={}
){
  if(!clientId){
    return Object.freeze({
      clientId:null,
      exercises:Object.freeze([]),
      totalExercises:0,
      totalExecutions:0,
      coverageStartAt:null,
      coverageEndAt:null,
    });
  }

  const executions=forClient(
    state,
    'sessionExecutions',
    clientId
  );

  const sessions=epSessionMap(state);
  const byExercise=new Map();
  let acceptedExecutions=0;

  for(const original of executions){
    const source=epExecutionSource(original);
    const status=epStatus(source)||epStatus(original);

    if(![
      'completed','complete','completado'
    ].includes(status)){
      continue;
    }

    const rows=epResultRows(source);

    if(!rows.length)continue;

    acceptedExecutions+=1;

    const sessionId=epFirst(
      source,
      'sessionId','session_id'
    )||epFirst(
      original,
      'sessionId','session_id'
    );

    const session=sessionId
      ? sessions.get(String(sessionId))
      : null;

    const grouped=new Map();

    for(const row of rows){
      const exerciseId=epFirst(
        row,
        'exerciseId','exercise_id',
        'exerciseKey','exercise_key',
        'movementId','movement_id'
      );

      if(!exerciseId)continue;

      const id=String(exerciseId);
      const meta=epExerciseMeta(session,id)||{
        id,
        name:String(epFirst(
          row,
          'exerciseName','exercise_name',
          'movementName','movement_name',
          'name','nombre'
        )||id),
      };

      if(!grouped.has(id)){
        grouped.set(id,{
          meta,
          rows:[],
        });
      }

      grouped.get(id).rows.push(row);
    }

    for(const group of grouped.values()){
      const point=epPoint(source,group.rows,group.meta);

      if(!byExercise.has(group.meta.id)){
        byExercise.set(group.meta.id,{
          id:group.meta.id,
          name:group.meta.name,
          points:[],
        });
      }

      byExercise.get(group.meta.id).points.push(point);
    }
  }

  const exercises=[];

  for(const item of byExercise.values()){
    const allPoints=item.points
      .filter((point)=>point.at)
      .sort(
        (a,b)=>new Date(a.at).getTime()-new Date(b.at).getTime()
      );

    if(!allPoints.length)continue;

    const latest=allPoints.at(-1);
    const previous=allPoints.length>=2
      ? allPoints.at(-2)
      : null;

    const knownLoadPoints=allPoints.filter(
      (point)=>Number.isFinite(point.maxLoadKg)
    );

    const knownVolumePoints=allPoints.filter(
      (point)=>Number.isFinite(point.volumeKgReps)
    );

    const bestLoadKg=knownLoadPoints.length
      ? Math.max(...knownLoadPoints.map((point)=>point.maxLoadKg))
      : null;

    const bestVolumeKgReps=knownVolumePoints.length
      ? Math.max(...knownVolumePoints.map((point)=>point.volumeKgReps))
      : null;

    const totalSets=allPoints.reduce(
      (sum,point)=>sum+Number(point.setCount||0),
      0
    );

    const totalKnownLoadSets=allPoints.reduce(
      (sum,point)=>sum+Number(point.knownLoadSets||0),
      0
    );

    const quality=allPoints.length>=6
      ? 'alta'
      : allPoints.length>=2
        ? 'media'
        : 'limitada';

    exercises.push(Object.freeze({
      exerciseId:item.id,
      exerciseName:item.name,
      sessions:allPoints.length,
      totalSets,
      firstAt:allPoints[0].at,
      lastAt:latest.at,
      latest,
      bestLoadKg,
      bestVolumeKgReps,
      loadCoverage:totalSets
        ? epRound(totalKnownLoadSets/totalSets,2)
        : null,
      dataQuality:quality,
      loadTrend:epTrend(
        latest.maxLoadKg,
        previous?.maxLoadKg,
        {unit:' kg'}
      ),
      repsTrend:epTrend(
        latest.bestReps,
        previous?.bestReps,
        {unit:' reps'}
      ),
      volumeTrend:epTrend(
        latest.volumeKgReps,
        previous?.volumeKgReps,
        {percent:true}
      ),
      rpeTrend:epTrend(
        latest.averageRpe,
        previous?.averageRpe,
        {unit:' RPE'}
      ),
      rirTrend:epTrend(
        latest.averageRir,
        previous?.averageRir,
        {unit:' RIR'}
      ),
      history:Object.freeze(
        allPoints.slice(-Math.max(2,Math.min(
          Number(limitPerExercise)||36,
          100
        )))
      ),
    }));
  }

  exercises.sort((a,b)=>{
    const dateDiff=new Date(b.lastAt).getTime()-new Date(a.lastAt).getTime();
    if(dateDiff!==0)return dateDiff;
    return a.exerciseName.localeCompare(
      b.exerciseName,
      'es',
      {sensitivity:'base'}
    );
  });

  const dates=exercises.flatMap(
    (exercise)=>exercise.history.map((point)=>point.at)
  ).filter(Boolean).sort();

  return Object.freeze({
    clientId,
    exercises:Object.freeze(exercises),
    totalExercises:exercises.length,
    totalExecutions:acceptedExecutions,
    coverageStartAt:dates[0]||null,
    coverageEndAt:dates.at(-1)||null,
    semantics:Object.freeze({
      knownLoad:'Solo se interpreta como kg cuando la unidad kg es explícita.',
      ambiguousLoad:'Las cargas sin unidad se muestran como texto y no generan volumen en kg.',
      effort:'RPE y RIR se muestran como esfuerzo, no como mejora automática.',
      missing:'Dato ausente se conserva como ausente; nunca se convierte en cero.',
    }),
  });
}
// RC70_2_EXERCISE_PROGRESS_END
