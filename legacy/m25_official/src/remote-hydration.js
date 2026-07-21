import { clientProfileFor, normalizeSession } from './domain.js';
import { createPlanningDraft } from './planning.js';
import { createIriAssessment, mapRemoteIriAssessment } from './iri.js';

const ROLE_MAP = Object.freeze({ client: 'cliente', cliente: 'cliente', coach: 'coach', admin: 'admin' });
const PUBLISHED = new Set(['publicado', 'aprobado']);

export function normalizeIberfitRole(value) {
  return ROLE_MAP[String(value || '').trim().toLowerCase()] || null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function latest(items, predicate = () => true) {
  return list(items)
    .filter(predicate)
    .sort((a, b) => {
      const statusDelta = Number(PUBLISHED.has(b.status)) - Number(PUBLISHED.has(a.status));
      if (statusDelta) return statusDelta;
      const versionDelta = Number(b.version || b.revision || 0) - Number(a.version || a.revision || 0);
      if (versionDelta) return versionDelta;
      return String(b.published_at || b.updated_at || b.created_at || '').localeCompare(String(a.published_at || a.updated_at || a.created_at || ''));
    })[0] || null;
}

function mapClientProfile(remote, client) {
  return clientProfileFor(client.modalidad, {
    version: Number(remote?.version || 1),
    revision: Number(remote?.revision || 0),
    status: remote?.status || 'borrador',
    publishedAt: remote?.published_at || null,
    modules: Array.isArray(remote?.modules) && remote.modules.length ? remote.modules : undefined,
  });
}

function mapClient(remote, profile, intake) {
  const modalidad = remote.modality || remote.modalidad || 'Presencial';
  return {
    id: remote.id,
    name: remote.name || 'Cliente IBERFIT',
    modalidad,
    objective: remote.objective || '',
    profileVersion: Number(profile?.version || 1),
    profileRevision: Number(profile?.revision || 0),
    revision: Number(remote.revision || 0),
    pendingModalidad: null,
    email: intake?.email || '',
    address: intake?.address || '',
    zone: intake?.zone || '',
    level: intake?.level || '',
    phase: intake?.phase || '',
    frequency: intake?.frequency || '',
    restrictions: intake?.restrictions || '',
    pain: intake?.pain || '',
    history: intake?.history || '',
    equipment: intake?.equipment || '',
    preferences: intake?.preferences || '',
    primaryLimiter: intake?.primary_limiter || '',
    currentRecommendation: intake?.current_recommendation || '',
    pending: intake?.pending || '',
    onboardingStatus: intake?.onboarding_status || 'expediente',
  };
}

function mapSession(remote, fallback) {
  if (!remote?.id) return fallback;
  const blocks = list(remote.prescription?.blocks);
  if (!blocks.length && fallback?.blocks?.length) {
    return normalizeSession({
      ...fallback,
      id: remote.id,
      revision: Number(remote.revision || 0),
      title: remote.title || fallback.title,
      type: remote.execution_type || fallback.type,
      remoteStatus: remote.status,
      publishedAt: remote.published_at || null,
    });
  }
  return normalizeSession({
    id: remote.id,
    revision: Number(remote.revision || 0),
    title: remote.title || 'Sesión IBERFIT',
    type: remote.execution_type || 'guiada_en_app',
    blocks,
    remoteStatus: remote.status,
    publishedAt: remote.published_at || null,
  });
}

function mapReport(remote) {
  return {
    id: remote.id,
    clientId: remote.client_id,
    sourceType: remote.source_type || null,
    sourceId: remote.source_id || null,
    title: remote.title,
    type: remote.report_type,
    audience: remote.audience,
    summary: remote.summary || '',
    detail: remote.content || {},
    status: remote.status,
    revision: Number(remote.revision || 0),
    approvedAt: remote.approved_at || null,
    publishedAt: remote.published_at || null,
    createdAt: remote.created_at || null,
  };
}

function mapDocument(remote) {
  return {
    id: remote.id,
    lineageId: remote.lineage_id,
    clientId: remote.client_id,
    iriId: remote.iri_id || null,
    title: remote.title,
    type: remote.document_type,
    version: Number(remote.version || 1),
    audience: remote.audience,
    status: remote.status,
    fileName: remote.file_name,
    mimeType: remote.mime_type,
    size: Number(remote.size_bytes || 0),
    hash: remote.sha256,
    storagePath: remote.storage_path,
    measuredAt: remote.measured_at || null,
    measurementContext: remote.measurement_context || {},
    publishedAt: remote.published_at || null,
    createdAt: remote.created_at || null,
    remote: true,
  };
}

function evidenceList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => typeof item === 'object' && item !== null
    ? {
        label: item.label || item.metric || item.name || `Evidencia ${index + 1}`,
        value: item.value ?? item.result ?? '',
        unit: item.unit || '',
        source: item.source || item.origin || 'Motor IBERFIT',
      }
    : { label: `Evidencia ${index + 1}`, value: item, unit: '', source: 'Motor IBERFIT' });
}

function mapIntelligence(remote) {
  const recommendation = remote.recommendation || {};
  const confidence = remote.confidence || {};
  return {
    runId: remote.id,
    clientId: remote.client_id,
    rulesetVersion: remote.ruleset_version,
    engine: remote.engine,
    code: remote.signal_code,
    priority: remote.priority || 'normal',
    status: remote.status || 'propuesta',
    title: recommendation.title || remote.signal_code || 'Lectura IBERFIT',
    observation: recommendation.observation || remote.input_snapshot?.observation || 'Señal contextual disponible para revisión Coach.',
    interpretation: recommendation.interpretation || recommendation.reading || 'La señal debe interpretarse junto con recuperación, adherencia y objetivo.',
    evidence: evidenceList(remote.evidence),
    recommendation: {
      action: recommendation.action || recommendation.nextAction || 'Revisar contexto antes de modificar el plan.',
      rationale: recommendation.rationale || recommendation.reason || 'La decisión permanece bajo control del Coach.',
      guardrails: list(recommendation.guardrails),
    },
    coachQuestion: recommendation.coachQuestion || recommendation.question || '¿La señal justifica un cambio o corresponde consolidar?',
    confidence: {
      level: confidence.level || confidence.label || 'media',
      score: Number(confidence.score ?? confidence.value ?? 0.5),
    },
    limitations: list(remote.limitations),
    missingData: list(remote.missing_data),
    coachDecision: remote.coach_decision || null,
    createdAt: remote.created_at || null,
    remote: true,
  };
}

function mapPlanChange(remote) {
  return {
    id: remote.id,
    clientId: remote.client_id,
    planId: remote.plan_id,
    sessionId: remote.session_id,
    sourceRunId: remote.intelligence_run_id,
    sourceSignalCode: remote.source_signal_code,
    sourceRulesetVersion: remote.source_ruleset_version,
    status: remote.status,
    basePlanningRevision: Number(remote.base_planning_revision || 0),
    target: remote.target || {},
    previousValue: Number(remote.previous_value || 0),
    proposedValue: Number(remote.proposed_value || 0),
    rationale: remote.rationale || '',
    evidence: list(remote.evidence),
    approvedBy: remote.approved_by || null,
    approvedAt: remote.approved_at || null,
    publishedBy: remote.published_by || null,
    publishedAt: remote.published_at || null,
    appliedPlanningRevision: remote.applied_planning_revision == null ? null : Number(remote.applied_planning_revision),
    createdBy: remote.created_by,
    createdAt: remote.created_at,
    publicationBlocked: remote.status !== 'publicado',
    remote: true,
  };
}

function productionEmptyState(localState, bootstrap, role) {
  return {
    ...localState,
    coachMode: 'analisis',
    coachSection: 'hoy',
    selectedClientId: null,
    client: null,
    clients: [],
    planning: null,
    session: null,
    activeSession: null,
    iriAssessment: null,
    iriAssessments: [],
    reports: [],
    documents: [],
    intelligenceRuns: [],
    planChanges: [],
    remoteTimeline: [],
    remoteSessionExecutions: [],
    checkin: { energy: 0, sleep: 0, stress: 0, pain: 0 },
    progressContext: { loadDelta: 0, volumeDelta: 0, rpeDelta: 0, adherence: 0, goal: '', dataQuality: 'pendiente', sessionsObserved: 0, technicalQuality: 0 },
    iri: { score: null, classification: 'Pendiente', nextAction: 'Completar el primer IRI.' },
    recovery: null,
    sync: {
      ...(localState.sync || {}),
      remoteHydratedAt: new Date().toISOString(),
      remoteRevisions: bootstrap.remoteRevisions || {},
      remoteEnvironment: bootstrap.environment,
      remoteUserRole: role,
      activeExecutionPreserved: false,
      localIriPreserved: false,
    },
  };
}

export function hydrateStateFromRemote(localState, bootstrap, options = {}) {
  if (!bootstrap || !['SYNTHETIC_ONLY', 'PRODUCTION'].includes(bootstrap.environment)) {
    throw new Error('El entorno remoto no es válido');
  }
  const production = bootstrap.environment === 'PRODUCTION';
  const remote = bootstrap.data || {};
  const role = normalizeIberfitRole(bootstrap.user?.role);
  const remoteProfiles = list(remote.clientProfiles);
  const remoteIntakeProfiles = list(remote.clientIntakeProfiles);
  const clients = list(remote.clients).map((client) => {
    const profile = latest(remoteProfiles, (item) => item.client_id === client.id);
    const intake = latest(remoteIntakeProfiles, (item) => item.client_id === client.id);
    return mapClient(client, profile, intake);
  });

  if (!clients.length) {
    if (production) return productionEmptyState(localState, bootstrap, role);
    return {
      ...localState,
      sync: {
        ...(localState.sync || {}),
        remoteHydratedAt: new Date().toISOString(),
        remoteRevisions: bootstrap.remoteRevisions || {},
        remoteEnvironment: bootstrap.environment,
        remoteUserRole: role,
      },
    };
  }

  const preferredClientId = role === 'cliente'
    ? bootstrap.user?.clientId
    : options.selectedClientId || (production ? null : localState.selectedClientId);
  const selectedClient = clients.find((client) => client.id === preferredClientId) || clients[0];
  const selectedProfileRemote = latest(remoteProfiles, (item) => item.client_id === selectedClient.id);
  const appProfile = mapClientProfile(selectedProfileRemote, selectedClient);
  const selectedCycle = latest(remote.cycles, (item) => item.client_id === selectedClient.id);
  const selectedSessionRemote = latest(remote.sessions, (item) => item.client_id === selectedClient.id);
  const remoteSession = mapSession(selectedSessionRemote, production ? null : localState.session);
  const planning = selectedCycle
    ? createPlanningDraft({
        id: selectedCycle.id,
        clientId: selectedClient.id,
        title: selectedCycle.title,
        goal: selectedCycle.goal,
        weeks: selectedCycle.weeks,
        activeWeek: selectedCycle.active_week,
        status: selectedCycle.status,
        revision: selectedCycle.revision,
        publishedAt: selectedCycle.published_at,
        createdAt: selectedCycle.created_at,
        session: remoteSession || undefined,
      })
    : createPlanningDraft({ clientId: selectedClient.id, session: remoteSession || undefined });

  const preserveActiveExecution = Boolean(localState.activeSession)
    && (!production || localState.sync?.remoteEnvironment === bootstrap.environment)
    && [localState.activeSession.id, localState.activeSession.sessionId, localState.session?.id].includes(planning.session?.id);
  const visibleReports = list(remote.reports).map(mapReport);
  const visibleDocuments = list(remote.documents).map(mapDocument);
  const intelligenceRuns = list(remote.intelligenceRuns).map(mapIntelligence);
  const planChanges = list(remote.planChanges).map(mapPlanChange);
  const iriAssessments = list(remote.iriAssessments).map(mapRemoteIriAssessment);
  const selectedIriHistory = iriAssessments
    .filter((assessment) => assessment.clientId === selectedClient.id)
    .sort((a, b) => String(b.evaluatedAt || b.updatedAt || '').localeCompare(String(a.evaluatedAt || a.updatedAt || '')));
  const localIri = localState.iriAssessment;
  const matchingRemoteIri = localIri?.id ? iriAssessments.find((assessment) => assessment.id === localIri.id) : null;
  const preserveLocalIri = Boolean(localIri)
    && (!production || localState.sync?.remoteEnvironment === bootstrap.environment)
    && localIri.clientId === selectedClient.id
    && (!matchingRemoteIri || Number(localIri.revision || 0) > Number(matchingRemoteIri.revision || 0));
  const iriAssessment = preserveLocalIri
    ? localIri
    : selectedIriHistory[0] || createIriAssessment({ clientId: selectedClient.id, assessmentType: selectedIriHistory.length ? 'reevaluacion' : 'inicial' });
  const hydratedIriAssessments = iriAssessments.some((item) => item.id === iriAssessment.id)
    ? iriAssessments
    : [iriAssessment, ...iriAssessments];

  return {
    ...localState,
    coachMode: production && role !== 'cliente' && !localState.activeSession ? 'analisis' : localState.coachMode,
    selectedClientId: selectedClient.id,
    clients,
    client: {
      ...(production ? {} : (localState.client || {})),
      ...selectedClient,
      appProfile,
      nextSession: selectedSessionRemote?.title || 'Plan pendiente de publicación',
      coachMessage: production
        ? 'Tu planificación se ajusta con criterio a partir de tu evaluación y seguimiento.'
        : localState.client?.coachMessage || 'Tu Coach revisará la ejecución y el contexto antes de modificar el plan.',
    },
    planning,
    session: preserveActiveExecution ? localState.session : planning.session,
    activeSession: preserveActiveExecution ? localState.activeSession : null,
    reports: production ? visibleReports : (visibleReports.length ? visibleReports : localState.reports),
    documents: production ? visibleDocuments : (visibleDocuments.length ? visibleDocuments : localState.documents),
    iriAssessments: hydratedIriAssessments,
    iriAssessment,
    iri: production ? { score: null, classification: 'Pendiente', nextAction: 'Completar y aprobar el IRI.' } : localState.iri,
    checkin: production ? { energy: 0, sleep: 0, stress: 0, pain: 0 } : localState.checkin,
    intelligenceRuns,
    planChanges,
    remoteTimeline: list(remote.timeline),
    remoteSessionExecutions: list(remote.sessionExecutions),
    sync: {
      ...(localState.sync || {}),
      remoteHydratedAt: new Date().toISOString(),
      remoteRevisions: bootstrap.remoteRevisions || {},
      remoteEnvironment: bootstrap.environment,
      remoteUserRole: role,
      activeExecutionPreserved: preserveActiveExecution,
      localIriPreserved: preserveLocalIri,
    },
  };
}
