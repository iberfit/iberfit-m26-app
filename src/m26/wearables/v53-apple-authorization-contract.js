// Candidate-only Apple server authorization contract. No OS permission
// inference, persistence, automatic reauthorization or transport activation.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const reasons=new Set(['release-disabled','connection-blocked','scope-conflict','consent-required','authorized']);
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const cursor=v=>Number.isSafeInteger(v)&&v>=0;
const grant=v=>typeof v==='string'&&UUID.test(v);
const exercise=v=>Array.isArray(v)&&v.length===1&&v[0]==='exerciseSessions';
const fail=()=>{throw Error('M26_V53_APPLE_AUTH_RESPONSE_INVALID');};
export function verifyAppleExerciseStatus(v){
 if(!shape(v,['ok','provider','serverEnabled','authorized','reason','grantId','revocationCursor','scopes'])
 ||v.ok!==true||v.provider!=='apple_health'||typeof v.serverEnabled!=='boolean'||typeof v.authorized!=='boolean'
 ||!reasons.has(v.reason)||!cursor(v.revocationCursor)||(v.grantId!==null&&!grant(v.grantId))
 ||v.serverEnabled!==(v.reason!=='release-disabled')||v.authorized!==(v.reason==='authorized')
 ||(v.authorized?(!grant(v.grantId)||!exercise(v.scopes)):(!Array.isArray(v.scopes)||v.scopes.length!==0))
 ||(v.reason==='scope-conflict'&&!grant(v.grantId)))fail();
 return Object.freeze({...v,scopes:Object.freeze([...v.scopes])});
}
export function appleExerciseConsentParams(status,{confirmed=false}={}){
 const v=verifyAppleExerciseStatus(status);
 if(confirmed!==true||!v.serverEnabled||!['authorized','consent-required'].includes(v.reason))throw Error('M26_V53_APPLE_EXPLICIT_CONSENT_REQUIRED');
 return Object.freeze({p_expected_grant:v.grantId,p_expected_cursor:v.revocationCursor,p_confirmed:true});
}
export function verifyAppleExerciseConsentReceipt(v,params){
 if(!shape(v,['ok','provider','grantId','revocationCursor','scopes','alreadyAuthorized'])
 ||!shape(params,['p_expected_grant','p_expected_cursor','p_confirmed'])
 ||params.p_confirmed!==true||!cursor(params.p_expected_cursor)||(params.p_expected_grant!==null&&!grant(params.p_expected_grant))
 ||v.ok!==true||v.provider!=='apple_health'||!grant(v.grantId)||v.revocationCursor!==params.p_expected_cursor
 ||!exercise(v.scopes)||typeof v.alreadyAuthorized!=='boolean'
 ||(v.alreadyAuthorized?v.grantId!==params.p_expected_grant:v.grantId===params.p_expected_grant))fail();
 return Object.freeze({...v,scopes:Object.freeze([...v.scopes])});
}

// Candidate workout-only transport. No native/UI caller or automatic retry.
const workoutSports=new Set(['running','cycling','walking','strength','hiit','swimming','other']);
const key=/^[0-9a-f]{64}$/u;
function instant(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/u.test(v))return NaN;
 const n=Date.parse(v);
 return Number.isFinite(n)&&new Date(n).toISOString()===(v.length===20?v.slice(0,-1)+'.000Z':v)?n:NaN;
}
const importFail=()=>{throw Error('M26_V54_APPLE_IMPORT_CONTRACT_INVALID');};
export function appleExerciseImportParams(status,payload,{at=Date.now()}={}){
 const v=verifyAppleExerciseStatus(status);
 if(!v.authorized||!Number.isFinite(at)||!shape(payload,['schema','acquiredAt','exerciseEvidence'])
 ||payload.schema!=='iberfit.connected360.v54.apple.ingest.v1'||!Array.isArray(payload.exerciseEvidence)
 ||payload.exerciseEvidence.length<1||payload.exerciseEvidence.length>20)importFail();
 const acquired=instant(payload.acquiredAt);
 if(!Number.isFinite(acquired)||acquired<at-1200000||acquired>at+300000)importFail();
 const seen=new Set();
 const rows=payload.exerciseEvidence.map(r=>{
  if(!shape(r,['observationKey','sport','startedAt','endedAt','activeSeconds','distanceMeters'])
  ||typeof r.observationKey!=='string'||!key.test(r.observationKey)||seen.has(r.observationKey)||!workoutSports.has(r.sport))importFail();
  const start=instant(r.startedAt),end=instant(r.endedAt),elapsed=(end-start)/1000;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<acquired-31*86400000||end>acquired+5000||elapsed<=0||elapsed>86400
  ||typeof r.activeSeconds!=='number'||!Number.isFinite(r.activeSeconds)||r.activeSeconds<=0||r.activeSeconds>elapsed+1
  ||(r.distanceMeters!==null&&(typeof r.distanceMeters!=='number'||!Number.isFinite(r.distanceMeters)||r.distanceMeters<0||r.distanceMeters>500000)))importFail();
  seen.add(r.observationKey);return Object.freeze({...r});
 });
 return Object.freeze({p_grant_id:v.grantId,p_payload:Object.freeze({...payload,exerciseEvidence:Object.freeze(rows)})});
}
export function verifyAppleExerciseImportReceipt(v,params){
 const count=params?.p_payload?.exerciseEvidence?.length;
 if(!Number.isInteger(count)||count<1||count>20||!shape(v,['ok','provider','persisted','inserted','updated','unchanged','sourceIdentityVerified','automaticSyncCertified'])
 ||v.ok!==true||v.provider!=='apple_health'||v.persisted!==true||v.sourceIdentityVerified!==false||v.automaticSyncCertified!==false
 ||![v.inserted,v.updated,v.unchanged].every(n=>Number.isSafeInteger(n)&&n>=0)||v.inserted+v.updated+v.unchanged!==count)importFail();
 return Object.freeze({...v});
}
