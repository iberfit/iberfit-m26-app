import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SESSION_EVIDENCE_SCHEMA,
  correlateConnected360Workout,
  buildConnected360SessionEvidenceView,
} from '../src/m26/wearables/session-evidence.js';

const CLIENT='44444444-4444-4444-8444-444444444444';
const OTHER='55555555-5555-4555-8555-555555555555';
const start='2026-10-11T11:00:00.000Z';
const end='2026-10-11T11:50:00.000Z';
const now=new Date('2026-10-12T00:00:00Z');
const session=(extra={})=>({
  id:'11111111-1111-4111-8111-111111111111',
  clientId:CLIENT,startedAt:start,completedAt:end,mode:'running',...extra,
});
const observation=(extra={})=>({
  clientId:CLIENT,provider:'health_connect',originScope:'exercise-session',
  observationKey:'health-app.record-x',mode:'running',startedAt:start,endedAt:end,
  sourceTimeVerified:true,
  metrics:{
    distanceMeters:10000,steps:9000,heartRateAvg:151,
    heartRateMin:110,heartRateMax:182,heartRateSampleCount:320,caloriesKcal:620,
  },...extra,
});
function match(s=session(),items=[observation()]){
  return correlateConnected360Workout({clientId:CLIENT,session:s,observations:items,now});
}

test('schema identifies separate workout evidence; exact 10 km in 50 min yields 5 min/km',()=>{
  assert.equal(SESSION_EVIDENCE_SCHEMA,'iberfit.connected360.session-evidence.v1');
  const m=match(),v=buildConnected360SessionEvidenceView(m);
  assert.equal(m.status,'candidate');
  assert.equal(m.userConfirmationRequired,true);
  assert.equal(m.automaticLoadChange,false);
  assert.equal(v.state,'pending-confirmation');
  assert.equal(v.durationMinutes,50);
  assert.equal(v.distanceKm,10);
  assert.equal(v.paceSecondsPerKm,300);
  assert.equal(v.generalHeartRate.average,151);
  assert.equal(v.generalHeartRate.sampleCount,320);
  assert.equal(v.generalHeartRate.resting,false);
  assert.equal(v.displayRestingHeartRate,null);
  assert.equal(v.safeForAutomaticPrescription,false);
});

test('HIIT exposes min/max pulse data, never invents resting HR, zones or interval splits',()=>{
  const s=session({mode:'hiit'});
  const h=observation({
    mode:'hiit',
    metrics:{heartRateSampleCount:7821,heartRateAvg:155,heartRateMin:79,heartRateMax:197},
  });
  const v=buildConnected360SessionEvidenceView(match(s,[h]));
  assert.equal(v.generalHeartRate.sampleCount,7821);
  assert.equal(v.generalHeartRate.max,197);
  assert.equal(v.distanceKm,null);
  assert.equal(v.paceSecondsPerKm,null);
  assert.equal(v.displayRestingHeartRate,null);
  assert.equal('heartRateZones' in v,false);
  assert.equal(v.safeForAutomaticPrescription,false);
});

test('missing distance or valid heart-rate sample count stays missing, never becomes zero',()=>{
  const m=match(session(),[observation({metrics:{heartRateAvg:75,distanceMeters:null,steps:0}})]);
  const v=buildConnected360SessionEvidenceView(m);
  assert.equal(v.distanceKm,null);
  assert.equal(v.paceSecondsPerKm,null);
  assert.equal(v.generalHeartRate,null);
  assert.equal(v.steps,0);
});

test('different authenticated client cannot associate even with identical device time',()=>{
  const m=correlateConnected360Workout({
    clientId:OTHER,session:session(),observations:[observation({clientId:OTHER})],now,
  });
  assert.equal(m.status,'denied');
  assert.equal(m.candidates.length,0);
  assert.equal(match(session(),[observation({clientId:OTHER})]).status,'no-evidence');
});

test('scheduled but not performed sessions cannot absorb passive wearable observations',()=>{
  const m=match(session({startedAt:null,completedAt:null,scheduledAt:start}));
  assert.equal(m.status,'unconfirmed-session');
});

test('multiple overlapping watches/apps never silently choose one',()=>{
  const a=observation(),b=observation({observationKey:'other-health-app.abc',metrics:{distanceMeters:10200}});
  const m=match(session(),[a,b]);
  assert.equal(m.status,'ambiguous');
  assert.equal(m.selected,undefined);
  assert.equal(buildConnected360SessionEvidenceView(m).state,'ambiguous');
});

test('repeating the same Health Connect record key is idempotent',()=>{
  const a=observation();
  const m=match(session(),[a,a]);
  assert.equal(m.status,'candidate');
  assert.equal(m.candidates.length,1);
});

test('minor incidental overlap cannot attach to a long coached session',()=>{
  const a=observation({
    startedAt:'2026-10-11T11:45:00.000Z',
    endedAt:'2026-10-11T12:10:00.000Z',
  });
  const m=match(session(),[a]);
  assert.equal(m.status,'no-evidence');
});

test('unknown device source cannot impersonate Health Connect',()=>{
  assert.equal(match(session(),[observation({provider:'garmin_connect'})]).status,'no-evidence');
  assert.equal(match(session(),[observation({originScope:'daily-steps'})]).status,'no-evidence');
});

test('unrelated sport and running session are not matched just by time',()=>{
  assert.equal(match(session(),[observation({mode:'cycling'})]).status,'no-evidence');
});

test('one exercise observation may have imperfect overlap but cannot be automatically confirmed',()=>{
  const m=match(session(),[observation({
    startedAt:'2026-10-11T11:03:00.000Z',
    endedAt:'2026-10-11T11:47:00.000Z',
  })]);
  assert.equal(m.status,'candidate');
  assert.equal(m.selected.overlapSession,0.88);
  assert.equal(m.userConfirmationRequired,true);
});

test('corrupt, future or multi-day timestamps fail closed',()=>{
  assert.equal(match(session({completedAt:'2026-10-14T12:00:00Z'})).status,'unconfirmed-session');
  assert.equal(match(session({startedAt:'2026-10-11T23:00:00Z',completedAt:'2026-10-12T01:00:00Z'})).status,'invalid-time');
  assert.equal(match(session(),[observation({startedAt:'invalid'})]).status,'no-evidence');
});

test('impossible heart-rate range is not portrayed as a valid physiological range',()=>{
  const m=match(session(),[observation({metrics:{heartRateSampleCount:200,heartRateMin:202,heartRateMax:45}})]);
  const v=buildConnected360SessionEvidenceView(m);
  assert.equal(v.generalHeartRate.min,null);
  assert.equal(v.generalHeartRate.max,null);
  assert.equal(v.generalHeartRate.sampleCount,200);
});

test('unverified source time leaves limited quality and is not treated as verified device time',()=>{
  const m=match(session(),[observation({sourceTimeVerified:false})]);
  const v=buildConnected360SessionEvidenceView(m);
  assert.equal(v.signalQuality,'limited-provenance');
});

test('input is not mutated by correlation and report projection',()=>{
  const item=observation(),s=session(),before=structuredClone({item,s});
  buildConnected360SessionEvidenceView(match(s,[item]));
  assert.deepEqual({item,s},before);
});
