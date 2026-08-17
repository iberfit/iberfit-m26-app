import {getCommandDefinition} from '../command-catalog.js';

export const BULK_PREPARATION_SCHEMA_VERSION='iberfit.bulk-preparation.v1';
export const BULK_PREPARATION_MAX_TARGETS=25;

const SUPPORTED_ACTIONS=Object.freeze({
  CLIENTE_REENVIAR_INVITACION:Object.freeze({label:'Reenviar invitación',requiresReason:false}),
  CLIENTE_SUSPENDER:Object.freeze({label:'Suspender acceso',requiresReason:true}),
  CLIENTE_REACTIVAR:Object.freeze({label:'Reactivar acceso',requiresReason:true}),
});

function text(value,max=240){return String(value??'').trim().slice(0,max);}
function unique(values=[]){return [...new Set((Array.isArray(values)?values:[]).map((value)=>text(value,160)).filter(Boolean))];}

function assertVisibleTargets(selectedClientIds,visibleClientIds){
  const selected=unique(selectedClientIds);
  const visible=new Set(unique(visibleClientIds));
  if(selected.length<2)throw new Error('M26_BULK_MIN_TWO_TARGETS');
  if(selected.length>BULK_PREPARATION_MAX_TARGETS)throw new Error('M26_BULK_TARGET_LIMIT');
  for(const clientId of selected){
    if(!visible.has(clientId))throw new Error(`M26_BULK_TARGET_OUT_OF_SCOPE:${clientId}`);
  }
  return selected;
}

function supportedAction(action){
  const type=text(action,80);
  const config=SUPPORTED_ACTIONS[type];
  const definition=getCommandDefinition(type);
  if(!config||!definition||definition.entityType!=='client_access'){
    throw new Error('M26_BULK_ACTION_UNSUPPORTED');
  }
  return {type,config,definition};
}

export function orderBulkTargets(selectedClientIds,visibleClientIds){
  const selected=new Set(unique(selectedClientIds));
  return Object.freeze(unique(visibleClientIds).filter((clientId)=>selected.has(clientId)));
}

export function createBulkOperationPreview({
  action,
  selectedClientIds=[],
  visibleClientIds=[],
  reason='',
}={}){
  const {type,config,definition}=supportedAction(action);
  const selected=assertVisibleTargets(selectedClientIds,visibleClientIds);
  const ordered=orderBulkTargets(selected,visibleClientIds);
  const safeReason=text(reason,240);
  if((config.requiresReason||definition.requiresReason)&&!safeReason){
    throw new Error('M26_BULK_REASON_REQUIRED');
  }
  const confirmationToken=`CONFIRMAR ${ordered.length}`;
  const items=ordered.map((clientId,index)=>Object.freeze({
    sequence:index+1,
    clientId,
    commandType:type,
    entityType:'client_access',
    requiresReason:Boolean(definition.requiresReason),
  }));
  return Object.freeze({
    schemaVersion:BULK_PREPARATION_SCHEMA_VERSION,
    action:type,
    actionLabel:config.label,
    count:items.length,
    reason:safeReason||null,
    items:Object.freeze(items),
    requiresExplicitConfirmation:true,
    confirmationToken,
    automaticExecution:false,
    status:'preview',
  });
}

export function confirmBulkOperationPreview(preview,{confirmation=''}={}){
  if(!preview||preview.schemaVersion!==BULK_PREPARATION_SCHEMA_VERSION){
    throw new Error('M26_BULK_PREVIEW_REQUIRED');
  }
  if(preview.status!=='preview'||preview.automaticExecution!==false){
    throw new Error('M26_BULK_PREVIEW_INVALID');
  }
  if(text(confirmation,80)!==preview.confirmationToken){
    throw new Error('M26_BULK_CONFIRMATION_MISMATCH');
  }
  return Object.freeze({
    ...preview,
    status:'confirmed_for_manual_execution',
    confirmed:true,
    automaticExecution:false,
  });
}

export function buildBulkCommandDrafts(confirmedPreview){
  if(!confirmedPreview?.confirmed||confirmedPreview.status!=='confirmed_for_manual_execution'){
    throw new Error('M26_BULK_CONFIRMATION_REQUIRED');
  }
  return Object.freeze(confirmedPreview.items.map((item)=>Object.freeze({
    type:item.commandType,
    entityType:item.entityType,
    entityId:item.clientId,
    clientId:item.clientId,
    reason:confirmedPreview.reason||undefined,
    previewAccepted:false,
    bulkPrepared:true,
  })));
}

export const BULK_PREPARATION_ACTIONS=Object.freeze(
  Object.entries(SUPPORTED_ACTIONS).map(([type,config])=>Object.freeze({
    type,
    label:config.label,
    requiresReason:config.requiresReason,
  }))
);