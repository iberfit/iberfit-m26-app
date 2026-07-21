import { clientProfileFor, contextualProgressSignal, createSessionState } from './domain.js';
import { createPlanningDraft } from './planning.js';
import { createIriAssessment } from './iri.js';
import { api } from './api.js';
import { createOperationEnvelope, applyReconcileResult } from './sync.js';
import { prepareConflictResolution } from './conflicts.js';
import { canonicalExerciseFallback } from './exercise-catalog.js';


const initialIriAssessment = createIriAssessment({
  id: 'IRI-DEMO-001',
  clientId: 'CLI-DEMO-001',
  evaluatedAt: '2026-07-01',
  sections: {
    contexto: {
      objetivo: 'Mejorar fuerza y composición corporal',
      objetivosSecundarios: 'Aumentar autonomía y continuidad',
      antecedentes: 'Sin restricciones médicas declaradas',
      restricciones: 'Ninguna declarada',
      limitadores: 'Estrés laboral alto',
      experiencia: 'Intermedia',
      frecuenciaActual: '2 sesiones por semana',
      disponibilidad: '3 días por semana',
      sueno: '6',
      estres: '7',
      dolor: '1',
    },
    composicion: {
      peso: '68.4', talla: '165', grasa: '31', masaMuscular: '26.1', cintura: '79',
      condiciones: 'Mañana, ayuno, misma máquina', dispositivo: 'Equipo sintético de referencia',
    },
    movilidad: {
      tobillo: 'Mejorable', cadera: 'Adecuada', hombro: 'Adecuada',
      tobilloIzq: '3', tobilloDer: '2', caderaIzq: '4', caderaDer: '4', hombroIzq: '4', hombroDer: '4',
      observaciones: 'Revisar dorsiflexión derecha',
    },
    fuerza: {
      traccion: 'Inicial', traccionTest: 'Remo con banda', traccionCalidad: '2', traccionReps: '12', traccionRpe: '7', traccionDolor: '0',
      empuje: 'Media', empujeTest: 'Flexión inclinada', empujeCalidad: '3', empujeReps: '10', empujeRpe: '7', empujeDolor: '0',
      bisagra: 'Media', bisagraTest: 'Peso muerto rumano con mancuernas', bisagraCalidad: '3', bisagraCarga: '20', bisagraReps: '8', bisagraRpe: '7', bisagraDolor: '0',
      sentadilla: 'Media', sentadillaTest: 'Sentadilla Goblet', sentadillaCalidad: '4', sentadillaCarga: '12', sentadillaReps: '8', sentadillaRpe: '7', sentadillaDolor: '0',
      rotacion: 'Inicial', rotacionTest: 'Pallof press', rotacionCalidad: '2', rotacionReps: '10', rotacionRpe: '6', rotacionDolor: '0',
    },
    capacidad: { fcReposo: '72', fcFinal: '154', fcMinuto: '126', protocolo: 'Step test 3 minutos', duracion: '3', rpe: '7' },
    interpretacion: {
      fortalezas: 'Buena adherencia y control en sentadilla',
      limitadores: 'Tracción y movilidad de tobillo',
      clasificacion: 'Progreso',
      criterio: 'Base sólida con dos prioridades concretas',
      calidadDatos: 'alta',
    },
    planAccion: {
      prioridad1: 'Progresar tracción', prioridad2: 'Mejorar dorsiflexión', prioridad3: 'Consolidar anti-rotación',
      modalidadSugerida: 'Híbrido', frecuenciaSugerida: '3 sesiones por semana', reevaluacion: '2026-08-01',
      acciones: 'Dos sesiones de fuerza y una sesión guiada en app.',
    },
  },
});

export const initialState = {
  coachMode: 'campo',
  coachSection: 'hoy',
  recovery: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  selectedClientId: 'CLI-DEMO-001',
  client: {
    id: 'CLI-DEMO-001',
    name: 'Ana Demo Martín',
    modalidad: 'Híbrido',
    profileVersion: 3,
    profileRevision: 0,
    revision: 0,
    objective: 'Recomposición corporal y fuerza',
    nextSession: 'Mañana · 18:30',
    coachMessage: 'Esta semana priorizamos calidad técnica y continuidad.',
    appProfile: clientProfileFor('Híbrido', { version: 3, revision: 0, status: 'publicado', publishedAt: '2026-07-01T10:00:00.000Z' }),
  },
  clients: [
    { id: 'CLI-DEMO-001', name: 'Ana Demo Martín', modalidad: 'Híbrido', objective: 'Recomposición corporal y fuerza', profileVersion: 3, profileRevision: 0, revision: 0, pendingModalidad: null },
    { id: 'CLI-DEMO-002', name: 'Luis Demo Fernández', modalidad: 'Presencial', objective: 'Fuerza y movilidad', profileVersion: 1, profileRevision: 0, revision: 0, pendingModalidad: null },
    { id: 'CLI-DEMO-003', name: 'Marta Demo Silva', modalidad: 'Online', objective: 'Continuidad y capacidad física', profileVersion: 2, profileRevision: 0, revision: 0, pendingModalidad: null },
  ],
  exerciseLibrary: canonicalExerciseFallback(),
  availableEquipment: ['sin equipo', 'mancuerna', 'banda', 'cajón', 'silla', 'palo', 'banco', 'polea'],
  limitations: [],
  planning: createPlanningDraft({
    id: 'PLAN-DEMO-001',
    clientId: 'CLI-DEMO-001',
    title: 'Ciclo base · Fuerza y continuidad',
    goal: 'Consolidar técnica y progresar sin perder adherencia',
    weeks: 4,
    session: {
      id: 'SES-PLAN-001', revision: 0, title: 'Sesión A · Fuerza global', type: 'guiada_en_app', blocks: [
        { id: 'PB1', title: 'Preparación', type: 'simple', exercises: [{ id: 'E1', name: 'Dead bug', sets: 3, reps: 8, load: 0, rest: 45 }] },
      ],
    },
  }),
  iriAssessment: initialIriAssessment,
  iriAssessments: [initialIriAssessment],
  documents: [
    { id: 'DOC-001', type: 'bioimpedancia', title: 'Bioimpedancia inicial', version: 1, status: 'interno', measuredAt: '2026-07-01', conditions: 'Mañana, ayuno, misma máquina' },
  ],
  session: {
    id: 'SES-DEMO-001',
    revision: 0,
    title: 'Fuerza global · Técnica y control',
    type: 'guiada_en_app',
    blocks: [
      { id: 'B1', title: 'Preparación', type: 'simple', exercises: [{ id: 'E1', name: 'Dead bug', sets: 3, reps: 8, load: 0, rest: 45 }] },
      {
        id: 'B2',
        title: 'Superserie de fuerza',
        type: 'superserie',
        exercises: [
          { id: 'E2', name: 'Sentadilla Goblet', sets: 4, reps: 8, load: 12, rest: 90 },
          { id: 'E3', name: 'Remo con banda', sets: 3, reps: 12, load: 0, rest: 60 },
        ],
      },
      {
        id: 'B3',
        title: 'Circuito de cierre',
        type: 'circuito',
        rounds: 2,
        restBetweenRounds: 60,
        exercises: [
          { id: 'E4', name: 'Pallof press', sets: 1, reps: 10, load: 0, rest: 30 },
          { id: 'E5', name: 'Step-up', sets: 1, reps: 8, load: 6, rest: 30 },
        ],
      },
    ],
  },
  activeSession: null,
  checkin: { energy: 6, sleep: 6, stress: 7, pain: 1 },
  progressContext: { loadDelta: 0, volumeDelta: 0, rpeDelta: -1, adherence: 1, goal: 'fuerza y calidad técnica', dataQuality: 'alta', sessionsObserved: 4, technicalQuality: 8 },
  intelligenceRuns: [],
  planChanges: [],
  reports: [
    { id: 'INF-001', title: 'Informe mensual · Junio', status: 'publicado', revision: 1, summary: 'Mejora consistente en adherencia y tolerancia a la carga.' },
    { id: 'INF-002', title: 'Informe IRI inicial', status: 'aprobado', revision: 0, summary: 'Base sólida con prioridad en movilidad de tobillo y fuerza de tracción.' },
  ],
  iri: { score: 67.8, classification: 'Performance', nextAction: 'Mantener progresión de fuerza y revisar movilidad en 4 semanas.' },
  operationalEvents: [],
  backupHistory: [],
  chaosReport: null,
  loadReport: null,
  systemChecks: {
    'synthetic-only': true,
    'security-advisor-clean': true,
    'auth-rls-e2e': true,
    'storage-private': true,
    'backup-restore': false,
    'chaos-offline': false,
    'synthetic-load': false,
    'visual-mobile': true,
    'visual-tablet': true,
    'visual-desktop': true,
    'accessibility-smoke': true,
  },
  sync: { lastResult: null, conflicts: [], repositoryKind: 'inicializando' },
  audit: [],
};

export function cloneInitialState() {
  return structuredClone(initialState);
}

export async function loadState(repository) {
  const [saved, storedDocuments] = await Promise.all([repository.getState(), repository.listDocuments?.() || []]);
  const base = cloneInitialState();
  const merged = saved ? { ...base, ...saved } : base;
  const documentMap = new Map((merged.documents || []).map((item) => [item.id, item]));
  for (const item of storedDocuments || []) documentMap.set(item.id, { ...item, blob: undefined, dataUrl: undefined });
  return {
    ...merged,
    documents: [...documentMap.values()],
    sync: { ...base.sync, ...(merged.sync || {}), repositoryKind: repository.kind },
  };
}

export async function saveState(repository, state) {
  await repository.setState(state);
}

export async function addAudit(repository, state, audit) {
  if (!audit) return state;
  const item = { id: globalThis.crypto?.randomUUID?.() || `AUD-${Date.now()}`, ...audit, at: new Date().toISOString() };
  await repository.putAudit(item);
  return { ...state, audit: [item, ...(state.audit || [])].slice(0, 100) };
}

export async function enqueue(repository, operation) {
  const queue = await repository.listOutbox();
  const nextSequence = queue.reduce((max, item) => Math.max(max, Number(item.localSequence || 0)), 0) + 1;
  const envelope = createOperationEnvelope(operation, { localSequence: nextSequence });
  await repository.putOutbox(envelope);
  return envelope;
}

export async function outboxItems(repository) {
  return (await repository.listOutbox()).sort((a, b) => a.localSequence - b.localSequence);
}

export async function outboxCount(repository) {
  return (await repository.listOutbox()).length;
}

export async function conflictCount(repository) {
  return (await repository.listOutbox()).filter((item) => item.status === 'conflicto').length;
}

export async function reconcileOutbox(repository, auth) {
  if (!navigator.onLine) return { ok: false, reason: 'Sin conexión', ack: [], conflicts: [], rejected: [] };
  if (!auth?.token) return { ok: false, reason: 'Sin sesión autenticada', ack: [], conflicts: [], rejected: [] };
  const queue = await outboxItems(repository);
  if (!queue.length) return { ok: true, ack: [], conflicts: [], rejected: [] };
  const remote = repository.authMode === 'supabase-synthetic' && typeof repository.reconcileRemote === 'function'
    ? await repository.reconcileRemote(auth.token, queue)
    : await api.reconcile(auth.token, queue);
  const applied = applyReconcileResult(queue, remote);
  await repository.clearOutbox();
  for (const item of applied.remaining) await repository.putOutbox(item);
  return { ok: applied.conflicts.length === 0 && applied.rejected.length === 0, ...applied, remoteRevisions: remote.remoteRevisions };
}

export async function discardConflict(repository, operationId) {
  await repository.removeOutbox(operationId);
}

export async function storeDocument(repository, record) {
  await repository.putDocument(record);
  return { ...record, blob: undefined, dataUrl: undefined };
}

export async function resolveQueuedConflict(repository, operationId, strategy) {
  const queue = await outboxItems(repository);
  const target = queue.find((item) => item.operationId === operationId);
  if (!target) throw new Error('Operación en conflicto no encontrada');
  const resolution = prepareConflictResolution(target, strategy);
  await repository.removeOutbox(operationId);
  if (resolution.action === 'discard') return resolution;
  const nextSequence = queue.reduce((max, item) => Math.max(max, Number(item.localSequence || 0)), 0) + 1;
  const envelope = createOperationEnvelope(resolution.operation, { localSequence: nextSequence });
  await repository.putOutbox(envelope);
  return { ...resolution, operation: envelope };
}

export function ensureActiveSession(state) {
  return state.activeSession ? state : { ...state, activeSession: createSessionState(state.session) };
}

export function profile(state) {
  return state.client.appProfile || clientProfileFor(state.client.modalidad, { version: state.client.profileVersion, status: 'publicado' });
}

export function progressSignal(state) {
  return contextualProgressSignal({ ...state.progressContext, checkin: state.checkin });
}
