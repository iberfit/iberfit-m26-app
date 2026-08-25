import { M26_ENGAGEMENT_EXTENSION_REGISTRY } from './engagement/activity-capabilities.js';

const rows = [
  ['CLIENTE_INVITAR','client_access','INVITAR',['admin','coach'],false,false,false,true,true,true],
  ['CLIENTE_REENVIAR_INVITACION','client_access','REENVIAR',['admin','coach'],false,false,false,true,false,true],
  ['CLIENTE_CANCELAR_INVITACION','client_access','CANCELAR_INVITACION',['admin','coach'],true,false,false,true,false,true],
  ['CLIENTE_ACTIVAR','client_access','ACTIVAR',['admin','sistema'],false,false,false,true,false,true],
  ['CLIENTE_SUSPENDER','client_access','SUSPENDER',['admin','coach'],true,false,false,true,false,true],
  ['CLIENTE_REACTIVAR','client_access','REACTIVAR',['admin','coach'],true,false,false,true,false,true],
  ['CLIENTE_REVOCAR','client_access','REVOCAR',['admin'],true,false,false,true,false,true],
  ['CLIENTE_REINVITAR','client_access','REINVITAR',['admin'],false,false,false,true,false,true],
  ['IRI_COMPLETAR','iri','COMPLETAR',['admin','coach'],false,false,false,true,false,true],
  ['IRI_REABRIR','iri','REABRIR',['admin','coach'],true,false,false,true,false,true],
  ['IRI_APROBAR','iri','APROBAR',['admin','coach'],false,false,false,true,false,true],
  ['IRI_SUSTITUIR','iri','SUSTITUIR',['admin','coach'],true,false,false,true,false,true],
  ['IRI_ANULAR','iri','ANULAR',['admin'],true,false,false,true,false,true],
  ['INFORME_APROBAR','report','APROBAR',['admin','coach'],false,false,false,true,false,true],
  ['INFORME_PUBLICAR','report','PUBLICAR',['admin','coach'],false,true,true,true,false,true],
  ['INFORME_RETIRAR','report','RETIRAR',['admin','coach'],true,false,false,true,false,true],
  ['INFORME_ANULAR','report','ANULAR',['admin'],true,false,false,true,false,true],
  ['PLAN_VALIDAR','planning','VALIDAR',['admin','coach'],false,false,false,true,true,true],
  ['PLAN_REABRIR','planning','REABRIR',['admin','coach'],true,false,false,true,false,true],
  ['PLAN_APROBAR','planning','APROBAR',['admin','coach'],false,false,false,true,false,true],
  ['PLAN_PUBLICAR','planning','PUBLICAR',['admin','coach'],false,true,true,true,false,true],
  ['PLAN_ARCHIVAR','planning','ARCHIVAR',['admin','coach'],true,false,false,true,false,true],
  ['CITA_CREAR','appointment','CREAR',['admin','coach'],false,false,false,true,true,true],
  ['CITA_CONFIRMAR','appointment','CONFIRMAR',['admin','coach','cliente'],false,false,false,true,false,true],
  ['CITA_REPROGRAMAR','appointment','REPROGRAMAR',['admin','coach'],true,false,false,true,false,true],
  ['CITA_CANCELAR','appointment','CANCELAR',['admin','coach','cliente'],true,false,false,true,false,true],
  ['CITA_COMPLETAR','appointment','COMPLETAR',['admin','coach'],false,false,false,true,false,true],
  ['SESION_APROBAR','session','APROBAR',['admin','coach'],false,false,false,true,false,true],
  ['SESION_PUBLICAR','session','PUBLICAR',['admin','coach'],false,true,true,true,false,true],
  ['SESION_HABILITAR','session','HABILITAR',['admin','coach','sistema'],false,false,false,true,false,true],
  ['SESION_INICIAR','session','INICIAR',['coach','cliente'],false,false,false,true,false,true],
  ['SESION_COMPLETAR','session','COMPLETAR',['coach','sistema'],false,false,false,true,false,true],
  ['SESION_CANCELAR','session','CANCELAR',['coach'],true,false,false,true,false,true],
  ['EJECUCION_INICIAR','session_execution','INICIAR',['coach','cliente'],false,false,false,true,false,true],
  ['EJECUCION_GUARDAR_PROGRESO','session_execution','GUARDAR',['coach','cliente'],false,false,false,true,false,true],
  ['EJECUCION_PAUSAR','session_execution','PAUSAR',['coach','cliente'],false,false,false,true,false,true],
  ['EJECUCION_REANUDAR','session_execution','REANUDAR',['coach','cliente'],false,false,false,true,false,true],
  ['EJECUCION_COMPLETAR','session_execution','COMPLETAR',['coach','cliente'],false,false,false,true,false,true],
  ['EJECUCION_CANCELAR','session_execution','CANCELAR',['coach','cliente'],true,false,false,true,false,true],
  ['INTELIGENCIA_GENERAR','intelligence','GENERAR',['admin','coach'],false,false,false,true,true,true],
  ['INTELIGENCIA_REVISAR','intelligence','REVISAR',['admin','coach'],false,false,false,true,false,true],
  ['INTELIGENCIA_APROBAR','intelligence','APROBAR',['admin','coach'],false,false,false,true,false,true],
  ['INTELIGENCIA_DESCARTAR','intelligence','DESCARTAR',['admin','coach'],true,false,false,true,false,true],
  ['INTELIGENCIA_APLICAR_A_BORRADOR','intelligence','APLICAR',['admin','coach'],false,false,false,true,false,true],
];

export const M26_COMMAND_REGISTRY = Object.freeze(rows.map(([type, entityType, eventName, allowedRoles, requiresReason, requiresPreview, snapshotOnApply, conflictSensitive, bootstrapAllowed, enabled]) => Object.freeze({
  type, entityType, eventName, allowedRoles: Object.freeze([...allowedRoles]), requiresReason, requiresPreview,
  snapshotOnApply, conflictSensitive, bootstrapAllowed, enabled,
})));
export const M26_BASE_COMMAND_REGISTRY=M26_COMMAND_REGISTRY;
export const M26_COMMAND_TYPES = Object.freeze(M26_COMMAND_REGISTRY.map((entry) => entry.type));
export const M26_REQUIRED_COMMANDS = M26_COMMAND_TYPES;
export const M26_EXTENDED_COMMAND_REGISTRY=Object.freeze([...M26_COMMAND_REGISTRY,...M26_ENGAGEMENT_EXTENSION_REGISTRY]);
export const M26_EXTENDED_COMMAND_TYPES=Object.freeze(M26_EXTENDED_COMMAND_REGISTRY.map((entry)=>entry.type));

export function normalizeRegistryRole(role){const value=String(role||'').toLowerCase();return value==='client'?'cliente':value==='system'?'sistema':value;}
function registryMap(registry=M26_COMMAND_REGISTRY){return new Map(registry.map((entry)=>[entry.type,entry]));}
function normalizeInstalled(installed = []) {
  return installed.map((item) => typeof item === 'string' ? { type: item } : {
    type: item?.type || item?.command_type || '', entityType: item?.entityType || item?.entity_type,
    eventName: item?.eventName || item?.event_name, allowedRoles: item?.allowedRoles || item?.allowed_roles,
    requiresReason: item?.requiresReason ?? item?.requires_reason, requiresPreview: item?.requiresPreview ?? item?.requires_preview,
    snapshotOnApply: item?.snapshotOnApply ?? item?.snapshot_on_apply,
    conflictSensitive: item?.conflictSensitive ?? item?.conflict_sensitive,
    bootstrapAllowed: item?.bootstrapAllowed ?? item?.bootstrap_allowed,
    enabled: item?.enabled,
  }).filter((item) => item.type);
}
export function getCommandDefinition(type,registry=M26_COMMAND_REGISTRY) { return registryMap(registry).get(String(type || '')) || null; }
export function validateCommandCatalog(installed = [], expectedRegistry=M26_COMMAND_REGISTRY,{strict=false}={}) {
  const expectedMap=registryMap(expectedRegistry),normalized=normalizeInstalled(installed),counts=new Map();for(const entry of normalized)counts.set(entry.type,(counts.get(entry.type)||0)+1);
  const duplicates=[...counts.entries()].filter(([,count])=>count>1).map(([type,count])=>({type,count}));
  const installedMap = new Map(normalized.map((entry) => [entry.type, entry]));
  const expectedTypes=expectedRegistry.map((entry)=>entry.type);const missing = expectedTypes.filter((type) => !installedMap.has(type));
  const unexpected = [...installedMap.keys()].filter((type) => !expectedMap.has(type));const mismatches = [],incomplete=[];
  for (const expected of expectedRegistry) {const actual = installedMap.get(expected.type);if (!actual) continue;
    for (const key of ['entityType', 'eventName', 'requiresReason', 'requiresPreview','snapshotOnApply','conflictSensitive','bootstrapAllowed']) {if(strict&&actual[key]===undefined)incomplete.push({type:expected.type,field:key});else if(actual[key] !== undefined && actual[key] !== expected[key]) mismatches.push({ type: expected.type, field: key, expected: expected[key], actual: actual[key] });}
    if(strict&&!Array.isArray(actual.allowedRoles))incomplete.push({type:expected.type,field:'allowedRoles'});else if (actual.allowedRoles && JSON.stringify([...actual.allowedRoles].map(normalizeRegistryRole).sort()) !== JSON.stringify([...expected.allowedRoles].map(normalizeRegistryRole).sort())) mismatches.push({ type: expected.type, field: 'allowedRoles', expected: expected.allowedRoles, actual: actual.allowedRoles });
    if(strict&&actual.enabled===undefined)incomplete.push({type:expected.type,field:'enabled'});else if (actual.enabled === false) mismatches.push({ type: expected.type, field: 'enabled', expected: true, actual: false });
  }
  return { ok: missing.length === 0 && unexpected.length === 0 && mismatches.length === 0 && duplicates.length===0 && incomplete.length===0, required: expectedTypes.length, installed: installedMap.size, missing, unexpected, mismatches,duplicates,incomplete };
}
export function validatedRuntimeRegistry(installed=[]){
  const normalized=normalizeInstalled(installed),counts=new Map();for(const entry of normalized)counts.set(entry.type,(counts.get(entry.type)||0)+1);const installedMap=new Map(normalized.map((entry)=>[entry.type,entry]));const accepted=[],rejected=[];
  for(const expected of M26_EXTENDED_COMMAND_REGISTRY){const actual=installedMap.get(expected.type);if(!actual)continue;const check=validateCommandCatalog(normalized.filter((item)=>item.type===expected.type),[expected],{strict:true});if(check.ok)accepted.push(expected);else rejected.push(...check.mismatches,...check.incomplete,...check.duplicates);}
  const base=validateCommandCatalog(normalized.filter((item)=>M26_COMMAND_TYPES.includes(item.type)),M26_COMMAND_REGISTRY,{strict:true});
  return Object.freeze({ok:base.ok&&rejected.length===0,base,registry:Object.freeze(accepted),types:Object.freeze(accepted.map((item)=>item.type)),rejected:Object.freeze(rejected)});
}
export function validateCommandAgainstRegistry(command, role, registry=M26_COMMAND_REGISTRY) {
  const definition = getCommandDefinition(command?.type,registry);const errors = [];
  if (!definition) errors.push('COMMAND_NOT_REGISTERED'); else {if (command.entityType !== definition.entityType) errors.push('ENTITY_TYPE_MISMATCH');
    const normalizedRole=normalizeRegistryRole(role);if (normalizedRole && !definition.allowedRoles.map(normalizeRegistryRole).includes(normalizedRole)) errors.push('ROLE_NOT_ALLOWED');
    if (definition.requiresReason && !String(command.reason || '').trim()) errors.push('REASON_REQUIRED');if (definition.requiresPreview && command.previewAccepted !== true) errors.push('PREVIEW_REQUIRED');
    if (command.conflictSensitive !== undefined && command.conflictSensitive !== definition.conflictSensitive) errors.push('CONFLICT_POLICY_MISMATCH');}
  return { ok: errors.length === 0, errors, definition };
}
export function assertCommandSupported(type, installed = M26_COMMAND_TYPES,expectedRegistry=M26_COMMAND_REGISTRY) {const result = validateCommandCatalog(installed,expectedRegistry);if (!new Set(normalizeInstalled(installed).map((x) => x.type)).has(type)) throw new Error(`M26_COMMAND_NOT_INSTALLED:${type}`);return result;}
