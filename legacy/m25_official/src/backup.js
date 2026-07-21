const FORMAT = 'IBERFIT_LOCAL_BACKUP';
export const BACKUP_SCHEMA_VERSION = 14;
const FORBIDDEN_KEYS = /token|password|secret|authorization|apikey|refresh/i;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function scrub(value, path = '') {
  if (Array.isArray(value)) return value.map((item, index) => scrub(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return value;
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key)) continue;
    if (key === 'blob' || key === 'dataUrl') continue;
    clean[key] = scrub(item, path ? `${path}.${key}` : key);
  }
  return clean;
}

async function digestHex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function createBackupEnvelope(repository, options = {}) {
  const [state, outbox, audit, documents] = await Promise.all([
    repository.getState(), repository.listOutbox(), repository.listAudit(), repository.listDocuments(),
  ]);
  const payload = scrub({ state, outbox, audit, documents });
  const counts = {
    outbox: payload.outbox?.length || 0,
    audit: payload.audit?.length || 0,
    documents: payload.documents?.length || 0,
    clients: payload.state?.clients?.length || 0,
  };
  const createdAt = options.createdAt || new Date().toISOString();
  const body = {
    format: FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    environment: 'SYNTHETIC_ONLY',
    createdAt,
    repositoryKind: repository.kind,
    counts,
    payload,
  };
  return { ...body, sha256: await digestHex(canonical(body)) };
}

export async function validateBackupEnvelope(envelope) {
  const errors = [];
  if (envelope?.format !== FORMAT) errors.push('Formato de respaldo no reconocido');
  if (envelope?.schemaVersion !== BACKUP_SCHEMA_VERSION) errors.push(`Versión incompatible: ${envelope?.schemaVersion}`);
  if (envelope?.environment !== 'SYNTHETIC_ONLY') errors.push('Gate 0: respaldo no sintético bloqueado');
  if (!envelope?.payload?.state) errors.push('Falta el estado principal');
  const raw = JSON.stringify(envelope?.payload || {});
  if (/"(?:accessToken|refreshToken|password|secret|authorization|apikey)"\s*:/i.test(raw)) errors.push('El respaldo contiene campos sensibles');
  if (raw.length > 20_000_000) errors.push('El respaldo supera 20 MB');
  if (envelope?.sha256) {
    const { sha256, ...body } = envelope;
    const calculated = await digestHex(canonical(body));
    if (calculated !== sha256) errors.push('Checksum SHA-256 no coincide');
  } else errors.push('Falta checksum SHA-256');
  return { ok: errors.length === 0, errors };
}

export async function restoreBackupEnvelope(repository, envelope, options = {}) {
  const validation = await validateBackupEnvelope(envelope);
  if (!validation.ok) throw new Error(validation.errors.join(' · '));
  const payload = structuredClone(envelope.payload);
  const plan = {
    state: true,
    outbox: payload.outbox?.length || 0,
    audit: payload.audit?.length || 0,
    documents: payload.documents?.length || 0,
    authRestored: false,
  };
  if (options.dryRun !== false) return { restored: false, dryRun: true, plan, validation };
  await repository.setState(payload.state);
  await repository.clearOutbox();
  for (const item of payload.outbox || []) await repository.putOutbox(item);
  if (repository.clearAudit) await repository.clearAudit();
  for (const item of payload.audit || []) await repository.putAudit(item);
  if (repository.clearDocuments) await repository.clearDocuments();
  for (const item of payload.documents || []) await repository.putDocument(item);
  return { restored: true, dryRun: false, plan, validation };
}

export function backupSummary(envelope) {
  return {
    createdAt: envelope?.createdAt || null,
    sha256: envelope?.sha256 || null,
    schemaVersion: envelope?.schemaVersion || null,
    counts: envelope?.counts || {},
    environment: envelope?.environment || null,
  };
}
