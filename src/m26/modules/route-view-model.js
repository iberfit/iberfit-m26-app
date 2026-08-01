import {
  clientsOverview,
  clientHealthSummary,
  todayOverview,
  domainValue,
  domainDate,
  domainStatus,
  recordsForClient,
} from './domain-selectors.js';
import {
  computeProgressSummary,
  buildProgressTimeline,
  deriveAdherenceAlerts,
  adherenceSignal,
  buildVerificationCenter,
  engagementCapabilities,
} from '../engagement/index.js';
import { clientModalityLabel } from '../domain/modality.js';
import {
  appointmentStatusLabel,
  normalizeAppointmentRecord,
} from '../domain/appointment.js';
import { normalizeClientProfile } from '../domain/client-profile.js';
import { buildWearableViewModel } from '../wearables/view-model.js';
import {
  IBERFIT_UI_LOCALE,
  castilianStatusLabel,
} from '../ui/castellano.js';
import {
  civilDateInTimeZone,
  formatIberfitDate,
} from '../domain/civil-date.js';
import { deriveAgeYears } from '../workflows/iri-profile.js';
import {
  publicationSummary,
  publicationCounts,
} from '../workflows/publication-workflow.js';
import { clientContentView } from '../publication/client-content.js';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function dateLabel(value) {
  return (
    formatIberfitDate(value, {
      locale: IBERFIT_UI_LOCALE,
      includeTime: 'auto',
    }) || 'Sin fecha'
  );
}

function text(record, ...keys) {
  return domainValue(record, ...keys);
}

function statusLabel(record, fallback = 'Estado no informado') {
  return castilianStatusLabel(domainStatus(record), fallback);
}

function compactAppointment(record) {
  const appointment = normalizeAppointmentRecord(record);

  return {
    id: appointment.id,
    clientId: appointment.clientId,
    sessionId: appointment.sessionId,
    title: appointment.title,
    date: appointment.startAt,
    dateLabel: dateLabel(appointment.startAt),
    status: appointmentStatusLabel(appointment.status),
    statusRaw: appointment.status,
    revision: Number(text(record, 'revision') || 0),
    location: appointment.location,
    modality: appointment.modalityLabel,
  };
}

function objectiveMeasurement(value) {
  if (value == null || value === '') return false;
  if (Number.isFinite(Number(value))) return true;
  if (Array.isArray(value)) return value.some(objectiveMeasurement);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(objectiveMeasurement);
}

function compactIri(record) {
  if (!record) return null;

  const stepFinalHr = text(record, 'stepFinalHr', 'step_final_hr');
  const stepOneMinuteHr = text(
    record,
    'stepOneMinuteHr',
    'step_one_minute_hr'
  );
  const bodyComposition = text(
    record,
    'bodyComposition',
    'body_composition'
  );
  const strengthPatterns = text(
    record,
    'strengthPatterns',
    'strength_patterns'
  );
  const normScoring = text(record, 'normScoring', 'norm_scoring');
  const domains = Object.freeze({
    cardiovascular:
      stepFinalHr != null &&
      stepFinalHr !== '' &&
      stepOneMinuteHr != null &&
      stepOneMinuteHr !== '' &&
      Number.isFinite(Number(stepFinalHr)) &&
      Number.isFinite(Number(stepOneMinuteHr)),
    bodyComposition: objectiveMeasurement(bodyComposition),
    strength: objectiveMeasurement(strengthPatterns),
  });
  const coverageCount = Object.values(domains).filter(Boolean).length;
  const assessmentDate = text(
    record,
    'assessmentDate',
    'assessment_date',
    'evaluatedAt',
    'evaluated_at'
  );
  const firstSessionCompletedAt = text(
    record,
    'firstSessionCompletedAt',
    'first_session_completed_at'
  );
  const ageYears = Number(
    text(record, 'ageYears', 'age_years') ?? normScoring?.context?.ageYears
  );
  const sexForNorms =
    text(record, 'sexForNorms', 'sex_for_norms') ??
    normScoring?.context?.sexForNorms ??
    null;
  const status = statusLabel(record);
  const confirmed =
    Boolean(firstSessionCompletedAt) || /(?:complet|confirmad)/i.test(status);

  return Object.freeze({
    id: text(record, 'id'),
    assessmentDate: assessmentDate || null,
    dateLabel: dateLabel(assessmentDate),
    status,
    confirmed,
    processCompleted: confirmed,
    processLabel: confirmed
      ? '7 de 7 etapas completadas'
      : coverageCount > 0
        ? 'Evaluación en preparación'
        : 'Evaluación no iniciada',
    coverageCount,
    coverageLabel: `${coverageCount} de 3 dominios de resultado registrados`,
    domains,
    normContextReady: normScoring?.context?.ok === true,
    sexForNorms,
    ageYears: Number.isFinite(ageYears) ? ageYears : null,
  });
}

function compactIriDiagnosis(record) {
  const iri = compactIri(record);
  if (!iri) return null;
  const body = record?.body && typeof record.body === 'object' ? record.body : record || {};
  const revision = Number(record?.revision ?? body?.revision ?? 1);
  return Object.freeze({
    assessmentId: iri.id,
    dateLabel: iri.dateLabel,
    classification:
      text(record, 'classification', 'clasificacion', 'resultClassification') ||
      'Perfil IRI por dominios',
    processLabel: iri.processLabel,
    coverageLabel: iri.coverageLabel,
    revision: Number.isFinite(revision) && revision > 0 ? revision : 1,
    confirmed: iri.confirmed,
  });
}
function profileFromIri(record) {
  const body = record?.body && typeof record.body === 'object' ? record.body : record || {};
  const profile = body.personProfile || body.person_profile;
  return profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
}

function mergeProfileFallback(primary = {}, fallback = {}) {
  const out = { ...fallback };
  for (const [key, value] of Object.entries(primary || {})) {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  }
  return out;
}

function compactSummary(summary) {
  const client = summary.client || {};
  const profile = normalizeClientProfile(
    mergeProfileFallback(summary.profile || {}, profileFromIri(summary.iri)),
    client
  );

  return {
    id: client.id,
    name: text(client, 'name', 'nombre') || 'Cliente sin nombre',
    modality:
      profile.modalityLabel ||
      clientModalityLabel(text(client, 'modality', 'modalidad')),
    status: statusLabel(client),
    access: summary.access
      ? statusLabel(summary.access, 'Acceso registrado')
      : 'Acceso no informado',
    accessKnown: Boolean(summary.access),
    iri: compactIri(summary.iri),
    cycle: summary.cycle
      ? {
          name:
            text(summary.cycle, 'name', 'nombre', 'title', 'titulo') ||
            'Ciclo de entrenamiento',
          status: statusLabel(summary.cycle),
        }
      : null,
    report: summary.report
      ? {
          title:
            text(summary.report, 'title', 'titulo', 'name', 'nombre') ||
            'Informe IBERFIT',
          status: statusLabel(summary.report),
        }
      : null,
    nextAppointment: summary.nextAppointment
      ? compactAppointment(summary.nextAppointment)
      : null,
    counts: clone(summary.counts),
    profile,
  };
}

function routeClientId(shellVm, state) {
  return shellVm.identity?.role === 'client'
    ? state.identity?.clientId
    : state.selectedClientId;
}

function installedCommands(state) {
  const candidates = [
    state?.environment?.commandRegistry,
    state?.environment?.installedCommands,
    state?.canary?.commandRegistry,
    state?.canary?.installedCommands,
  ];
  return candidates.find(Array.isArray) || [];
}

function compactActivity(record) {
  return {
    id: text(record, 'id'),
    clientId: text(record, 'clientId', 'client_id'),
    title: text(record, 'title', 'name', 'nombre') || 'Registro',
    status: statusLabel(record),
    statusRaw: domainStatus(record),
    revision: Number(text(record, 'revision') || 0),
    date: domainDate(record),
    dateLabel: dateLabel(domainDate(record)),
    body: clone(record?.body || record),
    raw: clone(record),
  };
}

function publicationItems(records, entity, role) {
  return records.map((record) => {
    const clientContent = clientContentView(entity, record);
    if (role === 'client') {
      return Object.freeze({
        id: clientContent.id,
        clientId: text(record, 'clientId', 'client_id'),
        title: clientContent.title,
        clientContent,
      });
    }
    return Object.freeze({
      ...compactActivity(record),
      publication: publicationSummary({ entity, record, role }),
      clientContent,
    });
  });
}

export function createRouteViewModel(shellVm, state, now = new Date(), options = {}) {
  const area = shellVm.activeArea;

  if (area === 'hoy') {
    const overview = todayOverview(state, now);
    const clientId = routeClientId(shellVm, state);
    const alerts = clientId
      ? deriveAdherenceAlerts(state, clientId, { now })
      : [];

    return Object.freeze({
      kind: 'hoy',
      role: overview.role,
      appointments: Object.freeze(overview.appointments.map(compactAppointment)),
      proposals: Object.freeze(overview.proposals.map(compactAppointment)),
      upcoming: Object.freeze(overview.upcoming.map(compactAppointment)),
      clients: Object.freeze(overview.summaries.map(compactSummary)),
      operations: Object.freeze(overview.operations),
      alerts: Object.freeze(alerts),
      alertSignal: Object.freeze(adherenceSignal(alerts)),
      serverTime: state?.hydration?.serverTime || null,
    });
  }

  if (area === 'clientes') {
    const role = String(shellVm.identity?.role || '');
    return Object.freeze({
      kind: 'clientes',
      role,
      canCreate: ['admin', 'coach'].includes(role),
      clients: Object.freeze(clientsOverview(state).map(compactSummary)),
      selectedClientId: state.selectedClientId || null,
    });
  }

  if (area === 'expediente') {
    const summary = clientHealthSummary(state, state.selectedClientId);
    const progress = state.selectedClientId
      ? computeProgressSummary(state, state.selectedClientId, { now })
      : null;
    const alerts = state.selectedClientId
      ? deriveAdherenceAlerts(state, state.selectedClientId, { now })
      : [];

    return Object.freeze({
      kind: 'expediente',
      summary: summary ? compactSummary(summary) : null,
      progress,
      alerts: Object.freeze(alerts),
      alertSignal: Object.freeze(adherenceSignal(alerts)),
    });
  }

  if (area === 'progreso') {
    const clientId = routeClientId(shellVm, state);
    const summary = computeProgressSummary(state, clientId, { now });
    const alerts = deriveAdherenceAlerts(state, clientId, { now });
    return Object.freeze({
      kind: 'progreso',
      clientId,
      summary,
      timeline: Object.freeze(buildProgressTimeline(state, clientId, { now })),
      alerts: Object.freeze(alerts),
      signal: Object.freeze(adherenceSignal(alerts)),
    });
  }

  if (area === 'actividad') {
    const clientId = routeClientId(shellVm, state);
    const role = String(shellVm.identity?.role || '');
    const capabilities = engagementCapabilities(installedCommands(state));
    const wearables = buildWearableViewModel({
      records: recordsForClient(state, 'wearableDailySummaries', clientId),
      connections: recordsForClient(state, 'wearableConnections', clientId),
      role,
      now,
    });
    return Object.freeze({
      kind: 'actividad',
      clientId,
      role,
      canManageHabits: ['admin', 'coach'].includes(role),
      capabilities,
      wearables,
      checkins: Object.freeze(
        recordsForClient(state, 'checkins', clientId).map(compactActivity)
      ),
      habits: Object.freeze(
        recordsForClient(state, 'habits', clientId).map(compactActivity)
      ),
      habitLogs: Object.freeze(
        recordsForClient(state, 'habitLogs', clientId).map(compactActivity)
      ),
    });
  }

  if (area === 'notas') {
    const clientId = routeClientId(shellVm, state);
    const capabilities = engagementCapabilities(installedCommands(state));
    return Object.freeze({
      kind: 'notas',
      clientId,
      capability: capabilities.privateNotes,
      notes: Object.freeze(
        recordsForClient(state, 'privateNotes', clientId).map(compactActivity)
      ),
    });
  }

  if (area === 'iri') {
    const clientId = routeClientId(shellVm, state);
    const assessments = recordsForClient(state, 'iriAssessments', clientId).sort(
      (a, b) => String(domainDate(b) || '').localeCompare(String(domainDate(a) || ''))
    );
    const current = assessments.find(
      (record) => text(record, 'id') === state.selectedIriAssessmentId
    ) || assessments[0] || null;
    const rawProfile = recordsForClient(state, 'clientProfiles', clientId)[0] || null;
    const client = (state?.collections?.clients || []).find(
      (item) => item.id === clientId
    );
    const profile = normalizeClientProfile(
      mergeProfileFallback(rawProfile || {}, profileFromIri(current)),
      client || {}
    );

    return Object.freeze({
      kind: 'iri',
      clientId,
      role: shellVm.identity?.role,
      current: clone(current),
      currentSummary: compactIri(current),
      history: Object.freeze(assessments.map(compactActivity)),
      profile,
      sourceProfile: clone(rawProfile),
      canEdit: ['admin', 'coach'].includes(
        String(shellVm.identity?.role || '')
      ),
    });
  }

  if (area === 'planificacion') {
    const clientId = routeClientId(shellVm, state);
    const cycles = recordsForClient(state, 'trainingCycles', clientId);
    const sessions = recordsForClient(state, 'sessions', clientId);
    const role = String(shellVm.identity?.role || '');
    return Object.freeze({
      kind: 'planificacion',
      clientId,
      role,
      canEdit: ['admin', 'coach'].includes(role),
      cycles: Object.freeze(publicationItems(cycles, 'planning', role)),
      sessions: Object.freeze(publicationItems(sessions, 'session', role)),
      cycleCounts: publicationCounts(cycles),
      sessionCounts: publicationCounts(sessions),
      currentCycle: clone(cycles[0] || null),
    });
  }

  if (area === 'agenda') {
    const appointments = (state?.collections?.appointments || []).map(
      compactAppointment
    );
    return Object.freeze({
      kind: 'agenda',
      role: shellVm.identity?.role,
      appointments: Object.freeze(appointments),
      clients: Object.freeze(clientsOverview(state).map(compactSummary)),
      selectedClientId: state.selectedClientId || null,
    });
  }

  if (area === 'sesion') {
    const clientId = routeClientId(shellVm, state);
    const sessions = recordsForClient(state, 'sessions', clientId);
    const executions = recordsForClient(state, 'sessionExecutions', clientId);
    const role = String(shellVm.identity?.role || '');
    return Object.freeze({
      kind: 'sesion',
      clientId,
      role,
      canBuild: ['admin', 'coach'].includes(role),
      sessions: Object.freeze(publicationItems(sessions, 'session', role)),
      sessionCounts: publicationCounts(sessions),
      executions: Object.freeze(executions.map(compactActivity)),
    });
  }

  if (area === 'informes') {
    const clientId = routeClientId(shellVm, state);
    const reports = recordsForClient(state, 'reports', clientId);
    const role = String(shellVm.identity?.role || '');
    const iriAssessments = recordsForClient(state, 'iriAssessments', clientId).sort((a, b) =>
      String(domainDate(b) || '').localeCompare(String(domainDate(a) || ''))
    );
    const iri = iriAssessments.find(
      (record) => text(record, 'id') === state.selectedIriAssessmentId && compactIri(record)?.confirmed
    ) || iriAssessments.find((record)=>compactIri(record)?.confirmed) || null;
    const reportItems = publicationItems(reports, 'report', role);
    return Object.freeze({
      kind: 'informes',
      clientId,
      role,
      canManage: ['admin', 'coach'].includes(role),
      reports: Object.freeze(
        role === 'client'
          ? reportItems
          : reportItems.map((item) =>
              Object.freeze({
                ...item,
                visibility: text(item.raw, 'visibility', 'audience') || null,
              })
            )
      ),
      reportCounts: publicationCounts(reports),
      latestIri: clone(iri),
      iriDiagnosis: compactIriDiagnosis(iri),
    });
  }

  if (area === 'inteligencia') {
    const clientId = routeClientId(shellVm, state);
    const runs = recordsForClient(state, 'intelligenceRuns', clientId);
    const summary = clientId
      ? computeProgressSummary(state, clientId, { now })
      : null;
    const alerts = clientId
      ? deriveAdherenceAlerts(state, clientId, { now })
      : [];
    const rawProfile = recordsForClient(state, 'clientProfiles', clientId)[0] || null;
    const client = (state?.collections?.clients || []).find(
      (item) => item.id === clientId
    );
    const profile = normalizeClientProfile(rawProfile || {}, client || {});
    const birthDate = profile.birthDate;
    let ageYears = null;
    try {
      if (birthDate) ageYears = deriveAgeYears(birthDate, civilDateInTimeZone(now));
    } catch {}

    return Object.freeze({
      kind: 'inteligencia',
      clientId,
      role: shellVm.identity?.role,
      runs: Object.freeze(runs.map(compactActivity)),
      summary,
      alerts: Object.freeze(alerts),
      profile,
      ageYears,
      birthDate: birthDate || null,
      canGenerate: ['admin', 'coach'].includes(
        String(shellVm.identity?.role || '')
      ),
    });
  }

  if (area === 'biblioteca') {
    const catalog = Array.isArray(options.catalog) ? options.catalog : [];
    return Object.freeze({
      kind: 'biblioteca',
      role: shellVm.identity?.role,
      catalog: Object.freeze(catalog.map((item) => clone(item))),
      mediaMap: options.mediaMap || null,
      total: catalog.length,
    });
  }

  if (area === 'verificacion') {
    return Object.freeze({ kind: 'verificacion', center: buildVerificationCenter(state) });
  }

  return Object.freeze({ kind: 'placeholder', area, title: shellVm.page.title });
}

export const __routeViewModelInternals = Object.freeze({
  compactIri,
  compactIriDiagnosis,
  compactSummary,
  objectiveMeasurement,
});
