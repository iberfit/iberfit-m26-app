export const IBERFIT_UI_LOCALE = 'es-ES';

const STATUS_LABELS = Object.freeze({
  active: 'Activo', activo: 'Activo',
  available: 'Disponible', disponible: 'Disponible',
  authorizing: 'Solicitando autorización',
  cancelled: 'Cancelado', cancelado: 'Cancelado',
  clean: 'Confirmado', confirmado: 'Confirmado', confirmed: 'Confirmado',
  completed: 'Completado', completado: 'Completado',
  conflict: 'Conflicto', conflicto: 'Conflicto',
  connected: 'Conectado', conectado: 'Conectado',
  draft: 'Borrador', borrador: 'Borrador',
  error: 'Error',
  paused: 'En pausa', pausado: 'En pausa',
  pending: 'Pendiente', pendiente: 'Pendiente',
  published: 'Publicado', publicado: 'Publicado',
  approved: 'Aprobado', aprobado: 'Aprobado',
  review: 'Pendiente de aprobación', revision: 'Pendiente de aprobación', en_revision: 'Pendiente de aprobación', validado: 'Pendiente de aprobación', validated: 'Pendiente de aprobación',
  withdrawn: 'Retirado', retirado: 'Retirado',
  archived: 'Archivado', archivado: 'Archivado',
  ready: 'Preparado', preparado: 'Preparado',
  rejected: 'Rechazada', rechazado: 'Rechazado', rechazada: 'Rechazada',
  revoked: 'Revocado', revocado: 'Revocado',
  syncing: 'Sincronizando', sincronizando: 'Sincronizando',
  unavailable: 'No disponible',
});

const SOURCE_LABELS = Object.freeze({
  checkin: 'Registro de bienestar',
  checkins: 'Registros de bienestar',
  registro_bienestar: 'Registro de bienestar',
  sessions: 'Sesiones',
  session: 'Sesión',
  planning: 'Planificación',
  'data-quality': 'Calidad de los datos',
  data_quality: 'Calidad de los datos',
  wearable: 'Datos de dispositivos',
  wearables: 'Datos de dispositivos',
});

const PLATFORM_LABELS = Object.freeze({
  android: 'Android',
  browser: 'Navegador',
  cloud: 'Servicio en línea',
  ios: 'iOS',
});

export function castilianStatusLabel(value, fallback = 'Sin estado') {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return fallback;
  return STATUS_LABELS[key] || key.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

export function castilianSourceLabel(value, fallback = 'IBERFIT') {
  const key = String(value ?? '').trim().toLowerCase();
  return SOURCE_LABELS[key] || fallback;
}

export function castilianPlatformLabel(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return PLATFORM_LABELS[key] || 'Plataforma externa';
}

const OPERATION_ENTITY_LABELS = Object.freeze({
  appointment: 'Cita',
  checkin: 'Registro de bienestar',
  client_access: 'Acceso del cliente',
  habit: 'Hábito',
  habit_log: 'Registro de hábito',
  intelligence: 'Propuesta de inteligencia',
  iri: 'Diagnóstico IRI',
  planning: 'Planificación',
  private_note: 'Nota privada',
  report: 'Informe',
  session: 'Sesión',
  session_execution: 'Ejecución de sesión',
});

const OPERATION_ACTION_LABELS = Object.freeze({
  ACTUALIZAR: 'Actualizar',
  ANULAR: 'Anular',
  APLICAR: 'Aplicar',
  APROBAR: 'Aprobar',
  ARCHIVAR: 'Archivar',
  CANCELAR: 'Cancelar',
  CANCELAR_INVITACION: 'Cancelar invitación',
  COMPLETAR: 'Completar',
  CREAR: 'Crear',
  DEFINIR: 'Definir',
  DESCARTAR: 'Descartar',
  GENERAR: 'Generar',
  GUARDAR: 'Guardar progreso',
  HABILITAR: 'Habilitar',
  INICIAR: 'Iniciar',
  INVITAR: 'Invitar',
  PUBLICAR: 'Publicar',
  REABRIR: 'Reabrir',
  REACTIVAR: 'Reactivar',
  REANUDAR: 'Reanudar',
  REENVIAR: 'Reenviar invitación',
  REGISTRAR: 'Registrar',
  REPROGRAMAR: 'Reprogramar',
  RETIRAR: 'Retirar',
  REVISAR: 'Revisar',
  SUSPENDER: 'Suspender',
  SUSTITUIR: 'Sustituir',
  VALIDAR: 'Validar',
});

const ERROR_MESSAGES = Object.freeze({
  M26_NETWORK_UNAVAILABLE: 'No hay conexión. Se volverá a intentar de forma segura.',
  REVISION_CONFLICT: 'Existe una versión más reciente que debe revisarse.',
  ROLE_FORBIDDEN: 'La cuenta actual no tiene permiso para completar esta operación.',
  REJECTED: 'La operación no fue aceptada y requiere revisión.',
});

export function castilianEntityLabel(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return OPERATION_ENTITY_LABELS[key] || 'Operación IBERFIT';
}

export function castilianOperationTitle(type, entityType = '') {
  const raw = String(type ?? '').trim().toUpperCase();
  const action = Object.keys(OPERATION_ACTION_LABELS)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => raw === candidate || raw.endsWith(`_${candidate}`));
  const entity = castilianEntityLabel(entityType || raw.toLowerCase());
  return action ? `${entity} · ${OPERATION_ACTION_LABELS[action]}` : entity;
}

export function castilianOperationDetail(errorCode, entityType = '') {
  const code = String(errorCode ?? '').trim().toUpperCase();
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  return code ? 'La operación requiere revisión antes de continuar.' : `${castilianEntityLabel(entityType)} pendiente de confirmación.`;
}
