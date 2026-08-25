import {createCommunicationState,projectCommunicationSnapshot} from './communication/state.js';
import {createAdminState,projectAdminSnapshot} from './admin/admin-state.js';
import { projectCollectionsForRole, projectRemoteRevisionsForRole, assertClientProjectionSafe, projectIdentityForRole, projectEnvironmentForRole, projectCanaryForRole, projectMetricsForRole } from './security/role-projection.js';
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
  'wearableConnections',
  'wearableDailySummaries',
  'wearableSyncRuns',
  'm26Entities',
]);

const FORBIDDEN_SYNTHETIC = /(?:CLI-DEMO|USR-DEMO|cliente\s+sint[eé]tico|fixture|demo\.iberfit)/i;
const SAFE_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_BOOTSTRAP_BYTES=20_000_000;
const MAX_COLLECTION_RECORDS=50_000;
const CLIENT_SCOPED_COLLECTIONS=new Set(M26_COLLECTION_KEYS.filter((key)=>key!=='coachAvailability'));
const ROLE_ALIASES=Object.freeze({admin:'admin',administrador:'admin',administrator:'admin',coach:'coach',entrenador:'coach',client:'client',cliente:'client'});

function clone(value) {
  return value == null ? value : structuredClone(value);
}
function qaStage(stage){
  try{
    const hook=globalThis.__IBERFIT_M26_QA_STAGE__;
    if(typeof hook==='function')void hook(stage);
  }catch{}
}
function normalizeRole(value){return ROLE_ALIASES[String(value||'').trim().toLowerCase()]||null;}
function environmentMode(environment){
  if(typeof environment==='string'){
    return environment.trim().toUpperCase();
  }

  if(
    !environment ||
    typeof environment!=='object' ||
    Array.isArray(environment)
  ){
    return '';
  }

  return String(
    environment.mode ||
    environment.name ||
    ''
  ).trim().toUpperCase();
}

function syntheticCanaryAllowed(snapshot){
  const mode=environmentMode(snapshot?.environment);
  return snapshot?.canary?.active===true
    &&String(
      snapshot?.canary?.scope||''
    ).trim().toLowerCase()==='allowlist'
    &&(mode==='SYNTHETIC_ONLY'||mode==='QA');
}
function safeId(value){const id=String(value||'').trim();return SAFE_ID_PATTERN.test(id)?id:null;}
function jsonByteLength(value){let text;try{text=JSON.stringify(value);}catch{throw new Error('M26_BOOTSTRAP_NOT_SERIALIZABLE');}if(text===undefined)throw new Error('M26_BOOTSTRAP_NOT_SERIALIZABLE');return typeof TextEncoder==='function'?new TextEncoder().encode(text).length:text.length;}
function recordClientId(record,key){
  if(!record||typeof record!=='object')return null;
  if(key==='clients')return safeId(record.id);
  const body=record.body&&typeof record.body==='object'?record.body:{};
  const direct=record.clientId??record.client_id??record.clienteId??record.cliente_id??body.clientId??body.client_id??null;
  if(direct)return safeId(direct);
  if(key==='clientProfiles')return safeId(record.id);
  return null;
}
function restrictCollectionsForIdentity(collections,user){const projected=projectCollectionsForRole(collections,user,M26_COLLECTION_KEYS);assertClientProjectionSafe(projected,user);return projected;}

function restrictRemoteRevisions(revisions,user){return projectRemoteRevisionsForRole(revisions,user);}

export function createProductionState(overrides = {}) {
  const collections = Object.fromEntries(M26_COLLECTION_KEYS.map((key) => [key, []]));
  return {
    schema: M26_UI_SCHEMA,
    hydration: { status: 'idle', error: null, confirmedAt: null, serverTime: null },
    identity: null,
    environment: null,
    canary: { active: false, scope: null, version: null },
    admin:createAdminState(),
    communication:createCommunicationState(),
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
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new Error('M26_BOOTSTRAP_INVALID');
  if(jsonByteLength(snapshot)>MAX_BOOTSTRAP_BYTES)throw new Error('M26_BOOTSTRAP_TOO_LARGE');
  if (containsSyntheticData(snapshot)&&!syntheticCanaryAllowed(snapshot)) throw new Error('M26_SYNTHETIC_DATA_REJECTED');
  const role=normalizeRole(snapshot.user?.role);
  if (!safeId(snapshot.user?.id) || !role) throw new Error('M26_IDENTITY_REQUIRED');
  if(role==='client'&&!safeId(snapshot.user?.clientId||snapshot.user?.client_id))throw new Error('M26_CLIENT_IDENTITY_REQUIRED');
  if (snapshot.canary?.active !== true) throw new Error('M26_CANARY_NOT_ACTIVE');
  if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) throw new Error('M26_DATA_REQUIRED');
  for(const [key,value] of Object.entries(snapshot.data)){if(Array.isArray(value)&&value.length>MAX_COLLECTION_RECORDS)throw new Error(`M26_COLLECTION_TOO_LARGE:${key}`);}
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
    wearableConnections: ['wearableConnections', 'wearable_connections'],
    wearableDailySummaries: ['wearableDailySummaries', 'wearable_daily_summaries'],
    wearableSyncRuns: ['wearableSyncRuns', 'wearable_sync_runs'],
    m26Entities: ['m26Entities', 'm26_entities'],
  };
  const candidates = aliases[key] || [key];
  for (const candidate of candidates) {
    if (Array.isArray(data?.[candidate])) return clone(data[candidate]);
  }
  return [];
}

export function stateFromBootstrap(rawSnapshot, previous = createProductionState()) {
  qaStage('rc64-state-start');
  const snapshot = assertProductionSnapshot(rawSnapshot);
  qaStage('rc64-state-assert-ready');
  const rawCollections = Object.fromEntries(
    M26_COLLECTION_KEYS.map((key) => [key, normalizeCollection(snapshot.data, key)]),
  );
  qaStage('rc64-state-collections-ready');
  const identity=projectIdentityForRole(snapshot.user);
  qaStage('rc64-state-identity-ready');
  const collections=identity.role==='client'?restrictCollectionsForIdentity(rawCollections,identity):rawCollections;
  qaStage('rc64-state-role-projection-ready');
  const visibleClientIds = new Set(collections.clients.map((client) => client?.id).filter(Boolean));
  const sameIdentity=previous?.identity?.id===identity.id&&normalizeRole(previous?.identity?.role)===identity.role;
  const hasPreviousIdentity=Boolean(previous?.identity);
  const navigationContinuity=!hasPreviousIdentity||sameIdentity;
  const defaultArea=identity.role==='admin'?'admin-inicio':'hoy';
  const initialArea=!hasPreviousIdentity&&previous?.activeArea&&previous.activeArea!=='hoy'?previous.activeArea:defaultArea;
  const requestedSelection = navigationContinuity?previous.selectedClientId:null;
  const ownClientId = identity.clientId || null;
  const selectedClientId = identity.role==='admin'
    ? null
    : visibleClientIds.has(requestedSelection)
      ? requestedSelection
      : visibleClientIds.has(ownClientId)
        ? ownClientId
        : collections.clients[0]?.id || null;

  qaStage('rc64-state-ready');
  return {
    ...createProductionState(),
    activeArea:sameIdentity?(previous.activeArea||defaultArea):!hasPreviousIdentity?initialArea:defaultArea,
    coachMode: navigationContinuity?(previous.coachMode || 'gestionar'):'gestionar',
    identity,
    environment: projectEnvironmentForRole(snapshot.environment,identity),
    canary: projectCanaryForRole(snapshot.canary,identity),
    admin:projectAdminSnapshot(snapshot.admin,identity),
    communication:projectCommunicationSnapshot(snapshot.communication,identity),
    selectedClientId,
    collections,
    metrics: projectMetricsForRole(snapshot.data.metrics),
    remoteRevisions: restrictRemoteRevisions(snapshot.remoteRevisions,identity),
    pendingOperations: sameIdentity?clone(previous.pendingOperations || []):[],
    conflicts: sameIdentity?clone(previous.conflicts || []):[],
    rejectedOperations: sameIdentity?clone(previous.rejectedOperations || []):[],
    lastAck: sameIdentity?clone(previous.lastAck || null):null,
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

export const __productionStateInternals=Object.freeze({normalizeRole,recordClientId,restrictCollectionsForIdentity,MAX_BOOTSTRAP_BYTES,MAX_COLLECTION_RECORDS});
