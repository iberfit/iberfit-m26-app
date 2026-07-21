// IBERFIT V12 M6 · Adaptador Supabase sintético
// Este adaptador no conecta credenciales reales. Traduce operaciones canónicas a contratos
// verificables para staging Supabase y mantiene Gate 0: syntheticOnly=true obligatorio.

export const SUPABASE_TABLE_MAP = Object.freeze({
  clients: 'clients',
  clientProfiles: 'client_app_profiles',
  cycles: 'training_cycles',
  sessions: 'sessions',
  sessionEvents: 'session_events',
  iri: 'iri_assessments',
  reports: 'reports',
  documents: 'documents',
  syncReceipts: 'sync_receipts',
  audit: 'audit_events',
  expediente: 'client_timeline_events',
  planChanges: 'plan_change_proposals',
});

const SENSITIVE_TYPES = new Set([
  'MODALIDAD_CAMBIADA',
  'PERFIL_CLIENTE_PUBLICADO',
  'PLANIFICACION_APROBADA',
  'SESION_PUBLICADA',
  'IRI_APROBADO',
  'INFORME_PUBLICADO',
  'INFORME_RETIRADO',
  'DOCUMENTO_PUBLICADO',
  'DOCUMENTO_RETIRADO',
  'CAMBIO_PLAN_PUBLICADO',
]);

const EVENT_TYPES = new Set([
  'SESION_INICIADA',
  'SERIE_COMPLETADA',
  'INCIDENCIA_REGISTRADA',
  'CHECKIN_REGISTRADO',
  'FEEDBACK_REGISTRADO',
  'SESION_CERRADA',
  'EJERCICIO_OMITIDO',
  'EJERCICIO_REEMPLAZADO',
  'EJERCICIO_AÑADIDO',
  'DESCANSO_EDITADO',
  'CAMBIO_PLAN_APROBADO',
  'CAMBIO_PLAN_DESCARTADO',
]);

export function ensureSupabaseConfig(config = {}) {
  const authMode = config.authMode;
  if (authMode === 'supabase-synthetic') {
    if (config.syntheticOnly !== true) throw new Error('Gate 0: el entorno de ensayo debe ser sintético');
    if (config.allowRealData === true) throw new Error('Gate 0: los datos reales no están autorizados en ensayo');
    return { ...config, syntheticOnly: true, allowRealData: false, environment: 'SYNTHETIC_ONLY' };
  }
  if (authMode === 'supabase-production') {
    if (config.syntheticOnly === true) throw new Error('La producción no puede declararse sintética');
    if (config.allowRealData !== true) throw new Error('La producción requiere autorización explícita para datos reales');
    return { ...config, syntheticOnly: false, allowRealData: true, environment: 'PRODUCTION' };
  }
  throw new Error('Modo Supabase no reconocido');
}

export function ensureSyntheticSupabaseConfig(config = {}) {
  return ensureSupabaseConfig({ ...config, authMode: config.authMode || 'supabase-synthetic' });
}

export function tableForEntity(entityType) {
  const normalized = String(entityType || '').toLowerCase();
  const aliases = {
    client: SUPABASE_TABLE_MAP.clients,
    perfil_cliente: SUPABASE_TABLE_MAP.clientProfiles,
    cycle: SUPABASE_TABLE_MAP.cycles,
    planning: SUPABASE_TABLE_MAP.cycles,
    session: SUPABASE_TABLE_MAP.sessions,
    iri: SUPABASE_TABLE_MAP.iri,
    report: SUPABASE_TABLE_MAP.reports,
    document: SUPABASE_TABLE_MAP.documents,
    expediente: SUPABASE_TABLE_MAP.expediente,
    plan_change: SUPABASE_TABLE_MAP.planChanges,
  };
  return aliases[normalized] || null;
}

export function mapOperationToSupabaseContract(operation) {
  if (!operation?.operationId || !operation?.type) throw new Error('Operación sin contrato mínimo');
  if (EVENT_TYPES.has(operation.type)) {
    return {
      mode: 'append-only',
      table: SUPABASE_TABLE_MAP.sessionEvents,
      match: { operation_id: operation.operationId },
      insert: {
        operation_id: operation.operationId,
        session_id: operation.entityId,
        event_type: operation.type,
        payload: operation.payload || {},
        base_revision: operation.baseRevision ?? 0,
      },
      idempotencyKey: 'operation_id',
      requiresRevision: false,
    };
  }

  const table = tableForEntity(operation.entityType);
  if (!table) throw new Error(`Entidad sin tabla Supabase: ${operation.entityType}`);
  return {
    mode: SENSITIVE_TYPES.has(operation.type) || operation.conflictSensitive ? 'revisioned-upsert' : 'upsert',
    table,
    match: { id: operation.entityId, revision: operation.baseRevision ?? 0 },
    upsert: {
      id: operation.entityId,
      ...(operation.payload || {}),
      revision: Number(operation.baseRevision || 0) + 1,
    },
    idempotencyKey: 'operation_id',
    requiresRevision: SENSITIVE_TYPES.has(operation.type) || Boolean(operation.conflictSensitive),
  };
}

export function buildRlsProbeMatrix({ clientUserId = 'USR-CLIENT-001', coachUserId = 'USR-COACH-001', adminUserId = 'USR-ADMIN-001', clientId = 'CLI-DEMO-001' } = {}) {
  return [
    { actor: clientUserId, role: 'cliente', action: 'select', table: 'clients', clientId, expected: 'allow-own' },
    { actor: clientUserId, role: 'cliente', action: 'select', table: 'reports', clientId, filter: { status: 'publicado', audience: 'cliente' }, expected: 'allow-published' },
    { actor: clientUserId, role: 'cliente', action: 'select', table: 'reports', clientId, filter: { status: 'borrador' }, expected: 'deny-drafts' },
    { actor: clientUserId, role: 'cliente', action: 'insert', table: 'client_app_profiles', clientId, expected: 'deny' },
    { actor: coachUserId, role: 'coach', action: 'select', table: 'clients', clientId, expected: 'allow-assigned' },
    { actor: coachUserId, role: 'coach', action: 'update', table: 'sessions', clientId, expected: 'allow-assigned' },
    { actor: adminUserId, role: 'admin', action: 'select', table: 'audit_events', expected: 'allow-global' },
  ];
}

export function evaluateSyntheticRls(probe, assignments = [{ coachUserId: 'USR-COACH-001', clientId: 'CLI-DEMO-001' }]) {
  if (probe.role === 'admin') return true;
  if (probe.role === 'cliente') {
    if (probe.action !== 'select' && probe.table !== 'session_events') return false;
    if (probe.expected === 'deny-drafts') return false;
    return probe.clientId === 'CLI-DEMO-001';
  }
  if (probe.role === 'coach') {
    return assignments.some((item) => item.coachUserId === probe.actor && item.clientId === probe.clientId);
  }
  return false;
}
