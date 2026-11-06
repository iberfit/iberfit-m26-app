import { createProductionState, stateFromBootstrap } from './production-state.js';
import { sanitizeOperation } from './command-bus.js';
import {projectCompletedHistoryForClient} from './domain/client-completed-history-merge.js';
import {deriveCoachSelfLaunchJourney} from './onboarding/coach-launch-journey.js';

function clone(value) { return value == null ? value : structuredClone(value); }
function errorText(error){return error?String(error.message||error):null;}
function sameJson(a,b){try{return JSON.stringify(a)===JSON.stringify(b);}catch{return false;}}
function authorizationFailure(error){
  const status=Number(error?.status||0);
  if(status===401||status===403)return true;
  return /(?:M26_(?:SESSION_EXPIRED|REFRESH_IDENTITY_MISMATCH|AUTH_[A-Z0-9_:-]*)|\b401\b|\b403\b)/u.test(errorText(error)||'');
}

export function createCanonicalStore(initial = createProductionState(),{onListenerError=()=>{}}={}) {
  let state = clone(initial);
  const listeners = new Set();
  // A shell repaint is an invalidation signal, not permission to copy or
  // mutate the whole authenticated archive. Legacy full-state subscriptions
  // retain their separate defensive structuredClone contracts unchanged.
  const invalidationListeners = new Set();
  const selectionListeners = new Set();
  let notifiedClientId=String(state.selectedClientId||'');

  function emit() {
    const selectedClientId=String(state.selectedClientId||'');
    if(selectedClientId!==notifiedClientId){
      notifiedClientId=selectedClientId;
      for(const listener of [...selectionListeners]){
        try{listener(selectedClientId);}catch(error){try{onListenerError(error);}catch{}}
      }
    }
    for(const listener of [...invalidationListeners]){
      try{listener();}catch(error){try{onListenerError(error);}catch{}}
    }
    for(const listener of [...listeners]){
      try{listener(getState());}catch(error){try{onListenerError(error);}catch{}}
    }
  }

  function getState() {
    return clone(state);
  }

  // Read-only, constant-size navigation evidence. The authenticated Coach
  // archive can contain thousands of events: copying it merely to read the
  // current route must never block physical input or QA route polling.
  // The full getState() contract and authorization checks remain unchanged.
  function getNavigationSnapshot() {
    return Object.freeze({
      activeArea:String(state.activeArea||''),
      identity:Object.freeze({
        id:String(state.identity?.id||''),
        role:String(state.identity?.role||''),
      }),
    });
  }

  // Stable authenticated identity claims for the live session controller.
  // Never clone the Coach's complete execution archive during shell events.
  // This immutable projection is not an authorization decision: backend/RLS
  // and the canonical session owner/ACK checks remain the security boundary.
  function getSessionActorSnapshot(){
    const identity=state.identity;
    return Object.freeze({identity:identity?Object.freeze({
      id:String(identity.id||''),
      role:String(identity.role||''),
      clientId:String(identity.clientId||'')||null,
    }):null});
  }

  // Onboarding needs verified role/app-choice only. Never clone multi-MB
  // Client/Coach histories to inspect these bounded access claims.
  function getOnboardingAccessSnapshot(){
    return Object.freeze({
      identity:Object.freeze({role:String(state.identity?.role||'')}),
      applicationAccess:clone(state.applicationAccess||{}),
    });
  }

  // Only a fully derived, frozen and owner-scope-filtered Coach milestone
  // projection leaves this store. The raw state/history never does.
  function getCoachLaunchJourney(){
    return deriveCoachSelfLaunchJourney({state,identity:state.identity});
  }

  // Route authorization needs only the verified identity, hydration lease,
  // selected owner, visible client/service scope and Admin media flag.
  // Keep the full getState() snapshot API for all other consumers; do not
  // clone the Coach's 38-page U38 history on each physical route click.
  function getRouteAuthorizationSnapshot() {
    return {
      activeArea:String(state.activeArea||''),
      identity:state.identity?Object.freeze({
        id:String(state.identity.id||''),
        role:String(state.identity.role||''),
        clientId:state.identity.clientId||null,
      }):null,
      hydration:Object.freeze({status:String(state.hydration?.status||'')}),
      selectedClientId:state.selectedClientId||null,
      collections:Object.freeze({clients:clone(state.collections?.clients||[])}),
      admin:Object.freeze({
        available:state.admin?.available===true,
        organization:Object.freeze({settings:Object.freeze({
          admin_media_review_enabled:state.admin?.organization?.settings?.admin_media_review_enabled===true,
        })}),
      }),
    };
  }

  // Internal shell use: the state change and subscribed render are identical
  // to navigate(), but the unused return value must not clone the whole
  // authenticated archive a second time.
  function navigateFast(activeArea) {
    const next=String(activeArea||'hoy');
    if(state.activeArea===next)return false;
    state={...state,activeArea:next};
    emit();
    return true;
  }

  function setHydration(status, error = null) {
    const nextError=errorText(error);const current=state.hydration||{};
    const hasAuthenticatedSnapshot=Boolean(state.identity)&&current.status==='ready';
    const keepAuthenticated=hasAuthenticatedSnapshot&&(status==='loading'||(status==='error'&&!authorizationFailure(error)));
    const nextStatus=keepAuthenticated?'ready':status;
    const nextRefreshing=hasAuthenticatedSnapshot&&status==='loading';
    const visibleError=status==='loading'?null:nextError;
    if(current.status===nextStatus&&current.error===visibleError&&Boolean(current.refreshing)===nextRefreshing)return getState();
    state = { ...state, hydration: { ...current, status: nextStatus, error: visibleError, refreshing: nextRefreshing } };
    emit();return getState();
  }

  function hydrate(snapshot) {
    const next=stateFromBootstrap(snapshot, state);
    const initialHydration=!state?.identity||state?.hydration?.status!=='ready';
    if(!initialHydration&&sameJson(next,state))return getState();
    state = next;
    emit();
    return getState();
  }

  // Stage a complete, server-owner-verified archive atomically. No partially
  // received page may update the Client UI or overwrite an active draft/ACK.
  function incorporateClientCompletedHistory({ownerId,clientId,confirmedAt,lastAck,sections}={}){
    const projected=projectCompletedHistoryForClient({
      state,ownerId,clientId,confirmedAt,lastAck,sections,
    });
    if(sameJson(state.collections.sessions,projected.sessions)
       &&sameJson(state.collections.sessionExecutions,projected.sessionExecutions))
      return getState();
    state={...state,collections:{...state.collections,...projected}};
    emit();return getState();
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
    if(typeof listener!=='function')throw new TypeError('listener must be a function');
    listeners.add(listener);
    return ()=>listeners.delete(listener);
  }

  function subscribeInvalidation(listener){
    if(typeof listener!=='function')throw new TypeError('listener must be a function');
    invalidationListeners.add(listener);
    return ()=>invalidationListeners.delete(listener);
  }

  function subscribeSelection(listener){
    if(typeof listener!=='function')throw new TypeError('listener must be a function');
    selectionListeners.add(listener);
    return ()=>selectionListeners.delete(listener);
  }

  return Object.freeze({ getState, getNavigationSnapshot, getSessionActorSnapshot, getRouteAuthorizationSnapshot, setHydration, hydrate, incorporateClientCompletedHistory, reset, selectClient, selectIriAssessment, navigate, navigateFast, projectOperations, acknowledge, subscribe, subscribeInvalidation, subscribeSelection, getOnboardingAccessSnapshot, getCoachLaunchJourney });
}
