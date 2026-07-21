import { api } from './api.js';
import { normalizeIberfitRole } from './remote-hydration.js';

const REFRESH_MARGIN_SECONDS = 90;

export const DEMO_USERS = Object.freeze([
  { role: 'cliente', label: 'Entrar como cliente', email: 'cliente@demo.iberfit', password: 'cliente-demo' },
  { role: 'coach', label: 'Entrar como Coach', email: 'coach@demo.iberfit', password: 'coach-demo' },
  { role: 'admin', label: 'Entrar como administrador', email: 'admin@demo.iberfit', password: 'admin-demo' },
]);

function remoteSupabase(repository) {
  return String(repository?.authMode || '').startsWith('supabase-');
}

function online() {
  return globalThis.navigator?.onLine !== false;
}

export function sessionNeedsRefresh(session, nowSeconds = Date.now() / 1000) {
  if (!session?.expiresAt) return false;
  return Number(session.expiresAt) - Number(nowSeconds) <= REFRESH_MARGIN_SECONDS;
}

function normalizeSessionUser(session, bootstrapUser) {
  const source = bootstrapUser || session?.user || {};
  return {
    ...source,
    role: normalizeIberfitRole(source.role),
    clientId: source.clientId || session?.user?.clientId || null,
  };
}

async function bootstrapRemoteSession(repository, session) {
  const bootstrap = await repository.bootstrapRemote(session.token);
  return {
    ...session,
    environment: bootstrap.environment,
    user: normalizeSessionUser(session, bootstrap.user),
    remoteRevisions: bootstrap.remoteRevisions || {},
    remoteBootstrap: bootstrap,
    offlineResume: false,
    refreshedAt: new Date().toISOString(),
  };
}

async function refreshRemoteSession(repository, session) {
  if (!session?.refreshToken || typeof repository.refreshRemote !== 'function') {
    throw new Error('La sesión remota expiró y no puede renovarse');
  }
  const refreshed = await repository.refreshRemote(session.refreshToken, session);
  return { ...session, ...refreshed, user: normalizeSessionUser(refreshed) };
}

export async function loginWithCredentials(repository, email, password) {
  if (!String(email || '').trim() || !String(password || '')) throw new Error('Ingresa correo y contraseña');
  const remote = remoteSupabase(repository) && typeof repository.loginRemote === 'function';
  let session = remote
    ? await repository.loginRemote(String(email).trim(), String(password))
    : await api.login(String(email).trim(), String(password));
  if (remote) session = await bootstrapRemoteSession(repository, session);
  else session = { ...session, user: normalizeSessionUser(session) };
  await repository.setAuth(session);
  return session;
}

export async function loginDemo(repository, role) {
  const demo = DEMO_USERS.find((item) => item.role === role);
  if (!demo) throw new Error('Rol demo inválido');
  return loginWithCredentials(repository, demo.email, demo.password);
}

export async function resumeAuth(repository) {
  let session = await repository.getAuth();
  if (!session?.token) return null;
  const remote = remoteSupabase(repository) && typeof repository.bootstrapRemote === 'function';

  if (!online()) return { ...session, user: normalizeSessionUser(session), offlineResume: true };

  try {
    if (remote && sessionNeedsRefresh(session)) session = await refreshRemoteSession(repository, session);
    if (remote) session = await bootstrapRemoteSession(repository, session);
    else {
      const bootstrap = await api.bootstrap(session.token);
      session = { ...session, user: normalizeSessionUser(session, bootstrap.user), remoteRevisions: bootstrap.remoteRevisions || {} };
    }
    await repository.setAuth(session);
    return session;
  } catch (error) {
    const retryableAuthFailure = remote && session?.refreshToken && [401, 403].includes(Number(error?.status));
    if (retryableAuthFailure) {
      try {
        session = await refreshRemoteSession(repository, session);
        session = await bootstrapRemoteSession(repository, session);
        await repository.setAuth(session);
        return session;
      } catch {
        // Se limpia abajo: no se conserva una sesión remota inválida.
      }
    }
    if (!online()) return { ...session, user: normalizeSessionUser(session), offlineResume: true };
    await repository.clearAuth();
    return null;
  }
}

export async function logout(repository, session) {
  if (remoteSupabase(repository) && typeof repository.logoutRemote === 'function' && session?.token && online()) {
    try {
      await repository.logoutRemote(session.token);
    } catch {
      // El cierre local no depende de la disponibilidad remota.
    }
  }
  await repository.clearAuth();
}


export function recoveryTokenFromLocation(locationLike = globalThis.location) {
  const hash = new URLSearchParams(String(locationLike?.hash || '').replace(/^#/, ''));
  const token = hash.get('access_token');
  const type = hash.get('type');
  return type === 'recovery' && token ? token : null;
}

export async function requestPasswordRecovery(repository, email, redirectTo) {
  if (!remoteSupabase(repository) || typeof repository.requestPasswordRecoveryRemote !== 'function') {
    throw new Error('La recuperación de contraseña no está disponible en este entorno');
  }
  const normalizedEmail = String(email || '').trim();
  if (!normalizedEmail) throw new Error('Ingresa tu correo');
  return repository.requestPasswordRecoveryRemote(normalizedEmail, redirectTo);
}

export async function updateRecoveredPassword(repository, token, password, confirmation) {
  if (!remoteSupabase(repository) || typeof repository.updatePasswordRemote !== 'function') {
    throw new Error('La actualización de contraseña no está disponible en este entorno');
  }
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden');
  if (String(password || '').length < 12) throw new Error('La contraseña debe tener al menos 12 caracteres');
  return repository.updatePasswordRemote(token, password);
}
