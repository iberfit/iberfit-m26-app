import { assertKnownRole } from './role-policy.js';
import {ADMIN_AREAS,ADMIN_NAVIGATION} from '../admin/navigation.js';

export const M26_AREAS = Object.freeze({
  acceso: Object.freeze({ key: 'acceso', label: 'Acceso', title: 'Acceso IBERFIT', scope: 'public', roles: [] }),
  hoy: Object.freeze({ key: 'hoy', label: 'Hoy', title: 'Hoy en IBERFIT', scope: 'global', roles: ['coach', 'client'] }),
  clientes: Object.freeze({ key: 'clientes', label: 'Clientes', title: 'Clientes', scope: 'global', roles: ['coach'] }),
  expediente: Object.freeze({ key: 'expediente', label: 'Expediente', title: 'Expediente IBERFIT', scope: 'selected-client', roles: ['coach'] }),
  iri: Object.freeze({ key: 'iri', label: 'Diagnóstico IRI', title: 'Diagnóstico IRI', scope: 'selected-client', roles: ['coach'] }),
  informes: Object.freeze({ key: 'informes', label: 'Informes', title: 'Informes', scope: 'client-context', roles: ['coach', 'client'] }),
  planificacion: Object.freeze({ key: 'planificacion', label: 'Planificación', title: 'Planificación', scope: 'client-context', roles: ['coach', 'client'] }),
  agenda: Object.freeze({ key: 'agenda', label: 'Agenda', title: 'Agenda', scope: 'global', roles: ['coach'] }),
  sesion: Object.freeze({ key: 'sesion', label: 'Sesiones', title: 'Sesiones', scope: 'client-context', roles: ['coach', 'client'] }),
  progreso: Object.freeze({ key: 'progreso', label: 'Progreso', title: 'Progreso', scope: 'client-context', roles: ['coach', 'client'] }),
  actividad: Object.freeze({ key: 'actividad', label: 'Actividad', title: 'Actividad, hábitos y dispositivos', scope: 'client-context', roles: ['coach', 'client'] }),
  notas: Object.freeze({ key: 'notas', label: 'Notas privadas', title: 'Notas privadas del entrenador', scope: 'selected-client', roles: ['coach'] }),
  inteligencia: Object.freeze({ key: 'inteligencia', label: 'Inteligencia', title: 'Inteligencia IBERFIT', scope: 'selected-client', roles: ['coach'] }),
  biblioteca: Object.freeze({ key: 'biblioteca', label: 'Biblioteca', title: 'Biblioteca visual', scope: 'global', roles: ['coach'] }),
  retos: Object.freeze({ key: 'retos', label: 'Retos', title: 'Retos y comunidad', scope: 'client-context', roles: ['admin', 'coach', 'client'] }),
  ajustes: Object.freeze({ key: 'ajustes', label: 'Ajustes', title: 'Ajustes', scope: 'global', roles: ['admin', 'coach', 'client'] }),
  verificacion: Object.freeze({ key: 'verificacion', label: 'Verificación', title: 'Centro de verificación', scope: 'global', roles: ['coach'] }),
  mensajes: Object.freeze({ key: 'mensajes', label: 'Mensajes', title: 'Mensajes IBERFIT', scope: 'global', roles: ['coach','client'] }),
  ...ADMIN_AREAS,
});

const AREA_ALIASES = Object.freeze({
  inicio: 'hoy',home: 'hoy',cliente: 'expediente',diagnostico: 'iri',diagnóstico: 'iri',plan: 'planificacion',planificación: 'planificacion',entrenar: 'sesion',sesiones: 'sesion',informe: 'informes',reportes: 'informes',library: 'biblioteca',qa: 'verificacion',mensaje:'mensajes',mensajes:'mensajes',comunicacion:'mensajes',comunicación:'mensajes',administracion:'admin-inicio',administración:'admin-inicio',usuarios:'admin-usuarios',equipo:'admin-equipo',operaciones:'admin-operaciones',auditoria:'admin-auditoria',auditoría:'admin-auditoria',
  comunidad: 'retos',
  challenges: 'retos',
  configuracion: 'ajustes',
  configuración: 'ajustes',
  settings: 'ajustes',
});

const NAVIGATION = Object.freeze({
  admin: Object.freeze({...ADMIN_NAVIGATION}),
  coach: Object.freeze({
    primary: ['hoy', 'clientes', 'agenda', 'biblioteca'],
    context: ['expediente', 'iri', 'planificacion', 'sesion', 'progreso', 'actividad', 'informes', 'notas', 'inteligencia'],
    tools: ['mensajes', 'verificacion'],
    mobile: ['hoy', 'clientes', 'agenda', 'mensajes'],
  }),
  client: Object.freeze({
    primary: ['hoy', 'planificacion', 'sesion', 'progreso'],
    context: ['informes', 'actividad', 'mensajes'],
    tools: [],
    mobile: ['hoy', 'sesion', 'progreso', 'actividad'],
  }),
});

export function canonicalArea(value) {const requested=String(value||'').trim().toLowerCase();if(M26_AREAS[requested])return requested;return AREA_ALIASES[requested]||null;}
export function areaDefinition(value){const key=canonicalArea(value);return key?M26_AREAS[key]:null;}
function resolveItems(keys){return keys.map((key)=>M26_AREAS[key]);}
export function navigationForRole(value){const role=assertKnownRole(value);const model=NAVIGATION[role];return Object.freeze({role,primary:Object.freeze(resolveItems(model.primary)),context:Object.freeze(resolveItems(model.context)),tools:Object.freeze(resolveItems(model.tools)),mobile:Object.freeze(resolveItems(model.mobile))});}
export function roleHome(value){const role=assertKnownRole(value);return role==='admin'?'admin-inicio':'hoy';}
export function areaAllowedForRole(area,role){const definition=areaDefinition(area);const normalized=assertKnownRole(role);if(normalized==='admin')return Boolean(definition?.key?.startsWith('admin-')&&definition?.roles?.includes('admin'));return Boolean(definition?.roles?.includes(normalized));}
