import { createProductionState, stateFromBootstrap } from './production-state.js';
import { sanitizeOperation } from './command-bus.js';

function clone(value) { return value == null ? value : structuredClone(value); }

export function createCanonicalStore(initial = createProductionState()) {
  let state = clone(initial);
  const listeners = new Set();

  function emit() {
    const snapshot = getState();
    for (const listener of listeners) listener(snapshot);
  }

  function getState() {
    return clone(state);
  }

  function setHydration(status, error = null) {
    state = { ...state, hydration: { ...state.hydration, status, error: error ? String(error.message || error) : null } };
    emit();
  }

  function hydrate(snapshot) {
    state = stateFromBootstrap(snapshot, state);
    emit();
    return getState();
  }

  function selectClient(clientId) {
    const exists = state.collections.clients.some((client) => client.id === clientId);
    if (!exists) throw new Error('M26_CLIENT_NOT_VISIBLE');
    state = { ...state, selectedClientId: clientId };
    emit();
  }

  function navigate(activeArea) {
    state = { ...state, activeArea: String(activeArea || 'hoy') };
    emit();
  }

  function projectOperations(records = []) {
    const sanitized = records.map(sanitizeOperation);
    state = {
      ...state,
      pendingOperations: sanitized.filter((item) => item.status === 'pending'),
      conflicts: sanitized.filter((item) => item.status === 'conflict'),
      rejectedOperations: sanitized.filter((item) => item.status === 'rejected'),
    };
    emit();
  }

  function acknowledge(response) {
    state = { ...state, lastAck: clone(response) };
    emit();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ getState, setHydration, hydrate, selectClient, navigate, projectOperations, acknowledge, subscribe });
}
