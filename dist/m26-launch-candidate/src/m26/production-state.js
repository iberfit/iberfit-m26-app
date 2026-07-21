export const M26_UI_SCHEMA = 'iberfit-m26-ui-v1';

export const M26_COLLECTION_KEYS = Object.freeze([
  'clients',
  'clientProfiles',
  'clientAccess',
  'iriAssessments',
  'reports',
  'trainingCycles',
  'sessions',
  'sessionExecutions',
  'appointments',
  'checkins',
  'habits',
  'habitLogs',
  'privateNotes',
  'intelligenceRuns',
  'domainEvents',
  'coachAvailability',
  'm26Entities',
]);

const FORBIDDEN_SYNTHETIC = /(?:CLI-DEMO|USR-DEMO|cliente\s+sint[eé]tico|fixture|demo\.iberfit)/i;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function createProductionState(overrides = {}) {
  const collections = Object.fromEntries(M26_COLLECTION_KEYS.map((key) => [key, []]));
  return {
    schema: M26_UI_SCHEMA,
    hydration: { status: 'idle', error: null, confirmedAt: null, serverTime: null },
    identity: null,
    environment: null,
    canary: { active: false, scope: null, version: null },
    selectedClientId: null,
    activeArea: 'hoy',
    coachMode: 'gestionar',
    collections,
    metrics: { checkin: null, progress: null, iri: null },
    remoteRevisions: {},
    pendingOperations: [],
    conflicts: [],
    rejectedOperations: [],
    lastAck: null,
    ...clone(overrides),
  };
}

export function containsSyntheticData(value) {
  const stack = [value];
  const seen = new WeakSet();
  while (stack.length) {
    const current = stack.pop();
    if (typeof current === 'string' && FORBIDDEN_SYNTHETIC.test(current)) return true;
    if (!current || typeof current !== 'object') continue;
    if (seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) stack.push(...current);
    else stack.push(...Object.values(current));
  }
  return false;
}

export function assertProductionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('M26_BOOTSTRAP_INVALID');
  if (containsSyntheticData(snapshot)) throw new Error('M26_SYNTHETIC_DATA_REJECTED');
  if (!snapshot.user?.id || !snapshot.user?.role) throw new Error('M26_IDENTITY_REQUIRED');
  if (snapshot.canary?.active !== true) throw new Error('M26_CANARY_NOT_ACTIVE');
  if (!snapshot.data || typeof snapshot.data !== 'object') throw new Error('M26_DATA_REQUIRED');
  return snapshot;
}

function normalizeCollection(data, key) {
  const aliases = {
    clientProfiles: ['clientProfiles', 'client_profiles'],
    clientAccess: ['clientAccess', 'client_access'],
    iriAssessments: ['iriAssessments', 'iri_assessments'],
    trainingCycles: ['trainingCycles', 'training_cycles', 'cycles'],
    sessionExecutions: ['sessionExecutions', 'session_executions'],
    checkins: ['checkins', 'check_ins', 'client_checkins'],
    habits: ['habits', 'client_habits'],
    habitLogs: ['habitLogs', 'habit_logs', 'client_habit_logs'],
    privateNotes: ['privateNotes', 'private_notes', 'coach_private_notes'],
    intelligenceRuns: ['intelligenceRuns', 'intelligence_runs'],
    domainEvents: ['domainEvents', 'domain_events'],
    coachAvailability: ['coachAvailability', 'coach_availability'],
    m26Entities: ['m26Entities', 'm26_entities'],
  };
  const candidates = aliases[key] || [key];
  for (const candidate of candidates) {
    if (Array.isArray(data?.[candidate])) return clone(data[candidate]);
  }
  return [];
}

export function stateFromBootstrap(rawSnapshot, previous = createProductionState()) {
  const snapshot = assertProductionSnapshot(rawSnapshot);
  const collections = Object.fromEntries(
    M26_COLLECTION_KEYS.map((key) => [key, normalizeCollection(snapshot.data, key)]),
  );
  const visibleClientIds = new Set(collections.clients.map((client) => client?.id).filter(Boolean));
  const requestedSelection = previous.selectedClientId;
  const ownClientId = snapshot.user.clientId || null;
  const selectedClientId = visibleClientIds.has(requestedSelection)
    ? requestedSelection
    : visibleClientIds.has(ownClientId)
      ? ownClientId
      : collections.clients[0]?.id || null;

  return {
    ...createProductionState(),
    activeArea: previous.activeArea || 'hoy',
    coachMode: previous.coachMode || 'gestionar',
    identity: clone(snapshot.user),
    environment: snapshot.environment || null,
    canary: clone(snapshot.canary),
    selectedClientId,
    collections,
    metrics: clone(snapshot.data.metrics || { checkin: null, progress: null, iri: null }),
    remoteRevisions: clone(snapshot.remoteRevisions || {}),
    pendingOperations: clone(previous.pendingOperations || []),
    conflicts: clone(previous.conflicts || []),
    rejectedOperations: clone(previous.rejectedOperations || []),
    lastAck: clone(previous.lastAck || null),
    hydration: {
      status: 'ready',
      error: null,
      confirmedAt: new Date().toISOString(),
      serverTime: snapshot.serverTime || null,
    },
  };
}

export function selectedClient(state) {
  return state?.collections?.clients?.find((client) => client.id === state.selectedClientId) || null;
}

export function metricPresentation(value) {
  if (value === null || value === undefined || value === '') return { kind: 'missing', label: 'Sin registro' };
  return { kind: 'value', value, label: String(value) };
}
