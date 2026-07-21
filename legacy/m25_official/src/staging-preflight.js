export const REQUIRED_PUBLIC_TABLES_M10 = [
  'user_profiles',
  'clients',
  'client_assignments',
  'client_app_profiles',
  'training_cycles',
  'sessions',
  'session_events',
  'reports',
  'documents',
  'sync_events',
  'session_executions',
  'intelligence_runs',
  'plan_change_proposals',
  'client_timeline_events'
];

export const REQUIRED_STORAGE_BUCKETS_M10 = ['iberfit-documents-private'];

export function summarizeSupabaseInspection({ project, tables = [], buckets = [], advisors = [], migrations = [] } = {}) {
  const publicTables = tables
    .filter((table) => table.schemaname === 'public' || !table.schemaname)
    .map((table) => table.tablename || table.name)
    .filter(Boolean);
  const bucketNames = buckets.map((bucket) => bucket.name || bucket.id).filter(Boolean);
  const missingTables = REQUIRED_PUBLIC_TABLES_M10.filter((name) => !publicTables.includes(name));
  const missingBuckets = REQUIRED_STORAGE_BUCKETS_M10.filter((name) => !bucketNames.includes(name));
  const destructiveAdvisors = advisors.filter((advisor) => /rls|security|policy/i.test(`${advisor.title || ''} ${advisor.message || ''}`));
  const migrationNames = migrations.map((migration) => migration.name || migration.version || '').filter(Boolean);
  return {
    projectId: project?.id || project?.ref || null,
    status: project?.status || 'desconocido',
    publicTablesFound: publicTables.length,
    missingTables,
    missingBuckets,
    migrationNames,
    securityAdvisoryCount: destructiveAdvisors.length,
    readyForSyntheticMigration: missingTables.length > 0 && missingBuckets.length >= 0,
    canUseRealData: false,
    recommendation: missingTables.length
      ? 'Aplicar migraciones M5-M10 solo en staging sintético, con backup y aprobación explícita.'
      : 'Ejecutar matriz RLS con usuarios sintéticos antes de cualquier conexión de app.'
  };
}

export function buildRlsProbePlan({ clientUserId, coachUserId, adminUserId, clientId, unassignedClientId } = {}) {
  const missing = { clientUserId, coachUserId, adminUserId, clientId, unassignedClientId };
  const missingKeys = Object.entries(missing).filter(([, value]) => !value).map(([key]) => key);
  if (missingKeys.length) {
    return { ready: false, missing: missingKeys, probes: [] };
  }
  return {
    ready: true,
    missing: [],
    probes: [
      { actor: 'client', userId: clientUserId, shouldAllow: true, action: 'select own published client report' },
      { actor: 'client', userId: clientUserId, shouldAllow: false, action: 'select coach intelligence run' },
      { actor: 'client', userId: clientUserId, shouldAllow: false, action: 'update modality' },
      { actor: 'coach', userId: coachUserId, shouldAllow: true, action: 'select assigned client timeline' },
      { actor: 'coach', userId: coachUserId, shouldAllow: false, action: 'select unassigned client timeline', clientId: unassignedClientId },
      { actor: 'admin', userId: adminUserId, shouldAllow: true, action: 'select all client timeline' }
    ]
  };
}

export function assertSyntheticStagingGate(config = {}) {
  const failures = [];
  if (config.environment !== 'SYNTHETIC_ONLY') failures.push('environment must be SYNTHETIC_ONLY');
  if (config.allowRealData) failures.push('allowRealData must remain false');
  if (config.serviceRoleInBrowser) failures.push('service_role must never be available to browser code');
  if (config.remoteEnabled && !config.explicitApproval) failures.push('remote sync requires explicit approval');
  if (config.remoteEnabled && config.url && !/^https:\/\//.test(config.url) && !/^http:\/\/localhost/.test(config.url)) failures.push('remote URL must be HTTPS outside localhost');
  return { ok: failures.length === 0, failures };
}
