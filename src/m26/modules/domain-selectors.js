import { selectedClient } from '../production-state.js';
import {
  isClientVisibleAppointment,
  isConfirmedAppointment,
  normalizeAppointmentStatus,
} from '../domain/appointment.js';
import { parseDateValue } from '../domain/civil-date.js';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function list(state, key) {
  return Array.isArray(state?.collections?.[key])
    ? state.collections[key]
    : [];
}

function value(record, ...keys) {
  const body =
    record?.body &&
    typeof record.body === 'object' &&
    !Array.isArray(record.body)
      ? record.body
      : {};

  for (const key of keys) {
    const found = record?.[key] ?? body?.[key];

    if (found !== undefined && found !== null && found !== '') {
      return found;
    }
  }

  return null;
}

function clientIdOf(record) {
  return value(record, 'clientId', 'client_id', 'clienteId', 'cliente_id');
}

function dateValue(record) {
  return value(
    record,
    'startAt',
    'start_at',
    'scheduledAt',
    'scheduled_at',
    'assessmentDate',
    'assessment_date',
    'evaluatedAt',
    'evaluated_at',
    'date',
    'fecha',
    'periodStart',
    'period_start',
    'startDate',
    'start_date',
    'createdAt',
    'created_at'
  );
}

function safeDate(input) {
  return parseDateValue(input);
}

function sameLocalDay(a, b) {
  return (
    a &&
    b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function byNewest(a, b) {
  return (
    (safeDate(dateValue(b))?.getTime() || 0) -
    (safeDate(dateValue(a))?.getTime() || 0)
  );
}

function bySoonest(a, b) {
  return (
    (safeDate(dateValue(a))?.getTime() || 0) -
    (safeDate(dateValue(b))?.getTime() || 0)
  );
}

function statusOf(record) {
  return String(value(record, 'status', 'estado') || '').toLowerCase();
}

function appointmentMatchesScope(
  record,
  { clientVisibleOnly = false, confirmedOnly = false, proposalOnly = false } = {}
) {
  if (clientVisibleOnly && !isClientVisibleAppointment(record)) return false;
  if (confirmedOnly && !isConfirmedAppointment(record)) return false;
  if (proposalOnly && normalizeAppointmentStatus(statusOf(record)) !== 'propuesta') {
    return false;
  }
  return true;
}

export function recordsForClient(
  state,
  collectionKey,
  clientId = state?.selectedClientId
) {
  if (!clientId) return [];
  return list(state, collectionKey)
    .filter((record) => clientIdOf(record) === clientId)
    .map(clone);
}

export function latestForClient(
  state,
  collectionKey,
  clientId = state?.selectedClientId
) {
  return recordsForClient(state, collectionKey, clientId).sort(byNewest)[0] || null;
}

export function profileForClient(state, clientId = state?.selectedClientId) {
  return latestForClient(state, 'clientProfiles', clientId);
}

export function accessForClient(state, clientId = state?.selectedClientId) {
  return latestForClient(state, 'clientAccess', clientId);
}

export function latestIriForClient(state, clientId = state?.selectedClientId) {
  return latestForClient(state, 'iriAssessments', clientId);
}

export function latestReportForClient(state, clientId = state?.selectedClientId) {
  return latestForClient(state, 'reports', clientId);
}

export function activeCycleForClient(state, clientId = state?.selectedClientId) {
  const cycles = recordsForClient(state, 'trainingCycles', clientId);
  return (
    cycles.find((cycle) =>
      ['activo', 'active', 'publicado', 'published'].includes(statusOf(cycle))
    ) ||
    cycles.sort(byNewest)[0] ||
    null
  );
}

export function upcomingAppointments(
  state,
  {
    clientId = null,
    now = new Date(),
    limit = 6,
    clientVisibleOnly = false,
    confirmedOnly = false,
    proposalOnly = false,
  } = {}
) {
  return list(state, 'appointments')
    .filter((record) => !clientId || clientIdOf(record) === clientId)
    .filter((record) =>
      appointmentMatchesScope(record, {
        clientVisibleOnly,
        confirmedOnly,
        proposalOnly,
      })
    )
    .filter((record) => {
      const date = safeDate(dateValue(record));
      return date && date.getTime() >= now.getTime() - 60_000;
    })
    .sort(bySoonest)
    .slice(0, limit)
    .map(clone);
}

export function todaysAppointments(
  state,
  {
    clientId = null,
    now = new Date(),
    clientVisibleOnly = false,
    confirmedOnly = false,
    proposalOnly = false,
  } = {}
) {
  return list(state, 'appointments')
    .filter((record) => !clientId || clientIdOf(record) === clientId)
    .filter((record) =>
      appointmentMatchesScope(record, {
        clientVisibleOnly,
        confirmedOnly,
        proposalOnly,
      })
    )
    .filter((record) => sameLocalDay(safeDate(dateValue(record)), now))
    .sort(bySoonest)
    .map(clone);
}

export function clientHealthSummary(state, clientId = state?.selectedClientId, now = new Date()) {
  const client =
    list(state, 'clients').find((item) => item.id === clientId) ||
    selectedClient(state);
  if (!client) return null;

  const profile = profileForClient(state, clientId);
  const access = accessForClient(state, clientId);
  const iri = latestIriForClient(state, clientId);
  const report = latestReportForClient(state, clientId);
  const cycle = activeCycleForClient(state, clientId);
  const sessions = recordsForClient(state, 'sessions', clientId);
  const executions = recordsForClient(state, 'sessionExecutions', clientId);
  const appointments = upcomingAppointments(state, {
    clientId,
    now,
    limit: 3,
    confirmedOnly: true,
  });

  return {
    client: clone(client),
    profile,
    access,
    iri,
    report,
    cycle,
    counts: {
      sessions: sessions.length,
      executions: executions.length,
      appointments: appointments.length,
    },
    nextAppointment: appointments[0] || null,
  };
}

export function clientsOverview(state, now = new Date()) {
  return list(state, 'clients')
    .map((client) => clientHealthSummary(state, client.id, now))
    .filter(Boolean);
}

export function todayOverview(state, now = new Date()) {
  const role = String(state?.identity?.role || '').toLowerCase();
  const clientId = role === 'client' ? state.identity?.clientId : null;
  const clientVisibleOnly = role === 'client';
  const appointments = todaysAppointments(state, {
    clientId,
    now,
    clientVisibleOnly,
    confirmedOnly: true,
  });
  const proposals =
    role === 'client'
      ? []
      : todaysAppointments(state, {
          clientId,
          now,
          proposalOnly: true,
        });
  const upcoming = upcomingAppointments(state, {
    clientId,
    now,
    limit: 5,
    clientVisibleOnly,
    confirmedOnly: true,
  });
  const summaries =
    role === 'client'
      ? [clientHealthSummary(state, clientId, now)].filter(Boolean)
      : clientsOverview(state, now);
  const pending = state?.pendingOperations?.length || 0;
  const conflicts = state?.conflicts?.length || 0;
  const rejected = state?.rejectedOperations?.length || 0;

  return {
    role,
    appointments,
    proposals,
    upcoming,
    summaries,
    operations: { pending, conflicts, rejected },
  };
}

export const domainValue = value;
export const domainDate = dateValue;
export const domainStatus = statusOf;
