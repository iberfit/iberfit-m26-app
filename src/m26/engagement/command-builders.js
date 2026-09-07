import { createM26Id } from '../platform/id.js';
import { createCommand } from '../command-bus.js';
import { M26_EXTENDED_COMMAND_REGISTRY } from '../command-catalog.js';
import { validateCheckinDraft, validateHabitDefinitionDraft, validateHabitLogDraft } from './activity-drafts.js';

function id(){return createM26Id();}
function text(value,max){return String(value||'').trim().slice(0,max);}
function requireClient(clientId){if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');return clientId;}
function build(input,{registry=M26_EXTENDED_COMMAND_REGISTRY,role=null}={}){return createCommand(input,{registry,role});}
function optionalBoundedText(value,max,code){if(value===null||value===undefined)return null;const normalized=String(value).trim();if(normalized.length>max)throw new Error(code);return normalized||null;}
function renewalDate(value){if(value===null||value===undefined||String(value).trim()==='')return null;const normalized=String(value).trim();const match=normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/u);if(!match)throw new Error('M26_RENEWAL_DATE_INVALID');const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);const date=new Date(Date.UTC(y,m-1,d));if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw new Error('M26_RENEWAL_DATE_INVALID');return normalized;}

export function buildCheckinRegisterCommand({clientId,checkin,entityId=id(),baseRevision=0}={},options={}){
  const validation=validateCheckinDraft(checkin);if(!validation.ok)throw new Error(`M26_CHECKIN_INVALID:${validation.errors.join(',')}`);
  return build({type:'CHECKIN_REGISTRAR',entityType:'checkin',entityId,clientId:requireClient(clientId),baseRevision,conflictSensitive:false,payload:{patch:{id:entityId,clientId,...validation.value,status:'confirmado'}}},options);
}
export function buildCheckinVoidCommand({clientId,checkinId,reason,baseRevision=0}={},options={}){
  if(!checkinId)throw new Error('M26_CHECKIN_ID_REQUIRED');if(!text(reason,500))throw new Error('M26_CHECKIN_VOID_REASON_REQUIRED');
  return build({type:'CHECKIN_ANULAR',entityType:'checkin',entityId:checkinId,clientId:requireClient(clientId),baseRevision,reason:text(reason,500),payload:{patch:{status:'anulado'}}},options);
}
export function buildHabitDefineCommand({clientId,habit,entityId=id(),baseRevision=0}={},options={}){
  const validation=validateHabitDefinitionDraft(habit);if(!validation.ok)throw new Error(`M26_HABIT_INVALID:${validation.errors.join(',')}`);
  const patch={id:entityId,clientId,...validation.value,status:'activo'};
  return build({type:'HABITO_DEFINIR',entityType:'habit',entityId,clientId:requireClient(clientId),baseRevision,payload:{patch}},options);
}
export function buildHabitLogCommand({clientId,log,entityId=id(),baseRevision=0}={},options={}){
  const validation=validateHabitLogDraft(log);if(!validation.ok)throw new Error(`M26_HABIT_LOG_INVALID:${validation.errors.join(',')}`);
  return build({type:'HABITO_REGISTRAR',entityType:'habit_log',entityId,clientId:requireClient(clientId),baseRevision,conflictSensitive:false,payload:{patch:{id:entityId,clientId,...validation.value,status:'confirmado'}}},options);
}
export function buildHabitArchiveCommand({clientId,habitId,reason,baseRevision=0}={},options={}){
  if(!habitId)throw new Error('M26_HABIT_ID_REQUIRED');if(!text(reason,500))throw new Error('M26_HABIT_ARCHIVE_REASON_REQUIRED');
  return build({type:'HABITO_ARCHIVAR',entityType:'habit',entityId:habitId,clientId:requireClient(clientId),baseRevision,reason:text(reason,500),payload:{patch:{status:'archivado'}}},options);
}
export function buildPrivateNoteCreateCommand({clientId,body,entityId=id(),baseRevision=0}={},options={}){
  const note=text(body,4000);if(note.length<3)throw new Error('M26_PRIVATE_NOTE_REQUIRED');
  return build({type:'NOTA_PRIVADA_CREAR',entityType:'private_note',entityId,clientId:requireClient(clientId),baseRevision,payload:{patch:{id:entityId,clientId,body:note,status:'activo',visibility:'coach_only'}}},options);
}
export function buildPrivateNoteUpdateCommand({clientId,noteId,body,baseRevision}={},options={}){
  if(!noteId)throw new Error('M26_PRIVATE_NOTE_ID_REQUIRED');const note=text(body,4000);if(note.length<3)throw new Error('M26_PRIVATE_NOTE_REQUIRED');if(!Number.isInteger(Number(baseRevision))||Number(baseRevision)<1)throw new Error('M26_PRIVATE_NOTE_REVISION_REQUIRED');
  return build({type:'NOTA_PRIVADA_ACTUALIZAR',entityType:'private_note',entityId:noteId,clientId:requireClient(clientId),baseRevision:Number(baseRevision),payload:{patch:{body:note,visibility:'coach_only'}}},options);
}
export function buildPrivateNoteArchiveCommand({clientId,noteId,reason,baseRevision}={},options={}){
  if(!noteId)throw new Error('M26_PRIVATE_NOTE_ID_REQUIRED');if(!text(reason,500))throw new Error('M26_PRIVATE_NOTE_ARCHIVE_REASON_REQUIRED');
  return build({type:'NOTA_PRIVADA_ARCHIVAR',entityType:'private_note',entityId:noteId,clientId:requireClient(clientId),baseRevision:Number(baseRevision||0),reason:text(reason,500),payload:{patch:{status:'archivado',visibility:'coach_only'}}},options);
}
export function buildCommercialRenewalCommand({clientId,renewal={},entityId=id(),baseRevision=0,operationId}={},options={}){
  const statusRaw=String(renewal?.renewalStatus||'').trim().toLowerCase();
  const renewalStatus=statusRaw||null;
  if(renewalStatus&&!['completed','overdue','upcoming','current'].includes(renewalStatus))throw new Error('M26_RENEWAL_STATUS_INVALID');
  const date=renewalDate(renewal?.renewalDate);
  if(!renewalStatus&&!date)throw new Error('M26_RENEWAL_EVIDENCE_REQUIRED');
  const revision=Number(baseRevision);
  if(!Number.isInteger(revision)||revision<0)throw new Error('M26_RENEWAL_REVISION_INVALID');
  const patch={renewalDate:date,renewalStatus,commercialPlan:optionalBoundedText(renewal?.commercialPlan,140,'M26_RENEWAL_PLAN_INVALID'),notes:optionalBoundedText(renewal?.notes,1000,'M26_RENEWAL_NOTES_INVALID')};
  return build({operationId,type:'RENOVACION_REGISTRAR',entityType:'renewal',entityId,clientId:requireClient(clientId),baseRevision:revision,payload:{patch}},options);
}
