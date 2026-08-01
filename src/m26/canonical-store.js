import { createProductionState, stateFromBootstrap } from './production-state.js';
import { sanitizeOperation } from './command-bus.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function errorText(error){return error?String(error.message||error):null;}
function sameJson(a,b){try{return JSON.stringify(a)===JSON.stringify(b);}catch{return false;}}

export function createCanonicalStore(initial = createProductionState(),{onListenerError=()=>{}}={}) {
  let state = clone(initial);
  const listeners = new Set();

  function emit() {
    for (const listener of [...listeners]) {
      try{listener(getState());}catch(error){try{onListenerError(error);}catch{}}
    }
  }

  function getState() {
    return clone(state);
  }

  function setHydration(status, error = null) {
    const nextError=errorText(error);const current=state.hydration||{};
    if(current.status===status&&current.error===nextError)return getState();
    state = { ...state, hydration: { ...current, status, error: nextError } };
    emit();return getState();
  }

  function hydrate(snapshot) {
    const next=stateFromBootstrap(snapshot, state);
    if(sameJson(next,state))return getState();
    state = next;
    emit();
    return getState();
  }

  function reset(next=createProductionState()) {
    state=clone(next);
    emit();
    return getState();
  }

  function selectClient(clientId) {
    const exists = state.collections.clients.some((client) => client.id === clientId);
    if (!exists) throw new Error('M26_CLIENT_NOT_VISIBLE');
    const role=String(state.identity?.role||'').toLowerCase();
    if(['client','cliente'].includes(role)&&clientId!==state.identity?.clientId)throw new Error('M26_CLIENT_SCOPE_FORBIDDEN');
    if(state.selectedClientId===clientId)return getState();
    state = { ...state, selectedClientId: clientId };
    emit();return getState();
  }

  function selectIriAssessment(assessmentId) {
    const id=String(assessmentId||'').trim();
    const role=String(state.identity?.role||'').toLowerCase();
    const clientId=['client','cliente'].includes(role)?state.identity?.clientId:state.selectedClientId;
    const record=(state.collections.iriAssessments||[]).find((item)=>{
      const body=item?.body&&typeof item.body==='object'?item.body:item;
      const recordId=String(item?.id||body?.id||'');
      const recordClientId=String(item?.clientId||item?.client_id||body?.clientId||body?.client_id||'');
      return recordId===id&&recordClientId===String(clientId||'');
    });
    if(!record)throw new Error('M26_IRI_ASSESSMENT_NOT_VISIBLE');
    if(state.selectedIriAssessmentId===id)return getState();
    state={...state,selectedIriAssessmentId:id};emit();return getState();
  }

  function navigate(activeArea) {
    const next=String(activeArea || 'hoy');if(state.activeArea===next)return getState();
    state = { ...state, activeArea: next };
    emit();return getState();
  }

  function projectOperations(records = []) {
    const sanitized = records.map(sanitizeOperation);
    const next={pendingOperations:sanitized.filter((item) => item.status === 'pending'),conflicts:sanitized.filter((item) => item.status === 'conflict'),rejectedOperations:sanitized.filter((item) => item.status === 'rejected')};
    if(sameJson(state.pendingOperations,next.pendingOperations)&&sameJson(state.conflicts,next.conflicts)&&sameJson(state.rejectedOperations,next.rejectedOperations))return getState();
    state = {...state,...next};emit();return getState();
  }

  function acknowledge(response) {
    const next=clone(response);if(sameJson(state.lastAck,next))return getState();
    state = { ...state, lastAck: next };
    emit();return getState();
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ getState, setHydration, hydrate, reset, selectClient, selectIriAssessment, navigate, projectOperations, acknowledge, subscribe });
}
