import {parseDateValue,reportCivilDate,isWithinCivilPeriod} from '../domain/civil-date.js';
import {observedSet,observedLoadKg} from '../domain/evidence-signal.js';
import {
  unconfirmedSessionExecutionIds as blockedCompletionIds,
  sessionExecutionIsConfirmed as executionConfirmed,
  sessionExecutionIsCompleted as executionCompleted,
  sessionExecutionCompletionDate,
  reconcileSessionExecutionsForClient,
} from '../domain/session-execution-truth.js';

const COMPLETE_STATUSES=new Set(['completed','completado','complete']);

function arr(value){
  return Array.isArray(value)?value:[];
}

function first(record,...keys){
  for(const key of keys){
    const value=record?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
}

function unwrap(record){
  return record?.body&&
    typeof record.body==='object'&&
    !Array.isArray(record.body)
      ?{...record,...record.body}
      :record;
}

function clientIdOf(record){
  return first(
    record,
    'clientId',
    'client_id',
    'clienteId',
    'cliente_id',
  );
}

function executionDate(record){
  return sessionExecutionCompletionDate(record);
}

function safeDate(value){
  return parseDateValue(value);
}

function numeric(value){
  if(typeof value!=='number'&&typeof value!=='string')return null;
  if(typeof value==='number'){
    return Number.isFinite(value)?value:null;
  }

  const text=String(value??'')
    .trim()
    .replace(',','.');

  if(!/^[-+]?\d+(?:\.\d+)?$/u.test(text)){
    return null;
  }

  const parsed=Number(text);
  return Number.isFinite(parsed)?parsed:null;
}

function round(value,digits=2){
  if(!Number.isFinite(value))return null;
  const factor=10**digits;
  return Math.round(value*factor)/factor;
}

function average(values){
  const valid=values.filter(Number.isFinite);

  return valid.length
    ?valid.reduce((sum,value)=>sum+value,0)/valid.length
    :null;
}

function rowsFrom(value){
  if(Array.isArray(value)){
    return value.filter(
      (row)=>row&&
        typeof row==='object'&&
        !Array.isArray(row),
    );
  }

  if(value&&typeof value==='object'){
    return Object.values(value).filter(
      (row)=>row&&
        typeof row==='object'&&
        !Array.isArray(row),
    );
  }

  return [];
}

function setRows(execution){
  const source=unwrap(execution)||{};

  const candidates=[
    source.results,
    source.setResults,
    source.set_results,
    source.progressSnapshot?.results,
    source.progress_snapshot?.results,
    source.feedback?.sets,
  ];

  for(const candidate of candidates){
    const rows=rowsFrom(candidate);
    if(rows.length)return rows;
  }

  return [];
}

export function normalizeExerciseLoad(row={}){
  const typedKg=first(row,'loadKg','load_kg','weightKg','weight_kg','kg');
  const kgValue=observedLoadKg(row);
  if(kgValue!==null){
    return Object.freeze({
      raw:`${kgValue} kg`,
      value:kgValue,
      unit:'kg',
      comparableKey:'kg',
    });
  }
  if(typedKg!==null)return Object.freeze({
    raw:null,value:null,unit:null,comparableKey:null,
  });

  const lb=numeric(
    first(
      row,
      'loadLb',
      'load_lb',
      'weightLb',
      'weight_lb',
    ),
  );

  if(Number.isFinite(lb)&&lb>=0){
    return Object.freeze({
      raw:`${lb} lb`,
      value:lb,
      unit:'lb',
      comparableKey:'lb',
    });
  }

  const raw=first(
    row,
    'load',
    'weight',
    'carga',
  );

  if(raw===null){
    return Object.freeze({
      raw:null,
      value:null,
      unit:null,
      comparableKey:null,
    });
  }

  if(typeof raw!=='number'&&typeof raw!=='string')return Object.freeze({raw:null,value:null,unit:null,comparableKey:null});
  const text=String(raw).trim();

  let match=text.match(
    /^([-+]?\d+(?:[.,]\d+)?)\s*(kg|kgs?|kilogramos?)$/iu,
  );

  if(match)return Object.freeze({
    raw:text,value:null,unit:null,comparableKey:null,
  });

  match=text.match(
    /^([-+]?\d+(?:[.,]\d+)?)\s*(lb|lbs?|libras?)$/iu,
  );

  if(match){
    return Object.freeze({
      raw:text,
      value:Number(match[1].replace(',','.'))>=0?Number(match[1].replace(',','.')):null,
      unit:'lb',
      comparableKey:Number(match[1].replace(',','.'))>=0?'lb':null,
    });
  }

  const value=numeric(text);

  if(Number.isFinite(value)&&value>=0){
    return Object.freeze({
      raw:text,
      value,
      unit:null,
      comparableKey:'numeric',
    });
  }

  return Object.freeze({
    raw:text,
    value:null,
    unit:null,
    comparableKey:null,
  });
}

// Retain only observed metrics, not prescribed pace or distance.
function observedDistance(value,max){
  const n=numeric(value);
  return Number.isFinite(n)&&n>=0&&n<=max?n:null;
}
function observedPace(value){
  const text=String(value??'').trim();
  return /^\d{1,2}:[0-5]\d$/u.test(text)&&Number(text.split(':')[0])*60+Number(text.split(':')[1])>0?text:null;
}
function normalizeSet(row,index){
  if(!observedSet(row))return null;
  const exerciseId=String(
    first(
      row,
      'exerciseId',
      'exercise_id',
      'ejercicioId',
      'ejercicio_id',
    )||'',
  ).trim();

  if(!exerciseId)return null;

  const setNumberRaw=numeric(
    first(
      row,
      'setNumber',
      'set_number',
      'serie',
      'series',
    ),
  );

  const setNumber=
    Number.isInteger(setNumberRaw)&&setNumberRaw>0
      ?setNumberRaw
      :index+1;

  const reps=numeric(
    first(
      row,
      'reps',
      'actualReps',
      'actual_reps',
    ),
  );

  const seconds=numeric(
    first(
      row,
      'seconds',
      'durationSeconds',
      'duration_seconds',
    ),
  );

  const rpe=numeric(
    first(
      row,
      'rpe',
      'actualRpe',
      'actual_rpe',
    ),
  );

  const rir=numeric(
    first(
      row,
      'rir',
      'actualRir',
      'actual_rir',
    ),
  );

  return Object.freeze({
    exerciseId,
    setNumber,
    reps:Number.isSafeInteger(reps)&&reps>=0&&reps<=10000?reps:null,
    seconds:Number.isFinite(seconds)&&seconds>=0?seconds:null,
    distanceKm:observedDistance(first(row,'distanceKm','distance_km'),1000),
    distanceM:observedDistance(first(row,'distanceM','distance_m'),100000),
    paceMinPerKm:observedPace(first(row,'paceMinPerKm','pace_min_per_km')),
    pacePer100M:observedPace(first(row,'pacePer100M','pace_per_100m')),
    load:normalizeExerciseLoad(row),
    rpe:Number.isFinite(rpe)&&rpe>=1&&rpe<=10?rpe:null,
    rir:Number.isFinite(rir)&&rir>=0&&rir<=10?rir:null,
    notes:String(
      first(
        row,
        'notes',
        'note',
        'notas',
      )||'',
    ).trim()||null,
    completedAt:first(
      row,
      'completedAt',
      'completed_at',
      'recordedAt',
      'recorded_at',
    )||null,
  });
}

function recordMax(items,valueOf){
  let best=null;

  for(const item of items){
    const value=valueOf(item);

    if(!Number.isFinite(value))continue;

    if(!best||value>best.value){
      best={value,item};
    }
  }

  return best;
}

function exposureFrom(execution,exerciseId){
  const source=unwrap(execution)||{};

  const sets=setRows(source)
    .map(normalizeSet)
    .filter(
      (row)=>row?.exerciseId===exerciseId,
    )
    .sort(
      (a,b)=>a.setNumber-b.setNumber,
    );

  if(!sets.length)return null;

  const dated=executionDate(source);
  if(!safeDate(dated))return null;

  const reps=sets
    .map((row)=>row.reps)
    .filter(Number.isFinite);

  const seconds=sets
    .map((row)=>row.seconds)
    .filter(Number.isFinite);

  const rpes=sets
    .map((row)=>row.rpe)
    .filter(Number.isFinite);

  const rirs=sets
    .map((row)=>row.rir)
    .filter(Number.isFinite);

  const comparableSets=sets.filter(
    (row)=>
      Boolean(row.load.comparableKey)&&
      Number.isFinite(row.load.value),
  );

  const latestComparableKey=
    [...comparableSets]
      .reverse()
      .find(Boolean)
      ?.load
      ?.comparableKey||
    null;

  const sameComparableSets=
    latestComparableKey
      ?comparableSets.filter(
          (row)=>
            row.load.comparableKey===
            latestComparableKey,
        )
      :[];

  const peakComparable=recordMax(
    sameComparableSets,
    (row)=>row.load.value,
  );

  const kgSets=sets.filter(
    (row)=>
      row.load.comparableKey==='kg'&&
      Number.isFinite(row.load.value),
  );

  const volumeParts=kgSets
    .filter(
      (row)=>Number.isFinite(row.reps),
    )
    .map(
      (row)=>row.reps*row.load.value,
    );

  const peakKg=recordMax(
    kgSets,
    (row)=>row.load.value,
  );

  return Object.freeze({
    executionId:String(
      first(
        source,
        'id',
        'executionId',
        'execution_id',
      )||'',
    ),
    sessionId:first(
      source,
      'sessionId',
      'session_id',
    )||null,
    clientId:clientIdOf(source)||null,
    exerciseId,
    completedAt:dated,
    setCount:sets.length,
    sets:Object.freeze(sets),
    lastLoad:[...sets].reverse().find((row)=>row.load.raw!==null)?.load||sets.at(-1)?.load||null,
    totalReps:reps.length
      ?round(
          reps.reduce(
            (sum,value)=>sum+value,
            0,
          ),
          2,
        )
      :null,
    totalSeconds:seconds.length
      ?round(
          seconds.reduce(
            (sum,value)=>sum+value,
            0,
          ),
          2,
        )
      :null,
    averageRpe:round(
      average(rpes),
      2,
    ),
    averageRir:round(
      average(rirs),
      2,
    ),
    peakLoad:peakComparable
      ?Object.freeze({
          value:round(
            peakComparable.value,
            2,
          ),
          unit:
            peakComparable.item.load.unit||
            null,
          comparableKey:
            peakComparable.item.load.comparableKey,
        })
      :null,
    peakLoadKg:peakKg
      ?peakKg.value
      :null,
    repsPerSet:
      sets.length>0&&
      reps.length===sets.length
        ?round(
            reps.reduce(
              (sum,value)=>sum+value,
              0,
            )/sets.length,
            2,
          )
        :null,
    secondsPerSet:
      sets.length>0&&
      seconds.length===sets.length
        ?round(
            seconds.reduce(
              (sum,value)=>sum+value,
              0,
            )/sets.length,
            2,
          )
        :null,
    volumeCoverage:Object.freeze({
      complete:
        sets.length>0&&
        volumeParts.length===sets.length,
      coveredSets:volumeParts.length,
      totalSets:sets.length,
    }),
    volumeKg:
      sets.length>0&&
      volumeParts.length===sets.length
        ?round(
          volumeParts.reduce(
            (sum,value)=>sum+value,
            0,
          ),
          2,
        )
      :null,
  });
}

function delta(current,previous){
  return Number.isFinite(current)&&
    Number.isFinite(previous)
      ?round(current-previous,2)
      :null;
}

function percentDelta(current,previous){
  return Number.isFinite(current)&&
    Number.isFinite(previous)&&
    previous!==0
      ?round(
          ((current-previous)/previous)*100,
          1,
        )
      :null;
}

function comparableLoadDelta(current,previous){
  if(
    !current||
    !previous||
    !current.comparableKey||
    current.comparableKey!==previous.comparableKey||
    !Number.isFinite(current.value)||
    !Number.isFinite(previous.value)
  ){
    return null;
  }

  return Object.freeze({
    unit:current.unit||null,
    comparableKey:current.comparableKey,
    value:delta(
      current.value,
      previous.value,
    ),
    percent:percentDelta(
      current.value,
      previous.value,
    ),
  });
}

function comparison(latest,previous){
  if(!latest||!previous)return null;

  return Object.freeze({
    lastLoad:comparableLoadDelta(
      latest.lastLoad,
      previous.lastLoad,
    ),
    peakLoadKg:delta(
      latest.peakLoadKg,
      previous.peakLoadKg,
    ),
    peakLoadKgPercent:percentDelta(
      latest.peakLoadKg,
      previous.peakLoadKg,
    ),
    volumeKg:delta(
      latest.volumeKg,
      previous.volumeKg,
    ),
    volumeKgPercent:percentDelta(
      latest.volumeKg,
      previous.volumeKg,
    ),
    totalReps:delta(
      latest.totalReps,
      previous.totalReps,
    ),
    totalSeconds:delta(
      latest.totalSeconds,
      previous.totalSeconds,
    ),
    averageRpe:delta(
      latest.averageRpe,
      previous.averageRpe,
    ),
    averageRir:delta(
      latest.averageRir,
      previous.averageRir,
    ),
    setCount:delta(
      latest.setCount,
      previous.setCount,
    ),
  });
}

function buildRecords(history){
  const sets=history.flatMap(
    (exposure)=>
      exposure.sets.map(
        (set)=>({exposure,set}),
      ),
  );

  const latestComparableKey=
    history.find(
      (exposure)=>
        exposure?.peakLoad?.comparableKey,
    )
      ?.peakLoad
      ?.comparableKey||
    null;

  const comparable=sets.filter(
    ({set})=>
      Boolean(latestComparableKey)&&
      set.load.comparableKey===
        latestComparableKey&&
      Number.isFinite(set.load.value),
  );

  const maxComparableLoad=recordMax(
    comparable,
    ({set})=>set.load.value,
  );

  const kg=sets.filter(
    ({set})=>
      set.load.comparableKey==='kg'&&
      Number.isFinite(set.load.value),
  );

  const maxLoad=recordMax(
    kg,
    ({set})=>set.load.value,
  );

  const maxSetVolume=recordMax(
    kg,
    ({set})=>
      Number.isFinite(set.reps)
        ?set.reps*set.load.value
        :null,
  );

  const maxExposureVolume=recordMax(
    history,
    (item)=>item.volumeKg,
  );

  const maxReps=recordMax(
    sets,
    ({set})=>set.reps,
  );

  const longest=recordMax(
    sets,
    ({set})=>set.seconds,
  );

  const setRecord=(record,metric)=>
    record
      ?Object.freeze({
          value:round(
            record.value,
            2,
          ),
          completedAt:
            record.item.exposure.completedAt,
          executionId:
            record.item.exposure.executionId,
          setNumber:
            record.item.set.setNumber,
          ...metric(record.item.set),
        })
      :null;

  return Object.freeze({
    maxComparableLoad:setRecord(
      maxComparableLoad,
      (set)=>({
        unit:set.load.unit||null,
        comparableKey:
          set.load.comparableKey,
      }),
    ),
    maxLoadKg:setRecord(
      maxLoad,
      ()=>({unit:'kg'}),
    ),
    maxSetVolumeKg:setRecord(
      maxSetVolume,
      ()=>({unit:'kg·rep'}),
    ),
    maxExposureVolumeKg:
      maxExposureVolume
        ?Object.freeze({
            value:round(
              maxExposureVolume.value,
              2,
            ),
            unit:'kg·rep',
            completedAt:
              maxExposureVolume.item.completedAt,
            executionId:
              maxExposureVolume.item.executionId,
          })
        :null,
    maxReps:setRecord(
      maxReps,
      (set)=>({load:set.load}),
    ),
    longestSetSeconds:setRecord(
      longest,
      ()=>({unit:'s'}),
    ),
  });
}

function performanceMetricTrend(
  history,
  metric,
  valueOf,
  {
    unit=null,
    comparableKey=null,
  }={},
){
  const points=history
    .map(
      (exposure)=>{
        const value=valueOf(exposure);

        return Number.isFinite(value)
          ?Object.freeze({
              completedAt:
                exposure.completedAt||
                null,
              executionId:
                exposure.executionId||
                null,
              value:round(value,2),
            })
          :null;
      },
    )
    .filter(Boolean);

  const firstPoint=
    points[0]||
    null;

  const latestPoint=
    points.at(-1)||
    null;

  const absoluteDelta=
    firstPoint&&latestPoint
      ?delta(
          latestPoint.value,
          firstPoint.value,
        )
      :null;

  const percentageDelta=
    firstPoint&&latestPoint
      ?percentDelta(
          latestPoint.value,
          firstPoint.value,
        )
      :null;

  const direction=
    Number.isFinite(absoluteDelta)
      ?absoluteDelta>0
        ?'up'
        :absoluteDelta<0
          ?'down'
          :'flat'
      :'insufficient';

  return Object.freeze({
    metric,
    unit,
    comparableKey,
    points:Object.freeze(points),
    pointCount:points.length,
    first:firstPoint,
    latest:latestPoint,
    absoluteDelta,
    percentageDelta,
    direction,
    comparable:
      points.length>=2,
  });
}

export function buildExercisePerformanceTrend(
  memory,
  {window=8}={},
){
  const safeWindow=
    Number.isInteger(Number(window))
      ?Math.max(
          2,
          Math.min(Number(window),50),
        )
      :8;

  const sourceHistory=
    arr(memory?.history)
      .slice(0,safeWindow);

  const chronological=
    [...sourceHistory].reverse();

  const latestLoad=
    memory?.latest?.peakLoad||
    null;

  const latestLoadKey=
    latestLoad?.comparableKey||
    null;

  const loadTrend=
    performanceMetricTrend(
      chronological,
      'load',
      (exposure)=>
        latestLoadKey&&
        exposure?.peakLoad?.comparableKey===
          latestLoadKey
          ?exposure.peakLoad.value
          :null,
      {
        unit:latestLoad?.unit||null,
        comparableKey:latestLoadKey,
      },
    );

  const volumeTrend=
    performanceMetricTrend(
      chronological,
      'volumeKg',
      (exposure)=>exposure?.volumeKg,
      {
        unit:'kg·rep',
        comparableKey:'kg-volume',
      },
    );

  const repsTrend=
    performanceMetricTrend(
      chronological,
      'totalReps',
      (exposure)=>exposure?.totalReps,
      {
        unit:'rep',
        comparableKey:'reps',
      },
    );

  const repsPerSetTrend=
    performanceMetricTrend(
      chronological,
      'repsPerSet',
      (exposure)=>exposure?.repsPerSet,
      {
        unit:'rep/serie',
        comparableKey:'reps-per-set',
      },
    );

  const secondsTrend=
    performanceMetricTrend(
      chronological,
      'totalSeconds',
      (exposure)=>exposure?.totalSeconds,
      {
        unit:'s',
        comparableKey:'seconds',
      },
    );

  const secondsPerSetTrend=
    performanceMetricTrend(
      chronological,
      'secondsPerSet',
      (exposure)=>exposure?.secondsPerSet,
      {
        unit:'s/serie',
        comparableKey:'seconds-per-set',
      },
    );

  const rpeTrend=
    performanceMetricTrend(
      chronological,
      'averageRpe',
      (exposure)=>exposure?.averageRpe,
      {
        unit:'RPE',
        comparableKey:'rpe',
      },
    );

  const rirTrend=
    performanceMetricTrend(
      chronological,
      'averageRir',
      (exposure)=>exposure?.averageRir,
      {
        unit:'RIR',
        comparableKey:'rir',
      },
    );

  const dated=chronological
    .map(
      (exposure)=>
        safeDate(exposure?.completedAt),
    )
    .filter(Boolean)
    .sort(
      (a,b)=>a.getTime()-b.getTime(),
    );

  const gaps=[];

  for(
    let index=1;
    index<dated.length;
    index+=1
  ){
    const days=
      (
        dated[index].getTime()-
        dated[index-1].getTime()
      )/
      86400000;

    if(
      Number.isFinite(days)&&
      days>=0
    ){
      gaps.push(days);
    }
  }

  const primaryMetric=
    loadTrend.comparable
      ?'load'
      :repsPerSetTrend.comparable
        ?'repsPerSet'
        :secondsPerSetTrend.comparable
          ?'secondsPerSet'
          :volumeTrend.comparable
            ?'volumeKg'
            :null;

  return Object.freeze({
    exerciseId:
      memory?.exerciseId||
      null,
    clientId:
      memory?.clientId||
      null,
    window:safeWindow,
    exposureCount:
      Number(memory?.exposureCount||0),
    pointsUsed:
      chronological.length,
    averageGapDays:round(
      average(gaps),
      1,
    ),
    primaryMetric,
    metrics:Object.freeze({
      load:loadTrend,
      volumeKg:volumeTrend,
      totalReps:repsTrend,
      repsPerSet:repsPerSetTrend,
      totalSeconds:secondsTrend,
      secondsPerSet:secondsPerSetTrend,
      averageRpe:rpeTrend,
      averageRir:rirTrend,
    }),
    interpretation:
      'facts-only',
  });
}
function exerciseAssessmentPerSet(total,setCount){
  return Number.isFinite(total)&&
    Number.isFinite(setCount)&&
    setCount>0
      ?round(total/setCount,2)
      :null;
}

function exerciseAssessmentRelativeDelta(current,previous){
  return Number.isFinite(current)&&
    Number.isFinite(previous)&&
    previous!==0
      ?round(
          ((current-previous)/Math.abs(previous))*100,
          1,
        )
      :null;
}

function exerciseAssessmentFinite(value){
  return (
    typeof value==='number'&&
    Number.isFinite(value)
  );
}

function exerciseAssessmentCausalMetric(
  status,
  evidence={},
){
  const outputMetric=
    evidence?.outputMetric==='reps-per-set'
      ?'repsPerSet'
      :evidence?.outputMetric==='seconds-per-set'
        ?'secondsPerSet'
        :null;

  const outputDeltaPercent=
    exerciseAssessmentFinite(
      evidence?.outputDeltaPercent,
    )
      ?evidence.outputDeltaPercent
      :null;

  const loadDeltaPercent=
    exerciseAssessmentFinite(
      evidence?.loadDeltaPercent,
    )
      ?evidence.loadDeltaPercent
      :null;

  const loadDirection=
    evidence?.loadDirection==='higher-is-better'||
    evidence?.loadDirection==='lower-is-better'
      ?evidence.loadDirection
      :'unknown';

  const semanticLoadDelta=
    loadDirection==='higher-is-better'&&
    exerciseAssessmentFinite(loadDeltaPercent)
      ?loadDeltaPercent
      :loadDirection==='lower-is-better'&&
        exerciseAssessmentFinite(loadDeltaPercent)
        ?-loadDeltaPercent
        :null;

  const rpeDelta=
    exerciseAssessmentFinite(evidence?.rpeDelta)
      ?evidence.rpeDelta
      :null;

  const rirDelta=
    exerciseAssessmentFinite(evidence?.rirDelta)
      ?evidence.rirDelta
      :null;

  if(status==='progress'){
    if(
      outputMetric&&
      exerciseAssessmentFinite(outputDeltaPercent)&&
      outputDeltaPercent>5
    ){
      return outputMetric;
    }

    if(
      exerciseAssessmentFinite(semanticLoadDelta)&&
      semanticLoadDelta>2
    ){
      return 'load';
    }

    if(
      exerciseAssessmentFinite(rpeDelta)&&
      rpeDelta<(-0.75)
    ){
      return 'averageRpe';
    }

    if(
      exerciseAssessmentFinite(rirDelta)&&
      rirDelta>0.75
    ){
      return 'averageRir';
    }

    return null;
  }

  if(status==='regression'){
    if(
      outputMetric&&
      exerciseAssessmentFinite(outputDeltaPercent)&&
      outputDeltaPercent<(-5)
    ){
      return outputMetric;
    }

    if(
      exerciseAssessmentFinite(semanticLoadDelta)&&
      semanticLoadDelta<(-2)
    ){
      return 'load';
    }

    if(
      exerciseAssessmentFinite(rpeDelta)&&
      rpeDelta>0.75
    ){
      return 'averageRpe';
    }

    if(
      exerciseAssessmentFinite(rirDelta)&&
      rirDelta<(-0.75)
    ){
      return 'averageRir';
    }

    return null;
  }

  if(status==='stable'){
    if(
      outputMetric&&
      exerciseAssessmentFinite(outputDeltaPercent)&&
      Math.abs(outputDeltaPercent)<=5
    ){
      return outputMetric;
    }

    if(
      exerciseAssessmentFinite(loadDeltaPercent)&&
      loadDirection!=='unknown'&&
      Math.abs(loadDeltaPercent)<=2
    ){
      return 'load';
    }

    return null;
  }

  return null;
}

function exerciseAssessmentResult(
  status,
  confidence,
  basis,
  evidence,
){
  const presentation={
    progress:{
      label:'Evolución',
      symbol:'↑',
      tone:'success',
      colorEligible:true,
    },
    regression:{
      label:'Retroceso',
      symbol:'↓',
      tone:'danger',
      colorEligible:true,
    },
    stable:{
      label:'Estable',
      symbol:'=',
      tone:'neutral',
      colorEligible:false,
    },
    indeterminate:{
      label:'Sin conclusión',
      symbol:'·',
      tone:'neutral',
      colorEligible:false,
    },
  }[status];

  return Object.freeze({
    status,
    confidence,
    basis,
    label:presentation.label,
    symbol:presentation.symbol,
    tone:presentation.tone,
    colorEligible:
      presentation.colorEligible,
    evidence:Object.freeze(evidence),
    causalMetric:
      exerciseAssessmentCausalMetric(
        status,
        evidence,
      ),
    methodology:
      'deterministic-comparable-performance-v1',
  });
}

export function assessExercisePerformance(
  memory,
  {
    loadDirection='unknown',
  }={},
){
  const latest=memory?.latest||null;
  const previous=memory?.previous||null;

  const normalizedLoadDirection=
    loadDirection==='higher-is-better'||
    loadDirection==='lower-is-better'
      ?loadDirection
      :'unknown';

  if(!latest||!previous){
    return exerciseAssessmentResult(
      'indeterminate',
      'low',
      'Se necesitan al menos dos exposiciones confirmadas.',
      {
        comparableExposures:false,
        loadDirection:
          normalizedLoadDirection,
      },
    );
  }

  const latestLoad=
    latest.peakLoad||
    null;

  const previousLoad=
    previous.peakLoad||
    null;

  const latestLoadKey=
    latestLoad?.comparableKey||
    null;

  const previousLoadKey=
    previousLoad?.comparableKey||
    null;

  const loadContextChanged=
    latestLoadKey!==previousLoadKey;

  const loadComparable=
    Boolean(latestLoadKey)&&
    latestLoadKey===previousLoadKey&&
    Number.isFinite(latestLoad?.value)&&
    Number.isFinite(previousLoad?.value);

  const loadDelta=
    loadComparable
      ?delta(
          latestLoad.value,
          previousLoad.value,
        )
      :null;

  const loadDeltaPercent=
    loadComparable
      ?exerciseAssessmentRelativeDelta(
          latestLoad.value,
          previousLoad.value,
        )
      :null;

  const loadStable=
    loadComparable&&
    (
      Math.abs(loadDeltaPercent??0)<=2
    );

  const latestRepsPerSet=
    Number.isFinite(latest.repsPerSet)
      ?latest.repsPerSet
      :null;

  const previousRepsPerSet=
    Number.isFinite(previous.repsPerSet)
      ?previous.repsPerSet
      :null;

  const repsComparable=
    Number.isFinite(latestRepsPerSet)&&
    Number.isFinite(previousRepsPerSet);

  const repsDeltaPercent=
    repsComparable
      ?exerciseAssessmentRelativeDelta(
          latestRepsPerSet,
          previousRepsPerSet,
        )
      :null;

  const latestSecondsPerSet=
    Number.isFinite(latest.secondsPerSet)
      ?latest.secondsPerSet
      :null;

  const previousSecondsPerSet=
    Number.isFinite(previous.secondsPerSet)
      ?previous.secondsPerSet
      :null;

  const secondsComparable=
    Number.isFinite(latestSecondsPerSet)&&
    Number.isFinite(previousSecondsPerSet);

  const secondsDeltaPercent=
    secondsComparable
      ?exerciseAssessmentRelativeDelta(
          latestSecondsPerSet,
          previousSecondsPerSet,
        )
      :null;

  const outputMetric=
    repsComparable
      ?'reps-per-set'
      :secondsComparable
        ?'seconds-per-set'
        :null;

  const outputDeltaPercent=
    repsComparable
      ?repsDeltaPercent
      :secondsComparable
        ?secondsDeltaPercent
        :null;

  const outputUp=
    Number.isFinite(outputDeltaPercent)&&
    outputDeltaPercent>5;

  const outputDown=
    Number.isFinite(outputDeltaPercent)&&
    outputDeltaPercent<(-5);

  const outputStable=
    Number.isFinite(outputDeltaPercent)&&
    Math.abs(outputDeltaPercent)<=5;

  const rpeDelta=
    delta(
      latest.averageRpe,
      previous.averageRpe,
    );

  const rirDelta=
    delta(
      latest.averageRir,
      previous.averageRir,
    );

  const effortWorse=
    (
      Number.isFinite(rpeDelta)&&
      rpeDelta>0.75
    )||
    (
      Number.isFinite(rirDelta)&&
      rirDelta<(-0.75)
    );

  const effortBetter=
    (
      Number.isFinite(rpeDelta)&&
      rpeDelta<(-0.75)
    )||
    (
      Number.isFinite(rirDelta)&&
      rirDelta>0.75
    );

  const evidence={
    comparableExposures:true,
    loadDirection:
      normalizedLoadDirection,
    loadComparable,
    loadContextChanged,
    loadDelta,
    loadDeltaPercent,
    outputMetric,
    outputDeltaPercent,
    rpeDelta,
    rirDelta,
    effortBetter,
    effortWorse,
  };

  /*
   * Different or missing load contexts must never be
   * interpreted from reps alone.
   */
  if(loadContextChanged){
    return exerciseAssessmentResult(
      'indeterminate',
      'low',
      'La referencia de carga cambió o no es comparable.',
      evidence,
    );
  }

  /*
   * Same load: output and effort can be interpreted
   * without assuming whether higher load is better.
   */
  if(loadStable){
    if(outputUp&&!effortWorse){
      return exerciseAssessmentResult(
        'progress',
        effortBetter?'high':'medium',
        outputMetric==='reps-per-set'
          ?'Más repeticiones por serie con carga equivalente y esfuerzo no peor.'
          :'Más tiempo por serie con carga equivalente y esfuerzo no peor.',
        evidence,
      );
    }

    if(outputDown&&!effortBetter){
      return exerciseAssessmentResult(
        'regression',
        effortWorse?'high':'medium',
        outputMetric==='reps-per-set'
          ?'Menos repeticiones por serie con carga equivalente sin una mejora compensatoria del esfuerzo.'
          :'Menos tiempo por serie con carga equivalente sin una mejora compensatoria del esfuerzo.',
        evidence,
      );
    }

    if(outputStable&&effortBetter){
      return exerciseAssessmentResult(
        'progress',
        'medium',
        'Rendimiento equivalente con menor esfuerzo percibido.',
        evidence,
      );
    }

    if(outputStable&&effortWorse){
      return exerciseAssessmentResult(
        'regression',
        'medium',
        'Rendimiento equivalente con mayor esfuerzo percibido.',
        evidence,
      );
    }

    if(outputStable){
      return exerciseAssessmentResult(
        'stable',
        'medium',
        'Rendimiento y esfuerzo se mantienen dentro de un rango equivalente.',
        evidence,
      );
    }

    return exerciseAssessmentResult(
      'indeterminate',
      'low',
      'Los cambios observados no permiten una conclusión robusta.',
      evidence,
    );
  }

  /*
   * Changing resistance/assistance requires explicit
   * exercise semantics. Never assume "more is better".
   */
  if(loadComparable&&!loadStable){
    if(normalizedLoadDirection==='unknown'){
      return exerciseAssessmentResult(
        'indeterminate',
        'low',
        'La carga cambió, pero este ejercicio todavía no define si una carga mayor o menor representa avance.',
        evidence,
      );
    }

    const semanticLoadDelta=
      normalizedLoadDirection===
        'higher-is-better'
        ?loadDelta
        :-loadDelta;

    if(semanticLoadDelta>0){
      const outputPreserved=
        !Number.isFinite(
          outputDeltaPercent,
        )||
        outputDeltaPercent>=(-10);

      if(outputPreserved&&!effortWorse){
        return exerciseAssessmentResult(
          'progress',
          Number.isFinite(
            outputDeltaPercent,
          )
            ?'high'
            :'medium',
          normalizedLoadDirection===
            'higher-is-better'
            ?'Mayor resistencia con rendimiento conservado y esfuerzo no claramente peor.'
            :'Menor asistencia con rendimiento conservado y esfuerzo no claramente peor.',
          evidence,
        );
      }

      return exerciseAssessmentResult(
        'indeterminate',
        'low',
        'La variable principal avanzó, pero cayó el rendimiento o aumentó demasiado el esfuerzo.',
        evidence,
      );
    }

    if(semanticLoadDelta<0){
      const outputNotCompensated=
        !Number.isFinite(
          outputDeltaPercent,
        )||
        outputDeltaPercent<=10;

      if(
        outputNotCompensated&&
        !effortBetter
      ){
        return exerciseAssessmentResult(
          'regression',
          Number.isFinite(
            outputDeltaPercent,
          )
            ?'high'
            :'medium',
          normalizedLoadDirection===
            'higher-is-better'
            ?'Menor resistencia sin una mejora compensatoria del rendimiento o del esfuerzo.'
            :'Mayor asistencia sin una mejora compensatoria del rendimiento o del esfuerzo.',
          evidence,
        );
      }

      return exerciseAssessmentResult(
        'indeterminate',
        'low',
        'La variable principal retrocedió, pero existen cambios compensatorios que impiden concluir regresión.',
        evidence,
      );
    }
  }

  /*
   * Bodyweight / unweighted timed or rep work.
   */
  if(
    !latestLoadKey&&
    !previousLoadKey
  ){
    if(outputUp&&!effortWorse){
      return exerciseAssessmentResult(
        'progress',
        effortBetter?'high':'medium',
        outputMetric==='reps-per-set'
          ?'Aumentaron las repeticiones por serie sin un empeoramiento claro del esfuerzo.'
          :'Aumentó el tiempo por serie sin un empeoramiento claro del esfuerzo.',
        evidence,
      );
    }

    if(outputDown&&!effortBetter){
      return exerciseAssessmentResult(
        'regression',
        effortWorse?'high':'medium',
        outputMetric==='reps-per-set'
          ?'Disminuyeron las repeticiones por serie sin una mejora compensatoria del esfuerzo.'
          :'Disminuyó el tiempo por serie sin una mejora compensatoria del esfuerzo.',
        evidence,
      );
    }

    if(outputStable&&effortBetter){
      return exerciseAssessmentResult(
        'progress',
        'medium',
        'Mismo rendimiento con menor esfuerzo percibido.',
        evidence,
      );
    }

    if(outputStable&&effortWorse){
      return exerciseAssessmentResult(
        'regression',
        'medium',
        'Mismo rendimiento con mayor esfuerzo percibido.',
        evidence,
      );
    }

    if(outputStable){
      return exerciseAssessmentResult(
        'stable',
        'medium',
        'El rendimiento se mantiene dentro del rango comparable.',
        evidence,
      );
    }
  }

  return exerciseAssessmentResult(
    'indeterminate',
    'low',
    'No hay suficiente información comparable para clasificar la evolución.',
    evidence,
  );
}
function sharedObservedNumber(value){
  return value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))
    ?Number(value):null;
}
function exercisePerformanceSharedLoad(load){
  if(!load){
    return null;
  }

  return Object.freeze({
    raw:load.raw??null,
    value:sharedObservedNumber(load.value),
    unit:load.unit??null,
    comparableKey:load.comparableKey??null,
  });
}

function exercisePerformanceSharedExposure(exposure){
  if(!exposure){
    return null;
  }

  const sharedSets=
    arr(exposure.sets)
      .map(
        (row)=>
          Object.freeze({
            setNumber:sharedObservedNumber(row?.setNumber),
            reps:sharedObservedNumber(row?.reps),
            seconds:sharedObservedNumber(row?.seconds),
            distanceKm:observedDistance(row?.distanceKm,1000),
            distanceM:observedDistance(row?.distanceM,100000),
            paceMinPerKm:observedPace(row?.paceMinPerKm),
            pacePer100M:observedPace(row?.pacePer100M),
            load:
              exercisePerformanceSharedLoad(row?.load),
            rpe:sharedObservedNumber(row?.rpe),
            rir:sharedObservedNumber(row?.rir),
          }),
      );

  const coverage=exposure.volumeCoverage||{};

  return Object.freeze({
    completedAt:exposure.completedAt||null,
    setCount:Number(exposure.setCount||0),
    sets:Object.freeze(sharedSets),
    lastLoad:exercisePerformanceSharedLoad(exposure.lastLoad),
    totalReps:Number.isFinite(exposure.totalReps)?exposure.totalReps:null,
    repsPerSet:Number.isFinite(exposure.repsPerSet)?exposure.repsPerSet:null,
    totalSeconds:Number.isFinite(exposure.totalSeconds)?exposure.totalSeconds:null,
    secondsPerSet:Number.isFinite(exposure.secondsPerSet)?exposure.secondsPerSet:null,
    averageRpe:Number.isFinite(exposure.averageRpe)?exposure.averageRpe:null,
    averageRir:Number.isFinite(exposure.averageRir)?exposure.averageRir:null,
    peakLoad:exercisePerformanceSharedLoad(exposure.peakLoad),
    volumeKg:Number.isFinite(exposure.volumeKg)?exposure.volumeKg:null,
    volumeCoverage:Object.freeze({
      complete:coverage.complete===true,
      coveredSets:Number(coverage.coveredSets||0),
      totalSets:Number(coverage.totalSets||0),
    }),
  });
}

export function projectExercisePerformanceForRole(
  memory,
  {
    role='client',
    viewerClientId=null,
    loadDirection='unknown',
  }={},
){
  const normalizedRole=String(role||'').trim().toLowerCase();

  if(!['client','coach','admin'].includes(normalizedRole)){
    throw new Error('ROLE_FORBIDDEN');
  }

  const ownerClientId=String(memory?.clientId||'').trim();

  if(!ownerClientId){
    throw new Error('CLIENT_SCOPE_REQUIRED');
  }

  if(normalizedRole==='client'){
    const safeViewerClientId=String(viewerClientId||'').trim();

    if(!safeViewerClientId||safeViewerClientId!==ownerClientId){
      throw new Error('CROSS_SCOPE_FORBIDDEN');
    }
  }

  const facts=Object.freeze({
    clientId:ownerClientId,
    exerciseId:memory?.exerciseId||null,
    exposureCount:Number(memory?.exposureCount||0),
    latest:exercisePerformanceSharedExposure(memory?.latest),
    previous:exercisePerformanceSharedExposure(memory?.previous),
    trend:buildExercisePerformanceTrend(memory),
    interpretation:'facts-only',
  });

  const coachAssessment=
    normalizedRole==='coach'||normalizedRole==='admin'
      ?assessExercisePerformance(memory,{loadDirection})
      :null;

  return Object.freeze({
    facts,
    coachAssessment,
  });
}

// Reconcile once for the complete exercise list: the same revision cannot
// manufacture additional exposures, and conflicting results stay excluded.
function exerciseEvidenceScope(state,clientId,now,{from=null,civilPeriod=false}={}){
  const end=safeDate(now),start=from===null?null:safeDate(from);
  const startDay=from===null?'0001-01-01':reportCivilDate(from),endDay=reportCivilDate(now);
  const blocked=blockedCompletionIds(state);
  const reconciliation=reconcileSessionExecutionsForClient(state,clientId);
  const eligible=record=>{
    const value=executionDate(record),date=safeDate(value);
    const inWindow=civilPeriod
      ?Boolean(startDay&&endDay&&isWithinCivilPeriod(value,startDay,endDay,now))
      :Boolean(end&&date&&date.getTime()<=end.getTime()&&
        (from===null||(start&&date.getTime()>=start.getTime())));
    return inWindow&&executionCompleted(record,{allowDatedFallback:false});
  };
  const confirmed=[],unconfirmed=[];
  for(const record of reconciliation.records){
    if(!eligible(record))continue;
    (executionConfirmed(record,blocked)?confirmed:unconfirmed).push(unwrap(record));
  }
  confirmed.sort((a,b)=>safeDate(executionDate(b)).getTime()-safeDate(executionDate(a)).getTime());
  return {confirmed,unconfirmed,conflicts:reconciliation.conflicts.filter(group=>group.some(eligible))};
}

export function listExercisePerformanceMemories(
  state,
  clientId,
  {limit=6,historyLimit=20,now=new Date(),from=null,civilPeriod=false}={},
){
  const safeClientId=String(
    clientId||'',
  ).trim();

  if(!safeClientId){
    return Object.freeze([]);
  }

  const safeLimit=
    Number.isInteger(Number(limit))
      ?Math.max(
          1,
          Math.min(Number(limit),50),
        )
      :6;

  const scope=exerciseEvidenceScope(state,safeClientId,now,{from,civilPeriod});
  const executions=scope.confirmed;

  const exerciseIds=[];
  const seen=new Set();

  outer:
  for(const execution of executions){
    for(const row of setRows(execution)){
      const exerciseId=String(
        first(
          row,
          'exerciseId',
          'exercise_id',
          'ejercicioId',
          'ejercicio_id',
        )||'',
      ).trim();

      if(!exerciseId||seen.has(exerciseId)){
        continue;
      }

      seen.add(exerciseId);
      exerciseIds.push(exerciseId);

      if(exerciseIds.length>=safeLimit){
        break outer;
      }
    }
  }

  const memories=exerciseIds
    .map(
      (exerciseId)=>
        buildScopedExercisePerformanceMemory(
          scope,
          safeClientId,
          exerciseId,
          historyLimit,
        ),
    )
    .filter(
      (memory)=>
        memory&&memory.exposureCount>0,
    );

  return Object.freeze(memories);
}
export function buildExercisePerformanceMemory(
  state,
  clientId,
  exerciseId,
  {limit=50,now=new Date(),from=null,civilPeriod=false}={},
){
  const safeClientId=String(
    clientId||'',
  ).trim();

  const safeExerciseId=String(
    exerciseId||'',
  ).trim();

  if(!safeClientId||!safeExerciseId){
    return null;
  }

  return buildScopedExercisePerformanceMemory(
    exerciseEvidenceScope(state,safeClientId,now,{from,civilPeriod}),safeClientId,safeExerciseId,limit);
}

function buildScopedExercisePerformanceMemory(scope,safeClientId,safeExerciseId,limit){
  const confirmed=scope.confirmed.map(execution=>exposureFrom(execution,safeExerciseId)).filter(Boolean);
  const excludedUnconfirmedExposures=scope.unconfirmed.filter(execution=>exposureFrom(execution,safeExerciseId)).length;
  const excludedConflictingExposures=scope.conflicts.filter(group=>group.some(execution=>
    exposureFrom(execution,safeExerciseId))).length;

  const safeLimit=
    Number.isInteger(Number(limit))
      ?Math.max(
          1,
          Math.min(
            Number(limit),
            500,
          ),
        )
      :50;

  const history=
    confirmed.slice(0,safeLimit);

  const latest=history[0]||null;
  const previous=history[1]||null;

  return Object.freeze({
    clientId:safeClientId,
    exerciseId:safeExerciseId,
    source:'sessionExecutions.results',
    exposureCount:confirmed.length,
    excludedUnconfirmedExposures,
    excludedConflictingExposures,
    latest,
    previous,
    history:Object.freeze(history),
    comparison:comparison(
      latest,
      previous,
    ),
    records:buildRecords(confirmed),
    missingReason:
      confirmed.length
        ?null
        :'no-confirmed-exposures',
  });
}
