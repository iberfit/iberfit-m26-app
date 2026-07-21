import { areaAllowedForRole, areaDefinition, canonicalArea, roleHome } from './navigation.js';
import { assertClientSelectionAllowed, assertKnownRole, visibleClientIds } from './role-policy.js';

function result(area, allowed, reason, contextClientId = null) {
  return Object.freeze({ area, allowed, reason, contextClientId });
}

export function resolveM26Route(state, requestedArea = state?.activeArea) {
  if (!state?.identity || state?.hydration?.status !== 'ready') {
    return result('acceso', false, 'M26_SESSION_REQUIRED');
  }

  const role = assertKnownRole(state.identity.role);
  const requested = canonicalArea(requestedArea) || roleHome(role);
  const definition = areaDefinition(requested);

  if (!definition || !areaAllowedForRole(requested, role)) {
    return result(roleHome(role), false, 'M26_ROUTE_FORBIDDEN');
  }

  const visible = visibleClientIds(state);
  const selectedClientId = state.selectedClientId || null;
  const ownClientId = state.identity.clientId || null;

  if (role === 'client') {
    if (!ownClientId || !visible.has(ownClientId)) {
      return result('hoy', false, 'M26_OWN_CLIENT_NOT_VISIBLE');
    }
    if (definition.scope === 'global') return result(requested, true, null, ownClientId);
    return result(requested, true, null, ownClientId);
  }

  if (['selected-client', 'client-context'].includes(definition.scope)) {
    if (!selectedClientId || !visible.has(selectedClientId)) {
      return result('clientes', false, 'M26_CLIENT_CONTEXT_REQUIRED');
    }
    return result(requested, true, null, selectedClientId);
  }

  return result(requested, true, null, selectedClientId);
}

export function canAccessArea(state, area) {
  return resolveM26Route(state, area).allowed;
}

export function guardClientSelection(state, clientId) {
  return assertClientSelectionAllowed(state, clientId);
}
