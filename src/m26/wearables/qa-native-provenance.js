/**
 * Connected 360 Android Canary: epistemically honest daily provenance.
 *
 * This is intentionally distinct from V44 persistence. Health Connect's
 * daily aggregate has a civil date and an IBERFIT acquisition instant;
 * this QA bridge does NOT receive source event times, source revisions,
 * physical device identity or the source's IANA time zone. The phone's
 * aggregation time zone is available independently of sensor/source time.
 *
 * The legacy V44 importer requires sourceUpdatedAt. Its compatibility
 * projection is allowed ONLY at the final authorized RPC boundary.
 * Never use that compatibility field to claim sensor freshness.
 */
const SCHEMA='iberfit.connected360.qa.provenance.v45.preview';
const PROVIDER='health_connect';
const METRICS=Object.freeze(['steps','sleepMinutes','restingHeartRate']);
const CIVIL_DATE=/^\d{4}-\d{2}-\d{2}$/u;
const AGGREGATION_ZONE=/^[A-Za-z0-9_.:+-]+(?:\/[A-Za-z0-9_.:+-]+)*$/u;

function verifiedAggregationZone(value){
  if(value===null||value===undefined)return null;
  if(typeof value!=='string'||value.length<1||value.length>80||
    !AGGREGATION_ZONE.test(value))
    throw new Error('M26_HEALTH_QA_PROVENANCE_INVALID');
  // This names the Android aggregation window; it never proves the sensor zone.
  return value;
}

function hasValidAggregationZone(value){
  try{return verifiedAggregationZone(value)===(value??null);}
  catch{return false;}
}

function canonicalInstant(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/u.test(value))
    throw new Error('M26_HEALTH_QA_PROVENANCE_INVALID');
  const timestamp=Date.parse(value);
  if(!Number.isFinite(timestamp))
    throw new Error('M26_HEALTH_QA_PROVENANCE_INVALID');
  return new Date(timestamp).toISOString();
}

export function createQaNativeDailyRecord({clientId,date,metrics,acquiredAt,aggregationTimeZone=null}={}){
  if(typeof clientId!=='string'||!clientId||
    typeof date!=='string'||!CIVIL_DATE.test(date)||
    Number.isNaN(Date.parse(date+'T12:00:00Z'))||
    new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||
    !metrics||typeof metrics!=='object'||Array.isArray(metrics)||
    !Object.keys(metrics).length||
    Object.keys(metrics).some(key=>!METRICS.includes(key)||
      !Number.isInteger(metrics[key])||metrics[key]<0||
      (key==='steps'&&metrics[key]>200000)||
      (key==='sleepMinutes'&&metrics[key]>1440)||
      (key==='restingHeartRate'&&(metrics[key]<25||metrics[key]>240))))
    throw new Error('M26_HEALTH_QA_PROVENANCE_INVALID');

  return Object.freeze({
    clientId,provider:PROVIDER,date,
    metrics:Object.freeze({...metrics}),
    quality:'limitada',
    sourceRecordCount:1, // One aggregate/day; never assert one sensor event.
    provenance:Object.freeze({
      schema:SCHEMA,
      acquiredAt:canonicalInstant(acquiredAt),
      measuredAt:null, // Unknown: never fabricate 12:00 UTC.
      sourceUpdatedAt:null, // Unknown: not the acquisition instant.
      sourceIdentity:null, // No per-device provenance in this QA transport.
      timeZone:null, // Original sensor/source timezone still unknown.
      aggregationTimeZone:verifiedAggregationZone(aggregationTimeZone), // Phone civil-day window.
      aggregation:'daily',
      sourceTimestampVerified:false,
      automaticSyncCertified:false,
    }),
  });
}

export function projectQaNativeRecordToV44(record){
  const provenance=record?.provenance;
  if(record?.provider!==PROVIDER||
    record?.quality!=='limitada'||
    record?.sourceRecordCount!==1||
    provenance?.schema!==SCHEMA||
    provenance?.measuredAt!==null||
    provenance?.sourceUpdatedAt!==null||
    provenance?.sourceIdentity!==null||
    provenance?.timeZone!==null||
    !hasValidAggregationZone(provenance?.aggregationTimeZone)||
    provenance?.aggregation!=='daily'||
    provenance?.sourceTimestampVerified!==false||
    provenance?.automaticSyncCertified!==false)
    throw new Error('M26_HEALTH_QA_PROVENANCE_UNVERIFIED');

  const acquiredAt=canonicalInstant(provenance.acquiredAt);
  // V44 transport only. The target database column is named
  // source_updated_at but contains the QA aggregate acquisition time.
  // Nothing in the V45 preview claims it was a source measurement time.
  return Object.freeze({
    clientId:record.clientId,
    provider:PROVIDER,
    date:record.date,
    metrics:Object.freeze({...record.metrics}),
    sourceUpdatedAt:acquiredAt,
    sourceRecordCount:1,
    quality:'limitada',
  });
}

export const CONNECTED360_QA_PROVENANCE_SCHEMA=SCHEMA;
