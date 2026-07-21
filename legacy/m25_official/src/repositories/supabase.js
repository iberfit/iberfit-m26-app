import { ensureSupabaseConfig } from '../supabase-adapter.js';

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_SIGNED_URL_SECONDS = 900;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_MAP = Object.freeze({ client: 'cliente', cliente: 'cliente', coach: 'coach', admin: 'admin' });

function normalizeBaseUrl(value) {
  const url = new URL(String(value || ''));
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('La conexión remota exige HTTPS o un host local');
  return url.toString().replace(/\/$/, '');
}

function storageSegments(path) {
  const raw = String(path || '').split('/').filter(Boolean);
  if (raw.some((segment) => segment === '.' || segment === '..')) throw new Error('Ruta de documento inválida');
  if (raw.length < 2 || !UUID_PATTERN.test(raw[0])) throw new Error('La ruta remota debe comenzar por el UUID del cliente');
  return raw;
}

function encodeStoragePath(path) {
  return storageSegments(path).map((segment) => encodeURIComponent(segment)).join('/');
}

function normalizeRole(value) {
  return ROLE_MAP[String(value || '').trim().toLowerCase()] || null;
}

export function normalizeAuthSession(body, previous = {}) {
  const token = body?.access_token || previous.token;
  if (!token) throw new Error('Supabase Auth no devolvió access_token');
  const user = body?.user || previous.rawUser || {};
  const expiresAt = Number(body?.expires_at || previous.expiresAt || 0) || null;
  return {
    token,
    refreshToken: body?.refresh_token || previous.refreshToken || null,
    expiresAt,
    expiresIn: Number(body?.expires_in || previous.expiresIn || 0) || null,
    tokenType: body?.token_type || previous.tokenType || 'bearer',
    environment: previous.environment || 'PENDING_REMOTE_GATE',
    rawUser: user,
    user: {
      id: user?.id || previous.user?.id || null,
      email: user?.email || previous.user?.email || null,
      role: normalizeRole(user?.app_metadata?.iberfit_role || previous.user?.role),
      clientId: user?.app_metadata?.iberfit_client_id || previous.user?.clientId || null,
      name: user?.user_metadata?.display_name || previous.user?.name || user?.email || 'Usuario IBERFIT',
    },
  };
}

function assertEnvironmentResponse(body, context, expectedEnvironment) {
  if (body?.environment !== expectedEnvironment) {
    if (expectedEnvironment === 'SYNTHETIC_ONLY') {
      throw new Error(`Gate 0: ${context} no declara entorno sintético`);
    }
    throw new Error(`${context} respondió en un entorno distinto del configurado`);
  }
  return body;
}

export function validateSupabaseConfig(raw = {}) {
  const config = ensureSupabaseConfig(raw);
  if (!config.url) throw new Error('Falta la URL del servicio remoto');
  if (!config.anonKey) throw new Error('Falta la clave pública del servicio remoto');
  if (config.enabled !== true) throw new Error('El adaptador remoto debe habilitarse explícitamente');
  if (!['supabase-synthetic', 'supabase-production'].includes(config.authMode)) {
    throw new Error('authMode remoto no reconocido');
  }
  return {
    ...config,
    url: normalizeBaseUrl(config.url),
    timeoutMs: Math.max(1_000, Math.min(Number(config.timeoutMs || DEFAULT_TIMEOUT_MS), 30_000)),
    documentsBucket: config.documentsBucket || 'iberfit-documents-private',
  };
}

export function validateSupabaseStagingConfig(raw = {}) {
  if (raw.authMode !== 'supabase-synthetic') {
    throw new Error('Supabase staging exige authMode supabase-synthetic');
  }
  return validateSupabaseConfig(raw);
}

export function createSupabaseRepository(rawConfig, dependencies = {}) {
  const config = validateSupabaseConfig(rawConfig);
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch no disponible para SupabaseRepository');

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Tiempo de espera agotado')), config.timeoutMs);
    try {
      const token = options.token || config.anonKey;
      const response = await fetchImpl(`${config.url}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          apikey: config.anonKey,
          authorization: `Bearer ${token}`,
          ...(options.body !== undefined && !options.rawBody ? { 'content-type': 'application/json' } : {}),
          'x-client-info': 'iberfit-m25',
          ...(options.headers || {}),
        },
      });
      const contentType = response.headers?.get?.('content-type') || '';
      let body = null;
      if (response.status !== 204) {
        body = contentType.includes('application/json')
          ? await response.json().catch(() => ({}))
          : await response.text().catch(() => '');
      }
      if (!response.ok) {
        const message = body?.message || body?.error_description || body?.error || `Supabase HTTP ${response.status}`;
        const error = new Error(message);
        error.status = response.status;
        error.body = body;
        throw error;
      }
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('El servicio no respondió dentro del tiempo permitido');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function login(email, password) {
    const body = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return normalizeAuthSession(body);
  }

  async function refresh(refreshToken, previous = {}) {
    if (!refreshToken) throw new Error('No existe refresh token para renovar la sesión');
    const body = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return normalizeAuthSession(body, previous);
  }

  async function logout(token) {
    if (!token) return { ok: true, skipped: true };
    await request('/auth/v1/logout', { method: 'POST', token });
    return { ok: true };
  }

  async function requestPasswordRecovery(email, redirectTo) {
    const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
    await request(`/auth/v1/recover${query}`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return { ok: true };
  }

  async function updatePassword(token, password) {
    if (!token) throw new Error('El enlace de recuperación no es válido');
    if (String(password || '').length < 12) throw new Error('La nueva contraseña debe tener al menos 12 caracteres');
    return request('/auth/v1/user', {
      method: 'PUT',
      token,
      body: JSON.stringify({ password }),
    });
  }

  async function bootstrap(token) {
    const body = await request('/rest/v1/rpc/iberfit_bootstrap', { method: 'POST', token, body: '{}' });
    return assertEnvironmentResponse(body, 'La carga inicial', config.environment);
  }

  async function reconcile(token, operations) {
    if (!Array.isArray(operations)) throw new Error('operations debe ser un array');
    if (!operations.length) return { ack: [], conflicts: [], rejected: [], remoteRevisions: {} };
    return request('/rest/v1/rpc/iberfit_reconcile_operations', {
      method: 'POST',
      token,
      body: JSON.stringify({ p_operations: operations }),
    });
  }

  async function createSignedDocumentUrl(token, storagePath, expiresIn = 300) {
    const seconds = Math.max(30, Math.min(Number(expiresIn || 300), MAX_SIGNED_URL_SECONDS));
    const encoded = encodeStoragePath(storagePath);
    const body = await request(`/storage/v1/object/sign/${encodeURIComponent(config.documentsBucket)}/${encoded}`, {
      method: 'POST', token, body: JSON.stringify({ expiresIn: seconds }),
    });
    const signedPath = body?.signedURL || body?.signedUrl;
    if (!signedPath) throw new Error('Supabase Storage no devolvió URL firmada');
    return signedPath.startsWith('http') ? signedPath : `${config.url}/storage/v1${signedPath}`;
  }

  async function saveDocumentMetadata(token, record, storagePath) {
    if (!record?.id || !record?.clientId || !storagePath) throw new Error('Metadatos documentales incompletos');
    const iriId = UUID_PATTERN.test(String(record.iriId || '')) ? record.iriId : null;
    const payload = {
      id: record.id,
      lineage_id: record.lineageId,
      client_id: record.clientId,
      iri_id: iriId,
      title: record.title,
      document_type: record.type,
      version: Number(record.version || 1),
      audience: record.audience || 'coach',
      status: record.status === 'interno' ? 'borrador' : record.status,
      file_name: record.fileName,
      mime_type: record.mimeType,
      size_bytes: Number(record.sizeBytes || record.size || 0),
      sha256: record.hash,
      storage_path: storagePath,
      measured_at: record.measuredAt || null,
      measurement_context: record.measurementContext || {},
      published_at: record.publishedAt || null,
      created_by: record.createdBy || null,
    };
    const body = await request('/rest/v1/documents', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
      headers: { prefer: 'return=representation' },
    });
    return Array.isArray(body) ? body[0] : body;
  }

  async function uploadDocument(token, storagePath, content, contentType = 'application/octet-stream', options = {}) {
    const encoded = encodeStoragePath(storagePath);
    if (content === undefined || content === null) throw new Error('Falta contenido del documento');
    return request(`/storage/v1/object/${encodeURIComponent(config.documentsBucket)}/${encoded}`, {
      method: 'POST', token, body: content, rawBody: true,
      headers: { 'content-type': contentType, 'x-upsert': options.upsert === true ? 'true' : 'false' },
    });
  }

  async function createClientDraft(token, payload) {
    if (!payload || typeof payload !== 'object') throw new Error('La ficha inicial del cliente está incompleta');
    return request('/rest/v1/rpc/iberfit_create_client_draft', {
      method: 'POST',
      token,
      body: JSON.stringify({ p_payload: payload }),
    });
  }


  async function searchExercises(token, filters = {}) {
    const body = {
      p_query: filters.query || null,
      p_pattern: filters.pattern || null,
      p_equipment: filters.equipment || null,
      p_intent: filters.intent || null,
      p_difficulty: filters.difficulty || null,
      p_limit: Math.max(1, Math.min(Number(filters.limit || 80), 200)),
      p_offset: Math.max(0, Number(filters.offset || 0)),
    };
    return request('/rest/v1/rpc/iberfit_search_exercises', { method: 'POST', token, body: JSON.stringify(body) });
  }

  async function exerciseFacets(token) {
    return request('/rest/v1/rpc/iberfit_exercise_facets', { method: 'POST', token, body: '{}' });
  }

  async function invokeEdgeFunction(token, functionName, payload = {}) {
    if (!/^[a-z0-9-]+$/.test(String(functionName || ''))) throw new Error('Función remota inválida');
    return request(`/functions/v1/${functionName}`, { method: 'POST', token, body: JSON.stringify(payload) });
  }

  async function invokeIberfitAi(token, payload = {}) {
    return invokeEdgeFunction(token, 'iberfit-ai', payload);
  }

  async function catalogAdmin(token, payload = {}) {
    return invokeEdgeFunction(token, 'iberfit-catalog-admin', payload);
  }

  async function saveIriAssessment(token, payload) {
    if (!payload?.id || !payload?.client_id || !payload?.sections) throw new Error('IRI remoto incompleto');
    if (!UUID_PATTERN.test(String(payload.id)) || !UUID_PATTERN.test(String(payload.client_id))) {
      throw new Error('IRI remoto exige UUID de evaluación y cliente');
    }
    const body = await request('/rest/v1/iri_assessments?on_conflict=id', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    });
    return Array.isArray(body) ? body[0] : body;
  }

  async function saveIriReports(token, reports, context = {}) {
    if (!Array.isArray(reports) || !reports.length) return [];
    const payload = reports.map((report) => {
      if (!UUID_PATTERN.test(String(report.id || ''))) throw new Error('Informe IRI remoto exige UUID');
      return {
        id: report.id,
        client_id: context.clientId,
        source_type: 'iri',
        source_id: context.assessmentId,
        title: report.title,
        report_type: report.type || 'iri',
        audience: report.audience,
        summary: report.summary || '',
        content: report.detail || { sections: report.sections || [] },
        status: report.status || 'aprobado',
        revision: Number(report.revision || 0),
        approved_at: report.approvedAt || new Date().toISOString(),
        published_at: report.publishedAt || null,
        created_by: context.actorUserId || null,
      };
    });
    if (!payload.every((item) => UUID_PATTERN.test(String(item.client_id || '')) && UUID_PATTERN.test(String(item.source_id || '')))) {
      throw new Error('Contexto remoto de informes IRI inválido');
    }
    const body = await request('/rest/v1/reports?on_conflict=id', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
    });
    return Array.isArray(body) ? body : [body];
  }

  async function health(token) {
    const result = await request('/rest/v1/rpc/iberfit_environment', { method: 'POST', token, body: '{}' });
    return assertEnvironmentResponse(result, 'La comprobación del entorno', config.environment);
  }

  async function recordOperationalEvents(token, events = []) {
    if (!Array.isArray(events) || !events.length) return [];
    return request('/rest/v1/operational_events', {
      method: 'POST', token, body: JSON.stringify(events), headers: { prefer: 'return=representation' },
    });
  }

  async function operationalHealth(token) {
    const body = await request('/rest/v1/rpc/iberfit_operational_health', { method: 'POST', token, body: '{}' });
    return assertEnvironmentResponse(body, 'La salud operacional', config.environment);
  }

  return {
    kind: config.authMode === 'supabase-production' ? 'supabase-production' : 'supabase-staging',
    authMode: config.authMode,
    config: { url: config.url, authMode: config.authMode, documentsBucket: config.documentsBucket, syntheticOnly: config.syntheticOnly, environment: config.environment },
    login,
    refresh,
    logout,
    requestPasswordRecovery,
    updatePassword,
    bootstrap,
    reconcile,
    createSignedDocumentUrl,
    saveDocumentMetadata,
    uploadDocument,
    createClientDraft,
    searchExercises,
    exerciseFacets,
    invokeIberfitAi,
    catalogAdmin,
    saveIriAssessment,
    saveIriReports,
    health,
    recordOperationalEvents,
    operationalHealth,
  };
}
