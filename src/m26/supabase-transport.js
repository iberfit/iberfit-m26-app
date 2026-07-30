const DEFAULT_TIMEOUT_MS = 12_000;
const EXACT_REMOTE_HOSTS = new Set(['app.iberfit.cl', 'coach.iberfit.cl', 'm26-canary.iberfit.cl']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
export const M26_CANONICAL_PROJECT_REF='pjhmrhejsoofmouedavw';
export const M26_CANONICAL_SUPABASE_ORIGIN=`https://${M26_CANONICAL_PROJECT_REF}.supabase.co`;
const PROJECT_REF_PATTERN=/^[a-z0-9]{20}$/;
const SAFE_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const MAX_TOKEN_CHARS=16_384;
const MAX_REFRESH_TOKEN_CHARS=16_384;
const MAX_AUTH_EMAIL_CHARS=254;
const MAX_RESPONSE_BYTES=20_000_000;
const CANONICAL_RPC=Object.freeze({
  bootstrap:'iberfit_bootstrap_v26',
  preflight:'iberfit_command_preflight_v26',
  execute:'iberfit_execute_command_v26',
});

export function resolveM26Runtime(raw, locationLike = globalThis.location) {
  const host = locationLike?.hostname || '';
  const local = LOCAL_HOSTS.has(host);
  const exactRemote = EXACT_REMOTE_HOSTS.has(host);
  const canary = host === 'm26-canary.iberfit.cl';
  const qaOnly = canary || Boolean(raw?.qaOnly);
  const enabled = Boolean(raw?.enabled) && (local || (qaOnly ? canary : exactRemote));
  return Object.freeze({
    enabled,
    host,
    projectRef: raw?.projectRef || M26_CANONICAL_PROJECT_REF,
    url: raw?.url || '',
    publishableKey: raw?.publishableKey || raw?.anonKey || '',
    timeoutMs: Math.max(1_000, Math.min(Number(raw?.timeoutMs || DEFAULT_TIMEOUT_MS), 30_000)),
    qaOnly,
    canary,
    version:String(raw?.version||'26.0.0').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80)||'26.0.0',
    rpc: Object.freeze({
      bootstrap: raw?.rpc?.bootstrap || CANONICAL_RPC.bootstrap,
      preflight: raw?.rpc?.preflight || CANONICAL_RPC.preflight,
      execute: raw?.rpc?.execute || CANONICAL_RPC.execute,
    }),
  });
}

function normalizeUrl(value,projectRef) {
  let url;
  try{url=new URL(String(value || ''));}catch{throw new Error('M26_SUPABASE_URL_INVALID');}
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new Error('M26_HTTPS_REQUIRED');
  if(!local){
    if(!PROJECT_REF_PATTERN.test(String(projectRef||'')))throw new Error('M26_PROJECT_REF_INVALID');
    if(projectRef!==M26_CANONICAL_PROJECT_REF)throw new Error('M26_PROJECT_REF_MISMATCH');
    if(url.origin!==M26_CANONICAL_SUPABASE_ORIGIN)throw new Error('M26_SUPABASE_ORIGIN_MISMATCH');
    if(url.username||url.password||!['','/'].includes(url.pathname)||url.search||url.hash)throw new Error('M26_SUPABASE_URL_INVALID');
  }
  return url.origin;
}

function validateRpcConfig(rpc={}){
  for(const key of Object.keys(CANONICAL_RPC)){const value=rpc?.[key]||CANONICAL_RPC[key];if(value!==CANONICAL_RPC[key])throw new Error(`M26_RPC_CONFIG_INVALID:${key}`);}
  return Object.freeze({...CANONICAL_RPC});
}

export function validateM26Runtime(raw) {
  if (!raw?.enabled) throw new Error('M26_BACKEND_DISABLED');
  if (!raw?.url || !raw?.publishableKey) throw new Error('M26_PUBLIC_CONFIG_MISSING');
  if(!PROJECT_REF_PATTERN.test(String(raw.projectRef||'')))throw new Error('M26_PROJECT_REF_INVALID');
  if(raw.projectRef!==M26_CANONICAL_PROJECT_REF)throw new Error('M26_PROJECT_REF_MISMATCH');
  if(String(raw.publishableKey).length<2||String(raw.publishableKey).length>MAX_TOKEN_CHARS)throw new Error('M26_PUBLIC_KEY_INVALID');
  return { ...raw, projectRef:M26_CANONICAL_PROJECT_REF, url: normalizeUrl(raw.url,raw.projectRef), rpc:validateRpcConfig(raw.rpc) };
}

function normalizeRpcResponse(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
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

function validateAuthBody(body,code='M26_AUTH_INVALID_RESPONSE'){
  const token=String(body?.access_token||'');
  const refreshToken=body?.refresh_token==null?'':String(body.refresh_token);
  const userId=String(body?.user?.id||'');
  const email=String(body?.user?.email||'');
  const expiresAt=body?.expires_at==null?null:Number(body.expires_at);
  if(!token||token.length>MAX_TOKEN_CHARS||/[\u0000-\u001f\u007f]/.test(token)||!SAFE_ID_PATTERN.test(userId)||email.length<3||email.length>MAX_AUTH_EMAIL_CHARS||!email.includes('@')||/[\u0000-\u001f\u007f]/.test(email)||refreshToken.length>MAX_REFRESH_TOKEN_CHARS||/[\u0000-\u001f\u007f]/.test(refreshToken))throw new Error(code);
  if(expiresAt!==null&&(!Number.isInteger(expiresAt)||expiresAt<0))throw new Error(code);
  return body;
}

function contentLength(response){const value=Number(response?.headers?.get?.('content-length')||0);return Number.isFinite(value)&&value>0?value:0;}
function jsonByteLength(value){let text;try{text=JSON.stringify(value);}catch{throw new Error('M26_RESPONSE_NOT_SERIALIZABLE');}if(text===undefined)return 0;return typeof TextEncoder==='function'?new TextEncoder().encode(text).length:text.length;}

export function createM26Transport(rawRuntime, dependencies = {}) {
  const runtime = validateM26Runtime(rawRuntime);
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('M26_FETCH_UNAVAILABLE');

  async function request(path, options = {}) {
    if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||/[\u0000-\u001f\u007f]/.test(path))throw new Error('M26_REQUEST_PATH_INVALID');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), runtime.timeoutMs);
    try {
      const {token:providedToken,headers:providedHeaders={},body,...fetchOptions}=options;
      const token = providedToken || runtime.publishableKey;
      if(!token||String(token).length>MAX_TOKEN_CHARS)throw new Error('M26_AUTH_TOKEN_INVALID');
      const response = await fetchImpl(`${runtime.url}${path}`, {
        ...fetchOptions,
        ...(body!==undefined?{body}:{}),
        signal: controller.signal,
        credentials:'omit',
        cache:'no-store',
        redirect:'error',
        referrerPolicy:'no-referrer',
        headers: {
          ...providedHeaders,
          apikey: runtime.publishableKey,
          authorization: `Bearer ${String(token)}`,
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          'x-client-info': `iberfit-m26-web/${runtime.version}`,
        },
      });
      if(contentLength(response)>MAX_RESPONSE_BYTES)throw Object.assign(new Error('M26_RESPONSE_TOO_LARGE'),{status:413});
      const contentType = response.headers?.get?.('content-type') || '';
      const payload = response.status === 204
        ? null
        : contentType.includes('application/json')
          ? await response.json().catch(() => ({}))
          : await response.text().catch(() => '');
      if((typeof payload==='string'&&payload.length>MAX_RESPONSE_BYTES)||(payload&&typeof payload==='object'&&jsonByteLength(payload)>MAX_RESPONSE_BYTES))throw Object.assign(new Error('M26_RESPONSE_TOO_LARGE'),{status:413});
      if (!response.ok) {
        const error = new Error(payload?.message || payload?.error_description || payload?.error || `M26_HTTP_${response.status}`);
        error.status = response.status;
        error.body = payload;
        throw error;
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('M26_TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function login(email, password) {
    const normalizedEmail=String(email||'').trim().toLowerCase();const normalizedPassword=String(password||'');
    if(normalizedEmail.length<5||normalizedEmail.length>MAX_AUTH_EMAIL_CHARS||!normalizedEmail.includes('@'))throw new Error('M26_AUTH_EMAIL_INVALID');
    if(normalizedPassword.length<8||normalizedPassword.length>1024)throw new Error('M26_AUTH_PASSWORD_INVALID');
    const body = validateAuthBody(await request('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedEmail, password: normalizedPassword }),
    }));
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

  async function requestPasswordRecovery(email, redirectTo) {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (
      normalizedEmail.length < 5 ||
      normalizedEmail.length > MAX_AUTH_EMAIL_CHARS ||
      !normalizedEmail.includes('@')
    ) {
      throw new Error('M26_AUTH_EMAIL_INVALID');
    }

    if (
      runtime.qaOnly &&
      !normalizedEmail.startsWith('iberfit.cl+qa.')
    ) {
      throw new Error('M26_QA_ACCOUNT_REQUIRED');
    }

    let redirect;

    try {
      redirect = new URL(String(redirectTo || ''));
    } catch {
      throw new Error('M26_RECOVERY_REDIRECT_INVALID');
    }

    if (
      redirect.origin !== 'https://m26-canary.iberfit.cl' ||
      redirect.pathname !== '/' ||
      redirect.search ||
      redirect.hash ||
      redirect.username ||
      redirect.password
    ) {
      throw new Error('M26_RECOVERY_REDIRECT_INVALID');
    }

    await request(
      `/auth/v1/recover?redirect_to=${encodeURIComponent(redirect.href)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          email: normalizedEmail,
        }),
      }
    );

    return { ok: true };
  }

  async function updatePassword(accessToken, password) {
    const token = String(accessToken || '');
    const normalizedPassword = String(password || '');

    if (
      !token ||
      token.length > MAX_TOKEN_CHARS ||
      /[\u0000-\u001f\u007f]/.test(token)
    ) {
      throw new Error('M26_RECOVERY_TOKEN_INVALID');
    }

    if (
      normalizedPassword.length < 8 ||
      normalizedPassword.length > 1024
    ) {
      throw new Error('M26_AUTH_PASSWORD_INVALID');
    }

    const validateRecoveryUser = (user, code) => {
      const id = String(user?.id || '');
      const email = String(user?.email || '').trim().toLowerCase();

      if (
        !SAFE_ID_PATTERN.test(id) ||
        email.length < 3 ||
        email.length > MAX_AUTH_EMAIL_CHARS ||
        !email.includes('@') ||
        /[\u0000-\u001f\u007f]/.test(email)
      ) {
        throw new Error(code);
      }

      if (runtime.qaOnly && !email.startsWith('iberfit.cl+qa.')) {
        throw new Error('M26_QA_ACCOUNT_REQUIRED');
      }

      return { id, email };
    };

    const currentUser = validateRecoveryUser(
      await request('/auth/v1/user', {
        method: 'GET',
        token,
      }),
      'M26_RECOVERY_USER_INVALID'
    );

    const user = await request('/auth/v1/user', {
      method: 'PUT',
      token,
      body: JSON.stringify({
        password: normalizedPassword,
      }),
    });

    const updatedUser = validateRecoveryUser(
      user,
      'M26_RECOVERY_UPDATE_INVALID_RESPONSE'
    );

    if (
      updatedUser.id !== currentUser.id ||
      updatedUser.email !== currentUser.email
    ) {
      throw new Error('M26_RECOVERY_IDENTITY_MISMATCH');
    }

    return user;
  }

  async function refresh(refreshToken) {
    if (!refreshToken || String(refreshToken).length>MAX_REFRESH_TOKEN_CHARS) throw new Error('M26_REFRESH_TOKEN_REQUIRED');
    const body = validateAuthBody(await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }),
    }),'M26_REFRESH_INVALID_RESPONSE');
    if(runtime.qaOnly&&!String(body.user.email||'').toLowerCase().startsWith('iberfit.cl+qa.'))throw new Error('M26_QA_ACCOUNT_REQUIRED');
    return { token: body.access_token, refreshToken: body.refresh_token || refreshToken, expiresAt: body.expires_at || null, user: body.user };
  }

  async function logout(token) {
    if (!token) return { ok: true, skipped: true };
    await request('/auth/v1/logout', { method: 'POST', token });
    return { ok: true };
  }

  async function rpc(name, token, params = {}) {
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    if(!Object.values(CANONICAL_RPC).includes(name))throw new Error('M26_RPC_NOT_ALLOWED');
    return request(`/rest/v1/rpc/${name}`, {
      method: 'POST', token, body: JSON.stringify(params),
    });
  }

  async function createClientDraft(token, payload = {}) {
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    if (!runtime.canary && !runtime.qaOnly) {
      throw new Error('M26_CLIENT_CREATE_CANARY_ONLY');
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('M26_CLIENT_DRAFT_PAYLOAD_INVALID');
    }
    const body = JSON.stringify({ p_payload: payload });
    if (body.length < 10 || body.length > 120_000) {
      throw new Error('M26_CLIENT_DRAFT_PAYLOAD_INVALID');
    }
    const result=await request('/rest/v1/rpc/iberfit_create_client_draft', {
      method: 'POST',
      token,
      body,
    });
    const item=Array.isArray(result)?result[0]:result;
    const nested=item?.data||item?.result||item?.client||item;
    const clientId=String(nested?.clientId||nested?.client_id||nested?.id||nested?.cliente_id||'').trim();
    if(item?.ok===false||item?.success===false||item?.created===false||!SAFE_ID_PATTERN.test(clientId))throw new Error('M26_CLIENT_CREATE_INVALID_RESPONSE');
    return {...(item&&typeof item==='object'?item:{}),clientId,client_id:clientId};
  }

  async function commandRegistry(token) {
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    const select = 'command_type,entity_type,event_name,allowed_roles,requires_reason,requires_preview,enabled';
    const rows = await request(`/rest/v1/domain_command_registry_v26?select=${encodeURIComponent(select)}&order=command_type.asc&limit=100`, { method: 'GET', token });
    if (!Array.isArray(rows)||rows.length>100) throw new Error('M26_COMMAND_REGISTRY_INVALID_RESPONSE');
    return rows;
  }

  return Object.freeze({
    runtime,
    login,
    requestPasswordRecovery,
    updatePassword,
    refresh,
    logout,
    bootstrap: (token) => rpc(runtime.rpc.bootstrap, token, {}),
    commandRegistry,
    createClientDraft,
    preflight: async (token, command) => normalizeRpcResponse(await rpc(runtime.rpc.preflight, token, { p_command: command })),
    execute: async (token, command) => normalizeRpcResponse(await rpc(runtime.rpc.execute, token, { p_command: command })),
  });
}
