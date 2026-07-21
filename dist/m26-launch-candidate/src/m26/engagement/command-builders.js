import { createCommand } from '../command-bus.js';
import { M26_EXTENDED_COMMAND_REGISTRY } from '../command-catalog.js';
import { validateCheckinDraft, normalizeHabitLogDraft } from './activity-drafts.js';

function id(){return globalThis.crypto?.randomUUID?.()||`00000000-0000-4000-8000-${Date.now().toString(16).padStart(12,'0').slice(-12)}`;}
function text(value,max){return String(value||'').trim().slice(0,max);}
function requireClient(clientId){if(!clientId)throw new Error('M26_CLIENT_CONTEXT_REQUIRED');return clientId;}
function build(input,{registry=M26_EXTENDED_COMMAND_REGISTRY,role=null}={}){return createCommand(input,{registry,role});}

export function buildCheckinRegisterCommand({clientId,checkin,entityId=id(),baseRevision=0}={},options={}){
  const validation=validateCheckinDraft(checkin);if(!validation.ok)throw new Error(`M26_CHECKIN_INVALID:${validation.errors.join(',')}`);
  return build({type:'CHECKIN_REGISTRAR',entityType:'checkin',entityId,clientId:requireClient(clientId),baseRevision,conflictSensitive:false,payload:{patch:{id:entityId,clientId,...validation.value,status:'confirmado'}}},options);
}
export function buildCheckinVoidCommand({clientId,checkinId,reason,baseRevision=0}={},options={}){
  if(!checkinId)throw new Error('M26_CHECKIN_ID_REQUIRED');if(!text(reason,500))throw new Error('M26_CHECKIN_VOID_REASON_REQUIRED');
  return build({type:'CHECKIN_ANULAR',entityType:'checkin',entityId:checkinId,clientId:requireClient(clientId),baseRevision,reason:text(reason,500),payload:{patch:{status:'anulado'}}},options);
}
export function buildHabitDefineCommand({clientId,habit,entityId=id(),baseRevision=0}={},options={}){
  const title=text(habit?.title,120);if(title.length<2)throw new Error('M26_HABIT_TITLE_REQUIRED');const target=Number(habit?.target);if(!Number.isFinite(target)||target<=0)throw new Error('M26_HABIT_TARGET_INVALID');
  const patch={id:entityId,clientId,title,description:text(habit?.description,500),target,unit:text(habit?.unit,40)||'veces',frequency:text(habit?.frequency,40)||'diario',status:'activo'};
  return build({type:'HABITO_DEFINIR',entityType:'habit',entityId,clientId:requireClient(clientId),baseRevision,payload:{patch}},options);
}
export function buildHabitLogCommand({clientId,log,entityId=id(),baseRevision=0}={},options={}){
  const value=normalizeHabitLogDraft(log);if(!value.habitId)throw new Error('M26_HABIT_ID_REQUIRED');
  return build({type:'HABITO_REGISTRAR',entityType:'habit_log',entityId,clientId:requireClient(clientId),baseRevision,conflictSensitive:false,payload:{patch:{id:entityId,clientId,...value,status:'confirmado'}}},options);
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
