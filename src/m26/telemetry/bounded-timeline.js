import {CANONICAL_TELEMETRY_SCHEMA_VERSION} from './canonical-telemetry.js';

export const DEFAULT_TELEMETRY_TIMELINE_MAX_EVENTS=7200;
export const DEFAULT_TELEMETRY_TIMELINE_MAX_AGE_MS=6*60*60*1000;

function safeInteger(value,{min,max,fallback}){
  const number=Number(value);
  return Number.isInteger(number)&&number>=min&&number<=max
    ?number
    :fallback;
}
function eventTime(event){
  const value=new Date(event?.receivedAt||event?.recordedAt||0).getTime();
  return Number.isFinite(value)?value:null;
}
function validCanonicalEvent(event){
  return Boolean(
    event&&
    event.schemaVersion===CANONICAL_TELEMETRY_SCHEMA_VERSION&&
    event.eventId&&
    event.clientId&&
    event.sessionId&&
    event.executionId&&
    event.raw&&
    Number.isFinite(Number(event.raw.heartRateBpm))
  );
}

export function createBoundedTelemetryTimeline({
  maxEvents=DEFAULT_TELEMETRY_TIMELINE_MAX_EVENTS,
  maxAgeMs=DEFAULT_TELEMETRY_TIMELINE_MAX_AGE_MS,
}={}){
  return {
    maxEvents:safeInteger(
      maxEvents,
      {min:1,max:20000,fallback:DEFAULT_TELEMETRY_TIMELINE_MAX_EVENTS}
    ),
    maxAgeMs:safeInteger(
      maxAgeMs,
      {min:60000,max:24*60*60*1000,fallback:DEFAULT_TELEMETRY_TIMELINE_MAX_AGE_MS}
    ),
    events:[],
    acceptedCount:0,
    rejectedCount:0,
    evictedCount:0,
    latestRecordedAt:null,
    latestReceivedAt:null,
  };
}

export function markTelemetryTimelineRejected(timeline,count=1){
  if(!timeline)throw new Error('M26_TELEMETRY_TIMELINE_REQUIRED');
  const amount=safeInteger(count,{min:1,max:10000,fallback:1});
  timeline.rejectedCount=Number(timeline.rejectedCount||0)+amount;
  return timeline;
}

export function appendCanonicalTelemetryEvent(
  timeline,
  event,
  {now=Date.now()}={}
){
  if(!timeline)throw new Error('M26_TELEMETRY_TIMELINE_REQUIRED');

  if(!validCanonicalEvent(event)){
    markTelemetryTimelineRejected(timeline);
    return Object.freeze({
      accepted:false,
      reason:'M26_TELEMETRY_EVENT_INVALID',
      evicted:0,
    });
  }

  const referenceMs=Number.isFinite(Number(now))
    ?Number(now)
    :Date.now();
  const cutoff=referenceMs-Number(timeline.maxAgeMs||0);
  let evicted=0;

  if(cutoff>0&&timeline.events.length){
    const retained=[];
    for(const current of timeline.events){
      const time=eventTime(current);
      if(time!==null&&time<cutoff){
        evicted+=1;
      }else{
        retained.push(current);
      }
    }
    timeline.events=retained;
  }

  timeline.events.push(event);
  timeline.acceptedCount=Number(timeline.acceptedCount||0)+1;

  if(timeline.events.length>timeline.maxEvents){
    const overflow=timeline.events.length-timeline.maxEvents;
    timeline.events.splice(0,overflow);
    evicted+=overflow;
  }

  timeline.evictedCount=Number(timeline.evictedCount||0)+evicted;
  timeline.latestRecordedAt=event.recordedAt||timeline.latestRecordedAt||null;
  timeline.latestReceivedAt=event.receivedAt||timeline.latestReceivedAt||null;

  return Object.freeze({
    accepted:true,
    reason:null,
    evicted,
  });
}

export function telemetryTimelineSummary(timeline){
  if(!timeline){
    return Object.freeze({
      eventCount:0,
      acceptedCount:0,
      rejectedCount:0,
      evictedCount:0,
      latestRecordedAt:null,
      latestReceivedAt:null,
      maxEvents:DEFAULT_TELEMETRY_TIMELINE_MAX_EVENTS,
      maxAgeMs:DEFAULT_TELEMETRY_TIMELINE_MAX_AGE_MS,
    });
  }

  return Object.freeze({
    eventCount:Array.isArray(timeline.events)?timeline.events.length:0,
    acceptedCount:Number(timeline.acceptedCount||0),
    rejectedCount:Number(timeline.rejectedCount||0),
    evictedCount:Number(timeline.evictedCount||0),
    latestRecordedAt:timeline.latestRecordedAt||null,
    latestReceivedAt:timeline.latestReceivedAt||null,
    maxEvents:Number(timeline.maxEvents||DEFAULT_TELEMETRY_TIMELINE_MAX_EVENTS),
    maxAgeMs:Number(timeline.maxAgeMs||DEFAULT_TELEMETRY_TIMELINE_MAX_AGE_MS),
  });
}

export const __boundedTelemetryInternals=Object.freeze({
  validCanonicalEvent,
  eventTime,
  safeInteger,
});