const ROLE_ALIASES = Object.freeze({
  admin: 'admin',
  administrador: 'admin',
  administrator: 'admin',
  coach: 'coach',
  entrenador: 'coach',
  client: 'client',
  cliente: 'client',
});

const ROLE_LABELS = Object.freeze({
  admin: 'Administración',
  coach: 'Entrenador',
  client: 'Cliente',
});

export function normalizeRole(value) {
  const key = String(value || '').trim().toLowerCase();
  return ROLE_ALIASES[key] || null;
}

export function assertKnownRole(value) {
  const role = normalizeRole(value);
  if (!role) throw new Error('M26_ROLE_NOT_SUPPORTED');
  return role;
}

export function roleLabel(value) {
  const role = assertKnownRole(value);
  return ROLE_LABELS[role];
}

export function isCoachRole(value) {
  const role = normalizeRole(value);
  return role === 'admin' || role === 'coach';
}

export function visibleClientIds(state) {
  return new Set(
    (state?.collections?.clients || [])
      .map((client) => client?.id)
      .filter(Boolean),
  );
}

export function assertClientSelectionAllowed(state, requestedClientId) {
  const role = assertKnownRole(state?.identity?.role);
  const clientId = String(requestedClientId || '');
  if (!clientId) throw new Error('M26_CLIENT_SELECTION_REQUIRED');

  const visible = visibleClientIds(state);
  if (!visible.has(clientId)) throw new Error('M26_CLIENT_NOT_VISIBLE');

  if (role === 'client' && clientId !== state.identity?.clientId) {
    throw new Error('M26_CLIENT_SCOPE_FORBIDDEN');
  }
  return clientId;
}

export function ownClientId(state) {
  const role = normalizeRole(state?.identity?.role);
  return role === 'client' ? state?.identity?.clientId || null : null;
}
