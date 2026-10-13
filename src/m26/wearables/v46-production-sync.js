// Connected 360 production: foreground-only, owner-scoped, remote-consent-first.
// The signed Android host ONLY reads health data. The authenticated website
// holds the JWT and submits aggregates to the server after verifying the grant.
// No raw GPS, no device identity inference, no local health queue.
import {CONNECTED360_PRODUCTION_SCOPES} from './measurement-capability-contract.js';
export const V46_PROD_SCOPES=CONNECTED360_PRODUCTION_SCOPES;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const METRICS=new Set(V46_PROD_SCOPES);
function same(a,b){return a?.role==='client'&&b?.role==='client'&&a?.ownerId===b?.ownerId&&a?.clientId===b?.clientId;}
function scoped(scopes){return Array.isArray(scopes)&&scopes.length>0&&scopes.length<=METRICS.size
  &&new Set(scopes).size===scopes.length&&scopes.every(x=>METRICS.has(x));}
export function createConnected360ProductionSync({
  transport,native,getIdentity,getToken,
  isOnline=()=>globalThis.navigator?.onLine!==false,
  now=()=>Date.now(),refreshState=async()=>{},
}={}){
  if(!transport||typeof transport.connected360ProductionAuthorizationStatus!=='function'
    ||typeof native?.readLocal!=='function'
    ||typeof getIdentity!=='function'||typeof getToken!=='function')
    throw new Error('M26_V46_PROD_DEPENDENCIES_MISSING');
  let dead=false,inflight=null,generation=0,lastSuccess=null;
  function owner(){
    if(dead)throw new Error('M26_V46_PROD_DISPOSED');
    const a=getIdentity()||{};
    const result={role:a.role,ownerId:String(a.ownerId||''),clientId:String(a.clientId||'')};
    if(result.role!=='client'||!UUID.test(result.ownerId)||!UUID.test(result.clientId))
      throw new Error('M26_V46_PROD_CLIENT_REQUIRED');
    return result;
  }
  function assertCurrent(expected,version,signal){
    if(signal?.aborted||version!==generation||dead)
      throw new Error('M26_V46_PROD_ABORTED');
    if(!same(expected,owner()))throw new Error('M26_V46_PROD_OWNER_CHANGED');
  }
  async function getTokenFor(expected,version,signal){
    const token=await getToken();
    assertCurrent(expected,version,signal);
    if(typeof token!=='string'||token.length<10)
      throw new Error('M26_V46_PROD_SESSION_REQUIRED');
    return token;
  }
  async function availability(){
    const version=generation,expected=owner();
    const token=await getTokenFor(expected,version);
    const flags=await transport.connected360ProductionCapabilities(token);
    assertCurrent(expected,version);
    return flags;
  }
  async function authorize(scopes){
    if(!scoped(scopes))throw new Error('M26_V46_PROD_SCOPES_INVALID');
    if(!isOnline())throw new Error('M26_V46_PROD_OFFLINE');
    const version=generation,expected=owner();
    const token=await getTokenFor(expected,version);
    const flags=await transport.connected360ProductionCapabilities(token);
    assertCurrent(expected,version);
    if(flags.serverEnabled!==true)throw new Error('M26_V46_PROD_NOT_ACTIVATED');
    const old=await transport.connected360ProductionAuthorizationStatus(token);
    assertCurrent(expected,version);
    if(!Number.isSafeInteger(old?.revocationCursor)||old.revocationCursor<0
      ||(old.grantId!=null&&!UUID.test(String(old.grantId))))
      throw new Error('M26_V46_PROD_AUTHORIZATION_UNKNOWN');
    const grant=await transport.authorizeConnected360Production(token,{
      expectedGrant:old.grantId||null,expectedCursor:old.revocationCursor,
      scopes,
    });
    assertCurrent(expected,version);
    await refreshState({reason:'connected360-prod-consent'});
    assertCurrent(expected,version);
    return grant;
  }
  async function sync({signal=null}={}){
    if(inflight?.generation===generation)return inflight.promise;
    if(!isOnline())return Object.freeze({skipped:'offline'});
    const operation=(async()=>{
      const version=generation,expected=owner();
      const token=await getTokenFor(expected,version,signal);
      const flags=await transport.connected360ProductionCapabilities(token);
      assertCurrent(expected,version,signal);
      if(flags.serverEnabled!==true)return Object.freeze({skipped:'release-disabled'});
      const status=await transport.connected360ProductionAuthorizationStatus(token,'health_connect');
      assertCurrent(expected,version,signal);
      const scopes=V46_PROD_SCOPES.filter(x=>status?.scopes?.includes(x));
      if(status?.authorized!==true||!UUID.test(String(status.grantId||''))
        ||!scopes.length)return Object.freeze({skipped:'consent-required'});
      const read=await native.readLocal({metrics:scopes});
      assertCurrent(expected,version,signal);
      if(read.ownerId!==expected.ownerId||read.clientId!==expected.clientId
        ||read.provider!=='health_connect'||read.persisted!==false)
        throw new Error('M26_V46_PROD_NATIVE_OWNER_MISMATCH');
      const granted=read.metrics.filter(x=>scopes.includes(x));
      if(!granted.length)return Object.freeze({skipped:'android-permission-required'});
      // Never store pulse fields under an exercise-only scope even if the
      // phone still carries an old OS heart rate permission.
      const pulseEnabled=granted.includes('generalHeartRate');
      const exEnabled=granted.includes('exerciseSessions');
      const rows={
        schema:'iberfit.connected360.v46.ingest.v1',
        heartRateDaily:pulseEnabled?read.envelope.heartRateDaily:[],
        exerciseEvidence:exEnabled?read.envelope.exerciseEvidence.map(x=>{
          if(pulseEnabled)return x;
          const {heartRateSamples,avgBpm,minBpm,maxBpm,...clean}=x;
          return clean;
        }):[],
      };
      const dailyHealth=read.envelope.dailyHealth||[];
      if(!rows.heartRateDaily.length&&!rows.exerciseEvidence.length&&!dailyHealth.length)
        return Object.freeze({skipped:'no-recent-observations'});
      const fresh=await transport.connected360ProductionAuthorizationStatus(
        await getTokenFor(expected,version,signal)
      );
      assertCurrent(expected,version,signal);
      if(fresh.authorized!==true||fresh.grantId!==status.grantId
        ||fresh.revocationCursor!==status.revocationCursor
        ||granted.some(x=>!fresh.scopes?.includes(x)))
        throw new Error('M26_V46_PROD_CONSENT_REVOKED');
      const results=[];
      if(rows.heartRateDaily.length||rows.exerciseEvidence.length){
        results.push(await transport.importConnected360Production(
          await getTokenFor(expected,version,signal),status.grantId,rows
        ));
        assertCurrent(expected,version,signal);
      }
      if(dailyHealth.length){
        if(typeof transport.importConnected360DailyProduction!=='function')
          throw new Error('M26_V47_DAILY_IMPORT_UNAVAILABLE');
        results.push(await transport.importConnected360DailyProduction(
          await getTokenFor(expected,version,signal),status.grantId,dailyHealth
        ));
        assertCurrent(expected,version,signal);
      }
      lastSuccess=now();
      await refreshState({reason:'connected360-prod-foreground'});
      return Object.freeze({ok:true,automatic:true,
        inserted:results.reduce((n,r)=>n+r.inserted,0),
        updated:results.reduce((n,r)=>n+r.updated,0),
        unchanged:results.reduce((n,r)=>n+r.unchanged,0),
        metrics:Object.freeze([...granted])});
    })();
    inflight={generation,promise:operation};
    try{return await operation;}finally{if(inflight?.promise===operation)inflight=null;}
  }
  function invalidate(){
    generation+=1;
    // A resumed foreground request must not reuse the obsolete promise.
    inflight=null;
    native.invalidate?.();
  }
  function destroy(){if(dead)return;dead=true;invalidate();native.destroy?.();}
  return Object.freeze({availability,authorize,sync,invalidate,destroy,
    get lastSuccess(){return lastSuccess;}});
}
