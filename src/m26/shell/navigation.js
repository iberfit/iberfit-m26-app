import { assertKnownRole } from './role-policy.js';

export const M26_AREAS = Object.freeze({
  acceso: Object.freeze({ key: 'acceso', label: 'Acceso', title: 'Acceso IBERFIT', scope: 'public', roles: [] }),
  hoy: Object.freeze({ key: 'hoy', label: 'Hoy', title: 'Hoy en IBERFIT', scope: 'global', roles: ['admin', 'coach', 'client'] }),
  clientes: Object.freeze({ key: 'clientes', label: 'Clientes', title: 'Clientes', scope: 'global', roles: ['admin', 'coach'] }),
  expediente: Object.freeze({ key: 'expediente', label: 'Expediente', title: 'Expediente IBERFIT', scope: 'selected-client', roles: ['admin', 'coach'] }),
  iri: Object.freeze({ key: 'iri', label: 'Diagnóstico IRI', title: 'Diagnóstico IRI', scope: 'selected-client', roles: ['admin', 'coach'] }),
  informes: Object.freeze({ key: 'informes', label: 'Informes', title: 'Informes', scope: 'client-context', roles: ['admin', 'coach', 'client'] }),
  planificacion: Object.freeze({ key: 'planificacion', label: 'Planificación', title: 'Planificación', scope: 'client-context', roles: ['admin', 'coach', 'client'] }),
  agenda: Object.freeze({ key: 'agenda', label: 'Agenda', title: 'Agenda', scope: 'global', roles: ['admin', 'coach'] }),
  sesion: Object.freeze({ key: 'sesion', label: 'Sesiones', title: 'Sesiones', scope: 'client-context', roles: ['admin', 'coach', 'client'] }),
  progreso: Object.freeze({ key: 'progreso', label: 'Progreso', title: 'Progreso', scope: 'client-context', roles: ['admin', 'coach', 'client'] }),
  actividad: Object.freeze({ key: 'actividad', label: 'Actividad', title: 'Actividad, hábitos y dispositivos', scope: 'client-context', roles: ['admin', 'coach', 'client'] }),
  notas: Object.freeze({ key: 'notas', label: 'Notas privadas', title: 'Notas privadas del entrenador', scope: 'selected-client', roles: ['admin', 'coach'] }),
  inteligencia: Object.freeze({ key: 'inteligencia', label: 'Inteligencia', title: 'Inteligencia IBERFIT', scope: 'selected-client', roles: ['admin', 'coach'] }),
  biblioteca: Object.freeze({ key: 'biblioteca', label: 'Biblioteca', title: 'Biblioteca visual', scope: 'global', roles: ['admin', 'coach'] }),
  verificacion: Object.freeze({ key: 'verificacion', label: 'Verificación', title: 'Centro de verificación', scope: 'global', roles: ['admin', 'coach'] }),
});

const AREA_ALIASES = Object.freeze({
  inicio: 'hoy',
  home: 'hoy',
  cliente: 'expediente',
  diagnostico: 'iri',
  diagnóstico: 'iri',
  plan: 'planificacion',
  planificación: 'planificacion',
  entrenar: 'sesion',
  sesiones: 'sesion',
  informe: 'informes',
  reportes: 'informes',
  library: 'biblioteca',
  qa: 'verificacion',
});

const NAVIGATION = Object.freeze({
  admin: Object.freeze({
    primary: ['hoy', 'clientes', 'agenda', 'biblioteca'],
    context: ['expediente', 'iri', 'planificacion', 'sesion', 'progreso', 'actividad', 'informes', 'notas', 'inteligencia'],
    tools: ['verificacion'],
    mobile: ['hoy', 'clientes', 'agenda', 'biblioteca', 'verificacion'],
  }),
  coach: Object.freeze({
    primary: ['hoy', 'clientes', 'agenda', 'biblioteca'],
    context: ['expediente', 'iri', 'planificacion', 'sesion', 'progreso', 'actividad', 'informes', 'notas', 'inteligencia'],
    tools: ['verificacion'],
    mobile: ['hoy', 'clientes', 'agenda', 'biblioteca', 'verificacion'],
  }),
  client: Object.freeze({
    primary: ['hoy', 'planificacion', 'sesion', 'progreso'],
    context: ['informes', 'actividad'],
    tools: [],
    mobile: ['hoy', 'planificacion', 'sesion', 'progreso', 'actividad'],
  }),
});

export function canonicalArea(value) {
  const requested = String(value || '').trim().toLowerCase();
  if (M26_AREAS[requested]) return requested;
  return AREA_ALIASES[requested] || null;
}

export function areaDefinition(value) {
  const key = canonicalArea(value);
  return key ? M26_AREAS[key] : null;
}

function resolveItems(keys) {
  return keys.map((key) => M26_AREAS[key]);
}

export function navigationForRole(value) {
  const role = assertKnownRole(value);
  const model = NAVIGATION[role];
  return Object.freeze({
    role,
    primary: Object.freeze(resolveItems(model.primary)),
    context: Object.freeze(resolveItems(model.context)),
    tools: Object.freeze(resolveItems(model.tools)),
    mobile: Object.freeze(resolveItems(model.mobile)),
  });
}

export function roleHome(value) {
  assertKnownRole(value);
  return 'hoy';
}

export function areaAllowedForRole(area, role) {
  const definition = areaDefinition(area);
  const normalizedRole = assertKnownRole(role);
  return Boolean(definition?.roles?.includes(normalizedRole));
}
