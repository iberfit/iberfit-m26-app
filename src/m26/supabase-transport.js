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
const CLIENT_ONBOARDING_RPC=Object.freeze({
  legacy:'iberfit_create_client_draft',
  preflight:'iberfit_client_onboarding_preflight_v12',
  create:'iberfit_create_client_draft_v12',
});
const RC43_RPC=Object.freeze({
  health:'m26_backend_health_v43',
  bootstrap:'m26_backend_bootstrap_v43',
  recordMeasurement:'m26_record_measurement_v43',
  saveTrainingSession:'m26_save_training_session_v43',
  sendMessage:'m26_send_message_v43',
});
const RC431_RPC=Object.freeze({
  health:'m26_backend_health_v431',
  getDraft:'m26_draft_get_v431',
  upsertDraft:'m26_draft_upsert_v431',
  deleteDraft:'m26_draft_delete_v431',
});
const RC44_RPC=Object.freeze({
  health:'m26_wearable_health_v44',
  bootstrap:'m26_wearable_bootstrap_v44',
  importSummaries:'m26_wearable_import_v44',
  upsertConnection:'m26_wearable_connection_upsert_v44',
  revokeConnection:'m26_wearable_revoke_v44',
  deleteAll:'m26_wearable_delete_all_v44',
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

  async function rc43Rpc(name,token,params={}){
    if(!token)throw new Error('M26_AUTH_REQUIRED');
    if(!Object.values(RC43_RPC).includes(name))throw new Error('M26_RC43_RPC_NOT_ALLOWED');
    return request('/rest/v1/rpc/'+name,{method:'POST',token,body:JSON.stringify(params)});
  }

  function normalizeRc43Result(result,code){
    const item=Array.isArray(result)?result[0]:result;
    if(!item||typeof item!=='object'||item.ok!==true)throw new Error(code);
    return Object.freeze({...item});
  }

  async function backendHealth(){
    const result=await request('/rest/v1/rpc/'+RC43_RPC.health,{method:'POST',body:'{}'});
    const item=normalizeRc43Result(result,'M26_RC43_HEALTH_INVALID_RESPONSE');
    if(item.ready!==true||item.version!=='RC43'||item.environment!=='canary')throw new Error('M26_RC43_BACKEND_NOT_READY');
    return item;
  }

  async function backendBootstrap(token){
    const item=normalizeRc43Result(await rc43Rpc(RC43_RPC.bootstrap,token,{}),'M26_RC43_BOOTSTRAP_INVALID_RESPONSE');
    if(item.ready!==true||item.version!=='RC43')throw new Error('M26_RC43_BACKEND_NOT_READY');
    return item;
  }

  async function recordMeasurement(token,payload={}){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('M26_RC43_PAYLOAD_INVALID');
    return normalizeRc43Result(await rc43Rpc(RC43_RPC.recordMeasurement,token,{p_payload:payload}),'M26_RC43_MEASUREMENT_INVALID_RESPONSE');
  }

  async function saveTrainingSession(token,payload={}){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('M26_RC43_PAYLOAD_INVALID');
    return normalizeRc43Result(await rc43Rpc(RC43_RPC.saveTrainingSession,token,{p_payload:payload}),'M26_RC43_SESSION_INVALID_RESPONSE');
  }

  async function sendMessage(token,payload={}){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('M26_RC43_PAYLOAD_INVALID');
    return normalizeRc43Result(await rc43Rpc(RC43_RPC.sendMessage,token,{p_payload:payload}),'M26_RC43_MESSAGE_INVALID_RESPONSE');
  }

  async function rc431Rpc(name,token,params={}){
    if(!token)throw new Error('M26_AUTH_REQUIRED');
    if(!Object.values(RC431_RPC).includes(name))throw new Error('M26_RC431_RPC_NOT_ALLOWED');
    return request('/rest/v1/rpc/'+name,{method:'POST',token,body:JSON.stringify(params)});
  }

  function normalizeDraftScope(value='session-builder'){
    const scope=String(value||'').trim();
    if(scope!=='session-builder')throw new Error('M26_RC431_DRAFT_SCOPE_INVALID');
    return scope;
  }

  function normalizeDraftClientId(value){
    const clientId=String(value||'').trim();
    if(!SAFE_ID_PATTERN.test(clientId))throw new Error('M26_RC431_CLIENT_ID_INVALID');
    return clientId;
  }

  async function draftBackendHealth(){
    const result=await request('/rest/v1/rpc/'+RC431_RPC.health,{method:'POST',body:'{}'});
    const item=normalizeRc43Result(result,'M26_RC431_HEALTH_INVALID_RESPONSE');
    if(item.ready!==true||item.version!=='RC43.1'||item.environment!=='canary')throw new Error('M26_RC431_BACKEND_NOT_READY');
    return item;
  }

  async function getSessionDraft(token,clientId,scope='session-builder'){
    const safeClientId=normalizeDraftClientId(clientId);
    const safeScope=normalizeDraftScope(scope);
    const item=normalizeRc43Result(
      await rc431Rpc(
        RC431_RPC.getDraft,
        token,
        {p_client_id:safeClientId,p_scope:safeScope},
      ),
      'M26_RC431_DRAFT_GET_INVALID_RESPONSE',
    );
    if(item.found===true&&(!item.draft||typeof item.draft!=='object'||Array.isArray(item.draft)))throw new Error('M26_RC431_DRAFT_GET_INVALID_RESPONSE');
    return item;
  }

  async function upsertSessionDraft(token,payload={}){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('M26_RC431_DRAFT_PAYLOAD_INVALID');
    const clientId=normalizeDraftClientId(payload.clientId);
    const scope=normalizeDraftScope(payload.scope);
    if(!payload.draft||typeof payload.draft!=='object'||Array.isArray(payload.draft))throw new Error('M26_RC431_DRAFT_PAYLOAD_INVALID');
    const safePayload={
      clientId,
      scope,
      revision:Math.max(0,Number(payload.revision)||0),
      draft:payload.draft,
    };
    const body=JSON.stringify({p_payload:safePayload});
    if(body.length<20||body.length>125000)throw new Error('M26_RC431_DRAFT_PAYLOAD_INVALID');
    const item=normalizeRc43Result(
      await rc431Rpc(
        RC431_RPC.upsertDraft,
        token,
        {p_payload:safePayload},
      ),
      'M26_RC431_DRAFT_SAVE_INVALID_RESPONSE',
    );
    if(item.saved!==true||!SAFE_ID_PATTERN.test(String(item.id||'')))throw new Error('M26_RC431_DRAFT_SAVE_INVALID_RESPONSE');
    return item;
  }

  async function deleteSessionDraft(token,clientId,scope='session-builder'){
    const safeClientId=normalizeDraftClientId(clientId);
    const safeScope=normalizeDraftScope(scope);
    return normalizeRc43Result(
      await rc431Rpc(
        RC431_RPC.deleteDraft,
        token,
        {p_client_id:safeClientId,p_scope:safeScope},
      ),
      'M26_RC431_DRAFT_DELETE_INVALID_RESPONSE',
    );
  }

  async function rc44Rpc(name,token,params={}){
    if(!token)throw new Error('M26_AUTH_REQUIRED');
    if(!Object.values(RC44_RPC).includes(name))throw new Error('M26_RC44_RPC_NOT_ALLOWED');
    return request('/rest/v1/rpc/'+name,{method:'POST',token,body:JSON.stringify(params)});
  }

  function normalizeRc44Result(result,code){
    const item=Array.isArray(result)?result[0]:result;
    if(!item||typeof item!=='object'||item.ok!==true)throw new Error(code);
    return Object.freeze({...item});
  }

  async function wearableHealth(){
    const result=await request('/rest/v1/rpc/'+RC44_RPC.health,{method:'POST',body:'{}'});
    const item=normalizeRc44Result(result,'M26_RC44_HEALTH_INVALID_RESPONSE');
    if(item.ready!==true||item.version!=='RC44'||item.environment!=='canary')throw new Error('M26_RC44_BACKEND_NOT_READY');
    return item;
  }

  async function wearableBootstrap(token){
    const item=normalizeRc44Result(
      await rc44Rpc(RC44_RPC.bootstrap,token,{}),
      'M26_RC44_BOOTSTRAP_INVALID_RESPONSE',
    );
    if(item.ready!==true||item.version!=='RC44')throw new Error('M26_RC44_BACKEND_NOT_READY');
    if(!Array.isArray(item.connections)||!Array.isArray(item.dailySummaries)||!Array.isArray(item.consents))throw new Error('M26_RC44_BOOTSTRAP_INVALID_RESPONSE');
    return item;
  }

  async function importWearableSummaries(token,payload={}){
    if(!payload||typeof payload!=='object'||!Array.isArray(payload.records)||payload.records.length<1||payload.records.length>250)throw new Error('M26_RC44_IMPORT_PAYLOAD_INVALID');
    const body=JSON.stringify({p_payload:{records:payload.records}});
    if(body.length<20||body.length>900000)throw new Error('M26_RC44_IMPORT_PAYLOAD_INVALID');
    return normalizeRc44Result(
      await rc44Rpc(
        RC44_RPC.importSummaries,
        token,
        {p_payload:{records:payload.records}},
      ),
      'M26_RC44_IMPORT_INVALID_RESPONSE',
    );
  }

  async function upsertWearableConnection(token,payload={}){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('M26_RC44_CONNECTION_PAYLOAD_INVALID');
    return normalizeRc44Result(
      await rc44Rpc(
        RC44_RPC.upsertConnection,
        token,
        {p_payload:payload},
      ),
      'M26_RC44_CONNECTION_INVALID_RESPONSE',
    );
  }

  async function revokeWearableConnection(token,provider,deleteData=false){
    const value=String(provider||'').trim().toLowerCase();
    if(!value)throw new Error('M26_WEARABLE_PROVIDER_UNKNOWN');
    return normalizeRc44Result(
      await rc44Rpc(
        RC44_RPC.revokeConnection,
        token,
        {
          p_provider:value,
          p_delete_data:Boolean(deleteData),
        },
      ),
      'M26_RC44_REVOKE_INVALID_RESPONSE',
    );
  }

  async function deleteWearableData(token){
    return normalizeRc44Result(
      await rc44Rpc(
        RC44_RPC.deleteAll,
        token,
        {},
      ),
      'M26_RC44_DELETE_INVALID_RESPONSE',
    );
  }

  async function clientOnboardingPreflight(token) {
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    if (!runtime.canary && !runtime.qaOnly) throw new Error('M26_CLIENT_CREATE_CANARY_ONLY');
    let result;
    try {
      result=await request(`/rest/v1/rpc/${CLIENT_ONBOARDING_RPC.preflight}`, {method:'POST',token,body:'{}'});
    } catch (error) {
      if(error?.status===404||/PGRST202|not find the function|M26_HTTP_404/i.test(String(error?.message||error)))throw new Error('M26_CLIENT_ONBOARDING_BACKEND_REQUIRED');
      throw error;
    }
    if(!result||typeof result!=='object'||Array.isArray(result)||result.ok!==true||result.ready!==true)throw new Error('M26_CLIENT_ONBOARDING_BACKEND_NOT_READY');
    return Object.freeze({...result});
  }

  async function createClientDraft(token, payload = {}) {
    if (!token) throw new Error('M26_AUTH_REQUIRED');
    if (!runtime.canary && !runtime.qaOnly) throw new Error('M26_CLIENT_CREATE_CANARY_ONLY');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('M26_CLIENT_DRAFT_PAYLOAD_INVALID');
    const body = JSON.stringify({ p_payload: payload });
    if (body.length < 10 || body.length > 120_000) throw new Error('M26_CLIENT_DRAFT_PAYLOAD_INVALID');
    let result;
    try {
      result=await request(`/rest/v1/rpc/${CLIENT_ONBOARDING_RPC.create}`, {method:'POST',token,body});
    } catch (error) {
      if(error?.status===404||/PGRST202|not find the function|M26_HTTP_404/i.test(String(error?.message||error)))throw new Error('M26_CLIENT_ONBOARDING_BACKEND_REQUIRED');
      throw error;
    }
    const item=Array.isArray(result)?result[0]:result;
    const nested=item?.data||item?.result||item?.client||item;
    const clientId=String(nested?.clientId||nested?.client_id||nested?.cliente_id||nested?.client?.id||'').trim();
    if(item?.ok!==true||item?.visible!==true||!SAFE_ID_PATTERN.test(clientId))throw new Error('M26_CLIENT_CREATE_INVALID_RESPONSE');
    return Object.freeze({...item,clientId,client_id:clientId});
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
    backendHealth,
    backendBootstrap,
    draftBackendHealth,
    getSessionDraft,
    upsertSessionDraft,
    deleteSessionDraft,
    wearableHealth,
    wearableBootstrap,
    importWearableSummaries,
    upsertWearableConnection,
    revokeWearableConnection,
    deleteWearableData,
    recordMeasurement,
    saveTrainingSession,
    sendMessage,
    commandRegistry,
    clientOnboardingPreflight,
    createClientDraft,
    preflight: async (token, command) => normalizeRpcResponse(await rpc(runtime.rpc.preflight, token, { p_command: command })),
    execute: async (token, command) => normalizeRpcResponse(await rpc(runtime.rpc.execute, token, { p_command: command })),
  });
}
