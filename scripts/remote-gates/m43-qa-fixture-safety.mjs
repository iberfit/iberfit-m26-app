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
