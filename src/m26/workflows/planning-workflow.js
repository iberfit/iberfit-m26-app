function required(v,c){if(!v)throw new Error(c);}
import {createM26Id} from '../platform/id.js';
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
