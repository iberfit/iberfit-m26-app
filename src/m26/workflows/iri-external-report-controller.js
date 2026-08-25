import {
  M26_PRODUCTION_PROJECT_REF,
  M26_PRODUCTION_SUPABASE_ORIGIN,
  M26_QA_PROJECT_REF,
  M26_QA_SUPABASE_ORIGIN,
} from '../supabase-transport.js';

export const IRI_EXTERNAL_REPORT_APP_ORIGIN = 'https://m26-canary.iberfit.cl';
const IRI_EXTERNAL_REPORT_APP_ORIGIN_MAP = new Map([
  ['https://m26-canary.iberfit.cl', 'https://m26-canary.iberfit.cl'],
  ['https://app.iberfit.cl', 'https://app.iberfit.cl'],
  ['https://coach.iberfit.cl', 'https://app.iberfit.cl'],
]);

export const IRI_EXTERNAL_REPORT_BUCKET = 'iberfit-iri-external-reports';
export const IRI_EXTERNAL_REPORT_MAX_BYTES = 50_000_000;
export const IRI_EXTERNAL_REPORT_REQUEST_TIMEOUT_MS = 12_000;
export const IRI_EXTERNAL_REPORT_UPLOAD_TIMEOUT_MS = 180_000;
export const IRI_EXTERNAL_REPORT_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const MIME_TYPES = new Set(IRI_EXTERNAL_REPORT_MIME_TYPES);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IRI_EXTERNAL_REPORT_INTENT_KEYS = new Set(['area', 'assessmentId', 'open']);
const REPORT_SELECT = [
  'id',
  'client_id',
  'assessment_id',
  'bucket_id',
  'object_path',
  'file_name',
  'mime_type',
  'size_bytes',
  'visible_to_client',
  'version',
  'uploaded_by',
  'uploaded_at',
  'updated_at',
].join(',');

function cleanText(value, max = 1000) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function recordBody(record = {}) {
  return record?.body && typeof record.body === 'object' && !Array.isArray(record.body)
    ? record.body
    : record;
}

function recordId(record = {}) {
  return cleanText(record?.id || record?.body?.id, 80);
}

function recordIsConfirmed(record = {}) {
  const body = recordBody(record);
  const status = cleanText(
    record?.status || record?.estado || body?.status || body?.estado,
    80
  ).toLowerCase();
  return Boolean(
    body?.firstSessionCompletedAt ||
      body?.first_session_completed_at ||
      /complet|confirm|publish|publicad/.test(status)
  );
}

function recordClientId(record = {}) {
  return cleanText(
    record?.clientId ||
      record?.client_id ||
      record?.body?.clientId ||
      record?.body?.client_id,
    80
  );
}

function assessmentSortValue(record = {}) {
  const body = recordBody(record);
  return cleanText(
    body?.assessmentDate ||
      body?.assessment_date ||
      record?.assessmentDate ||
      record?.assessment_date ||
      record?.evaluatedAt ||
      record?.evaluated_at ||
      record?.createdAt ||
      record?.created_at ||
      body?.createdAt ||
      body?.created_at,
    80
  );
}

function normalizeRole(value) {
  const role = cleanText(value, 40).toLowerCase();
  if (['admin', 'administrator', 'administrador'].includes(role)) return 'admin';
  if (['coach', 'entrenador'].includes(role)) return 'coach';
  if (['client', 'cliente'].includes(role)) return 'client';
  return role || 'unknown';
}

function normalizeReport(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const clientId = cleanText(row.clientId || row.client_id, 80);
  const assessmentId = cleanText(row.assessmentId || row.assessment_id, 80);
  const objectPath = cleanText(row.objectPath || row.object_path, 600);
  if (!UUID_PATTERN.test(clientId) || !UUID_PATTERN.test(assessmentId) || !objectPath) return null;
  return Object.freeze({
    id: cleanText(row.id, 80),
    clientId,
    assessmentId,
    bucketId: cleanText(row.bucketId || row.bucket_id, 160),
    objectPath,
    fileName: cleanText(row.fileName || row.file_name, 240),
    mimeType: cleanText(row.mimeType || row.mime_type, 120),
    sizeBytes: Number(row.sizeBytes ?? row.size_bytes ?? 0),
    visibleToClient: Boolean(row.visibleToClient ?? row.visible_to_client),
    version: Number(row.version || 1),
    uploadedBy: cleanText(row.uploadedBy || row.uploaded_by, 80),
    uploadedAt: row.uploadedAt || row.uploaded_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  });
}

function responseMessage(payload, status) {
  const message = cleanText(
    payload?.message || payload?.error_description || payload?.error || payload?.code,
    500
  );
  return message || `M26_IRI_EXTERNAL_REPORT_HTTP_${status}`;
}

function encodedStoragePath(path) {
  return String(path)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function validateUuid(value, code) {
  const id = cleanText(value, 80);
  if (!UUID_PATTERN.test(id)) throw new Error(code);
  return id;
}

export function resolveIriExternalReportAppOrigin(origin = IRI_EXTERNAL_REPORT_APP_ORIGIN) {
  let base;
  try {
    base = new URL(String(origin || ''));
  } catch {
    throw new Error('M26_IRI_EXTERNAL_REPORT_APP_ORIGIN_INVALID');
  }
  const target = IRI_EXTERNAL_REPORT_APP_ORIGIN_MAP.get(base.origin);
  if (!target) throw new Error('M26_IRI_EXTERNAL_REPORT_APP_ORIGIN_INVALID');
  return target;
}

export function iriExternalReportAppUrl(
  assessmentId,
  { origin = IRI_EXTERNAL_REPORT_APP_ORIGIN } = {}
) {
  const assessment = validateUuid(
    assessmentId,
    'M26_IRI_EXTERNAL_REPORT_ASSESSMENT_INVALID'
  );
  const appOrigin = resolveIriExternalReportAppOrigin(origin);
  const url = new URL('/', appOrigin);
  url.searchParams.set('area', 'informes');
  url.searchParams.set('assessmentId', assessment);
  url.searchParams.set('open', 'bioimpedancia');
  return url.href;
}

export function parseIriExternalReportIntent(locationLike = globalThis.location) {
  const search = cleanText(locationLike?.search, 2_000);
  if (!search) return null;
  let params;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return Object.freeze({ status: 'invalid' });
  }
  const attempted = params.has('assessmentId') || params.get('open') === 'bioimpedancia';
  if (!attempted) return null;
  const keys = [...params.keys()];
  const uniqueKeys = new Set(keys);
  const assessmentId = cleanText(params.get('assessmentId'), 80);
  const valid =
    keys.length === 3 &&
    uniqueKeys.size === 3 &&
    keys.every((key) => IRI_EXTERNAL_REPORT_INTENT_KEYS.has(key)) &&
    params.get('area') === 'informes' &&
    params.get('open') === 'bioimpedancia' &&
    UUID_PATTERN.test(assessmentId);
  if (!valid) return Object.freeze({ status: 'invalid' });
  return Object.freeze({
    status: 'valid',
    area: 'informes',
    assessmentId,
    open: 'bioimpedancia',
  });
}

export function resolveIriExternalReportTimeouts(runtime = {}) {
  const requestTimeoutMs = Math.max(
    1_000,
    Math.min(Number(runtime.timeoutMs || IRI_EXTERNAL_REPORT_REQUEST_TIMEOUT_MS), 30_000)
  );
  const uploadTimeoutMs = Math.max(
    60_000,
    Math.min(Number(runtime.iriExternalReportUploadTimeoutMs || IRI_EXTERNAL_REPORT_UPLOAD_TIMEOUT_MS), 300_000)
  );
  return Object.freeze({ requestTimeoutMs, uploadTimeoutMs });
}

function validateRuntime(runtime = {}) {
  if (!runtime.enabled) throw new Error('M26_IRI_EXTERNAL_REPORT_BACKEND_DISABLED');
  const expected = runtime.qaOnly === true
    ? { projectRef: M26_QA_PROJECT_REF, origin: M26_QA_SUPABASE_ORIGIN }
    : { projectRef: M26_PRODUCTION_PROJECT_REF, origin: M26_PRODUCTION_SUPABASE_ORIGIN };
  if (runtime.projectRef !== expected.projectRef) {
    throw new Error('M26_IRI_EXTERNAL_REPORT_PROJECT_MISMATCH');
  }
  let origin;
  try {
    origin = new URL(String(runtime.url || '')).origin;
  } catch {
    throw new Error('M26_IRI_EXTERNAL_REPORT_URL_INVALID');
  }
  if (origin !== expected.origin) {
    throw new Error('M26_IRI_EXTERNAL_REPORT_ORIGIN_MISMATCH');
  }
  const publishableKey = cleanText(runtime.publishableKey, 20_000);
  if (publishableKey.length < 2) throw new Error('M26_IRI_EXTERNAL_REPORT_KEY_REQUIRED');
  const timeouts = resolveIriExternalReportTimeouts(runtime);
  return Object.freeze({
    origin,
    publishableKey,
    timeoutMs: timeouts.requestTimeoutMs,
    uploadTimeoutMs: timeouts.uploadTimeoutMs,
    version: cleanText(runtime.version || '26.0.0', 80),
  });
}

export function iriExternalReportObjectPath(clientId, assessmentId) {
  const client = validateUuid(clientId, 'M26_IRI_EXTERNAL_REPORT_CLIENT_INVALID');
  const assessment = validateUuid(
    assessmentId,
    'M26_IRI_EXTERNAL_REPORT_ASSESSMENT_INVALID'
  );
  return `${client}/${assessment}/bioimpedancia`;
}

export function validateIriExternalReportFile(file) {
  if (!file || typeof file !== 'object') {
    throw new Error('M26_IRI_EXTERNAL_REPORT_FILE_REQUIRED');
  }
  const fileName = cleanText(file.name, 240);
  const mimeType = cleanText(file.type, 120).toLowerCase();
  const sizeBytes = Number(file.size);
  if (!fileName || fileName.length > 240) {
    throw new Error('M26_IRI_EXTERNAL_REPORT_FILE_NAME_INVALID');
  }
  if (!MIME_TYPES.has(mimeType)) {
    throw new Error('M26_IRI_EXTERNAL_REPORT_MIME_INVALID');
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > IRI_EXTERNAL_REPORT_MAX_BYTES) {
    throw new Error('M26_IRI_EXTERNAL_REPORT_SIZE_INVALID');
  }
  return Object.freeze({ fileName, mimeType, sizeBytes });
}

export function resolveIriExternalReportContext(state = {}, requestedAssessmentId = '') {
  const role = normalizeRole(state?.identity?.role);
  const clients = Array.isArray(state?.collections?.clients) ? state.collections.clients : [];
  const ownClientId = cleanText(
    state?.identity?.clientId || state?.identity?.client_id,
    80
  );
  const selectedClientId = cleanText(state?.selectedClientId, 80);
  const clientId = role === 'client'
    ? ownClientId
    : selectedClientId || (clients.length === 1 ? cleanText(clients[0]?.id, 80) : '');
  if (!UUID_PATTERN.test(clientId)) {
    return Object.freeze({ role, clientId: null, assessmentId: null, canManage: false });
  }
  if (role !== 'client' && clients.every((item) => cleanText(item?.id, 80) !== clientId)) {
    return Object.freeze({ role, clientId: null, assessmentId: null, canManage: false });
  }
  const assessments = (Array.isArray(state?.collections?.iriAssessments)
    ? state.collections.iriAssessments
    : [])
    .filter((item) => recordClientId(item) === clientId && UUID_PATTERN.test(recordId(item)))
    .sort((a, b) => assessmentSortValue(b).localeCompare(assessmentSortValue(a)));
  const requested = cleanText(requestedAssessmentId, 80);
  const selectedAssessment = requested && UUID_PATTERN.test(requested)
    ? assessments.find((item) => recordId(item) === requested)
    : assessments[0];
  return Object.freeze({
    role,
    clientId,
    assessmentId: recordId(selectedAssessment) || null,
    canManage: ['admin', 'coach'].includes(role),
  });
}

export function resolveIriExternalReportIntent(state = {}, intent = {}) {
  if (intent?.status !== 'valid' || !UUID_PATTERN.test(String(intent.assessmentId || ''))) {
    throw new Error('M26_IRI_EXTERNAL_REPORT_NOT_FOUND');
  }
  const context = resolveIriExternalReportContext(state, intent.assessmentId);
  const record = (state?.collections?.iriAssessments || []).find(
    (item) => recordId(item) === context.assessmentId && recordClientId(item) === context.clientId
  );
  if (!context.clientId || !context.assessmentId || !record || !recordIsConfirmed(record)) {
    throw new Error('M26_IRI_EXTERNAL_REPORT_NOT_FOUND');
  }
  return context;
}

export function friendlyIriExternalReportError(error) {
  const code = String(error?.message || error || '');
  if (/FILE_REQUIRED/.test(code)) return 'Selecciona primero un PDF, JPG o PNG.';
  if (/MIME_INVALID|MIME_TYPE_INVALID/.test(code)) {
    return 'Formato no permitido. Usa PDF, JPG o PNG.';
  }
  if (/SIZE_INVALID|TOO_LARGE|413/.test(code)) {
    return 'El archivo debe tener un tamaño máximo de 50 MB.';
  }
  if (/FILE_NAME_INVALID/.test(code)) return 'El nombre del archivo no es válido.';
  if (/POPUP_BLOCKED/.test(code)) {
    return 'El navegador bloqueó la pestaña nueva. Permite ventanas emergentes y vuelve a intentarlo.';
  }
  if (/AUTH|JWT|401|403/.test(code)) return 'La sesión perdió autorización. Vuelve a entrar.';
  if (/COACH_ASSIGNMENT_REQUIRED|ROLE_FORBIDDEN|NOT_VISIBLE/.test(code)) {
    return 'No tienes permiso para gestionar este informe.';
  }
  if (/IRI_NOT_FOUND|ASSESSMENT_INVALID/.test(code)) {
    return 'No se encontró una evaluación IRI válida para vincular el informe.';
  }
  if (/EXTERNAL_REPORT_NOT_FOUND|SCOPE_MISMATCH/.test(code)) {
    return 'El documento solicitado no está disponible para este expediente.';
  }
  if (/STORAGE_OBJECT_NOT_FOUND/.test(code)) {
    return 'El archivo se subió, pero Storage aún no lo reconoce. Reintenta el registro.';
  }
  if (/NETWORK|FETCH|TIMEOUT|AbortError/i.test(code)) {
    return 'No fue posible conectar. El estado actual permanece protegido.';
  }
  return 'No fue posible completar la gestión del informe. Revisa el estado e inténtalo nuevamente.';
}

export function createIriExternalReportService({ runtime, fetchImpl = globalThis.fetch } = {}) {
  const config = validateRuntime(runtime);
  if (typeof fetchImpl !== 'function') {
    throw new Error('M26_IRI_EXTERNAL_REPORT_FETCH_UNAVAILABLE');
  }

  async function request(
    path,
    { token, method = 'GET', headers = {}, body, timeoutMs = config.timeoutMs } = {}
  ) {
    const accessToken = cleanText(token, 20_000);
    if (!accessToken) throw new Error('M26_IRI_EXTERNAL_REPORT_AUTH_REQUIRED');
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      throw new Error('M26_IRI_EXTERNAL_REPORT_PATH_INVALID');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${config.origin}${path}`, {
        method,
        body,
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: {
          ...headers,
          apikey: config.publishableKey,
          authorization: `Bearer ${accessToken}`,
          'x-client-info': `iberfit-m26-web/${config.version}`,
        },
      });
      const contentType = response.headers?.get?.('content-type') || '';
      const payload = response.status === 204
        ? null
        : contentType.includes('application/json')
          ? await response.json().catch(() => ({}))
          : await response.text().catch(() => '');
      if (!response.ok) {
        const failure = new Error(responseMessage(payload, response.status));
        failure.status = response.status;
        failure.body = payload;
        throw failure;
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('M26_IRI_EXTERNAL_REPORT_TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function getReport(token, { assessmentId } = {}) {
    const assessment = validateUuid(
      assessmentId,
      'M26_IRI_EXTERNAL_REPORT_ASSESSMENT_INVALID'
    );
    const params = new URLSearchParams({
      select: REPORT_SELECT,
      assessment_id: `eq.${assessment}`,
      order: 'updated_at.desc',
      limit: '1',
    });
    const rows = await request(`/rest/v1/iri_external_reports_v26?${params}`, {
      token,
      method: 'GET',
    });
    if (!Array.isArray(rows) || rows.length > 1) {
      throw new Error('M26_IRI_EXTERNAL_REPORT_INVALID_RESPONSE');
    }
    return normalizeReport(rows[0]);
  }

  async function uploadObject(token, { clientId, assessmentId, file } = {}) {
    const details = validateIriExternalReportFile(file);
    const objectPath = iriExternalReportObjectPath(clientId, assessmentId);
    await request(
      `/storage/v1/object/${encodeURIComponent(IRI_EXTERNAL_REPORT_BUCKET)}/${encodedStoragePath(objectPath)}`,
      {
        token,
        method: 'POST',
        body: file,
        headers: {
          'content-type': details.mimeType,
          'cache-control': '3600',
          'x-upsert': 'true',
        },
        timeoutMs: config.uploadTimeoutMs,
      }
    );
    return Object.freeze({ ...details, objectPath });
  }

  async function registerReport(
    token,
    { clientId, assessmentId, fileName, mimeType, sizeBytes, objectPath } = {}
  ) {
    const client = validateUuid(clientId, 'M26_IRI_EXTERNAL_REPORT_CLIENT_INVALID');
    const assessment = validateUuid(
      assessmentId,
      'M26_IRI_EXTERNAL_REPORT_ASSESSMENT_INVALID'
    );
    const expectedPath = iriExternalReportObjectPath(client, assessment);
    if (cleanText(objectPath, 600) !== expectedPath) {
      throw new Error('M26_IRI_EXTERNAL_REPORT_OBJECT_PATH_INVALID');
    }
    const details = validateIriExternalReportFile({
      name: fileName,
      type: mimeType,
      size: sizeBytes,
    });
    const payload = await request(
      '/rest/v1/rpc/iberfit_register_iri_external_report_v12',
      {
        token,
        method: 'POST',
        body: JSON.stringify({
          p_client_id: client,
          p_assessment_id: assessment,
          p_file_name: details.fileName,
          p_mime_type: details.mimeType,
          p_size_bytes: details.sizeBytes,
          p_object_path: expectedPath,
        }),
        headers: { 'content-type': 'application/json' },
      }
    );
    const report = normalizeReport(payload);
    if (!report || payload?.ok !== true) {
      throw new Error('M26_IRI_EXTERNAL_REPORT_REGISTER_INVALID_RESPONSE');
    }
    return report;
  }

  async function signedUrl(token, { objectPath, expiresIn = 300 } = {}) {
    const path = cleanText(objectPath, 600);
    if (!path || !path.endsWith('/bioimpedancia')) {
      throw new Error('M26_IRI_EXTERNAL_REPORT_OBJECT_PATH_INVALID');
    }
    const seconds = Math.max(60, Math.min(Number(expiresIn) || 300, 900));
    const payload = await request(
      `/storage/v1/object/sign/${encodeURIComponent(IRI_EXTERNAL_REPORT_BUCKET)}/${encodedStoragePath(path)}`,
      {
        token,
        method: 'POST',
        body: JSON.stringify({ expiresIn: seconds }),
        headers: { 'content-type': 'application/json' },
      }
    );
    const value = cleanText(payload?.signedURL || payload?.signedUrl, 4_000);
    if (!value) throw new Error('M26_IRI_EXTERNAL_REPORT_SIGN_INVALID_RESPONSE');
    const url = new URL(value, `${config.origin}/`);
    if (url.origin !== config.origin) {
      throw new Error('M26_IRI_EXTERNAL_REPORT_SIGN_ORIGIN_INVALID');
    }
    return url.href;
  }

  return Object.freeze({ getReport, uploadObject, registerReport, signedUrl });
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Tamaño sin confirmar';
  if (bytes < 1_000_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${Math.round((bytes / 1_000_000) * 10) / 10} MB`;
}

function formatDate(value) {
  if (!value) return 'Fecha sin confirmar';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha sin confirmar';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
  }).format(date);
}

function formatMimeType(value) {
  const mimeType = cleanText(value, 120).toLowerCase();
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'image/jpeg') return 'JPEG';
  if (mimeType === 'image/png') return 'PNG';
  return 'Formato no disponible';
}

function reportForContext(context, report, { requireClientVisible = false } = {}) {
  if (!report) return null;
  if (
    report.clientId !== context.clientId ||
    report.assessmentId !== context.assessmentId ||
    !MIME_TYPES.has(report.mimeType)
  ) {
    throw new Error('M26_IRI_EXTERNAL_REPORT_SCOPE_MISMATCH');
  }
  if ((context.role === 'client' || requireClientVisible) && !report.visibleToClient) {
    return null;
  }
  return report;
}

export function prepareIriExternalReportViewTarget(openImpl = globalThis.open) {
  if (typeof openImpl !== 'function') return null;
  let target = null;
  try {
    target = openImpl('about:blank', '_blank');
  } catch {
    return null;
  }
  if (!target) return null;
  try {
    target.opener = null;
  } catch {
    // The placeholder stays same-origin until the canonical signed URL is ready.
  }
  return target;
}

export function navigateIriExternalReportViewTarget(target, url) {
  if (!target || !url) return false;
  try {
    if (typeof target.location?.replace === 'function') target.location.replace(url);
    else if (target.location) target.location.href = url;
    else return false;
    return true;
  } catch {
    try {
      target.close?.();
    } catch {
      // Ignore cleanup failures after a blocked navigation.
    }
    return false;
  }
}

function iriRoute(root, context = {}) {
  if (!context.canManage) {
    return root?.querySelector?.('[data-iri-external-report-host]')?.closest?.('.m26-route') || null;
  }
  return [...(root?.querySelectorAll?.('.m26-route') || [])].find((route) =>
    [...route.querySelectorAll('h2')].some((heading) =>
      /Índice de Rendimiento IBERFIT/i.test(heading.textContent || '')
    )
  ) || null;
}

function cardMarkup(context, entry) {
  let report = null;
  try {
    report = reportForContext(context, entry.report);
  } catch {
    report = null;
  }
  const canManage = context.canManage;
  const isBusy = Boolean(entry.busy || entry.loading);
  const status = entry.message
    ? `<p class="m26-external-report-status is-${escapeHtml(entry.tone || 'info')}" role="status" aria-live="polite">${escapeHtml(entry.message)}</p>`
    : '<p class="m26-external-report-status" role="status" aria-live="polite"></p>';
  const summary = report
    ? canManage
      ? `<div class="m26-external-report-summary"><div><span>Archivo actual</span><strong>${escapeHtml(report.fileName || 'Informe de bioimpedancia')}</strong><small>${escapeHtml(formatBytes(report.sizeBytes))} · ${escapeHtml(formatMimeType(report.mimeType))} · versión ${escapeHtml(report.version)} · ${escapeHtml(formatDate(report.updatedAt || report.uploadedAt))}</small></div><span class="m26-external-report-visibility">${report.visibleToClient ? 'Visible para cliente' : 'Solo uso interno'}</span></div>`
      : `<div class="m26-external-report-summary"><div><span>Documento complementario</span><strong>${escapeHtml(report.fileName || 'Informe de bioimpedancia')}</strong><small>${escapeHtml(formatMimeType(report.mimeType))} · subido el ${escapeHtml(formatDate(report.uploadedAt || report.updatedAt))} · versión ${escapeHtml(report.version)}</small></div></div>`
    : `<div class="m26-external-report-empty"><strong>${entry.loading ? 'Comprobando documento…' : 'Informe de bioimpedancia'}</strong><p>${canManage ? 'Selecciona el archivo en el campo anterior y súbelo desde aquí.' : 'Aún no hay un informe de bioimpedancia adjunto a este diagnóstico.'}</p></div>`;
  const uploadLabel = report ? 'Reemplazar informe' : 'Subir informe';
  const manageActions = canManage
    ? `<button type="button" class="m26-primary-action" data-iri-external-report-action="upload"${isBusy || !context.assessmentId ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(uploadLabel)}</button>${entry.pending ? '<button type="button" data-iri-external-report-action="retry-register">Reintentar registro</button>' : ''}`
    : '';
  const viewAction = report
    ? `<button type="button" data-iri-external-report-action="view"${isBusy ? ' disabled aria-disabled="true"' : ''}>Ver informe de bioimpedancia</button>`
    : '';
  const selection = canManage
    ? '<small class="m26-external-report-selection" data-iri-external-report-selection>Ningún archivo seleccionado para una nueva carga.</small>'
    : '';
  return `<section class="m26-panel m26-panel-soft m26-external-report-card m26-wide" data-iri-external-report-card data-assessment-id="${escapeHtml(context.assessmentId || '')}"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Documento complementario</p><h3>Informe de bioimpedancia</h3><p>${canManage ? 'PDF, JPG o PNG · máximo 50 MB · vinculado a esta evaluación IRI.' : 'Este documento complementa los resultados de composición corporal del Diagnóstico IRI.'}</p></div>${report ? `<span class="m26-badge is-success">Versión ${escapeHtml(report.version)}</span>` : '<span class="m26-badge is-neutral">Pendiente</span>'}</div>${summary}<div class="m26-external-report-actions">${manageActions}${viewAction}</div>${selection}${status}</section>`;
}

function viewerMarkup() {
  return `<dialog class="m26-document-viewer" data-iri-document-viewer aria-labelledby="m26-document-viewer-title"><div class="m26-document-viewer-shell"><header><div><p class="m26-eyebrow">Documento complementario</p><h2 id="m26-document-viewer-title">Informe de bioimpedancia</h2><p data-iri-document-viewer-meta></p></div><button type="button" data-iri-external-report-action="viewer-close" aria-label="Cerrar visor">Cerrar</button></header><div class="m26-document-viewer-stage"><div class="m26-document-viewer-loading" data-iri-document-viewer-loading role="status" aria-live="polite">Preparando acceso privado…</div><iframe data-iri-document-viewer-pdf title="Informe de bioimpedancia en PDF" referrerpolicy="no-referrer" hidden></iframe><img data-iri-document-viewer-image alt="Informe de bioimpedancia" referrerpolicy="no-referrer" hidden><section class="m26-document-viewer-error" data-iri-document-viewer-error role="alert" hidden><strong>No fue posible mostrar el documento.</strong><p>Comprueba tu conexión e inténtalo de nuevo.</p><button type="button" data-iri-external-report-action="viewer-retry">Reintentar</button></section></div><footer><button type="button" data-iri-external-report-action="viewer-open-new">Abrir en una pestaña nueva</button></footer></div></dialog>`;
}

export function createIriExternalReportController({
  root,
  store,
  runtime,
  getToken,
  isOnline = () => globalThis.navigator?.onLine !== false,
  service = null,
} = {}) {
  if (!root?.addEventListener || !store?.getState || typeof getToken !== 'function') {
    throw new Error('M26_IRI_EXTERNAL_REPORT_CONTROLLER_REQUIRED');
  }
  const api = service || createIriExternalReportService({ runtime });
  const entries = new Map();
  let mounted = false;
  let observer = null;
  let scanQueued = false;
  let requestSequence = 0;
  let pinnedAssessmentId = null;
  let viewerReturnFocus = null;
  let viewerLoadTimer = null;

  function entryFor(assessmentId) {
    if (!entries.has(assessmentId)) {
      entries.set(assessmentId, {
        loaded: false,
        loading: false,
        busy: false,
        report: null,
        pending: null,
        error: null,
        message: '',
        tone: 'info',
      });
    }
    return entries.get(assessmentId);
  }

  function currentContext() {
    const hostAssessmentId = cleanText(
      root.querySelector?.('[data-iri-external-report-host]')?.dataset?.assessmentId,
      80
    );
    return resolveIriExternalReportContext(
      store.getState(),
      pinnedAssessmentId || hostAssessmentId
    );
  }

  function currentCard() {
    return root.querySelector?.('[data-iri-external-report-card]') || null;
  }

  function targetFor(route, context) {
    if (context.canManage) {
      const input = route.querySelector?.('[name="bodyCompositionAttachment"]');
      const label = input?.closest?.('label');
      if (label) return { mode: 'after', node: label };
    }
    const host = route.querySelector?.('[data-iri-external-report-host]');
    if (host) return { mode: 'append', node: host };
    const intro = route.querySelector?.('.m26-route-intro');
    return { mode: intro ? 'after' : 'append', node: intro || route };
  }

  function placeCard(route, context) {
    const entry = context.assessmentId
      ? entryFor(context.assessmentId)
      : { report: null, loading: false, busy: false, pending: null, message: '', tone: 'info' };
    const existing = currentCard();
    const sameAssessment = existing?.dataset?.assessmentId === (context.assessmentId || '');
    if (existing && sameAssessment) return existing;
    existing?.remove?.();
    const template = document.createElement('template');
    template.innerHTML = cardMarkup(context, entry).trim();
    const card = template.content.firstElementChild;
    const target = targetFor(route, context);
    if (target.mode === 'after') target.node.insertAdjacentElement('afterend', card);
    else target.node.appendChild(card);
    syncSelectedFile(route, context);
    return card;
  }

  function repaint(context) {
    const route = iriRoute(root, context);
    if (!route) return;
    const existing = currentCard();
    const template = document.createElement('template');
    const entry = context.assessmentId
      ? entryFor(context.assessmentId)
      : { report: null, loading: false, busy: false, pending: null, message: '', tone: 'info' };
    template.innerHTML = cardMarkup(context, entry).trim();
    const replacement = template.content.firstElementChild;
    if (existing) existing.replaceWith(replacement);
    else placeCard(route, context);
    syncSelectedFile(route, context);
  }

  function selectedInput(route = iriRoute(root, currentContext())) {
    return route?.querySelector?.('[name="bodyCompositionAttachment"]') || null;
  }

  function syncSelectedFile(route, context) {
    const card = currentCard();
    if (!card || !context.canManage) return;
    const input = selectedInput(route);
    const button = card.querySelector?.('[data-iri-external-report-action="upload"]');
    const label = card.querySelector?.('[data-iri-external-report-selection]');
    const file = input?.files?.[0] || null;
    if (!file) {
      if (button) button.disabled = true;
      if (label) label.textContent = 'Ningún archivo seleccionado para una nueva carga.';
      return;
    }
    try {
      const details = validateIriExternalReportFile(file);
      if (button) button.disabled = Boolean(entryFor(context.assessmentId).busy);
      if (label) {
        label.textContent = `${details.fileName} · ${formatBytes(details.sizeBytes)} · listo para subir.`;
      }
    } catch (error) {
      if (button) button.disabled = true;
      if (label) label.textContent = friendlyIriExternalReportError(error);
    }
  }

  function ensureViewer() {
    let viewer = root.querySelector?.('[data-iri-document-viewer]');
    if (viewer) return viewer;
    const doc = root.ownerDocument || globalThis.document;
    const template = doc?.createElement?.('template');
    if (!template) throw new Error('M26_IRI_EXTERNAL_REPORT_VIEWER_UNAVAILABLE');
    template.innerHTML = viewerMarkup().trim();
    viewer = template.content.firstElementChild;
    root.appendChild(viewer);
    return viewer;
  }

  function clearViewerMedia(viewer) {
    clearTimeout(viewerLoadTimer);
    viewerLoadTimer = null;
    const frame = viewer?.querySelector?.('[data-iri-document-viewer-pdf]');
    const image = viewer?.querySelector?.('[data-iri-document-viewer-image]');
    if (frame) {
      frame.hidden = true;
      frame.removeAttribute?.('src');
    }
    if (image) {
      image.hidden = true;
      image.removeAttribute?.('src');
    }
  }

  function setViewerState(viewer, state, message = '') {
    if (!viewer) return;
    viewer.dataset.state = state;
    const loading = viewer.querySelector?.('[data-iri-document-viewer-loading]');
    const error = viewer.querySelector?.('[data-iri-document-viewer-error]');
    if (loading) {
      loading.hidden = state !== 'loading';
      if (message) loading.textContent = message;
    }
    if (error) error.hidden = state !== 'error';
  }

  function closeViewer() {
    const viewer = root.querySelector?.('[data-iri-document-viewer]');
    if (!viewer) return;
    clearViewerMedia(viewer);
    if (typeof viewer.close === 'function' && viewer.open) viewer.close();
    else viewer.removeAttribute?.('open');
    viewerReturnFocus?.focus?.({ preventScroll: true });
    viewerReturnFocus = null;
  }

  function openViewerShell(report) {
    const viewer = ensureViewer();
    clearViewerMedia(viewer);
    const meta = viewer.querySelector?.('[data-iri-document-viewer-meta]');
    if (meta) {
      meta.textContent = `${report.fileName || 'Informe de bioimpedancia'} · ${formatMimeType(report.mimeType)} · versión ${report.version}`;
    }
    setViewerState(viewer, 'loading', 'Preparando acceso privado…');
    if (typeof viewer.showModal === 'function' && !viewer.open) viewer.showModal();
    else viewer.setAttribute?.('open', '');
    queueMicrotask(() =>
      viewer.querySelector?.('[data-iri-external-report-action="viewer-close"]')?.focus?.()
    );
    return viewer;
  }

  function displaySignedDocument(viewer, report, url) {
    const ready = () => {
      clearTimeout(viewerLoadTimer);
      viewerLoadTimer = null;
      setViewerState(viewer, 'ready');
    };
    const failed = () => {
      clearTimeout(viewerLoadTimer);
      viewerLoadTimer = null;
      clearViewerMedia(viewer);
      setViewerState(viewer, 'error');
    };
    if (report.mimeType === 'application/pdf') {
      const frame = viewer.querySelector?.('[data-iri-document-viewer-pdf]');
      if (!frame) throw new Error('M26_IRI_EXTERNAL_REPORT_VIEWER_UNAVAILABLE');
      frame.hidden = false;
      frame.addEventListener?.('load', ready, { once: true });
      frame.addEventListener?.('error', failed, { once: true });
      frame.src = url;
    } else {
      const image = viewer.querySelector?.('[data-iri-document-viewer-image]');
      if (!image) throw new Error('M26_IRI_EXTERNAL_REPORT_VIEWER_UNAVAILABLE');
      image.alt = `Informe de bioimpedancia · ${report.fileName || formatMimeType(report.mimeType)}`;
      image.hidden = false;
      image.addEventListener?.('load', ready, { once: true });
      image.addEventListener?.('error', failed, { once: true });
      image.src = url;
    }
    viewerLoadTimer = setTimeout(failed, 20_000);
  }

  async function token() {
    const value = await getToken();
    if (!value) throw new Error('M26_IRI_EXTERNAL_REPORT_AUTH_REQUIRED');
    return value;
  }

  async function load(context, { throwOnError = false } = {}) {
    if (!context.assessmentId) {
      if (throwOnError) throw new Error('M26_IRI_EXTERNAL_REPORT_NOT_FOUND');
      return null;
    }
    const entry = entryFor(context.assessmentId);
    if (entry.loaded) return reportForContext(context, entry.report);
    if (entry.loading) {
      if (throwOnError) throw new Error('M26_IRI_EXTERNAL_REPORT_LOADING');
      return null;
    }
    entry.loading = true;
    entry.error = null;
    entry.message = '';
    repaint(context);
    const sequence = ++requestSequence;
    try {
      entry.report = reportForContext(context, await api.getReport(await token(), {
        assessmentId: context.assessmentId,
      }));
      entry.loaded = true;
    } catch (error) {
      entry.error = error;
      entry.message = friendlyIriExternalReportError(error);
      entry.tone = 'error';
      if (throwOnError) throw error;
    } finally {
      entry.loading = false;
      if (sequence === requestSequence) repaint(currentContext());
    }
    return reportForContext(context, entry.report);
  }

  async function registerPending(context, entry) {
    if (!entry.pending) throw new Error('M26_IRI_EXTERNAL_REPORT_PENDING_REQUIRED');
    if (entry.busy) return;
    entry.busy = true;
    entry.message = 'Confirmando la vinculación con el IRI…';
    entry.tone = 'pending';
    repaint(context);
    try {
      entry.report = await api.registerReport(await token(), entry.pending);
      entry.pending = null;
      entry.loaded = true;
      entry.message = `Informe registrado correctamente · versión ${entry.report.version}.`;
      entry.tone = 'success';
      const input = selectedInput();
      if (input) input.value = '';
    } catch (error) {
      entry.message = friendlyIriExternalReportError(error);
      entry.tone = 'error';
      throw error;
    } finally {
      entry.busy = false;
      repaint(currentContext());
    }
  }

  async function upload(context) {
    if (!context.canManage) throw new Error('M26_IRI_EXTERNAL_REPORT_ROLE_FORBIDDEN');
    if (!isOnline()) throw new Error('M26_IRI_EXTERNAL_REPORT_NETWORK_REQUIRED');
    if (!context.clientId || !context.assessmentId) {
      throw new Error('M26_IRI_EXTERNAL_REPORT_ASSESSMENT_INVALID');
    }
    const file = selectedInput()?.files?.[0] || null;
    const entry = entryFor(context.assessmentId);
    if (entry.busy) return;
    const details = validateIriExternalReportFile(file);
    entry.busy = true;
    entry.pending = null;
    entry.message = 'Subiendo el archivo de forma privada…';
    entry.tone = 'pending';
    repaint(context);
    try {
      const uploaded = await api.uploadObject(await token(), {
        clientId: context.clientId,
        assessmentId: context.assessmentId,
        file,
      });
      entry.pending = {
        clientId: context.clientId,
        assessmentId: context.assessmentId,
        fileName: details.fileName,
        mimeType: details.mimeType,
        sizeBytes: details.sizeBytes,
        objectPath: uploaded.objectPath,
      };
      entry.busy = false;
      await registerPending(context, entry);
    } catch (error) {
      entry.busy = false;
      if (entry.pending) {
        entry.message = 'El archivo llegó a Storage, pero falta confirmar su registro. Pulsa «Reintentar registro».';
      } else {
        entry.message = friendlyIriExternalReportError(error);
      }
      entry.tone = 'error';
      repaint(currentContext());
    }
  }

  async function view(context) {
    const entry = context.assessmentId ? entryFor(context.assessmentId) : null;
    const report = reportForContext(context, entry?.report);
    if (!report) throw new Error('M26_IRI_EXTERNAL_REPORT_NOT_FOUND');
    const viewer = openViewerShell(report);
    entry.busy = true;
    entry.message = 'Preparando acceso temporal…';
    entry.tone = 'pending';
    repaint(context);
    try {
      const signedUrl = await api.signedUrl(await token(), {
        objectPath: report.objectPath,
        expiresIn: 300,
      });
      displaySignedDocument(viewer, report, signedUrl);
      entry.message = 'Informe preparado en el visor privado.';
      entry.tone = 'success';
    } catch (error) {
      clearViewerMedia(viewer);
      setViewerState(viewer, 'error');
      entry.message = friendlyIriExternalReportError(error);
      entry.tone = 'error';
    } finally {
      entry.busy = false;
      repaint(currentContext());
    }
  }

  async function openInNewTab(context) {
    const entry = context.assessmentId ? entryFor(context.assessmentId) : null;
    const report = reportForContext(context, entry?.report);
    if (!report) throw new Error('M26_IRI_EXTERNAL_REPORT_NOT_FOUND');
    const viewTarget = prepareIriExternalReportViewTarget();
    if (!viewTarget) throw new Error('M26_IRI_EXTERNAL_REPORT_POPUP_BLOCKED');
    entry.busy = true;
    entry.message = 'Preparando una pestaña privada…';
    entry.tone = 'pending';
    repaint(context);
    try {
      const url = await api.signedUrl(await token(), {
        objectPath: report.objectPath,
        expiresIn: 300,
      });
      if (!navigateIriExternalReportViewTarget(viewTarget, url)) {
        throw new Error('M26_IRI_EXTERNAL_REPORT_POPUP_BLOCKED');
      }
      entry.message = 'Acceso temporal abierto en una pestaña nueva.';
      entry.tone = 'success';
    } catch (error) {
      try {
        viewTarget.close?.();
      } catch {}
      entry.message = friendlyIriExternalReportError(error);
      entry.tone = 'error';
      throw error;
    } finally {
      entry.busy = false;
      repaint(currentContext());
    }
  }

  async function onClick(event) {
    const button = event.target.closest?.('[data-iri-external-report-action]');
    if (!button) return;
    event.preventDefault?.();
    const context = currentContext();
    const action = button.getAttribute('data-iri-external-report-action');
    try {
      if (action === 'upload') await upload(context);
      else if (action === 'retry-register') {
        const entry = entryFor(context.assessmentId);
        await registerPending(context, entry);
      } else if (action === 'view') {
        viewerReturnFocus = button;
        await view(context);
      } else if (action === 'viewer-close') closeViewer();
      else if (action === 'viewer-retry') await view(context);
      else if (action === 'viewer-open-new') await openInNewTab(context);
    } catch (error) {
      const entry = context.assessmentId ? entryFor(context.assessmentId) : null;
      if (entry) {
        entry.message = friendlyIriExternalReportError(error);
        entry.tone = 'error';
        entry.busy = false;
        repaint(currentContext());
      }
    }
  }

  function onChange(event) {
    if (!event.target?.matches?.('[name="bodyCompositionAttachment"]')) return;
    const context = currentContext();
    const entry = context.assessmentId ? entryFor(context.assessmentId) : null;
    if (entry) {
      entry.message = '';
      entry.tone = 'info';
    }
    syncSelectedFile(iriRoute(root, context), context);
  }

  function onKeyDown(event) {
    if (event.key !== 'Escape') return;
    const viewer = root.querySelector?.('[data-iri-document-viewer]');
    if (!viewer?.open && !viewer?.hasAttribute?.('open')) return;
    event.preventDefault?.();
    closeViewer();
  }

  async function clientReportForPdf(assessmentId) {
    const intent = Object.freeze({
      status: 'valid',
      area: 'informes',
      assessmentId: validateUuid(
        assessmentId,
        'M26_IRI_EXTERNAL_REPORT_ASSESSMENT_INVALID'
      ),
      open: 'bioimpedancia',
    });
    const context = resolveIriExternalReportIntent(store.getState(), intent);
    const report = await load(context, { throwOnError: true });
    return reportForContext(context, report, { requireClientVisible: true });
  }

  async function openAssessmentReport(assessmentId) {
    const intent = Object.freeze({
      status: 'valid',
      area: 'informes',
      assessmentId: validateUuid(
        assessmentId,
        'M26_IRI_EXTERNAL_REPORT_ASSESSMENT_INVALID'
      ),
      open: 'bioimpedancia',
    });
    const context = resolveIriExternalReportIntent(store.getState(), intent);
    pinnedAssessmentId = context.assessmentId;
    const route = iriRoute(root, context);
    if (!route) throw new Error('M26_IRI_EXTERNAL_REPORT_NOT_FOUND');
    placeCard(route, context);
    await load(context, { throwOnError: true });
    await view(context);
    return true;
  }

  function scan() {
    scanQueued = false;
    const context = currentContext();
    const route = iriRoute(root, context);
    if (!route) {
      currentCard()?.remove?.();
      return;
    }
    placeCard(route, context);
    if (context.assessmentId) void load(context);
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    queueMicrotask(scan);
  }

  return Object.freeze({
    clientReportForPdf,
    openAssessmentReport,
    mount() {
      if (mounted) return;
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      root.addEventListener('keydown', onKeyDown);
      if (typeof MutationObserver === 'function') {
        observer = new MutationObserver(queueScan);
        observer.observe(root, { childList: true, subtree: true });
      }
      queueScan();
      mounted = true;
    },
    destroy() {
      if (!mounted) return;
      observer?.disconnect?.();
      observer = null;
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
      root.removeEventListener('keydown', onKeyDown);
      clearTimeout(viewerLoadTimer);
      root.querySelector?.('[data-iri-document-viewer]')?.remove?.();
      currentCard()?.remove?.();
      entries.clear();
      pinnedAssessmentId = null;
      viewerReturnFocus = null;
      mounted = false;
    },
  });
}

export const __iriExternalReportInternals = Object.freeze({
  cardMarkup,
  viewerMarkup,
  formatMimeType,
  reportForContext,
  recordIsConfirmed,
});
