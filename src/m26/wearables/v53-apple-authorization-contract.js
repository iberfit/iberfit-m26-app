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


// QA candidate coordinator, deliberately not mounted by the application.
// The future native adapter must correlate each page to its one-shot local
// request. The raw HealthKit UUID, user IDs and JWT never cross into Swift.
// A page cursor is opaque, ephemeral and scoped to the current grant.
export function createAppleExerciseCandidateSync({
 transport,native,getIdentity,getToken,canRun,now=()=>Date.now(),
}={}){
 if(typeof transport?.connected360AppleCandidateStatus!=='function'
 ||typeof transport?.importConnected360AppleCandidate!=='function'
 ||typeof native?.readCandidatePage!=='function'||typeof getIdentity!=='function'
 ||typeof getToken!=='function'||typeof canRun!=='function'||typeof now!=='function')
  throw Error('M26_V54_APPLE_SYNC_DEPENDENCIES');
 let generation=0,dead=false,pending=null,sweep=null;
 function identity(){
  const v=getIdentity();
  if(v?.role!=='client'||!grant(v.ownerId)||!grant(v.clientId))throw Error('M26_V54_APPLE_CLIENT_REQUIRED');
  return {ownerId:v.ownerId,clientId:v.clientId};
 }
 const same=(a,b)=>a.ownerId===b.ownerId&&a.clientId===b.clientId;
 function check(owner,lease,signal){
  if(dead||lease!==generation||signal?.aborted||!canRun())throw Error('M26_V54_APPLE_SYNC_INVALIDATED');
  if(!same(owner,identity()))throw Error('M26_V54_APPLE_OWNER_CHANGED');
 }
 async function tokenFor(owner,lease,signal){
  check(owner,lease,signal);
  const token=await getToken();check(owner,lease,signal);
  if(typeof token!=='string'||token.length<10)throw Error('M26_V54_APPLE_SESSION_REQUIRED');
  return token;
 }
 async function runPage({signal=null}={}){
  if(dead)throw Error('M26_V54_APPLE_SYNC_INVALIDATED');
  if(!canRun()||signal?.aborted)return Object.freeze({skipped:'inactive'});
  const owner=identity(),lease=generation;
  if(pending){
   if(!same(pending.owner,owner))throw Error('M26_V54_APPLE_OWNER_CHANGED');
   return pending.promise;
  }
  const run=async()=>{
   const status=verifyAppleExerciseStatus(await transport.connected360AppleCandidateStatus(
    await tokenFor(owner,lease,signal),{signal}));
   check(owner,lease,signal);
   if(!status.authorized){sweep=null;return Object.freeze({skipped:status.reason});}
   const binding=JSON.stringify([owner.ownerId,owner.clientId,status.grantId,status.revocationCursor]);
   if(sweep?.binding!==binding)sweep={binding,days:30,cursor:null,seen:new Set()};
   const current=sweep;
   let page;
   try{page=await native.readCandidatePage({days:current.days,cursor:current.cursor,signal});}
   catch(error){
    if(lease===generation&&sweep===current&&error?.message==='M26_V54_APPLE_CURSOR_INVALID')sweep=null;
    throw error;
   }
   check(owner,lease,signal);
   if(!shape(page,['schema','provider','days','cursor','nextCursor','acquiredAt','records','readPermissionStatus','persisted'])
   ||page.schema!=='iberfit.connected360.v54.apple.page.v1'||page.provider!=='apple_health'
   ||page.days!==current.days||page.cursor!==current.cursor||page.persisted!==false
   ||page.readPermissionStatus!=='not_disclosed'||!Array.isArray(page.records)||page.records.length>20
   ||(page.nextCursor!==null&&(!grant(page.nextCursor)||page.nextCursor===current.cursor||current.seen.has(page.nextCursor)))){
    sweep=null;throw Error('M26_V54_APPLE_PAGE_INVALID');
   }
   const nextCursor=page.nextCursor;
   // Reject unbounded/cyclic history even if a malformed bridge returns
   // endlessly unique tokens. Restart only after an explicit future trigger.
   if(nextCursor!==null&&current.seen.size>=59){sweep=null;throw Error('M26_V54_APPLE_PAGE_LIMIT');}
   const acquired=instant(page.acquiredAt),at=now();
   if(!Number.isFinite(at)||!Number.isFinite(acquired)||acquired<at-1200000||acquired>at+300000)importFail();
   const payload={schema:'iberfit.connected360.v54.apple.ingest.v1',acquiredAt:page.acquiredAt,exerciseEvidence:page.records};
   // Freeze and validate the page before any subsequent async boundary.
   const params=page.records.length?appleExerciseImportParams(status,payload,{at}):null;
   const fresh=verifyAppleExerciseStatus(await transport.connected360AppleCandidateStatus(
    await tokenFor(owner,lease,signal),{signal}));
   check(owner,lease,signal);
   if(!fresh.authorized||fresh.grantId!==status.grantId||fresh.revocationCursor!==status.revocationCursor){
    sweep=null;throw Error('M26_V54_APPLE_CONSENT_CHANGED');
   }
   let receipt=null;
   if(params){
    receipt=verifyAppleExerciseImportReceipt(await transport.importConnected360AppleCandidate(
     await tokenFor(owner,lease,signal),fresh,params.p_payload,{signal}),params);
    check(owner,lease,signal);
   }
   // Never retain health payloads or advance a cursor on uncertain ACK.
   // Empty pages do not prove OS permission or absence of activity.
   if(nextCursor===null)sweep={binding,days:7,cursor:null,seen:new Set()};
   else sweep={binding,days:current.days,cursor:nextCursor,seen:new Set([...current.seen,nextCursor])};
   return Object.freeze({ok:true,provider:'apple_health',workoutHistoryPending:nextCursor!==null,
    inserted:receipt?.inserted??0,updated:receipt?.updated??0,unchanged:receipt?.unchanged??0,
    observedRows:params?.p_payload.exerciseEvidence.length??0,readPermissionStatus:'not_disclosed',
    automaticSyncCertified:false});
  };
  const promise=run().finally(()=>{if(pending?.promise===promise)pending=null;});
  pending={owner,promise};
  return promise;
 }
 function invalidate(){generation++;sweep=null;pending=null;native.invalidate?.();}
 function destroy(){if(dead)return;dead=true;invalidate();}
 return Object.freeze({runPage,invalidate,destroy});
}
