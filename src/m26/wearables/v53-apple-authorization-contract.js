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
