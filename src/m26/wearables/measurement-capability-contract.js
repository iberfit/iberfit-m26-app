// Forward-compatible metadata; never a source of permission or clinical truth.
// New entries stay future-only until independent native, server and user consent gates pass.
export const CONNECTED360_RELEASED_V46_SCOPES=Object.freeze([
  'generalHeartRate','exerciseSessions',
]);
export const CONNECTED360_PRODUCTION_DAILY_SCOPES=Object.freeze(['steps','sleepMinutes','restingHeartRate']);
export const CONNECTED360_PRODUCTION_SCOPES=Object.freeze([
  ...CONNECTED360_RELEASED_V46_SCOPES,...CONNECTED360_PRODUCTION_DAILY_SCOPES,
]);
const definitions=[
  ['steps','steps','production-v47','day','observed'],
  ['sleepMinutes','minutes','production-v47','sleep-window','observed'],
  ['restingHeartRate','bpm','production-v47','day','observed'],
  ['generalHeartRate','bpm','production-v46','day-window','observed'],
  ['exerciseSessions','sessions','production-v46','exercise-window','observed'],
  ['runningDistance','meters','future','exercise-window','observed'],
  ['runningPace','seconds-per-kilometer','future','exercise-window','derived'],
  ['runningCadence','steps-per-minute','future','exercise-window','observed'],
  ['runningElevation','meters','future','exercise-window','observed'],
  ['runningIntervals','intervals','future','exercise-window','observed'],
  ['trainingLoad','source-dependent','future','training-session','derived'],
  ['recoveryContext','source-dependent','future','recovery-window','derived'],
  ['heartRateVariability','milliseconds','future','recovery-window','observed'],
  ['cyclingPower','watts','future','exercise-window','observed'],
  ['swimDistance','meters','future','exercise-window','observed'],
];
export const CONNECTED360_METRIC_CATALOGUE=Object.freeze(Object.fromEntries(
  definitions.map(([id,unit,stage,window,provenance])=>[
    id,Object.freeze({id,unit,stage,window,provenance}),
  ]),
));
export function evaluateConnected360V46Scope(metric,{
  explicitConsent=[],osPermission=[],releaseEnabled=false,
}={}){
  const entry=CONNECTED360_METRIC_CATALOGUE[metric];
  if(!entry)return Object.freeze({allowed:false,reason:'unknown-metric'});
  if(!['production-v46','production-v47'].includes(entry.stage))return Object.freeze({
    allowed:false,reason:'requires-independent-release',
  });
  if(!releaseEnabled)return Object.freeze({allowed:false,reason:'release-disabled'});
  if(!explicitConsent.includes(metric))return Object.freeze({
    allowed:false,reason:'client-consent-required',
  });
  if(!osPermission.includes(metric))return Object.freeze({
    allowed:false,reason:'os-permission-required',
  });
  return Object.freeze({allowed:true,reason:'authorized'});
}
