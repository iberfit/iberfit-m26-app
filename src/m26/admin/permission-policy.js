import {createPermissionSet,hasCapability,requireCapability} from '../shared/permission-set.js';
export const ADMIN_CAPABILITIES=Object.freeze({
  ORGANIZATION_READ:'organization.read',ORGANIZATION_SETTINGS_MANAGE:'organization.settings.manage',
  USER_READ:'user.read_summary',USER_MANAGE_STATUS:'user.manage_status',ROLE_READ:'role.read',ROLE_MANAGE:'role.manage',
  ASSIGNMENT_READ:'assignment.read',ASSIGNMENT_MANAGE:'assignment.manage',CLIENT_LIFECYCLE_READ:'client.lifecycle.read',CLIENT_LIFECYCLE_MANAGE:'client.lifecycle.manage',
  APPOINTMENT_MANAGE_GLOBAL:'appointment.manage_global',OPERATION_READ:'operation.read_global',OPERATION_MANAGE:'operation.manage_global',
  MESSAGE_READ:'message.read',MESSAGE_MANAGE_TEMPLATES:'message.manage_templates',AUTOMATION_READ:'automation.read',AUTOMATION_MANAGE:'automation.manage',
  ANALYTICS_READ:'analytics.read',AUDIT_READ:'audit.read',
});
export const ADMIN_ROUTE_CAPABILITIES=Object.freeze({
  'admin-inicio':'organization.read','admin-usuarios':'user.read_summary','admin-equipo':'assignment.read','admin-clientes':'client.lifecycle.read',
  'admin-agenda':'appointment.manage_global','admin-operaciones':'operation.read_global','admin-comunicacion':'message.read',
  'admin-automatizaciones':'automation.read','admin-analitica':'analytics.read','admin-auditoria':'audit.read','admin-configuracion':'organization.read',
});
export function adminCan(state,capability){return state?.available===true&&hasCapability(state.permissions,capability);}
export function assertAdminCapability(state,capability){if(state?.available!==true)throw new Error('M26_ADMIN_BACKEND_UNAVAILABLE');return requireCapability(state.permissions,capability);}
export function routeAllowedForAdmin(state,area){const cap=ADMIN_ROUTE_CAPABILITIES[area];return Boolean(cap&&adminCan(state,cap));}
export function normalizeAdminPermissions(input){return createPermissionSet(input||{capabilities:[],scopeType:'none'});}
