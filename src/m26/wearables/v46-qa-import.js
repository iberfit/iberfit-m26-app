// Canary V46 consented import: local native data -> authenticated QA RPC.
// No automatic uploads, no IndexedDB health queue and no Android-side tokens.
const PROVIDER='health_connect';
const SCHEMA='iberfit.connected360.qa.v46.explicit.v1';
const MAX_AGE_MS=20*60*1000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const pulseFields=new Set(['heartRateSamples','avgBpm','minBpm','maxBpm']);
const frozen=x=>Object.freeze(x);
const same=(a,b)=>a?.role==='client'&&b?.role==='client'
  &&String(a.ownerId||'')===String(b.ownerId||'')
  &&String(a.clientId||'')===String(b.clientId||'');

export function createConnected360V46QaImporter({
  transport,remoteSync,getIdentity,getToken,
  isOnline=()=>globalThis.navigator?.onLine!==false,
  now=()=>Date.now(),refreshState=async()=>{},
}={}){
  if(typeof transport?.importConnected360QaV46!=='function'
    ||typeof remoteSync?.reauthorize!=='function'
    ||typeof remoteSync?.currentAuthorization!=='function'
    ||typeof getIdentity!=='function'||typeof getToken!=='function'
    ||typeof isOnline!=='function')
    throw new Error('M26_V46_QA_IMPORT_DEPENDENCIES_REQUIRED');
  let pending=null,disposed=false,busy=false;
  const requireClient=()=>{
    if(disposed)throw new Error('M26_V46_QA_DISPOSED');
    const value=getIdentity();
    if(value?.role!=='client'||!UUID.test(String(value.clientId||''))
      ||!UUID.test(String(value.ownerId||'')))
      throw new Error('M26_V46_QA_CLIENT_REQUIRED');
    return {role:'client',ownerId:String(value.ownerId),clientId:String(value.clientId)};
  };
  const current=(original)=>{
    if(!same(original,requireClient()))
      throw new Error('M26_V46_QA_SESSION_CHANGED');
    if(disposed||pending!==original.pending)
      throw new Error('M26_V46_QA_PREVIEW_INVALIDATED');
  };
  function clear(){pending=null;}
  function capture(read){
    if(busy)throw new Error('M26_V46_QA_BUSY');
    clear();
    const identity=requireClient();
    if(read?.provider!==PROVIDER||read.persisted!==false||read.automatic!==false
      ||read.linked!==false||read.ownerId!==identity.ownerId
      ||read.clientId!==identity.clientId||read.envelope?.schema!==SCHEMA
      ||!Array.isArray(read.envelope?.heartRateDaily)
      ||!Array.isArray(read.envelope?.exerciseEvidence)
      ||!Array.isArray(read.metrics)||read.metrics.length>2)
      throw new Error('M26_V46_QA_PREVIEW_INVALID');
    const granted=[...new Set(read.metrics)];
    if(granted.some(s=>!['generalHeartRate','exerciseSessions'].includes(s))
      ||(read.envelope.heartRateDaily.length&&!granted.includes('generalHeartRate'))
      ||(read.envelope.exerciseEvidence.length&&!granted.includes('exerciseSessions')))
      throw new Error('M26_V46_QA_PREVIEW_SCOPE_INVALID');
    if(!read.envelope.heartRateDaily.length&&!read.envelope.exerciseEvidence.length)
      throw new Error('M26_V46_QA_PREVIEW_EMPTY');
    const stamp=now();
    if(!Number.isFinite(stamp))throw new Error('M26_V46_QA_CLOCK_INVALID');
    const records=[...read.envelope.heartRateDaily,...read.envelope.exerciseEvidence];
    if(records.some(x=>{
      const at=Date.parse(x?.acquiredAt||'');
      return !Number.isFinite(at)||at>stamp+5*60*1000||stamp-at>MAX_AGE_MS;
    }))throw new Error('M26_V46_QA_PREVIEW_EXPIRED');
    // Capture an isolated, shallow copy. Input already passed strict native
    // channel allowlist validation before arriving here.
    const envelope=frozen({
      schema:SCHEMA,
      heartRateDaily:frozen(read.envelope.heartRateDaily.map(r=>frozen({...r}))),
      exerciseEvidence:frozen(read.envelope.exerciseEvidence.map(r=>frozen({...r}))),
    });
    pending=frozen({...identity,envelope,granted:frozen(granted),capturedAt:stamp});
    return frozen({
      generalHeartRate:envelope.heartRateDaily.length,
      exerciseSessions:envelope.exerciseEvidence.length,
      persisted:false,
    });
  }

  async function commit({generalHeartRate=false,exerciseSessions=false}={}){
    if(generalHeartRate!==true&&exerciseSessions!==true)
      throw new Error('M26_V46_QA_EXPLICIT_CONSENT_REQUIRED');
    if(busy)throw new Error('M26_V46_QA_BUSY');
    const snapshot=pending;
    if(!snapshot)throw new Error('M26_V46_QA_PREVIEW_REQUIRED');
    if(!isOnline())throw new Error('M26_V46_QA_ONLINE_REQUIRED');
    const owner={role:'client',ownerId:snapshot.ownerId,clientId:snapshot.clientId,pending:snapshot};
    current(owner);
    const scopes=[
      ...(generalHeartRate?['generalHeartRate']:[]),
      ...(exerciseSessions?['exerciseSessions']:[]),
    ];
    if(scopes.some(s=>!snapshot.granted.includes(s)))
      throw new Error('M26_V46_QA_UNGRANTED_METRIC');
    const hr=generalHeartRate?snapshot.envelope.heartRateDaily:[];
    const exercises=exerciseSessions?snapshot.envelope.exerciseEvidence.map(r=>{
      if(generalHeartRate)return r;
      // Exercise data remains useful without heart rate, which requires its
      // own independent remote consent regardless of OS permissions.
      const clean={...r};
      for(const key of pulseFields)delete clean[key];
      return frozen(clean);
    }):[];
    if(!hr.length&&!exercises.length)
      throw new Error('M26_V46_QA_EMPTY_SELECTED');
    if(now()-snapshot.capturedAt>MAX_AGE_MS)
      throw new Error('M26_V46_QA_PREVIEW_EXPIRED');
    busy=true;
    try{
      const authorization=await remoteSync.reauthorize({provider:PROVIDER,scopes});
      current(owner);
      if(!UUID.test(String(authorization?.grantId||'')))
        throw new Error('M26_V46_QA_GRANT_INVALID');
      const verified=await remoteSync.currentAuthorization({provider:PROVIDER,scopes});
      current(owner);
      if(verified?.grantId!==authorization.grantId||!isOnline())
        throw new Error('M26_V46_QA_GRANT_STALE');
      const token=await getToken();
      current(owner);
      if(typeof token!=='string'||token.length<10)
        throw new Error('M26_V46_QA_SESSION_REQUIRED');
      const finalGrant=await remoteSync.currentAuthorization({provider:PROVIDER,scopes});
      current(owner);
      if(finalGrant?.grantId!==authorization.grantId||!isOnline())
        throw new Error('M26_V46_QA_GRANT_STALE');
      const records=frozen({schema:SCHEMA,heartRateDaily:hr,exerciseEvidence:exercises});
      const answer=await transport.importConnected360QaV46(token,authorization.grantId,records);
      current(owner);
      if(answer?.ok!==true||answer.persisted!==true||answer.automatic!==false)
        throw new Error('M26_V46_QA_WRITER_UNVERIFIED');
      clear();
      await refreshState({reason:'connected360-v46-qa-explicit-import'});
      return frozen({
        ok:true,persisted:true,automatic:false,
        inserted:answer.inserted,updated:answer.updated,unchanged:answer.unchanged,
      });
    }finally{busy=false;}
  }
  function destroy(){disposed=true;clear();}
  return frozen({capture,commit,clear,destroy,hasPreview:()=>!disposed&&pending!==null,
    isBusy:()=>busy});
}
