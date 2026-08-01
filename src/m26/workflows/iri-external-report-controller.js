const CANONICAL_PROJECT_REF = 'pjhmrhejsoofmouedavw';
const CANONICAL_SUPABASE_ORIGIN = `https://${CANONICAL_PROJECT_REF}.supabase.co`;

export const IRI_EXTERNAL_REPORT_BUCKET = 'iberfit-iri-external-reports';
export const IRI_EXTERNAL_REPORT_MAX_BYTES = 50_000_000;
export const IRI_EXTERNAL_REPORT_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const MIME_TYPES = new Set(IRI_EXTERNAL_REPORT_MIME_TYPES);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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

function validateRuntime(runtime = {}) {
  if (!runtime.enabled) throw new Error('M26_IRI_EXTERNAL_REPORT_BACKEND_DISABLED');
  if (runtime.projectRef !== CANONICAL_PROJECT_REF) {
    throw new Error('M26_IRI_EXTERNAL_REPORT_PROJECT_MISMATCH');
  }
  let origin;
  try {
    origin = new URL(String(runtime.url || '')).origin;
  } catch {
    throw new Error('M26_IRI_EXTERNAL_REPORT_URL_INVALID');
  }
  if (origin !== CANONICAL_SUPABASE_ORIGIN) {
    throw new Error('M26_IRI_EXTERNAL_REPORT_ORIGIN_MISMATCH');
  }
  const publishableKey = cleanText(runtime.publishableKey, 20_000);
  if (publishableKey.length < 2) throw new Error('M26_IRI_EXTERNAL_REPORT_KEY_REQUIRED');
  return Object.freeze({
    origin,
    publishableKey,
    timeoutMs: Math.max(1_000, Math.min(Number(runtime.timeoutMs || 12_000), 30_000)),
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

export function resolveIriExternalReportContext(state = {}) {
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
  return Object.freeze({
    role,
    clientId,
    assessmentId: recordId(assessments[0]) || null,
    canManage: ['admin', 'coach'].includes(role),
  });
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
  if (/AUTH|JWT|401|403/.test(code)) return 'La sesión perdió autorización. Vuelve a entrar.';
  if (/COACH_ASSIGNMENT_REQUIRED|ROLE_FORBIDDEN|NOT_VISIBLE/.test(code)) {
    return 'No tienes permiso para gestionar este informe.';
  }
  if (/IRI_NOT_FOUND|ASSESSMENT_INVALID/.test(code)) {
    return 'No se encontró una evaluación IRI válida para vincular el informe.';
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

  async function request(path, { token, method = 'GET', headers = {}, body } = {}) {
    const accessToken = cleanText(token, 20_000);
    if (!accessToken) throw new Error('M26_IRI_EXTERNAL_REPORT_AUTH_REQUIRED');
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
      throw new Error('M26_IRI_EXTERNAL_REPORT_PATH_INVALID');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
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
  const report = entry.report;
  const canManage = context.canManage;
  const isBusy = Boolean(entry.busy || entry.loading);
  const status = entry.message
    ? `<p class="m26-external-report-status is-${escapeHtml(entry.tone || 'info')}" role="status" aria-live="polite">${escapeHtml(entry.message)}</p>`
    : '<p class="m26-external-report-status" role="status" aria-live="polite"></p>';
  const summary = report
    ? `<div class="m26-external-report-summary"><div><span>Archivo actual</span><strong>${escapeHtml(report.fileName || 'Informe de bioimpedancia')}</strong><small>${escapeHtml(formatBytes(report.sizeBytes))} · versión ${escapeHtml(report.version)} · ${escapeHtml(formatDate(report.updatedAt || report.uploadedAt))}</small></div><span class="m26-external-report-visibility">${report.visibleToClient ? 'Visible para cliente' : 'Solo uso interno'}</span></div>`
    : `<div class="m26-external-report-empty"><strong>${entry.loading ? 'Comprobando documento…' : 'Sin informe externo vinculado'}</strong><p>${canManage ? 'Selecciona el archivo en el campo anterior y súbelo desde aquí.' : 'Tu entrenador todavía no ha compartido un informe externo para esta evaluación.'}</p></div>`;
  const uploadLabel = report ? 'Reemplazar informe' : 'Subir informe';
  const manageActions = canManage
    ? `<button type="button" class="m26-primary-action" data-iri-external-report-action="upload"${isBusy || !context.assessmentId ? ' disabled aria-disabled="true"' : ''}>${escapeHtml(uploadLabel)}</button>${entry.pending ? '<button type="button" data-iri-external-report-action="retry-register">Reintentar registro</button>' : ''}`
    : '';
  const viewAction = report
    ? `<button type="button" data-iri-external-report-action="view"${isBusy ? ' disabled aria-disabled="true"' : ''}>Ver archivo</button>`
    : '';
  return `<section class="m26-panel m26-panel-soft m26-external-report-card m26-wide" data-iri-external-report-card data-assessment-id="${escapeHtml(context.assessmentId || '')}"><div class="m26-panel-heading"><div><p class="m26-eyebrow">Documento externo</p><h3>Informe de bioimpedancia</h3><p>PDF, JPG o PNG · máximo 50 MB · vinculado a esta evaluación IRI.</p></div>${report ? `<span class="m26-badge is-success">Versión ${escapeHtml(report.version)}</span>` : '<span class="m26-badge is-neutral">Pendiente</span>'}</div>${summary}<div class="m26-external-report-actions">${manageActions}${viewAction}</div><small class="m26-external-report-selection" data-iri-external-report-selection>${canManage ? 'Ningún archivo seleccionado para una nueva carga.' : 'Acceso temporal y privado.'}</small>${status}</section>`;
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

  function entryFor(assessmentId) {
    if (!entries.has(assessmentId)) {
      entries.set(assessmentId, {
        loaded: false,
        loading: false,
        busy: false,
        report: null,
        pending: null,
        message: '',
        tone: 'info',
      });
    }
    return entries.get(assessmentId);
  }

  function currentContext() {
    return resolveIriExternalReportContext(store.getState());
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

  async function token() {
    const value = await getToken();
    if (!value) throw new Error('M26_IRI_EXTERNAL_REPORT_AUTH_REQUIRED');
    return value;
  }

  async function load(context) {
    if (!context.assessmentId) return;
    const entry = entryFor(context.assessmentId);
    if (entry.loading || entry.loaded) return;
    entry.loading = true;
    entry.message = '';
    repaint(context);
    const sequence = ++requestSequence;
    try {
      entry.report = await api.getReport(await token(), {
        assessmentId: context.assessmentId,
      });
      entry.loaded = true;
    } catch (error) {
      entry.message = friendlyIriExternalReportError(error);
      entry.tone = 'error';
    } finally {
      entry.loading = false;
      if (sequence === requestSequence) repaint(currentContext());
    }
  }

  async function registerPending(context, entry) {
    if (!entry.pending) throw new Error('M26_IRI_EXTERNAL_REPORT_PENDING_REQUIRED');
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
    const details = validateIriExternalReportFile(file);
    const entry = entryFor(context.assessmentId);
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
    if (!entry?.report) throw new Error('M26_IRI_EXTERNAL_REPORT_NOT_FOUND');
    entry.busy = true;
    entry.message = 'Preparando acceso temporal…';
    entry.tone = 'pending';
    repaint(context);
    try {
      const url = await api.signedUrl(await token(), {
        objectPath: entry.report.objectPath,
        expiresIn: 300,
      });
      const opened = globalThis.open?.(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        entry.message = 'El navegador bloqueó la nueva pestaña. Permite ventanas emergentes y vuelve a pulsar «Ver archivo».';
        entry.tone = 'error';
      } else {
        entry.message = 'Acceso temporal abierto en una nueva pestaña.';
        entry.tone = 'success';
      }
    } catch (error) {
      entry.message = friendlyIriExternalReportError(error);
      entry.tone = 'error';
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
      } else if (action === 'view') await view(context);
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
    mount() {
      if (mounted) return;
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
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
      currentCard()?.remove?.();
      entries.clear();
      mounted = false;
    },
  });
}
