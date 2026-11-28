/**
 * Connected360 V45 candidate policy: deterministic, READ-ONLY decision layer.
 *
 * This function MUST only receive rows obtained from an authorized server query
 * after the transactional grant/revocation fence. It does not authorize a row,
 * write a database, certify a watch, or override the V45 QA insert blocker.
 *
 * Two data sources can observe the same activity. Never sum them.
 * If the source conflict cannot be resolved explicitly, expose a conflict,
 * not an invented fused metric or "most recent device" assertion.
 */
const FIELDS=Object.freeze({
  steps:Object.freeze({column:'steps',min:0,max:200000,integer:true}),
  activeMinutes:Object.freeze({column:'active_minutes',min:0,max:1440,integer:true}),
  sleepMinutes:Object.freeze({column:'sleep_minutes',min:0,max:1440,integer:true}),
  restingHeartRate:Object.freeze({column:'resting_heart_rate',min:25,max:240,integer:false}),
  hrvMs:Object.freeze({column:'hrv_ms',min:0,max:1000,integer:false}),
  activeEnergyKcal:Object.freeze({column:'active_energy_kcal',min:0,max:20000,integer:false}),
  workoutMinutes:Object.freeze({column:'workout_minutes',min:0,max:1440,integer:true}),
});
const PROVIDERS=new Set(['normalized_file','health_connect','samsung_health','apple_health','strava','garmin_connect','fitbit','oura']);
const DATE=/^\d{4}-\d{2}-\d{2}$/u;
const KEY=/^[0-9a-f]{64}$/u;
const ZONE=/^[A-Za-z0-9_.:+-]+(?:\/[A-Za-z0-9_.:+-]+)*$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MAX_ROWS=1000;

function instant(value,required=false){
  if(value===null||value===undefined){
    if(required)throw new Error('M26_V45_RECONCILIATION_TIMESTAMP_REQUIRED');
    return null;
  }
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))
    throw new Error('M26_V45_RECONCILIATION_TIMESTAMP_INVALID');
  return new Date(value).toISOString();
}
function civilDay(value){
  if(typeof value!=='string'||!DATE.test(value)||
    Number.isNaN(Date.parse(value+'T12:00:00Z'))||
    new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)
    throw new Error('M26_V45_RECONCILIATION_DATE_INVALID');
  return value;
}
function normalize(row,ownerId,clientId){
  if(!row||typeof row!=='object'||Array.isArray(row)||
    row.owner_user_id!==ownerId||row.client_id!==clientId||
    !PROVIDERS.has(row.provider)||typeof row.grant_id!=='string'||!UUID.test(row.grant_id)||
    !/^(0|[1-9]\d*)$/u.test(String(row.revocation_cursor))||
    row.automatic_sync_certified!==false||
    typeof row.source_time_verified!=='boolean'||
    !['alta','media','limitada'].includes(row.quality))
    throw new Error('M26_V45_RECONCILIATION_UNTRUSTED_ROW');

  const date=civilDay(row.record_date);
  const sourceKey=row.source_key??null;
  if(sourceKey!==null&&(typeof sourceKey!=='string'||!KEY.test(sourceKey)))
    throw new Error('M26_V45_RECONCILIATION_SOURCE_KEY_INVALID');
  const aggregationTimeZone=row.aggregation_time_zone??null;
  const sourceTimeZone=row.source_time_zone??null;
  if([aggregationTimeZone,sourceTimeZone].some(value=>
    value!==null&&(typeof value!=='string'||value.length>80||!ZONE.test(value))))
    throw new Error('M26_V45_RECONCILIATION_ZONE_INVALID');
  const acquiredAt=instant(row.acquired_at,true);
  const updatedAt=instant(row.source_updated_at);
  const measuredAt=instant(row.measured_at);
  if(!row.source_time_verified&&(updatedAt!==null||measuredAt!==null||row.quality!=='limitada'))
    throw new Error('M26_V45_RECONCILIATION_FABRICATED_TIME');
  if(row.source_time_verified&&updatedAt===null&&measuredAt===null)
    throw new Error('M26_V45_RECONCILIATION_SOURCE_TIME_MISSING');

  const values={};
  for(const [key,def] of Object.entries(FIELDS)){
    const val=row[def.column];
    if(val==null)continue;
    const n=typeof val==='number'?val:Number(val);
    if(typeof val==='string'&&!/^-?\d+(?:\.\d+)?$/u.test(val))
      throw new Error('M26_V45_RECONCILIATION_METRIC_INVALID');
    if(typeof val==='boolean'||typeof val==='object'||!Number.isFinite(n)||
      n<def.min||n>def.max||(def.integer&&!Number.isInteger(n)))
      throw new Error('M26_V45_RECONCILIATION_METRIC_INVALID');
    values[key]=n;
  }
  if(!Object.keys(values).length)throw new Error('M26_V45_RECONCILIATION_METRICS_EMPTY');

  // Unknown source key stays explicitly unknown, not a fabricated watch ID.
  // An official aggregate remains one candidate for this provider and date.
  const sourceRef=row.provider+':'+(sourceKey??'unknown');
  return Object.freeze({
    date,provider:row.provider,sourceRef,sourceKey,aggregationTimeZone,sourceTimeZone,values:Object.freeze(values),
    acquiredAt,updatedAt,measuredAt,sourceTimeVerified:row.source_time_verified,
    quality:row.quality,
  });
}
function newest(candidateRows){
  const ordered=[...candidateRows].sort((a,b)=>
    String(b.updatedAt??'').localeCompare(String(a.updatedAt??''))||
    b.acquiredAt.localeCompare(a.acquiredAt));
  const winner=ordered[0];
  // Compare ALL tied snapshots; checking only the runner-up could miss
  // a third divergent value with exactly the same revision/acquisition.
  if(ordered.some(item=>
    item.updatedAt===winner.updatedAt&&item.acquiredAt===winner.acquiredAt&&
    item.value!==winner.value))return null;
  return winner;
}

/**
 * @param {Array<object>} rows trusted V45-shaped DB rows, already scoped by backend
 * @param {object} options ownerId, clientId and optional explicit per-metric source choice
 * @returns {object} read-only view with unresolved conflicts surfaced by metric/day
 */
export function reconcileV45SourceDailyMetrics(rows,{ownerId,clientId,preferredSources={}}={}){
  if(!Array.isArray(rows)||rows.length>MAX_ROWS||
    typeof ownerId!=='string'||!UUID.test(ownerId)||
    typeof clientId!=='string'||!UUID.test(clientId)||
    !preferredSources||typeof preferredSources!=='object'||Array.isArray(preferredSources)||
    Object.keys(preferredSources).some(k=>!Object.hasOwn(FIELDS,k)||
      typeof preferredSources[k]!=='string'||preferredSources[k].length>100))
    throw new Error('M26_V45_RECONCILIATION_INPUT_INVALID');

  const trusted=rows.map(row=>normalize(row,ownerId,clientId));
  const days=new Map();
  for(const row of trusted){
    let group=days.get(row.date);
    if(!group){group=new Map();days.set(row.date,group);}
    for(const [metric,value] of Object.entries(row.values)){
      let candidates=group.get(metric);
      if(!candidates){candidates=[];group.set(metric,candidates);}
      candidates.push(Object.freeze({...row,value}));
    }
  }
  const results=[...days.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,metricGroups])=>{
    const metrics={},evidence={},conflicts=[];
    for(const metric of Object.keys(FIELDS)){
      const candidates=metricGroups.get(metric)||[];
      if(!candidates.length){metrics[metric]=null;continue;}
      const sources=new Map();
      for(const row of candidates){
        // Same origin with a different civil-day window is NOT the same
        // daily aggregate, even when record_date and source_key match.
        const windowRef=row.sourceRef+'@'+(row.aggregationTimeZone??'unknown');
        const bySource=sources.get(windowRef)||[];
        bySource.push(row);
        sources.set(windowRef,bySource);
      }
      const distinct=[...sources.entries()].map(([windowRef,list])=>({
        windowRef,sourceRef:list[0].sourceRef,candidate:newest(list),
      }));
      const preference=preferredSources[metric]||null;
      const selected=preference
        ?distinct.filter(x=>x.sourceRef===preference)
        :distinct;
      // No arbitrary priority: if there are multiple watches/providers or
      // duplicate divergent snapshots, the metric is unresolved.
      if(selected.length!==1||selected[0].candidate===null){
        metrics[metric]=null;
        conflicts.push(Object.freeze({
          metric,reason:preference?'preferred_source_missing_or_ambiguous'
            :new Set(distinct.map(x=>x.candidate?.aggregationTimeZone??null)).size>1
              ?'civil_zone_mismatch':'overlapping_sources',
          sourceCount:distinct.length,
        }));
        continue;
      }
      const chosen=selected[0].candidate;
      metrics[metric]=chosen.value;
      evidence[metric]=Object.freeze({
        provider:chosen.provider,
        aggregationTimeZone:chosen.aggregationTimeZone,
        sourceTimeZone:chosen.sourceTimeZone,
        sourceKnown:chosen.sourceKey!==null,
        sourceTimeVerified:chosen.sourceTimeVerified,
        measuredAt:chosen.measuredAt,
        sourceUpdatedAt:chosen.sourceTimeVerified?chosen.updatedAt:null,
        acquiredAt:chosen.acquiredAt,
        quality:chosen.quality,
        selection:preference?'explicit_source':'sole_source',
        automaticSyncCertified:false,
      });
    }
    return Object.freeze({
      date,metrics:Object.freeze(metrics),evidence:Object.freeze(evidence),
      conflicts:Object.freeze(conflicts),conflictFree:conflicts.length===0,
    });
  });
  return Object.freeze({
    days:Object.freeze(results),
    conflictDays:results.filter(r=>r.conflicts.length>0).length,
    automaticSyncCertified:false,
    persisted:false,
    authorizationChecked:false, // MUST revalidate grant/cursor inside writer's shared lock.
  });
}

export const V45_RECONCILIATION_METRICS=Object.freeze(Object.keys(FIELDS));


// Longitudinal exercise reconciliation: a separate projection over the same
// authorized evidence rows, not a second storage table or a provider writer.
// A stable provider record key identifies a replay, not a physical workout
// shared by two providers. Overlap is ambiguous: never fuse or delete it.
// Caller must provide the complete bounded period (never a partial page).
const EXERCISE_PROVIDERS=new Set(['health_connect','apple_health','strava','garmin_connect','fitbit','oura']);
const EXERCISE_SPORTS=new Set(['running','interval_running','hiit','cycling','walking','strength','swimming','other']);
const EXERCISE_DAY_FORMAT=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'});
const EXERCISE_LIMIT=4000;
function exerciseDay(ms){
  const parts=Object.fromEntries(EXERCISE_DAY_FORMAT.formatToParts(ms).map(p=>[p.type,p.value]));
  return parts.year+'-'+parts.month+'-'+parts.day;
}
const exerciseFail=()=>{throw Error('M26_CONNECTED360_EXERCISE_RECONCILIATION_INVALID');};
function exerciseInstant(v){
  // PostgreSQL serializes offsets and microseconds. Preserve the instant
  // for grouping, not the original source identifier. Reject invalid dates.
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(v))exerciseFail();
  civilDay(v.slice(0,10));
  const n=Date.parse(v);if(!Number.isFinite(n))exerciseFail();return n;
}
function exerciseNumber(v,max){
  if(v===undefined||v===null)return null;
  if(typeof v!=='number'&&(typeof v!=='string'||!/^\d+(?:\.\d+)?$/u.test(v)))exerciseFail();
  const n=Number(v);if(!Number.isFinite(n)||n<0||n>max)exerciseFail();return n;
}
export function reconcileConnected360ExercisePeriod(rows,{ownerId,clientId,periodStart,periodEnd,
  complete=false,now=new Date()}={}){
  if(!Array.isArray(rows)||rows.length>EXERCISE_LIMIT||!UUID.test(String(ownerId||''))
    ||!UUID.test(String(clientId||''))||typeof complete!=='boolean'
    ||!Number.isFinite(now?.getTime?.()))exerciseFail();
  const first=civilDay(periodStart),last=civilDay(periodEnd);
  if(first>last||last>exerciseDay(now.getTime())||
    (Date.parse(last+'T00:00:00Z')-Date.parse(first+'T00:00:00Z'))/86400000>365)exerciseFail();
  const records=new Map();
  for(const raw of rows){
    if(!raw||raw.owner_user_id!==ownerId||raw.client_id!==clientId
      ||!EXERCISE_PROVIDERS.has(raw.provider)||!EXERCISE_SPORTS.has(raw.sport)
      ||typeof raw.source_record_key!=='string'||!KEY.test(raw.source_record_key)
      ||!UUID.test(String(raw.grant_id||''))||!/^(0|[1-9]\d*)$/u.test(String(raw.revocation_cursor))
      ||raw.link_status!=='unlinked'||raw.quality!=='limitada'
      ||raw.source_identity_verified!==false||raw.automatic_sync_certified!==false)exerciseFail();
    const start=exerciseInstant(raw.observed_started_at),end=exerciseInstant(raw.observed_ended_at);
    if(end<=start||end-start>86400000||end>now.getTime())exerciseFail();
    const day=exerciseDay(start);
    if(day<first||day>last)exerciseFail();
    const distance=exerciseNumber(raw.distance_meters,500000);
    // Current V46 rows do not include active duration. Do not infer it
    // from elapsed time, and do not mix active and elapsed pace.
    const active=exerciseNumber(raw.active_seconds,(end-start)/1000+1);
    if(active===0)exerciseFail();
    const item=Object.freeze({provider:raw.provider,sport:raw.sport,start,end,day,distance,active,
      grant:raw.grant_id,cursor:String(raw.revocation_cursor)});
    const key=raw.provider+':'+raw.source_record_key;
    if(records.has(key)){
      if(JSON.stringify(records.get(key))!==JSON.stringify(item))exerciseFail();
      continue;
    }
    records.set(key,item);
  }
  const sorted=[...records.values()].sort((a,b)=>a.start-b.start||a.end-b.end||
    a.provider.localeCompare(b.provider)||a.sport.localeCompare(b.sport));
  const components=[];
  for(const item of sorted){
    const lastGroup=components.at(-1);
    if(lastGroup&&item.start<lastGroup.end){
      lastGroup.rows.push(item);lastGroup.end=Math.max(lastGroup.end,item.end);
    }else components.push({end:item.end,rows:[item]});
  }
  const days=new Set(),sports=new Map(),conflicts=[];
  const sportEntry=sport=>{
    if(!sports.has(sport))sports.set(sport,{observedDays:new Set(),unambiguous:0,ambiguous:0,
      distance:0,distanceCount:0,elapsed:0,active:0,activeCount:0});
    return sports.get(sport);
  };
  for(const group of components){
    for(const row of group.rows){days.add(row.day);sportEntry(row.sport).observedDays.add(row.day);}
    if(group.rows.length>1){
      const groupSports=[...new Set(group.rows.map(x=>x.sport))].sort((a,b)=>a.localeCompare(b));
      const groupDays=[...new Set(group.rows.map(x=>x.day))].sort((a,b)=>a.localeCompare(b));
      for(const sport of groupSports)sportEntry(sport).ambiguous+=1;
      conflicts.push(Object.freeze({days:Object.freeze(groupDays),sports:Object.freeze(groupSports),
        providers:Object.freeze([...new Set(group.rows.map(x=>x.provider))].sort((a,b)=>a.localeCompare(b))),
        reason:'overlapping_observations'}));
      continue;
    }
    const row=group.rows[0],entry=sportEntry(row.sport);entry.unambiguous+=1;
    entry.elapsed+=(row.end-row.start)/1000;
    if(row.distance!==null){entry.distance+=row.distance;entry.distanceCount+=1;}
    if(row.active!==null){entry.active+=row.active;entry.activeCount+=1;}
  }
  const result=[...sports.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([sport,entry])=>{
    const full=complete&&entry.ambiguous===0&&entry.unambiguous>0;
    return Object.freeze({sport,observedDays:entry.observedDays.size,
      unambiguousObservations:entry.unambiguous,ambiguousGroups:entry.ambiguous,
      // Only complete non-overlapping evidence may expose aggregate volumes.
      // Partial or conflicted evidence must not look like a total.
      elapsedSeconds:full?entry.elapsed:null,
      activeSeconds:full&&entry.activeCount===entry.unambiguous?entry.active:null,
      distanceMeters:full&&entry.distanceCount===entry.unambiguous?entry.distance:null});
  });
  return Object.freeze({periodStart:first,periodEnd:last,coverage:complete?'complete-input':'partial-input',
    observedDays:days.size,disciplines:Object.freeze(result),conflicts:Object.freeze(conflicts),
    interpretation:'observed-external-evidence-only',persisted:false,authorizationChecked:false,
    automaticPlanChange:false});
}
