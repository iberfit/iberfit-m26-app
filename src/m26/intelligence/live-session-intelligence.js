export const LIVE_SESSION_INTELLIGENCE_SCHEMA_VERSION=
  'iberfit.live-session-intelligence.v1';

export const LIVE_SESSION_RECOVERY_WINDOW_MS=60*1000;
export const LIVE_SESSION_TIMELINE_MAX_POINTS=72;

const CANONICAL_SCHEMA='iberfit.telemetry.v1';
const NON_INTERPRETABLE_CODES=new Set([
  'acquiring',
  'poor_contact',
  'stale',
  'out_of_range',
  'disconnected',
  'unsupported',
]);

function finite(value){
  const number=Number(value);
  return Number.isFinite(number)?number:null;
}
function round1(value){
  const number=finite(value);
  return number===null?null:Math.round(number*10)/10;
}
function safeTime(value){
  const time=value?new Date(value).getTime():NaN;
  return Number.isFinite(time)?time:null;
}
function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}
function eventHeartRate(event){
  return finite(event?.raw?.heartRateBpm);
}
function isCanonicalHeartRateEvent(event){
  return Boolean(
    event&&
    event.schemaVersion===CANONICAL_SCHEMA&&
    event.eventType==='heart_rate_sample'&&
    eventHeartRate(event)!==null&&
    safeTime(event.recordedAt||event.receivedAt)!==null
  );
}
function isInterpretableEvent(event){
  if(!isCanonicalHeartRateEvent(event))return false;
  const code=String(event?.quality?.code||'').trim().toLowerCase();
  return !NON_INTERPRETABLE_CODES.has(code);
}
function sortedEvents(execution){
  const events=Array.isArray(execution?.liveTelemetry?.timeline?.events)
    ?execution.liveTelemetry.timeline.events
    :[];
  return [...events]
    .filter(isCanonicalHeartRateEvent)
    .sort((a,b)=>
      safeTime(a.recordedAt||a.receivedAt)-
      safeTime(b.recordedAt||b.receivedAt)
    );
}
function stats(events=[]){
  const values=events
    .map(eventHeartRate)
    .filter((value)=>value!==null);
  if(!values.length){
    return deepFreeze({
      sampleCount:0,
      averageBpm:null,
      minBpm:null,
      maxBpm:null,
      firstBpm:null,
      latestBpm:null,
      firstAt:null,
      latestAt:null,
    });
  }
  const sum=values.reduce((total,value)=>total+value,0);
  return deepFreeze({
    sampleCount:values.length,
    averageBpm:round1(sum/values.length),
    minBpm:Math.min(...values),
    maxBpm:Math.max(...values),
    firstBpm:values[0],
    latestBpm:values.at(-1),
    firstAt:events[0]?.recordedAt||events[0]?.receivedAt||null,
    latestAt:events.at(-1)?.recordedAt||events.at(-1)?.receivedAt||null,
  });
}
function boundedPoints(events,maxPoints){
  const safeMax=Math.max(
    2,
    Math.min(
      240,
      Number.isInteger(Number(maxPoints))
        ?Number(maxPoints)
        :LIVE_SESSION_TIMELINE_MAX_POINTS
    )
  );
  if(!events.length)return [];
  const selected=[];
  if(events.length<=safeMax){
    selected.push(...events);
  }else{
    const used=new Set();
    for(let index=0;index<safeMax;index+=1){
      const sourceIndex=Math.round(
        index*(events.length-1)/(safeMax-1)
      );
      if(used.has(sourceIndex))continue;
      used.add(sourceIndex);
      selected.push(events[sourceIndex]);
    }
  }
  return selected.map((event)=>deepFreeze({
    at:event.recordedAt||event.receivedAt,
    bpm:round1(eventHeartRate(event)),
    phase:event?.context?.phase||null,
    blockId:event?.context?.blockId||null,
    exerciseId:event?.context?.exerciseId||null,
    setNumber:Number.isFinite(Number(event?.context?.setNumber))
      ?Number(event.context.setNumber)
      :null,
    qualityGrade:event?.quality?.grade||'limitada',
    qualityCode:event?.quality?.code||null,
    interpretable:isInterpretableEvent(event),
  }));
}
function groupedWorkResponses(events){
  const groups=new Map();
  for(const event of events){
    if(event?.context?.phase!=='work')continue;
    const blockId=event?.context?.blockId||null;
    const exerciseId=event?.context?.exerciseId||null;
    const key=`${blockId||''}|${exerciseId||''}`;
    if(!groups.has(key)){
      groups.set(key,{blockId,exerciseId,events:[]});
    }
    groups.get(key).events.push(event);
  }
  return [...groups.values()]
    .map((group)=>{
      const summary=stats(group.events);
      return deepFreeze({
        blockId:group.blockId,
        exerciseId:group.exerciseId,
        ...summary,
      });
    })
    .sort((a,b)=>
      (safeTime(a.latestAt)||0)-(safeTime(b.latestAt)||0)
    );
}
function restSegments(events,recoveryWindowMs){
  const rest=events.filter((event)=>event?.context?.phase==='rest');
  const segments=[];
  let current=null;
  for(const event of rest){
    const at=safeTime(event.recordedAt||event.receivedAt);
    const blockId=event?.context?.blockId||null;
    const exerciseId=event?.context?.exerciseId||null;
    const setNumber=Number.isFinite(Number(event?.context?.setNumber))
      ?Number(event.context.setNumber)
      :null;
    const key=`${blockId||''}|${exerciseId||''}|${setNumber??''}`;
    const gap=current&&at!==null
      ?at-current.lastAt
      :null;
    if(
      !current||
      current.key!==key||
      gap===null||
      gap>recoveryWindowMs+30000
    ){
      current={
        key,
        blockId,
        exerciseId,
        setNumber,
        events:[],
        lastAt:at,
      };
      segments.push(current);
    }
    current.events.push(event);
    current.lastAt=at;
  }
  return segments;
}
function recoverySummaries(events,recoveryWindowMs){
  return restSegments(events,recoveryWindowMs)
    .map((segment)=>{
      const first=segment.events[0];
      const startAt=safeTime(first?.recordedAt||first?.receivedAt);
      const within=segment.events.filter((event)=>{
        const at=safeTime(event.recordedAt||event.receivedAt);
        return at!==null&&startAt!==null&&at<=startAt+recoveryWindowMs;
      });
      const latest=within.at(-1)||first;
      const latestAt=safeTime(latest?.recordedAt||latest?.receivedAt);
      const startBpm=eventHeartRate(first);
      const latestBpm=eventHeartRate(latest);
      const elapsedSeconds=
        startAt!==null&&latestAt!==null
          ?Math.max(0,Math.round((latestAt-startAt)/1000))
          :0;
      const available=within.length>=2&&elapsedSeconds>0;
      const dropBpm=available
        ?round1(startBpm-latestBpm)
        :null;
      const changeBpm=available
        ?round1(latestBpm-startBpm)
        :null;
      return deepFreeze({
        available,
        blockId:segment.blockId,
        exerciseId:segment.exerciseId,
        setNumber:segment.setNumber,
        startAt:first?.recordedAt||first?.receivedAt||null,
        latestAt:latest?.recordedAt||latest?.receivedAt||null,
        startBpm:round1(startBpm),
        latestBpm:round1(latestBpm),
        elapsedSeconds,
        sampleCount:within.length,
        dropBpm,
        changeBpm,
        direction:
          !available||changeBpm===0
            ?'flat'
            :changeBpm<0
              ?'down'
              :'up',
        method:'first_rest_sample_minus_latest_within_60s',
      });
    })
    .sort((a,b)=>
      (safeTime(a.latestAt)||0)-(safeTime(b.latestAt)||0)
    );
}
function setCorrelations(execution,events){
  const results=Object.values(execution?.results||{})
    .filter((item)=>item&&item.exerciseId&&item.setNumber)
    .sort((a,b)=>
      (safeTime(a.completedAt)||0)-(safeTime(b.completedAt)||0)
    );
  return results.map((result)=>{
    const matching=events.filter((event)=>
      event?.context?.phase==='work'&&
      event?.context?.exerciseId===result.exerciseId&&
      Number(event?.context?.setNumber)===Number(result.setNumber)
    );
    return deepFreeze({
      exerciseId:result.exerciseId,
      setNumber:Number(result.setNumber),
      completedAt:result.completedAt||null,
      rpe:finite(result.rpe),
      rir:result.rir===null||result.rir===undefined
        ?null
        :finite(result.rir),
      heartRate:stats(matching),
      joinMethod:'exerciseId+setNumber',
    });
  });
}
function qualitySummary(events){
  const counts={alta:0,media:0,limitada:0};
  let excludedFromDerived=0;
  for(const event of events){
    const grade=String(event?.quality?.grade||'limitada');
    counts[grade]=(counts[grade]||0)+1;
    if(!isInterpretableEvent(event))excludedFromDerived+=1;
  }
  return deepFreeze({
    totalEvents:events.length,
    alta:Number(counts.alta||0),
    media:Number(counts.media||0),
    limitada:Number(counts.limitada||0),
    excludedFromDerived,
    latestGrade:events.at(-1)?.quality?.grade||null,
    latestCode:events.at(-1)?.quality?.code||null,
  });
}

export function deriveLiveSessionIntelligence(
  execution,
  {
    maxTimelinePoints=LIVE_SESSION_TIMELINE_MAX_POINTS,
    recoveryWindowMs=LIVE_SESSION_RECOVERY_WINDOW_MS,
  }={}
){
  const rawEvents=sortedEvents(execution);
  const interpretable=rawEvents.filter(isInterpretableEvent);
  const overall=stats(interpretable);
  const responses=groupedWorkResponses(interpretable);
  const recoveries=recoverySummaries(
    interpretable,
    Math.max(
      5000,
      Math.min(
        5*60*1000,
        Number(recoveryWindowMs)||LIVE_SESSION_RECOVERY_WINDOW_MS
      )
    )
  );
  const correlations=setCorrelations(execution,interpretable);
  const latest=interpretable.at(-1)||null;
  const live=execution?.liveTelemetry||{};

  return deepFreeze({
    schemaVersion:LIVE_SESSION_INTELLIGENCE_SCHEMA_VERSION,
    available:Boolean(rawEvents.length||live.heartRateBpm!==null),
    rawEventCount:rawEvents.length,
    interpretableEventCount:interpretable.length,
    currentHeartRateBpm:
      overall.latestBpm??
      round1(live.heartRateBpm),
    averageHeartRateBpm:
      overall.averageBpm??
      round1(live.averageHeartRateBpm),
    maxHeartRateBpm:
      overall.maxBpm??
      round1(live.maxHeartRateBpm),
    minHeartRateBpm:
      overall.minBpm??
      round1(live.minHeartRateBpm),
    latestAt:
      overall.latestAt||
      live.latestAt||
      null,
    source:deepFreeze({
      provider:
        latest?.source?.provider||
        live.provider||
        null,
      providerLabel:live.providerLabel||null,
      deviceType:latest?.source?.deviceType||null,
      transport:latest?.source?.transport||null,
    }),
    quality:qualitySummary(rawEvents),
    timeline:deepFreeze({
      points:boundedPoints(interpretable,maxTimelinePoints),
      rawEventCount:rawEvents.length,
      interpretableEventCount:interpretable.length,
    }),
    responseByBlockExercise:responses,
    latestResponse:responses.at(-1)||null,
    recoveryDuringRest:recoveries,
    latestRecovery:recoveries.at(-1)||null,
    setCorrelations:correlations,
    latestSetCorrelation:correlations.at(-1)||null,
    methodology:deepFreeze({
      heartRate:
        'media, mínimo y máximo sobre eventos canónicos interpretables retenidos en el timeline local',
      qualityFilter:
        'acquiring, poor_contact, stale, out_of_range, disconnected y unsupported se conservan en raw pero se excluyen de métricas derivadas',
      recovery:
        'primer valor del descanso menos el último valor disponible dentro de los primeros 60 segundos; sin clasificación clínica',
      rpeRirCorrelation:
        'unión por exerciseId y setNumber con resultados registrados por la persona',
    }),
    decisionPolicy:deepFreeze({
      automaticPrescriptionChanges:false,
      clinicalClassification:false,
      coachDecisionRequired:true,
      rule:'dato → contexto → entrenador decide',
    }),
  });
}

export const __liveSessionIntelligenceInternals=deepFreeze({
  isCanonicalHeartRateEvent,
  isInterpretableEvent,
  stats,
  boundedPoints,
  groupedWorkResponses,
  recoverySummaries,
  setCorrelations,
});