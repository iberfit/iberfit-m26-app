function required(v,c){if(!v)throw new Error(c);}
import {createM26Id} from '../platform/id.js';
import {civilDateInTimeZone} from '../domain/civil-date.js';
function cycleCivilDate(value){
  if(value instanceof Date){
    if(!Number.isFinite(value.getTime()))return null;
    return Date.UTC(value.getUTCFullYear(),value.getUTCMonth(),value.getUTCDate());
  }
  if(typeof value!=='string')return null;
  const source=value.trim();
  // Preserve historical ISO timestamp inputs while enforcing a real civil date.
  const match=source.match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  if(!match)return null;
  if(source.length>10&&!Number.isFinite(new Date(source).getTime()))return null;
  const civil=match[1];
  const parsed=new Date(`${civil}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===civil
    ?parsed.getTime():null;
}
// Draft seeding must never depend on the arbitrary order in a remote collection.
// Only the matching client's live civil-date cycle (or undated legacy cycle) is
// eligible. Past, future, closed and archived cycles cannot silently prescribe.
const INELIGIBLE_CYCLE_STATUSES=new Set([
  'archived','archivado','cancelled','canceled','cancelado',
  'deleted','eliminado','completed','completado','closed','cerrado','finalizado',
]);
function unwrappedCycle(record){
  if(!record||typeof record!=='object')return null;
  return record.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?{...record,...record.body}:record;
}
function cycleSortTimestamp(record){
  const data=unwrappedCycle(record)||{};
  const source=data.updatedAt??data.updated_at??data.createdAt??data.created_at;
  const ms=Date.parse(String(source||''));
  return Number.isFinite(ms)?ms:0;
}
export function selectCurrentTrainingCycle(records=[],{clientId,now=new Date()}={}){
  const expected=String(clientId||'').trim();
  const today=cycleCivilDate(civilDateInTimeZone(now));
  if(!expected||today===null)return null;
  const current=[],legacy=[];
  for(const original of Array.isArray(records)?records:[]){
    const cycle=unwrappedCycle(original);
    // A conflicting client ID in the persisted wrapper/body is not trustworthy.
    const wrapperClient=String(original?.clientId??original?.client_id??'').trim();
    const bodyClient=String(original?.body?.clientId??original?.body?.client_id??'').trim();
    if((wrapperClient&&wrapperClient!==expected)||(bodyClient&&bodyClient!==expected))continue;
    if(!cycle||String(cycle.clientId??cycle.client_id??'').trim()!==expected)continue;
    const status=String(cycle.status??cycle.estado??'').trim().toLowerCase();
    if(INELIGIBLE_CYCLE_STATUSES.has(status))continue;
    const startRaw=cycle.startDate??cycle.start_date??null;
    const endRaw=cycle.endDate??cycle.end_date??null;
    const start=startRaw?cycleCivilDate(startRaw):null;
    const end=endRaw?cycleCivilDate(endRaw):null;
    if(startRaw||endRaw){
      if(start===null||end===null||end<start||today<start||today>end)continue;
      current.push({original,start,updated:cycleSortTimestamp(original)});
    }else{
      legacy.push({original,start:-1,updated:cycleSortTimestamp(original)});
    }
  }
  const eligible=current.length?current:legacy;
  eligible.sort((a,b)=>b.start-a.start||b.updated-a.updated||
    String(unwrappedCycle(a.original)?.id||'').localeCompare(String(unwrappedCycle(b.original)?.id||'')));
  return eligible[0]?.original||null;
}
export function validateCycleDraft(d={}){
  const errors=[];
  for(const key of ['clientId','name','startDate','endDate','goal']){
    const value=d[key];
    const present=key==='startDate'||key==='endDate'
      ?cycleCivilDate(value)!==null
      :typeof value==='string'&&Boolean(value.trim());
    if(!present)errors.push(key);
  }
  if(typeof d.name==='string'&&d.name.trim().length>120)errors.push('name');
  if(typeof d.goal==='string'&&d.goal.trim().length>500)errors.push('goal');
  const start=cycleCivilDate(d.startDate),end=cycleCivilDate(d.endDate);
  if(d.startDate&&start===null)errors.push('startDate');
  if(d.endDate&&end===null)errors.push('endDate');
  if(start!==null&&end!==null&&end<start)errors.push('endDate');
  if(d.modality!==undefined&&d.modality!==null&&d.modality!==''&&
     !['presencial','hibrido','online'].includes(String(d.modality).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')))errors.push('modality');
  for(const [field,min,max] of [['weeklyFrequency',1,14],['sessionDurationMinutes',20,240]]){
    const value=d[field];
    if(value===undefined||value===null||value==='')continue; // optional in historic command format
    const numeric=Number(value);
    if(typeof value==='boolean'||!Number.isInteger(numeric)||numeric<min||numeric>max)errors.push(field);
  }
  return {ok:!errors.length,errors:[...new Set(errors)]};
}
export function buildCycleCommand(draft,revision=0){ const v=validateCycleDraft(draft); if(!v.ok) throw new Error(`M26_CYCLE_INVALID:${v.errors.join(',')}`); return {type:'PLAN_VALIDAR',entityType:'planning',entityId:draft.id||createM26Id(),clientId:draft.clientId,baseRevision:revision,payload:{draft:structuredClone(draft)}}; }
export function buildPlanCommand(draft,revision=0){ required(draft?.clientId,'M26_PLAN_CLIENT_REQUIRED'); required(draft?.cycleId,'M26_PLAN_CYCLE_REQUIRED'); if(!Array.isArray(draft.sessions)||!draft.sessions.length) throw new Error('M26_PLAN_SESSIONS_REQUIRED'); return {type:'PLAN_VALIDAR',entityType:'planning',entityId:draft.cycleId,clientId:draft.clientId,baseRevision:revision,payload:{draft:structuredClone(draft)}}; }
export function buildPublishPlanCommand({clientId,planId,previewAccepted},revision=0){ if(!previewAccepted) throw new Error('M26_PLAN_PREVIEW_REQUIRED'); return {type:'PLAN_PUBLICAR',entityType:'planning',entityId:planId,clientId,baseRevision:revision,previewAccepted:true,payload:{patch:{publishedAt:new Date().toISOString()}}}; }
