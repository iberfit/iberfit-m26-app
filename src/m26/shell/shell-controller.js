import { guardClientSelection, resolveM26Route } from './route-guard.js';
import { createShellViewModel } from './shell-view-model.js';
import { renderM26Shell } from './shell-render.js';
import {setIberfitLanguage} from '../ui/i18n.js';
import {iberfitDomainTranslate} from '../ui/i18n-domain.js';
import {setIberfitUiLocale} from '../ui/castellano.js';
import {updateIberfitExperiencePreference} from '../ui/preferences.js';
import {enhanceNativeWorkspace,openNativeAdminIntake} from '../ui/native-workspace.js';
import {enhanceCliente360} from '../ui/client-360.js';
import {enhanceProgressContinuity} from '../ui/progress-continuity.js';
import {enhanceSessionReadiness,enhanceSessionFocus,teardownSessionFocus} from '../ui/session-readiness.js';
import {buildAdaptiveSessionContext} from '../intelligence/adaptive-context.js';
import {buildSessionEntryDecision} from '../intelligence/session-entry-policy.js';
import {revalidatePendingSessionEntry} from '../intelligence/session-entry-intent.js';
import {createRouteViewModel} from '../modules/route-view-model.js';
import {runRouteViewTransition} from '../experience/route-view-transitions.js';

const ACTION_CENTER_TITLE_ID='m26-coach-action-center-title';
const ACTION_CENTER_CARD_SELECTOR='.m26-coach-priority-card';

function coachActionText(key,params={}){
  return iberfitDomainTranslate(key,{params});
}

function coachTodayViewModel(shellVm,state){
  if(shellVm?.mode!=='authenticated')return null;
  if(shellVm?.identity?.role!=='coach')return null;
  if(shellVm?.activeArea!=='hoy')return null;
  return createRouteViewModel(shellVm,state,new Date());
}

function coachPriorityPanel(root){
  const panels=[...(root?.querySelectorAll?.('.m26-panel.m26-panel-soft')||[])];
  return panels.find((panel)=>{
    if(panel.querySelector?.(ACTION_CENTER_CARD_SELECTOR))return true;
    return String(panel.querySelector?.('h2')?.textContent||'').trim()==='Qué requiere tu decisión';
  })||null;
}

function setCoachActionText(node,value){
  if(node)node.textContent=String(value||'');
}

function addCoachActionWhy(card,next,item){
  const documentLike=card?.ownerDocument;
  if(!documentLike?.createElement||!documentLike?.createTextNode)return;
  const why=documentLike.createElement('p');
  why.dataset.m26ActionWhy='true';
  const label=documentLike.createElement('strong');
  label.textContent=`${coachActionText('coach.actionCenter.whyLabel')}:`;
  why.append(label,documentLike.createTextNode(` ${item.attentionWhy||coachActionText('coach.actionCenter.why.manual-attention')}`));
  next.parentNode?.insertBefore?.(why,next);
}

function enhanceCoachPriorityCard(card,item){
  if(!card||!item)return;
  const action=item.actionCtaLabel||coachActionText('coach.actionCenter.cta.manual-attention');
  const client=item.clientName||coachActionText('coach.client');
  const targetArea=String(item.nextAction?.area||'expediente').trim()||'expediente';

  card.dataset.coachActionType=item.actionType||'manual-attention';
  card.dataset.m26ClientId=String(item.clientId||'');

  setCoachActionText(
    card.querySelector?.('.m26-eyebrow'),
    item.actionTypeLabel||item.stageLabel||coachActionText('coach.actionCenter.type.manual-attention')
  );

  const next=card.querySelector?.('.m26-client-next');
  if(next){
    if(!card.querySelector?.('[data-m26-action-why]'))addCoachActionWhy(card,next,item);
    setCoachActionText(next,`${coachActionText('coach.actionCenter.nextLabel')}: ${action}`);
  }

  const button=card.querySelector?.('[data-m26-select-client]');
  if(button){
    button.dataset.m26CoachAction='true';
    button.dataset.m26ClientId=String(item.clientId||'');
    button.dataset.m26TargetArea=targetArea;
    button.classList?.remove?.('m26-text-action');
    button.classList?.add?.('m26-primary-action');
    button.textContent=action;
    button.setAttribute?.('aria-label',coachActionText('coach.actionCenter.ctaAria',{action,client}));
  }
}

export function enhanceCoachActionCenter({root,shellVm,state}={}){
  const routeVm=coachTodayViewModel(shellVm,state);
  if(!routeVm?.coachCockpit)return false;

  const cockpit=routeVm.coachCockpit;
  const panel=coachPriorityPanel(root);
  if(!panel)return false;

  panel.dataset.m26CoachActionCenter='true';
  panel.setAttribute?.('aria-labelledby',ACTION_CENTER_TITLE_ID);

  const heading=panel.querySelector?.('.m26-panel-heading');
  const title=heading?.querySelector?.('h2');
  setCoachActionText(heading?.querySelector?.('.m26-eyebrow'),coachActionText('coach.actionCenter.eyebrow'));
  if(title){
    title.id=ACTION_CENTER_TITLE_ID;
    setCoachActionText(title,coachActionText('coach.actionCenter.title'));
  }
  setCoachActionText(
    heading?.querySelector?.('.m26-badge'),
    coachActionText('coach.actionCenter.summary',{count:Number(cockpit.attentionCount||0)})
  );

  const items=Array.isArray(cockpit.items)?cockpit.items.slice(0,6):[];
  const cards=[...(panel.querySelectorAll?.(ACTION_CENTER_CARD_SELECTOR)||[])];
  cards.forEach((card,index)=>enhanceCoachPriorityCard(card,items[index]));

  if(!items.length){
    const empty=panel.querySelector?.('.m26-empty');
    if(empty){
      setCoachActionText(empty.querySelector?.('h3'),coachActionText('coach.actionCenter.emptyTitle'));
      setCoachActionText(empty.querySelector?.('p'),coachActionText('coach.actionCenter.emptyBody'));
    }
  }

  return true;
}

export function resolveCoachActionNavigation(state,{clientId,targetArea='expediente'}={}){
  if(String(state?.identity?.role||'').trim().toLowerCase()!=='coach'){
    throw new Error('M26_COACH_ACTION_FORBIDDEN');
  }
  const safeClientId=guardClientSelection(state,clientId);
  const requested=String(targetArea||'expediente').trim()||'expediente';
  const candidate={...state,selectedClientId:safeClientId};
  const decision=resolveM26Route(candidate,requested);
  if(!decision.allowed)throw new Error(decision.reason||'M26_ROUTE_FORBIDDEN');
  return Object.freeze({clientId:safeClientId,area:decision.area});
}

export function resolveAdaptiveLayout({width = 1440,coarsePointer = false,touchPoints = 0} = {}) {
  const viewportWidth = Number(width);
  const coarse = Boolean(coarsePointer) || Number(touchPoints || 0) > 0;
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 'expanded-pointer';
  if (viewportWidth <= 640) return 'compact-touch';
  if (viewportWidth <= 1179) return 'medium-touch';
  if (coarse) return 'expanded-touch';
  return 'expanded-pointer';
}

export function createShellController({ root, store, renderRoute = () => '' }) {
  if (!root?.addEventListener) throw new Error('M26_SHELL_ROOT_REQUIRED');
  if (!store?.getState || !store?.subscribe || !store?.navigate || !store?.selectClient) throw new Error('M26_SHELL_STORE_REQUIRED');

  let unsubscribe = null;
  let renderQueued=false;
  let queuedState=null;
  let generation=0;
  let lastMarkup='';
  let adaptiveWindow=null;
  let interactionPointerTarget=null;
  let interactionReleaseTimer=null;
  let pendingI18nContinuitySnapshot=null;

  const SHELL_INTERACTIVE_SELECTOR='input,textarea,select,[contenteditable="true"]';
  const INTERACTION_RELEASE_GRACE_MS=900;
  const NATIVE_SELECT_INTERACTION_HOLD_MS=30_000;
  function interactiveControl(node){return node?.closest?.(SHELL_INTERACTIVE_SELECTOR)||null;}
  function focusedInteractiveControl(){
    const active=root.ownerDocument?.activeElement;
    return active&&root.contains?.(active)&&active.matches?.(SHELL_INTERACTIVE_SELECTOR)?active:null;
  }
  function shellInteractionActive(){return Boolean(interactionPointerTarget||focusedInteractiveControl());}

  function clearInteractionReleaseTimer(){
    if(interactionReleaseTimer===null)return;
    const clearTimer=adaptiveWindow?.clearTimeout?.bind?.(adaptiveWindow)||globalThis.clearTimeout?.bind?.(globalThis);
    clearTimer?.(interactionReleaseTimer);
    interactionReleaseTimer=null;
  }

  function releasePointerInteraction({deferRender=true}={}){
    clearInteractionReleaseTimer();
    interactionPointerTarget=null;
    if(deferRender)queueMicrotask(flushDeferredRender);
  }

  function schedulePointerRelease(control){
    clearInteractionReleaseTimer();
    if(!control){
      releasePointerInteraction();
      return;
    }
    if(focusedInteractiveControl()===control){
      releasePointerInteraction();
      return;
    }
    const tag=String(control?.tagName||'').toLowerCase();
    const timeoutMs=tag==='select'?NATIVE_SELECT_INTERACTION_HOLD_MS:INTERACTION_RELEASE_GRACE_MS;
    const setTimer=adaptiveWindow?.setTimeout?.bind?.(adaptiveWindow)||globalThis.setTimeout?.bind?.(globalThis);
    if(typeof setTimer!=='function'){
      releasePointerInteraction();
      return;
    }
    interactionReleaseTimer=setTimer(()=>{
      interactionReleaseTimer=null;
      interactionPointerTarget=null;
      queueMicrotask(flushDeferredRender);
    },timeoutMs);
  }

  function captureControlContinuity(control){
    if(!control)return null;
    const settingsOpen=Boolean(control.closest?.('details.m26-settings-menu')?.open);
    if(control.matches?.('[data-m26-ui-locale]'))return Object.freeze({kind:'locale',settingsOpen});
    if(control.matches?.('[data-m26-ui-language]'))return Object.freeze({kind:'language',value:String(control.value||''),settingsOpen});
    if(control.matches?.('[data-m26-preference]'))return Object.freeze({kind:'preference',path:String(control.getAttribute?.('data-m26-preference')||''),settingsOpen});
    if(control.matches?.('[data-m26-client-select]'))return Object.freeze({kind:'client',settingsOpen:false});
    return null;
  }

  function findContinuityControl(snapshot){
    if(!snapshot)return null;
    const controls=[...(root.querySelectorAll?.(SHELL_INTERACTIVE_SELECTOR)||[])];
    if(snapshot.kind==='locale')return controls.find((node)=>node.matches?.('[data-m26-ui-locale]'))||null;
    if(snapshot.kind==='language')return controls.find((node)=>node.matches?.('[data-m26-ui-language]')&&String(node.value||'')===snapshot.value)||null;
    if(snapshot.kind==='preference')return controls.find((node)=>node.matches?.('[data-m26-preference]')&&String(node.getAttribute?.('data-m26-preference')||'')===snapshot.path)||null;
    if(snapshot.kind==='client')return controls.find((node)=>node.matches?.('[data-m26-client-select]'))||null;
    return null;
  }

  function restoreControlContinuity(snapshot,{defer=false}={}){
    if(!snapshot)return false;
    const apply=()=>{
      if(snapshot.settingsOpen){
        const settings=root.querySelector?.('details.m26-settings-menu');
        if(settings)settings.open=true;
      }
      const replacement=findContinuityControl(snapshot);
      replacement?.focus?.({preventScroll:true});
      return Boolean(replacement);
    };
    if(!defer)return apply();

    const windowLike=adaptiveWindow||root.ownerDocument?.defaultView||globalThis.window||globalThis;
    const run=()=>queueMicrotask(apply);
    if(typeof windowLike?.requestAnimationFrame==='function')windowLike.requestAnimationFrame(run);
    else run();
    return true;
  }

  function rerenderPreservingControl(control){
    const snapshot=captureControlContinuity(control);
    releasePointerInteraction({deferRender:false});
    queuedState=null;
    lastMarkup='';
    const rendered=renderNow(store.getState(),{force:true});
    if(snapshot?.kind==='locale'||snapshot?.kind==='language'){
      pendingI18nContinuitySnapshot=snapshot;
      restoreControlContinuity(snapshot,{defer:true});
    }else{
      restoreControlContinuity(snapshot);
    }
    return rendered;
  }

  function onI18nSwitchSettled(){
    const snapshot=pendingI18nContinuitySnapshot;
    pendingI18nContinuitySnapshot=null;
    restoreControlContinuity(snapshot,{defer:true});
  }

  function syncAdaptiveLayout(){
    const target=adaptiveWindow||root.ownerDocument?.defaultView||globalThis.window||null;
    const width=Number(target?.innerWidth)||Number(root?.clientWidth)||1440;
    const coarsePointer=Boolean(target?.matchMedia?.('(pointer: coarse)')?.matches);
    const touchPoints=Number(target?.navigator?.maxTouchPoints||0);
    const layout=resolveAdaptiveLayout({width,coarsePointer,touchPoints});
    if(root?.dataset){
      root.dataset.m26Layout=layout;
      root.dataset.m26Input=coarsePointer||touchPoints>0?'touch':'pointer';
    }
    return layout;
  }

  function clearClientSwitchBusy(){
    if(root?.dataset)delete root.dataset.m26ClientSwitching;
    for(const selector of root.querySelectorAll?.('[data-m26-client-select]')||[]){
      selector.removeAttribute?.('aria-busy');
      selector.disabled=false;
    }
  }

  function renderWorkspaceFrame(state=store.getState()){
    const viewModel=createShellViewModel(state);
    const markup=renderM26Shell(viewModel,'');
    if(markup===lastMarkup){clearClientSwitchBusy();return false;}
    root.innerHTML=markup;
    lastMarkup=markup;
    syncAdaptiveLayout();
    clearClientSwitchBusy();
    root.dispatchEvent(new CustomEvent('m26:shell-frame-ready',{bubbles:false,detail:{role:viewModel.identity?.role||'',area:viewModel.activeArea||''}}));
    return true;
  }


  function renderNow(state = store.getState(),{force=false}={}) {
    if(!force&&shellInteractionActive()){
      queuedState=state;
      return false;
    }
    const viewModel = createShellViewModel(state);
    const routeMarkup = viewModel.mode === 'authenticated' ? renderRoute(viewModel, state) : '';
    const markup=renderM26Shell(viewModel, routeMarkup);
    if(markup===lastMarkup){clearClientSwitchBusy();return false;}
    root.innerHTML = markup;
    lastMarkup=markup;
    syncAdaptiveLayout();
    enhanceCoachActionCenter({root,shellVm:viewModel,state});
    enhanceNativeWorkspace({root,viewModel});
    enhanceCliente360({root,viewModel,state});
    enhanceProgressContinuity({root,viewModel,state});
    enhanceSessionReadiness({root,viewModel,state});
    enhanceSessionFocus({root,viewModel});
    revalidatePendingSessionEntry(root,{state,now:new Date(),buildContext:buildAdaptiveSessionContext,buildDecision:buildSessionEntryDecision});
    clearClientSwitchBusy();
    root.dispatchEvent(new CustomEvent('m26:shell-rendered',{bubbles:false,detail:{role:viewModel.identity?.role||'',area:viewModel.activeArea||''}}));
    return true;
  }

  function flushDeferredRender(){
    if(renderQueued||!queuedState||shellInteractionActive())return false;
    const next=queuedState;
    queuedState=null;
    interactionPointerTarget=null;
    scheduleRender(next);
    return true;
  }

  function scheduleRender(state=store.getState()){
    queuedState=state;
    if(shellInteractionActive())return;
    if(renderQueued)return;
    renderQueued=true;
    const token=generation;
    queueMicrotask(()=>{
      renderQueued=false;
      if(token!==generation)return;
      if(shellInteractionActive())return;
      const next=queuedState;
      queuedState=null;
      renderNow(next);
    });
  }

  function onPointerDown(event){
    const previous=interactionPointerTarget;
    clearInteractionReleaseTimer();
    interactionPointerTarget=interactiveControl(event.target);
    if(previous&&!interactionPointerTarget)queueMicrotask(flushDeferredRender);
  }
  function onPointerRelease(){
    schedulePointerRelease(interactionPointerTarget);
  }
  function onPointerCancel(){
    releasePointerInteraction();
  }
  function onFocusIn(event){
    const control=interactiveControl(event.target);
    if(!control)return;
    if(interactionPointerTarget===control){
      clearInteractionReleaseTimer();
      interactionPointerTarget=null;
    }
  }
  function onFocusOut(event){
    const control=interactiveControl(event.target);
    if(!control)return;
    if(interactionPointerTarget===control)releasePointerInteraction({deferRender:false});
    queueMicrotask(flushDeferredRender);
  }

  function focusMain(){queueMicrotask(()=>root.querySelector?.('#m26-main')?.focus?.({preventScroll:false}));}

  function markClientSwitchBusy(source){
    if(root?.dataset)root.dataset.m26ClientSwitching='true';
    source?.setAttribute?.('aria-busy','true');
  }

  function switchClient(rawClientId,{openExpediente=false,source=null,preserveSourceFocus=false}={}){
    const current=store.getState();
    const requested=String(rawClientId||'').trim();
    if(!requested){
      if(source&&'value' in source)source.value=current.selectedClientId||'';
      clearClientSwitchBusy();
      return false;
    }
    try{
      const clientId=guardClientSelection(current,requested);
      const sameClient=String(current.selectedClientId||'')===String(clientId);
      const alreadyOpen=String(current.activeArea||'')==='expediente';
      if(sameClient&&(!openExpediente||alreadyOpen)){
        clearClientSwitchBusy();
        return false;
      }
      markClientSwitchBusy(source);
      if(!sameClient)store.selectClient(clientId);
      if(openExpediente&&!alreadyOpen)store.navigate('expediente');
      if(preserveSourceFocus&&source)rerenderPreservingControl(source);
      else focusMain();
      return true;
    }catch(error){
      clearClientSwitchBusy();
      if(source&&'value' in source)source.value=store.getState().selectedClientId||'';
      root.dispatchEvent(new CustomEvent('m26:access-denied',{bubbles:true,detail:{code:error.message}}));
      return false;
    }
  }

  function openCoachAction(source){
    const current=store.getState();
    try{
      const decision=resolveCoachActionNavigation(current,{
        clientId:source?.getAttribute?.('data-m26-client-id')||source?.getAttribute?.('data-m26-select-client'),
        targetArea:source?.getAttribute?.('data-m26-target-area')||'expediente',
      });
      const sameClient=String(current.selectedClientId||'')===String(decision.clientId);
      const sameArea=String(current.activeArea||'')===String(decision.area);
      if(sameClient&&sameArea){
        clearClientSwitchBusy();
        return false;
      }
      markClientSwitchBusy(source);
      if(!sameClient)store.selectClient(decision.clientId);
      if(!sameArea)store.navigate(decision.area);
      focusMain();
      return true;
    }catch(error){
      clearClientSwitchBusy();
      root.dispatchEvent(new CustomEvent('m26:access-denied',{bubbles:true,detail:{code:error.message}}));
      return false;
    }
  }

  function onClick(event) {
    const intakeButton=event.target.closest?.('[data-admin-intake-open]');
    if(intakeButton){
      event.preventDefault?.();
      openNativeAdminIntake(root);
      return;
    }

    const expedienteTab=event.target.closest?.('[data-m26-expediente-tab]');
    if(expedienteTab){
      const host=expedienteTab.closest?.('[data-m26-expediente]');
      const view=String(expedienteTab.getAttribute('data-m26-expediente-tab')||'').trim();
      if(host&&['resumen','contexto','perfil','plan'].includes(view)){
        host.dataset.m26ExpedienteView=view;
        for(const tab of host.querySelectorAll?.('[data-m26-expediente-tab]')||[]){
          const selected=tab.getAttribute('data-m26-expediente-tab')===view;
          tab.setAttribute('aria-selected',selected?'true':'false');
          tab.tabIndex=selected?0:-1;
        }
      }
      return;
    }

    const roleButton=event.target.closest?.('[data-m26-switch-role]');
    if(roleButton){
      root.dispatchEvent(new CustomEvent('m26:switch-role',{bubbles:true,detail:{role:roleButton.getAttribute('data-m26-switch-role')}}));
      return;
    }

    const coachActionButton=event.target.closest?.('[data-m26-coach-action]');
    if(coachActionButton){
      event.preventDefault?.();
      event.stopPropagation?.();
      openCoachAction(coachActionButton);
      return;
    }

    const clientButton = event.target.closest?.('[data-m26-select-client]');
    if (clientButton) {
      switchClient(clientButton.getAttribute('data-m26-select-client'),{openExpediente:true,source:clientButton});
      return;
    }

    const areaButton = event.target.closest?.('[data-m26-area]');
    if (areaButton) {
      const nextArea = areaButton.getAttribute('data-m26-area');
      const current=store.getState();
      const decision = resolveM26Route(current, nextArea);
      if(String(current.activeArea||'')===String(decision.area||'')){
        focusMain();
        return;
      }
      const documentLike=root.ownerDocument||globalThis.document;
      runRouteViewTransition(
        ()=>{
          const navigatedState=store.navigate(decision.area);
          // Navigation is an explicit user commitment. Paint the destination immediately
          // instead of relying only on the subscribed microtask render; this keeps
          // WebKit/mobile route feedback deterministic while the post-auth controller
          // rail is still mounting. The subscription remains as a harmless fallback.
          renderNow(navigatedState,{force:true});
          focusMain();
        },
        {documentLike,windowLike:documentLike?.defaultView||globalThis.window},
      );
      return;
    }

    const actionButton = event.target.closest?.('[data-m26-action]');
    const action=actionButton?.getAttribute('data-m26-action');
    if(action==='account-password-recovery'){
      root.dispatchEvent(new CustomEvent('m26:account-password-recovery',{bubbles:true}));
      return;
    }
    if(action==='logout'){
      root.dispatchEvent(new CustomEvent('m26:logout',{bubbles:true}));
      return;
    }
    if(action==='logout-clear-device'){
      root.dispatchEvent(new CustomEvent('m26:logout-and-clear-device',{bubbles:true}));
      return;
    }
  }

  function onChange(event) {
    const committedControl=interactiveControl(event.target);
    if(committedControl&&interactionPointerTarget===committedControl){
      releasePointerInteraction({deferRender:false});
    }

    const languageSelector=event.target.closest?.('[data-m26-ui-language]');
    if(languageSelector){
      try{
        setIberfitLanguage(String(languageSelector.value||'').trim());
        rerenderPreservingControl(languageSelector);
      }catch(error){
        root.dispatchEvent(new CustomEvent('m26:access-denied',{bubbles:true,detail:{code:error.message}}));
      }
      return;
    }

    const localeSelector=event.target.closest?.('[data-m26-ui-locale]');
    if(localeSelector){
      try{
        setIberfitUiLocale(String(localeSelector.value||'').trim());
        rerenderPreservingControl(localeSelector);
      }catch(error){
        root.dispatchEvent(new CustomEvent('m26:access-denied',{bubbles:true,detail:{code:error.message}}));
      }
      return;
    }

    // RC71_2_PREFERENCES_CHANGE_BEGIN — stable regression marker; behavior remains fail-closed.
    const preferenceControl=event.target.closest?.('[data-m26-preference]');
    if(preferenceControl){
      const state=store.getState();
      const scope=String(state?.identity?.id||'').trim();
      const path=String(preferenceControl.getAttribute('data-m26-preference')||'').trim();
      const value=preferenceControl.type==='checkbox'?Boolean(preferenceControl.checked):String(preferenceControl.value||'').trim();
      try{
        updateIberfitExperiencePreference(scope,path,value);
        rerenderPreservingControl(preferenceControl);
      }catch(error){
        root.dispatchEvent(new CustomEvent('m26:access-denied',{bubbles:true,detail:{code:error.message}}));
      }
      return;
    }

    const selector = event.target.closest?.('[data-m26-client-select]');
    if (!selector){
      if(committedControl)queueMicrotask(flushDeferredRender);
      return;
    }
    switchClient(selector.value,{openExpediente:false,source:selector,preserveSourceFocus:true});
  }

  function mount({progressive=false}={}) {
    if (unsubscribe) return;
    generation+=1;
    adaptiveWindow=root.ownerDocument?.defaultView||globalThis.window||null;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('m26:i18n-switch-settled',onI18nSwitchSettled);
    root.addEventListener('pointerdown',onPointerDown,{passive:true});
    root.addEventListener('pointerup',onPointerRelease,{passive:true});
    root.addEventListener('pointercancel',onPointerCancel,{passive:true});
    root.addEventListener('focusin',onFocusIn);
    root.addEventListener('focusout',onFocusOut);
    adaptiveWindow?.addEventListener?.('resize',syncAdaptiveLayout,{passive:true});
    adaptiveWindow?.addEventListener?.('orientationchange',syncAdaptiveLayout,{passive:true});
    unsubscribe = store.subscribe(scheduleRender);
    syncAdaptiveLayout();
    const state=store.getState();
    const authenticated=createShellViewModel(state).mode==='authenticated';
    if(progressive&&authenticated){
      renderWorkspaceFrame(state);
      return;
    }
    renderNow(state);
  }

  function destroy() {
    generation+=1;
    renderQueued=false;
    queuedState=null;
    pendingI18nContinuitySnapshot=null;
    clearInteractionReleaseTimer();
    interactionPointerTarget=null;
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('m26:i18n-switch-settled',onI18nSwitchSettled);
    root.removeEventListener('pointerdown',onPointerDown);
    root.removeEventListener('pointerup',onPointerRelease);
    root.removeEventListener('pointercancel',onPointerCancel);
    root.removeEventListener('focusin',onFocusIn);
    root.removeEventListener('focusout',onFocusOut);
    adaptiveWindow?.removeEventListener?.('resize',syncAdaptiveLayout);
    adaptiveWindow?.removeEventListener?.('orientationchange',syncAdaptiveLayout);
    adaptiveWindow=null;
    unsubscribe?.();
    unsubscribe=null;
    teardownSessionFocus({root});
    lastMarkup='';
    clearClientSwitchBusy();
  }

  return Object.freeze({ mount, destroy, render:renderNow, scheduleRender });
}
