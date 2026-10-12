/**
 * Connected360 workout evidence: pure, privacy-preserving reconciliation.
 *
 * Native Health Connect exercise windows are NOT automatically the same as a
 * coached session, even if their local times overlap. No synthetic metrics,
 * no cross-owner matching, no clinical claims and no automatic load change.
 * Persistence/consent/RLS belong to the separately certified server writer.
 */
export const SESSION_EVIDENCE_SCHEMA='iberfit.connected360.session-evidence.v1';
const MAX_HOURS=24,MIN_OVERLAP_MS=60_000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TYPE=new Set(['running','interval_running','hiit','cycling','walking','strength','other']);
const finite=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:null;
const instant=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/u.test(value)&&Number.isFinite(Date.parse(value))?Date.parse(value):null;
const freeze=value=>Object.freeze(value);

function timeWindow(row,fields){
  const start=instant(row?.[fields[0]]),end=instant(row?.[fields[1]]);
  return start!==null&&end!==null&&end>start&&end-start<=MAX_HOURS*3600_000
    ?freeze({start,end,durationMs:end-start}):null;
}
function normalizeMetrics(source={}){
  // Values without verified observation are missing, not inferred zeros.
  const distanceMeters=finite(source.distanceMeters,0,500000);
  const steps=finite(source.steps,0,250000);
  const hrCount=finite(source.heartRateSampleCount,0,200000);
  const hrAvg=finite(source.heartRateAvg,25,240);
  const hrMin=finite(source.heartRateMin,25,240);
  const hrMax=finite(source.heartRateMax,25,240);
  const calories=finite(source.caloriesKcal,0,20000);
  const inconsistent=hrMin!==null&&hrMax!==null&&hrMin>hrMax;
  return freeze({
    distanceMeters,steps,
    heartRateSampleCount:hrCount,heartRateAvg:hrAvg,
    heartRateMin:inconsistent?null:hrMin,
    heartRateMax:inconsistent?null:hrMax,
    caloriesKcal:calories,
  });
}
function normalizeWorkout(row,clientId){
  if(row?.clientId!==clientId||row.provider!=='health_connect'||row.originScope!=='exercise-session'
    ||typeof row.observationKey!=='string'||row.observationKey.length<8
    ||row.observationKey.length>160||!/^[A-Za-z0-9._:-]+$/u.test(row.observationKey))
    return null;
  const window=timeWindow(row,['startedAt','endedAt']);
  if(!window)return null;
  return freeze({
    observationKey:row.observationKey,provider:row.provider,clientId,
    mode:TYPE.has(row.mode)?row.mode:'other',window,
    // Native exercise windows are corroborating observations, not a coaching log.
    metrics:normalizeMetrics(row.metrics),
    sourceTimeVerified:row.sourceTimeVerified===true,
    originCount:finite(row.originCount,1,1000),
  });
}
function modeCompatible(a,b){
  if(!TYPE.has(a)||!TYPE.has(b))return false;
  if(a==='other'||b==='other')return true;
  if(a===b)return true;
  return (a==='running'&&b==='interval_running')||(a==='interval_running'&&b==='running');
}
function overlap(a,b){
  return Math.max(0,Math.min(a.end,b.end)-Math.max(a.start,b.start));
}

/**
 * @param {Object} params Data already authorized to the same client; no tokens
 * or raw heart-rate samples enter this function.
 * @returns candidate evidence. "candidate" is NEVER a confirmed match.
 */
export function correlateConnected360Workout({
  clientId,session,observations=[],now=new Date(),
}={}){
  if(!UUID.test(String(clientId||''))||session?.clientId!==clientId){
    return freeze({status:'denied',reason:'client-mismatch',candidates:freeze([])});
  }
  // A planned/scheduled session is NOT evidence that it took place.
  const sessionWindow=timeWindow(session,['startedAt','completedAt']);
  if(!sessionWindow){
    return freeze({status:'unconfirmed-session',reason:'actual-timestamps-required',candidates:freeze([])});
  }
  const nowMs=now instanceof Date?now.getTime():instant(now);
  if(!Number.isFinite(nowMs)||sessionWindow.end>nowMs+5*60_000){
    return freeze({status:'invalid-time',reason:'future-session',candidates:freeze([])});
  }
  const sessionMode=TYPE.has(session.mode)?session.mode:'other';
  const candidates=[],seen=new Set();
  for(const raw of Array.isArray(observations)?observations.slice(0,250):[]){
    const item=normalizeWorkout(raw,clientId);
    if(!item||seen.has(item.observationKey)||!modeCompatible(sessionMode,item.mode))continue;
    seen.add(item.observationKey);
    const shared=overlap(sessionWindow,item.window);
    if(shared<MIN_OVERLAP_MS)continue;
    const ofSession=shared/sessionWindow.durationMs;
    const ofWorkout=shared/item.window.durationMs;
    // Reject incidental crossing, e.g. 5 min of running during 75 min HIIT.
    if(ofSession<0.6||ofWorkout<0.6)continue;
    candidates.push(freeze({
      observationKey:item.observationKey,mode:item.mode,
      provider:item.provider,
      startAt:new Date(item.window.start).toISOString(),
      endAt:new Date(item.window.end).toISOString(),
      overlapSession:Math.round(ofSession*100)/100,
      overlapWorkout:Math.round(ofWorkout*100)/100,
      sourceTimeVerified:item.sourceTimeVerified,
      originCount:item.originCount,
      metrics:item.metrics,
      // min/km is observational only if meters were captured in the SAME
      // observed workout window, not in the all-day step count.
      paceSecPerKm:item.metrics.distanceMeters>0
        ?Math.round(item.window.durationMs/1000/(item.metrics.distanceMeters/1000)):null,
    }));
  }
  candidates.sort((a,b)=>
    (b.overlapSession+b.overlapWorkout)-(a.overlapSession+a.overlapWorkout));
  if(!candidates.length){
    return freeze({status:'no-evidence',reason:'no-matching-observation',candidates:freeze([])});
  }
  // Another watch/app, or two overlapping tracked workouts, can make
  // association ambiguous. Never silently choose a favorite source.
  const close=candidates.filter(x=>Math.abs(x.overlapSession+x.overlapWorkout-
      (candidates[0].overlapSession+candidates[0].overlapWorkout))<=0.15);
  if(close.length>1){
    return freeze({status:'ambiguous',reason:'multiple-overlapping-workouts',
      candidates:freeze(candidates)});
  }
  return freeze({
    status:'candidate',reason:'time-and-activity-overlap-not-verified',
    candidates:freeze(candidates),selected:candidates[0],
    // Requires explicit user verification before attaching to session result.
    userConfirmationRequired:true,
    automaticLoadChange:false,
    inferredRestingHeartRate:false,
  });
}

export function buildConnected360SessionEvidenceView(match){
  const base=freeze({
    state:match?.status||'no-evidence',
    safeForAutomaticPrescription:false,
    displayRestingHeartRate:null,
    message:'Los datos del reloj complementan la sesión; no sustituyen el registro del coach.',
  });
  if(match?.status!=='candidate'||!match.selected)return base;
  const metrics=match.selected.metrics;
  return freeze({
    ...base,
    state:'pending-confirmation',
    durationMinutes:Math.round((Date.parse(match.selected.endAt)-
      Date.parse(match.selected.startAt))/60000),
    distanceKm:metrics.distanceMeters===null?null:
      Math.round(metrics.distanceMeters/10)/100,
    paceSecondsPerKm:match.selected.paceSecPerKm,
    generalHeartRate:metrics.heartRateSampleCount>0?freeze({
      average:metrics.heartRateAvg,min:metrics.heartRateMin,
      max:metrics.heartRateMax,sampleCount:metrics.heartRateSampleCount,
      resting:false,
    }):null,
    steps:metrics.steps,caloriesKcal:metrics.caloriesKcal,
    signalQuality:match.selected.sourceTimeVerified?'source-time-known':'limited-provenance',
  });
}
