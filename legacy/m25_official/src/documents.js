export const DOCUMENT_TYPES = Object.freeze(['bioimpedancia', 'informe_externo', 'consentimiento', 'otro']);
export const DOCUMENT_STATUSES = Object.freeze(['interno', 'revisión', 'publicado', 'retirado']);

function now() {
  return new Date().toISOString();
}

function normalizeBoolean(value) {
  if (value === true || value === 'sí' || value === 'si' || value === 'true') return true;
  if (value === false || value === 'no' || value === 'false') return false;
  return null;
}

export function validateDocumentInput(input = {}) {
  const errors = [];
  if (!input.clientId) errors.push('Falta cliente');
  if (!DOCUMENT_TYPES.includes(input.type)) errors.push('Tipo documental inválido');
  if (!String(input.title || '').trim()) errors.push('Falta título');
  if (!input.fileName) errors.push('Falta archivo');
  if (!input.hash) errors.push('Falta hash de integridad');
  if (Number(input.sizeBytes || 0) <= 0) errors.push('El archivo está vacío');
  if (Number(input.sizeBytes || 0) > 8 * 1024 * 1024) errors.push('El archivo supera 8 MB');
  if (input.type === 'bioimpedancia') {
    const context = input.measurementContext || {};
    if (!input.measuredAt) errors.push('Falta fecha de medición');
    if (!String(context.device || '').trim()) errors.push('Falta dispositivo de medición');
    if (!String(context.timeOfDay || '').trim()) errors.push('Falta momento del día');
    if (normalizeBoolean(context.fasting) == null) errors.push('Falta condición de ayuno');
  }
  return { ok: errors.length === 0, errors };
}

export function createDocumentRecord(input = {}, previousVersions = []) {
  const lineageId = input.lineageId || `${input.clientId}:${input.type}:${String(input.title || '').trim().toLowerCase()}`;
  const matching = previousVersions.filter((item) => item.lineageId === lineageId);
  const version = Math.max(0, ...matching.map((item) => Number(item.version || 0))) + 1;
  const record = {
    id: input.id || `DOC-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    lineageId,
    clientId: input.clientId,
    iriId: input.iriId || null,
    periodId: input.periodId || null,
    type: input.type,
    title: String(input.title || '').trim(),
    version,
    status: input.status || 'interno',
    audience: input.audience || 'coach',
    fileName: input.fileName,
    mimeType: input.mimeType || 'application/octet-stream',
    sizeBytes: Number(input.sizeBytes || 0),
    hash: input.hash,
    measuredAt: input.measuredAt || null,
    measurementContext: {
      timeOfDay: input.measurementContext?.timeOfDay || '',
      fasting: normalizeBoolean(input.measurementContext?.fasting),
      device: input.measurementContext?.device || '',
      hydration: input.measurementContext?.hydration || '',
      trainingLast24h: normalizeBoolean(input.measurementContext?.trainingLast24h),
      notes: input.measurementContext?.notes || '',
    },
    createdAt: input.createdAt || now(),
    createdBy: input.createdBy || 'coach',
    publishedAt: null,
    retiredAt: null,
  };
  const gate = validateDocumentInput(record);
  if (!gate.ok) throw new Error(gate.errors.join(' · '));
  return record;
}

export function publishDocument(record, actor = 'coach') {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede publicar documentos');
  if (record.status === 'retirado') throw new Error('No se puede publicar un documento retirado');
  return {
    ...record,
    status: 'publicado',
    audience: 'cliente',
    publishedAt: now(),
  };
}

export function retireDocument(record, actor = 'coach') {
  if (!['coach', 'admin'].includes(actor)) throw new Error('Solo Coach/Admin puede retirar documentos');
  return { ...record, status: 'retirado', audience: 'coach', retiredAt: now() };
}

export function compareMeasurementConditions(current, previous) {
  if (!current || !previous) return { level: 'sin comparación', score: 0, differences: ['No existe una medición previa comparable.'] };
  const fields = [
    ['device', 'Dispositivo'],
    ['timeOfDay', 'Momento del día'],
    ['fasting', 'Ayuno'],
    ['trainingLast24h', 'Entrenamiento en últimas 24 h'],
    ['hydration', 'Hidratación declarada'],
  ];
  const differences = [];
  let comparable = 0;
  for (const [key, label] of fields) {
    const a = current.measurementContext?.[key];
    const b = previous.measurementContext?.[key];
    if (a === '' || a == null || b === '' || b == null) continue;
    if (a === b) comparable += 1;
    else differences.push(`${label}: ${String(b)} → ${String(a)}`);
  }
  const total = comparable + differences.length;
  const score = total ? comparable / total : 0;
  const level = score >= 0.8 ? 'comparable' : score >= 0.5 ? 'comparabilidad parcial' : 'no comparable';
  return { level, score, differences };
}

export async function sha256Hex(input) {
  const bytes = input instanceof ArrayBuffer ? input : new TextEncoder().encode(String(input));
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto no está disponible');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function latestDocumentByLineage(documents, lineageId) {
  return documents
    .filter((item) => item.lineageId === lineageId)
    .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0] || null;
}
