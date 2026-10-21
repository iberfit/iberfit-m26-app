/**
 * M43 QA-only acceptance controls. Never relax Coach/Client server authorization.
 * Observe the existing synthetic fixture, do not mutate or delete prior history.
 */
export const M43_SYNTHETIC_SESSION_LIMIT=150;
const MARKER='IBERFIT QA M43';

export function assessM43SyntheticFixtureBudget(snapshot,{limit=M43_SYNTHETIC_SESSION_LIMIT}={}){
  const entities=snapshot?.data?.m26Entities;
  // Missing or malformed bootstrap cannot be treated as an empty healthy QA.
  if(!Array.isArray(entities))return Object.freeze({count:null,limit,exhausted:true,reason:'BOOTSTRAP_MISSING'});
  const count=entities.filter(item=>
    item?.entityType==='session' &&
    String(item?.body?.title||'').startsWith(MARKER)
  ).length;
  return Object.freeze({count,limit,exhausted:count>=limit,reason:count>=limit?'M43_SYNTHETIC_HISTORY_CAP':'OK'});
}

/**
 * Exact-run QA handoff between the authenticated writer and browser reader.
 * A historical fixture must never satisfy a new workflow attempt.
 */
export function m43QaRunMarkers({runId,attempt}={}){
  const id=String(runId??''),n=String(attempt??'');
  if(!/^[1-9][0-9]{0,19}$/u.test(id)||!/^[1-9][0-9]{0,3}$/u.test(n))
    throw Error('M43_QA_RUN_PROVENANCE_MISSING_OR_INVALID');
  const suffix='run-'+id+'-a'+n;
  return Object.freeze({
    sessionTitle:'IBERFIT QA M43 · multideporte · '+suffix,
    interactiveSessionTitle:'IBERFIT QA M43 · sesión interactiva · '+suffix,
    publishedCycleTitle:'IBERFIT QA M43 · ciclo principal · '+suffix,
    unpublishedCycleTitle:'IBERFIT QA M43 · ciclo no publicado · '+suffix,
  });
}

/** A single real SESION_PUBLICAR ACK must result in available state (M37). */
export function verifyM43AtomicGuidedEnablement({canonical,publishedResult,sessionId,clientId}={}){
  const fail=reason=>Object.freeze({ok:false,reason,revision:null});
  if(!canonical||String(canonical.entityType)!=='session' ||
     String(canonical.entityId)!==String(sessionId)||
     String(canonical.clientId)!==String(clientId))return fail('WRONG_CANONICAL_SCOPE');
  if(canonical.status!=='disponible')return fail('PUBLISHED_NOT_ENABLED');
  const revision=Number(canonical.revision),ackRevision=Number(publishedResult?.remoteRevision);
  if(!Number.isSafeInteger(revision)||revision<2||
     !Number.isSafeInteger(ackRevision)||ackRevision<2 ||
     revision!==ackRevision)return fail('CANONICAL_ACK_REVISION_MISMATCH');
  if(publishedResult?.kind!=='ack'||publishedResult?.duplicate===true)
    return fail('PUBLISH_ACK_MISSING');
  return Object.freeze({ok:true,reason:'OK',revision});
}

/**
 * Recover ONLY a stale, run-marked M43 synthetic Client execution.
 * No direct SQL, no real account, no unmarked workout, no recent run and no
 * ambiguous active state can be repaired automatically.
 */
// The exact QA Real Write workflow serializes all runs and the browser test
// has a 180s hard timeout; allow a 60s recovery margin before cleanup.
// Every recovery still requires a prior run's exact synthetic marker, Client
// scope, a paused execution, a matching session and canonical CAS revision.
export function assessM43StalePausedRecovery(snapshot,{runId,minAgeMinutes=4}={}){
  const refuse=reason=>Object.freeze({kind:'blocked',reason});
  const data=snapshot?.data?.m26Entities;
  if(!Array.isArray(data))return refuse('BOOTSTRAP_MISSING');
  const active=data.filter(e=>e?.entityType==='session_execution'
    && ['en_curso','pausada'].includes(String(e.status||'')));
  if(active.length===0)return Object.freeze({kind:'none',reason:'NO_ACTIVE_EXECUTIONS'});
  if(active.length!==1)return refuse('AMBIGUOUS_ACTIVE_EXECUTIONS');
  const execution=active[0],body=execution.body||{};
  if(execution.status!=='pausada')return refuse('EXECUTION_NOT_PAUSED');
  const session=data.find(e=>e?.entityType==='session'
    && String(e.entityId)===String(body.sessionId)
    && String(e.clientId)===String(execution.clientId));
  if(!session||session.status!=='en_curso')return refuse('SESSION_NOT_IN_PROGRESS');
  const title=String(session.body?.title||'');
  const match=/^IBERFIT QA M43 · sesión interactiva · run-([1-9][0-9]{0,19})-a([1-9][0-9]{0,3})$/u.exec(title);
  if(!match)return refuse('UNMARKED_SESSION');
  if(!/^[1-9][0-9]{0,19}$/u.test(String(runId||'')))return refuse('RUN_PROVENANCE_INVALID');
  if(BigInt(match[1])>=BigInt(runId))return refuse('RUN_NOT_PRIOR');
  if(String(body.id)!==String(execution.entityId)
    || String(body.clientId)!==String(execution.clientId)
    || String(session.clientId)!==String(snapshot?.user?.clientId))
    return refuse('CLIENT_OR_ENTITY_SCOPE');
  const revision=Number(execution.revision);
  if(!Number.isSafeInteger(revision)||revision<1
    ||Number(body.revision)!==revision)return refuse('REVISION_INVALID');
  const now=Date.parse(String(snapshot?.serverTime||''));
  const updated=Date.parse(String(execution.updatedAt||''));
  if(!Number.isFinite(now)||!Number.isFinite(updated)||updated>now
    ||now-updated<minAgeMinutes*60000)return refuse('RUN_NOT_STALE');
  return Object.freeze({kind:'recover',reason:'STALE_SYNTHETIC_PAUSED',
    executionId:String(execution.entityId),sessionId:String(session.entityId),
    clientId:String(execution.clientId),revision});
}
