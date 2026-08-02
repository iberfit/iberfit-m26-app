import {augmentAdminShellViewModel} from '../admin/view-model.js';
import {augmentRc39ShellViewModel} from '../rc39/view-model.js';
import { metricPresentation, selectedClient } from '../production-state.js';
import { areaDefinition, navigationForRole } from './navigation.js';
import { resolveM26Route } from './route-guard.js';
import { assertKnownRole, isCoachRole, roleLabel } from './role-policy.js';
import {clientModalityLabel} from '../domain/modality.js';

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function compactClient(client) {
  if (!client) return null;
  return {
    id: client.id,
    name: client.name || 'Cliente sin nombre',
    modality: clientModalityLabel(client.modality || client.modalidad),
    status: client.status || client.estado || null,
  };
}

function operationalStatus(state) {
  const pending = state.pendingOperations?.length || 0;
  const conflicts = state.conflicts?.length || 0;
  const rejected = state.rejectedOperations?.length || 0;
  const kind = conflicts > 0 ? 'conflict' : rejected > 0 ? 'attention' : pending > 0 ? 'pending' : 'clear';
  return Object.freeze({ pending, conflicts, rejected, kind });
}

function clientOptions(state, role) {
  const clients = state.collections?.clients || [];
  if (role === 'client') {
    return clients
      .filter((client) => client.id === state.identity?.clientId)
      .map(compactClient);
  }
  return clients.map(compactClient);
}

function createShellViewModelBase(state) {
  const route = resolveM26Route(state);
  if (route.area === 'acceso') {
    return Object.freeze({
      mode: 'access',
      route,
      title: 'Acceso IBERFIT',
      subtitle: 'Identidad y permisos requeridos',
      hydration: clone(state?.hydration || { status: 'idle', error: null }),
    });
  }

  const role = assertKnownRole(state.identity.role);
  const navigation = navigationForRole(role);
  const selected = role === 'client'
    ? (state.collections?.clients || []).find((client) => client.id === state.identity.clientId) || null
    : selectedClient(state);
  const definition = areaDefinition(route.area);
  const metrics = state.metrics || {};

  return Object.freeze({
    mode: 'authenticated',
    route,
    identity: Object.freeze({
      id: state.identity.id,
      name: state.identity.name || state.identity.displayName || roleLabel(role),
      role,
      roleLabel: roleLabel(role),
    }),
    navigation,
    activeArea: route.area,
    page: Object.freeze({
      title: definition?.title || 'IBERFIT',
      label: definition?.label || 'IBERFIT',
      scope: definition?.scope || 'global',
    }),
    selectedClient: compactClient(selected),
    clientOptions: Object.freeze(clientOptions(state, role)),
    canChangeClient: isCoachRole(role),
    canary: clone(state.canary),
    environment: state.environment || null,
    hydration: clone(state.hydration),
    operations: operationalStatus(state),
    metrics: Object.freeze({
      checkin: metricPresentation(metrics.checkin),
      progress: metricPresentation(metrics.progress),
      iri: metricPresentation(metrics.iri),
    }),
  });
}

/* M26_RC39_SHELL_VIEW_MODEL_WRAPPER */
export function createShellViewModel(state){
  return augmentAdminShellViewModel(
    augmentRc39ShellViewModel(createShellViewModelBase(state),state),
    state
  );
}
