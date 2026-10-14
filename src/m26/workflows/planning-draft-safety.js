// M43: immutable identity of each local planning cycle. This module never
// changes publication rights or server records.
const SAFE_ID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
export const LEGACY_PLANNING_DRAFT_SCOPE='planning-cycle';

export function planningDraftScope(entityId){
  const id=String(entityId||'').trim();
  if(!SAFE_ID.test(id))throw new Error('M43_PLAN_DRAFT_ID_INVALID');
  const escaped=id.replace(/_/g,'_5f').replace(/:/g,'_3a');
  const scope='planning-cycle-'+escaped;
  if(scope.length>80)throw new Error('M43_PLAN_DRAFT_SCOPE_TOO_LONG');
  return scope;
}

function validRecord(record,clientId){
  const draft=record?.value;
  if(!draft||typeof draft!=='object'||Array.isArray(draft))return false;
  const id=String(draft.id||'').trim();
  if(String(draft.clientId||'')!==String(clientId))return false;
  try{return record.scope===planningDraftScope(id)||record.scope===LEGACY_PLANNING_DRAFT_SCOPE;}
  catch{return false;}
}

export async function listPlanningDrafts(repository,clientId){
  if(!repository?.list)return [];
  const records=await repository.list(clientId),unique=new Map();
  for(const record of records){
    if(!validRecord(record,clientId))continue;
    const id=String(record.value.id).trim(),prior=unique.get(id);
    if(!prior||record.scope===planningDraftScope(id)&&prior.scope!==planningDraftScope(id))
      unique.set(id,record);
  }
  return [...unique.values()].sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
}

export async function restorePlanningDraft(repository,clientId,entityId){
  const scope=planningDraftScope(entityId);
  const current=await repository.load(clientId,scope);
  if(current){
    if(!validRecord(current,clientId)||String(current.value.id)!==String(entityId))
      throw new Error('M43_PLAN_DRAFT_IDENTITY_CONFLICT');
    return current;
  }
  // Read historical single-key drafts without silently removing another cycle.
  const legacy=await repository.load(clientId,LEGACY_PLANNING_DRAFT_SCOPE);
  if(!legacy)return null;
  if(!validRecord(legacy,clientId))
    throw new Error('M43_PLAN_LEGACY_DRAFT_IDENTITY_CONFLICT');
  return String(legacy.value.id)===String(entityId)?legacy:null;
}

export async function removeConfirmedPlanningDraft(repository,clientId,entityId){
  const scope=planningDraftScope(entityId);
  await repository.remove(clientId,scope);
  const legacy=await repository.load(clientId,LEGACY_PLANNING_DRAFT_SCOPE);
  // Never purge a historical draft belonging to another cycle.
  if(legacy&&validRecord(legacy,clientId)&&String(legacy.value.id)===String(entityId))
    await repository.remove(clientId,LEGACY_PLANNING_DRAFT_SCOPE);
}

// Stable form signature prevents false edit conflicts from field enumeration
// order while retaining changes to any field, including blank -> nonblank.
export function planningFormSignature(fields={}){
  return JSON.stringify(Object.keys(fields).sort().map(key=>[key,String(fields[key]??'')]));
}

// Remote ACK does not authorize discarding later local changes. Check both
// before and AFTER asynchronous deletion: a user may type during cleanup.
// A rescue writes only the same client's same cycle, never another identity.
export async function finalizeConfirmedPlanningDraft(repository,clientId,entityId,{isCurrent,readEditedDraft}={}){
  if(typeof isCurrent!=='function'||typeof readEditedDraft!=='function')
    throw new Error('M43_PLAN_CONFIRM_GUARD_REQUIRED');
  if(!repository?.remove||!repository?.save)
    return Object.freeze({cleaned:false,reason:'storage-unavailable'});
  const scope=planningDraftScope(entityId);
  async function guard(){
    if(!isCurrent())return Object.freeze({cleaned:false,reason:'context-changed'});
    const edited=readEditedDraft();
    if(!edited)return null;
    if(String(edited.id||'')!==String(entityId)||String(edited.clientId||'')!==String(clientId))
      return Object.freeze({cleaned:false,reason:'scope-changed'});
    await repository.save(clientId,scope,edited);
    return Object.freeze({cleaned:false,reason:'edited-after-ack'});
  }
  const before=await guard();
  if(before)return before;
  await removeConfirmedPlanningDraft(repository,clientId,entityId);
  const after=await guard();
  return after||Object.freeze({cleaned:true,reason:'confirmed'});
}
