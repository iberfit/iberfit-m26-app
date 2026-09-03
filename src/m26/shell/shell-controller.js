import { guardClientSelection, resolveM26Route } from './route-guard.js';
import { createShellViewModel } from './shell-view-model.js';
import { renderM26Shell } from './shell-render.js';
import {setIberfitLanguage} from '../ui/i18n.js';
import {setIberfitUiLocale} from '../ui/castellano.js';
import {updateIberfitExperiencePreference} from '../ui/preferences.js';
import {enhanceNativeWorkspace,openNativeAdminIntake} from '../ui/native-workspace.js';

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

  function renderNow(state = store.getState()) {
    const viewModel = createShellViewModel(state);
    const routeMarkup = viewModel.mode === 'authenticated' ? renderRoute(viewModel, state) : '';
    const markup=renderM26Shell(viewModel, routeMarkup);
    if(markup===lastMarkup){clearClientSwitchBusy();return false;}
    root.innerHTML = markup;
    lastMarkup=markup;
    syncAdaptiveLayout();
    enhanceNativeWorkspace({root,viewModel});
    clearClientSwitchBusy();
    root.dispatchEvent(new CustomEvent('m26:shell-rendered',{bubbles:false,detail:{role:viewModel.identity?.role||'',area:viewModel.activeArea||''}}));
    return true;
  }

  function scheduleRender(state=store.getState()){
    queuedState=state;
    if(renderQueued)return;
    renderQueued=true;
    const token=generation;
    queueMicrotask(()=>{
      renderQueued=false;
      if(token!==generation)return;
      const next=queuedState;
      queuedState=null;
      renderNow(next);
    });
  }

  function focusMain(){queueMicrotask(()=>root.querySelector?.('#m26-main')?.focus?.({preventScroll:false}));}

  function markClientSwitchBusy(source){
    if(root?.dataset)root.dataset.m26ClientSwitching='true';
    source?.setAttribute?.('aria-busy','true');
  }

  function switchClient(rawClientId,{openExpediente=false,source=null}={}){
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
      focusMain();
      return true;
    }catch(error){
      clearClientSwitchBusy();
      if(source&&'value' in source)source.value=store.getState().selectedClientId||'';
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

    const clientButton = event.target.closest?.('[data-m26-select-client]');
    if (clientButton) {
      switchClient(clientButton.getAttribute('data-m26-select-client'),{openExpediente:true,source:clientButton});
      return;
    }

    const areaButton = event.target.closest?.('[data-m26-area]');
    if (areaButton) {
      const nextArea = areaButton.getAttribute('data-m26-area');
      const decision = resolveM26Route(store.getState(), nextArea);
      store.navigate(decision.area);
      focusMain();
      return;
    }

    const actionButton = event.target.closest?.('[data-m26-action]');
    const action=actionButton?.getAttribute('data-m26-action');
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
    const languageSelector=event.target.closest?.('[data-m26-ui-language]');
    if(languageSelector){
      try{
        setIberfitLanguage(String(languageSelector.value||'').trim());
        lastMarkup='';
        renderNow(store.getState());
        focusMain();
      }catch(error){
        root.dispatchEvent(new CustomEvent('m26:access-denied',{bubbles:true,detail:{code:error.message}}));
      }
      return;
    }

    const localeSelector=event.target.closest?.('[data-m26-ui-locale]');
    if(localeSelector){
      try{
        setIberfitUiLocale(String(localeSelector.value||'').trim());
        lastMarkup='';
        renderNow(store.getState());
        focusMain();
      }catch(error){
        root.dispatchEvent(new CustomEvent('m26:access-denied',{bubbles:true,detail:{code:error.message}}));
      }
      return;
    }

    const preferenceControl=event.target.closest?.('[data-m26-preference]');
    if(preferenceControl){
      const state=store.getState();
      const scope=String(state?.identity?.id||'').trim();
      const path=String(preferenceControl.getAttribute('data-m26-preference')||'').trim();
      const value=preferenceControl.type==='checkbox'?Boolean(preferenceControl.checked):String(preferenceControl.value||'').trim();
      try{
        updateIberfitExperiencePreference(scope,path,value);
        lastMarkup='';
        renderNow(store.getState());
        focusMain();
      }catch(error){
        root.dispatchEvent(new CustomEvent('m26:access-denied',{bubbles:true,detail:{code:error.message}}));
      }
      return;
    }

    const selector = event.target.closest?.('[data-m26-client-select]');
    if (!selector) return;
    switchClient(selector.value,{openExpediente:false,source:selector});
  }

  function mount() {
    if (unsubscribe) return;
    generation+=1;
    adaptiveWindow=root.ownerDocument?.defaultView||globalThis.window||null;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    adaptiveWindow?.addEventListener?.('resize',syncAdaptiveLayout,{passive:true});
    adaptiveWindow?.addEventListener?.('orientationchange',syncAdaptiveLayout,{passive:true});
    unsubscribe = store.subscribe(scheduleRender);
    syncAdaptiveLayout();
    renderNow();
  }

  function destroy() {
    generation+=1;
    renderQueued=false;
    queuedState=null;
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    adaptiveWindow?.removeEventListener?.('resize',syncAdaptiveLayout);
    adaptiveWindow?.removeEventListener?.('orientationchange',syncAdaptiveLayout);
    adaptiveWindow=null;
    unsubscribe?.();
    unsubscribe=null;
    lastMarkup='';
    clearClientSwitchBusy();
  }

  return Object.freeze({ mount, destroy, render:renderNow, scheduleRender });
}
