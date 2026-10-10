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
