import {createHash} from 'node:crypto';
import retainedHistory from './m43-qa-retained-history-v1.json' with {type:'json'};
/**
 * M43 QA-only acceptance controls. Never relax Coach/Client server authorization.
 * Observe the existing synthetic fixture, do not mutate or delete prior history.
 */
export const M43_SYNTHETIC_SESSION_LIMIT=150;
const MARKER='IBERFIT QA M43';
const RETAINED_HISTORY_DIGESTS=new Set(retainedHistory.sha256EntityScopeRevisionAndTitle);
if(retainedHistory.qaOnly!==true||retainedHistory.sourceProject!=='gjztkdwfmunnzhtvxrsu'
  ||retainedHistory.mode!=='logical_retention_only_no_database_mutation'
  ||RETAINED_HISTORY_DIGESTS.size!==retainedHistory.sha256EntityScopeRevisionAndTitle.length
  ||[...RETAINED_HISTORY_DIGESTS].some(d=>!/^[a-f0-9]{64}$/u.test(d)))
  throw Error('M43_RETENTION_CHECKPOINT_INVALID');

/**
 * A literal fingerprint of an old, completed QA run is not a deletion.
 * Status, server revision, client scope, ID and exact run marker must STILL
 * match the frozen SQL observation or that record again consumes live budget.
 * No user records, active executions, or unknown/malformed rows can qualify.
 */
export function retainedM43HistoricalFingerprint(item,digests=RETAINED_HISTORY_DIGESTS){
  if(item?.entityType!=='session'||item.status!=='completada')return false;
  const title=String(item.body?.title||''),id=String(item.entityId||''),
    clientId=String(item.clientId||''),revision=Number(item.revision);
  if(!(/^IBERFIT QA M43 · multideporte · run-[1-9][0-9]{0,19}-a[1-9][0-9]{0,3}$/u.test(title)
       ||title==='IBERFIT QA M43 · multideporte')
    ||!/^[a-f0-9-]{36}$/iu.test(id)||!/^[a-f0-9-]{36}$/iu.test(clientId)
    ||!Number.isSafeInteger(revision)||revision<2
    ||String(item.body?.clientId||'')!==clientId
    ||Number(item.body?.revision)!==revision)return false;
  const fingerprint=createHash('sha256').update(
    clientId+':'+id+':'+item.status+':'+revision+':'+title,'utf8').digest('hex');
  return digests.has(fingerprint);
}

export function assessM43SyntheticFixtureBudget(snapshot,{limit=M43_SYNTHETIC_SESSION_LIMIT}={}){
  const entities=snapshot?.data?.m26Entities;
  // Missing or malformed bootstrap cannot be treated as an empty healthy QA.
  if(!Array.isArray(entities))return Object.freeze({count:null,total:null,retained:null,limit,exhausted:true,reason:'BOOTSTRAP_MISSING'});
  const synthetic=entities.filter(item=>
    item?.entityType==='session' &&
    String(item?.body?.title||'').startsWith(MARKER)
  );
  // Preserve original canonical entities AND all execution/event/receipt rows.
  // Only explicitly frozen historical terminal records are excluded from
  // the 150 CURRENT fixture budget; keep an independent total for audits.
  const retained=synthetic.filter(item=>retainedM43HistoricalFingerprint(item)).length;
  const count=synthetic.length-retained;
  return Object.freeze({count,total:synthetic.length,retained,limit,
    exhausted:count>=limit,reason:count>=limit?'M43_SYNTHETIC_HISTORY_CAP':'OK'});
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
  if(!['pausada','en_curso'].includes(execution.status))
    return refuse('EXECUTION_NOT_RECOVERABLE');
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
  // In-progress recordings need a larger margin. The second mandatory guard
  // is GitHub's completed-run attestation before the authenticated cancel.
  const safeAgeMinutes=execution.status==='en_curso'
    ?Math.max(minAgeMinutes,8):minAgeMinutes;
  if(!Number.isFinite(now)||!Number.isFinite(updated)||updated>now
    ||now-updated<safeAgeMinutes*60000)return refuse('RUN_NOT_STALE');
  return Object.freeze({kind:'recover',reason:execution.status==='pausada'
      ?'STALE_SYNTHETIC_PAUSED':'STALE_SYNTHETIC_IN_PROGRESS',
    executionId:String(execution.entityId),sessionId:String(session.entityId),
    clientId:String(execution.clientId),revision,priorRunId:match[1]});
}

/**
 * A prior synthetic workout may be interrupted while "en_curso" or "pausada".
 * Never close it until GitHub certifies the exact prior writer+browser run is
 * fully COMPLETED, not just older than the current job.
 */
export async function attestCompletedM43Run(previousRunId,{
  repo=process.env.GITHUB_REPOSITORY,
  token=process.env.GH_ACTIONS_TOKEN,
  fetchImpl=globalThis.fetch,
}={}){
  if(repo!=='iberfit/iberfit-m26-app'||!/^[1-9][0-9]{0,19}$/u.test(String(previousRunId||''))||
    typeof fetchImpl!=='function'||!String(token||'').trim())return false;
  try{
    const response=await fetchImpl(
      'https://api.github.com/repos/'+repo+'/actions/runs/'+previousRunId,{
        redirect:'error',
        signal:AbortSignal.timeout(6_000),
        headers:{'accept':'application/vnd.github+json',
          'x-github-api-version':'2022-11-28',
          'authorization':'Bearer '+token},
      });
    if(!response?.ok)return false;
    const record=await response.json();
    return String(record?.id)===String(previousRunId)
      &&record?.name==='IBERFIT QA Real Write Certification'
      &&record?.repository?.full_name===repo
      &&record?.status==='completed'
      &&['success','failure','cancelled'].includes(String(record?.conclusion||''));
  }catch{return false;}
}
