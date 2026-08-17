export const MEDIA_TECHNICAL_ANALYTICS_SCHEMA_VERSION='iberfit.media-technical-analytics.v1';

const ALLOWED_EVENTS=new Set([
  'load_start',
  'metadata_ready',
  'ready',
  'play',
  'buffering',
  'stalled',
  'error',
  'ended',
  'retry',
  'rate_change',
  'pip_enter',
  'pip_exit',
  'network_online',
  'network_offline',
]);
const ALLOWED_STATES=new Set([
  'idle',
  'loading',
  'ready',
  'playing',
  'buffering',
  'error',
  'ended',
  'offline',
]);
const ALLOWED_NETWORKS=new Set(['online','offline','unknown']);
const ALLOWED_ERROR_CLASSES=new Set([
  'none',
  'aborted',
  'network',
  'decode',
  'source',
  'unsupported',
  'unknown',
]);
const ALLOWED_LATENCY_BUCKETS=new Set([
  'none',
  'lt_500ms',
  '500_1499ms',
  '1500_4999ms',
  'gte_5000ms',
]);

function enumValue(value,allowed,fallback){
  const key=String(value??'').trim().toLowerCase();
  return allowed.has(key)?key:fallback;
}

export function mediaLoadLatencyBucket(value){
  const ms=Number(value);
  if(!Number.isFinite(ms)||ms<0)return 'none';
  if(ms<500)return 'lt_500ms';
  if(ms<1500)return '500_1499ms';
  if(ms<5000)return '1500_4999ms';
  return 'gte_5000ms';
}

export function createExerciseMediaTechnicalAnalytics({limit=80}={}){
  const capacity=Math.min(200,Math.max(10,Number(limit)||80));
  const events=[];
  let sequence=0;

  function record(input={}){
    const eventType=enumValue(input.eventType,ALLOWED_EVENTS,null);
    if(!eventType)return null;
    const value=Object.freeze({
      schemaVersion:MEDIA_TECHNICAL_ANALYTICS_SCHEMA_VERSION,
      sequence:++sequence,
      eventType,
      assetKind:'video',
      state:enumValue(input.state,ALLOWED_STATES,'idle'),
      network:enumValue(input.network,ALLOWED_NETWORKS,'unknown'),
      errorClass:enumValue(input.errorClass,ALLOWED_ERROR_CLASSES,'none'),
      latencyBucket:enumValue(input.latencyBucket,ALLOWED_LATENCY_BUCKETS,'none'),
    });
    events.push(value);
    if(events.length>capacity)events.splice(0,events.length-capacity);
    return value;
  }

  function snapshot(){
    return Object.freeze({
      schemaVersion:MEDIA_TECHNICAL_ANALYTICS_SCHEMA_VERSION,
      storage:'memory-only',
      count:events.length,
      events:Object.freeze([...events]),
    });
  }

  function clear(){
    events.splice(0,events.length);
  }

  return Object.freeze({record,snapshot,clear});
}

export const __mediaTechnicalAnalyticsInternals=Object.freeze({
  ALLOWED_EVENTS,
  ALLOWED_STATES,
  ALLOWED_NETWORKS,
  ALLOWED_ERROR_CLASSES,
  ALLOWED_LATENCY_BUCKETS,
  enumValue,
});