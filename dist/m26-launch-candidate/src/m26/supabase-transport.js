const DEFAULT_TIMEOUT_MS = 12_000;
const EXACT_REMOTE_HOSTS = new Set(['app.iberfit.cl', 'coach.iberfit.cl', 'm26-canary.iberfit.cl']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function resolveM26Runtime(raw, locationLike = globalThis.location) {
  const host = locationLike?.hostname || '';
  const local = LOCAL_HOSTS.has(host);
  const exactRemote = EXACT_REMOTE_HOSTS.has(host);
  const enabled = Boolean(raw?.enabled) && (local || exactRemote);
  const canary = host === 'm26-canary.iberfit.cl';
  return Object.freeze({
    enabled,
    host,
    projectRef: raw?.projectRef || 'pjhmrhejsoofmouedavw',
    url: raw?.url || '',
    publishableKey: raw?.publishableKey || raw?.anonKey || '',
    timeoutMs: Math.max(1_000, Math.min(Number(raw?.timeoutMs || DEFAULT_TIMEOUT_MS), 30_000)),
    qaOnly: canary || Boolean(raw?.qaOnly),
    canary,
    rpc: Object.freeze({
      bootstrap: raw?.rpc?.bootstrap || 'iberfit_bootstrap_v26',
      preflight: raw?.rpc?.preflight || 'iberfit_command_preflight_v26',
      execute: raw?.rpc?.execute || 'iberfit_execute_command_v26',
    }),
  });
}

function normalizeUrl(value) {
  const url = new URL(String(value || ''));
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('M26_HTTPS_REQUIRED');
  return url.toString().replace(/\/$/, '');
}

export function validateM26Runtime(raw) {
  if (!raw?.enabled) throw new Error('M26_BACKEND_DISABLED');
  if (!raw?.url || !raw?.publishableKey) throw new Error('M26_PUBLIC_CONFIG_MISSING');
  return { ...raw, url: normalizeUrl(raw.url) };
}

function normalizeRpcResponse(body) {
  if (!body || typeof body !== 'object') return body;
  return {
    ...body,
    operationId: body.operationId || body.operation_id || null,
    commandType: body.commandType || body.command_type || null,
    entityType: body.entityType || body.entity_type || null,
    entityId: body.entityId || body.entity_id || null,
    clientId: body.clientId || body.client_id || null,
    remoteRevision: body.remoteRevision ?? body.remote_revision ?? null,
    baseRevision: body.baseRevision ?? body.base_revision ?? null,
  };
}

export function createM26Transport(rawRuntime, dependencies = {}) {
  const runtime = validateM26Runtime(rawRuntime);
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('M26_FETCH_UNAVAILABLE');

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), runtime.timeoutMs);
    try {
      const token = options.token || runtime.publishableKey;
      const response = await fetchImpl(`${runtime.url}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          apikey: runtime.publishableKey,
          authorization: `Bearer ${token}`,
          ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
          'x-client-info': 'iberfit-m26-recovery',
          ...(options.headers || {}),
        },
      });
      const contentType = response.headers?.get?.('content-type') || '';
      const body = response.status === 204
        ? null
        : contentType.includes('application/json')
          ? await response.json().catch(() => ({}))
          : await response.text().catch(() => '');
      if (!response.ok) {
        const error = new Error(body?.message || body?.error_description || body?.error || `M26_HTTP_${response.status}`);
        error.status = response.status;
        error.body = body;
        throw error;
      }
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('M26_TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function login(email, password) {
    const body = await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: String(email || '').trim(), password: String(password || '') }),
    });
    if (!body?.access_token || !body?.user?.id) throw new Error('M26_AUTH_INVALID_RESPONSE');
    if (runtime.qaOnly && !String(body.user.email || '').toLowerCase().startsWith('iberfit.cl+qa.')) {
      throw new Error('M26_QA_ACCOUNT_REQUIRED');
    }
    return {
      token: body.access_token,
      refreshToken: body.refresh_token || null,
      expiresAt: body.expires_at || null,
      user: body.user,
    };
  }

  async function refresh(refreshToken) {
    if (!refreshToken) throw new Error('M26_REFRESH_TOKEN_REQUIRED');
    const body = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }),
    });
    return { token: body.access_token, refreshToken: body.refresh_token || refreshToken, expiresAt: body.expires_at || null, user: body.user };
  }

  async function logout(token) {
    if (!token) return { ok: true, skipped: true };
    await request('/auth/v1/logout', { method: 'POST', token });
    return { ok: true };
  }

  async function rpc(name, token, params = {}) {
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    return request(`/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: 'POST', token, body: JSON.stringify(params),
    });
  }

  async function commandRegistry(token) {
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    const select = 'command_type,entity_type,event_name,allowed_roles,requires_reason,requires_preview,enabled';
    const rows = await request(`/rest/v1/domain_command_registry_v26?select=${encodeURIComponent(select)}&order=command_type.asc`, { method: 'GET', token });
    if (!Array.isArray(rows)) throw new Error('M26_COMMAND_REGISTRY_INVALID_RESPONSE');
    return rows;
  }

  return Object.freeze({
    runtime,
    login,
    refresh,
    logout,
    bootstrap: (token) => rpc(runtime.rpc.bootstrap, token, {}),
    commandRegistry,
    preflight: async (token, command) => normalizeRpcResponse(await rpc(runtime.rpc.preflight, token, { p_command: command })),
    execute: async (token, command) => normalizeRpcResponse(await rpc(runtime.rpc.execute, token, { p_command: command })),
  });
}
