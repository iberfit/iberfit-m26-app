import {assertAdminCapability,ADMIN_CAPABILITIES} from './permission-policy.js';
const COMMANDS=Object.freeze({
  ADMIN_USUARIO_CAMBIAR_ESTADO:{entityType:'admin_user',capability:ADMIN_CAPABILITIES.USER_MANAGE_STATUS,reason:true},
  ADMIN_ROL_OTORGAR:{entityType:'application_role',capability:ADMIN_CAPABILITIES.ROLE_MANAGE,reason:true},
  ADMIN_ROL_REVOCAR:{entityType:'application_role',capability:ADMIN_CAPABILITIES.ROLE_MANAGE,reason:true},
  ADMIN_ASIGNACION_CREAR:{entityType:'coach_client_assignment',capability:ADMIN_CAPABILITIES.ASSIGNMENT_MANAGE,reason:true},
  ADMIN_ASIGNACION_FINALIZAR:{entityType:'coach_client_assignment',capability:ADMIN_CAPABILITIES.ASSIGNMENT_MANAGE,reason:true},
  ADMIN_LEAD_CREAR:{entityType:'lead',capability:ADMIN_CAPABILITIES.CLIENT_LIFECYCLE_MANAGE,reason:false},
  ADMIN_LEAD_ACTUALIZAR:{entityType:'lead',capability:ADMIN_CAPABILITIES.CLIENT_LIFECYCLE_MANAGE,reason:true},
  ADMIN_CLIENTE_CAMBIAR_CICLO:{entityType:'client_lifecycle',capability:ADMIN_CAPABILITIES.CLIENT_LIFECYCLE_MANAGE,reason:true},
  ADMIN_TAREA_CREAR:{entityType:'operational_task',capability:ADMIN_CAPABILITIES.OPERATION_MANAGE,reason:false},
  ADMIN_TAREA_RESOLVER:{entityType:'operational_task',capability:ADMIN_CAPABILITIES.OPERATION_MANAGE,reason:true},
  ADMIN_PLANTILLA_GUARDAR:{entityType:'notification_template',capability:ADMIN_CAPABILITIES.MESSAGE_MANAGE_TEMPLATES,reason:false},
  ADMIN_AUTOMATIZACION_GUARDAR:{entityType:'automation_rule',capability:ADMIN_CAPABILITIES.AUTOMATION_MANAGE,reason:false},
  ADMIN_ORGANIZACION_ACTUALIZAR:{entityType:'organization',capability:ADMIN_CAPABILITIES.ORGANIZATION_SETTINGS_MANAGE,reason:true},
});
function op(){return globalThis.crypto?.randomUUID?.()||`ADM-${Date.now()}-${Math.random().toString(16).slice(2)}`;}
export function createAdminCommand(input={},state){const type=String(input.type||'').toUpperCase();const def=COMMANDS[type];if(!def)throw new Error('M26_ADMIN_COMMAND_NOT_REGISTERED');assertAdminCapability(state,def.capability);const reason=String(input.reason||'').trim().slice(0,500);if(def.reason&&reason.length<3)throw new Error('M26_ADMIN_COMMAND_REASON_REQUIRED');return Object.freeze({operationId:String(input.operationId||op()),type,entityType:def.entityType,entityId:String(input.entityId||state.organization?.id||''),organizationId:String(input.organizationId||state.organization?.id||''),baseRevision:Number(input.baseRevision||0),reason:reason||null,payload:Object.freeze(structuredClone(input.payload||{})),onlineOnly:true,createdAt:new Date().toISOString()});}
export const M26_ADMIN_COMMAND_TYPES=Object.freeze(Object.keys(COMMANDS));
