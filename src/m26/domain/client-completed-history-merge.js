// P0 #1209 · Pure, atomic Client history merge. Neither mutates source state
// nor makes incomplete history visible. Caller must verify owner at commit time.
import {reconcileCanonicalTrainingCollections} from './canonical-training-collections.js';
import {projectCollectionsForRole,assertClientProjectionSafe} from '../security/role-projection.js';
const COMPLETED=new Set(['completada','completado','completed']);
function fail(code){throw new Error('M26_CLIENT_HISTORY_'+code);}
export function projectCompletedHistoryForClient({
  state,ownerId,clientId,confirmedAt,lastAck,sections,
}={}){
  const id=state?.identity;
  if(id?.role!=='client'||id?.id!==ownerId||id?.clientId!==clientId
     ||state?.hydration?.status!=='ready'
     ||state?.hydration?.confirmedAt!==confirmedAt
     ||JSON.stringify(state?.lastAck??null)!==JSON.stringify(lastAck??null))
    fail('HYDRATION_OR_OWNER_CHANGED');
  if(!sections||typeof sections!=='object'||Array.isArray(sections))fail('SECTIONS_INVALID');
  const records=[];
  for(const [section,items] of Object.entries(sections)){
    if(!['session','session_execution'].includes(section)||!Array.isArray(items)||items.length>10_000)
      fail('SECTIONS_INVALID');
    for(const item of items){
      if(item?.entityType!==section||item?.clientId!==clientId
         ||!COMPLETED.has(String(item?.status||'').toLowerCase())
         ||item.body?.clientId&&String(item.body.clientId)!==clientId)
        fail('ROW_OWNER_INVALID');
      records.push(item);
    }
  }
  const current=state.collections||{};
  // The raw canonical row is transient: it is *never* published as
  // state.collections.m26Entities. Canonical role projection strips all
  // non-public metadata before the Client receives the hydrated result.
  const reconciled=reconcileCanonicalTrainingCollections({
    sessions:current.sessions||[],
    sessionExecutions:current.sessionExecutions||[],
    trainingCycles:current.trainingCycles||[],
    m26Entities:records,
  });
  const projected=projectCollectionsForRole({
    sessions:reconciled.sessions,
    sessionExecutions:reconciled.sessionExecutions,
  },id,['sessions','sessionExecutions']);
  assertClientProjectionSafe(projected,id);
  return Object.freeze({
    sessions:Object.freeze(projected.sessions),
    sessionExecutions:Object.freeze(projected.sessionExecutions),
  });
}
