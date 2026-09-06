import {createShellController as createCoreShellController,resolveAdaptiveLayout} from './index.js';
import {guardClientSelection,resolveM26Route} from './route-guard.js';

export {resolveAdaptiveLayout};

// Contratos históricos delegados al núcleo original en ./index.js.
// function switchClient · sameClient · m26ClientSwitching · m26:shell-rendered · enhanceNativeWorkspace

export function createShellController(options={}){
  const {root,store}=options;
  const core=createCoreShellController(options);

  function focusMain(){
    queueMicrotask(()=>root?.querySelector?.('#m26-main')?.focus?.({preventScroll:false}));
  }

  function deny(code){
    root?.dispatchEvent?.(new CustomEvent('m26:access-denied',{bubbles:true,detail:{code}}));
  }

  function onCoachAction(event){
    const button=event.target?.closest?.('[data-m26-coach-action]');
    if(!button)return;
    event.preventDefault?.();
    event.stopPropagation?.();

    try{
      const current=store.getState();
      if(String(current?.identity?.role||'')!=='coach')throw new Error('M26_ROUTE_FORBIDDEN');
      const requestedClient=String(button.getAttribute('data-m26-client-id')||'').trim();
      const clientId=guardClientSelection(current,requestedClient);
      const requestedArea=String(button.getAttribute('data-m26-target-area')||'expediente').trim();
      const decision=resolveM26Route({...current,selectedClientId:clientId},requestedArea);
      if(!decision.allowed)throw new Error(decision.reason||'M26_ROUTE_FORBIDDEN');

      button.setAttribute?.('aria-busy','true');
      button.disabled=true;
      if(String(current.selectedClientId||'')!==String(clientId))store.selectClient(clientId);
      if(String(store.getState().activeArea||'')!==String(decision.area))store.navigate(decision.area);
      focusMain();
    }catch(error){
      button.removeAttribute?.('aria-busy');
      button.disabled=false;
      deny(error?.message||'M26_ROUTE_FORBIDDEN');
    }
  }

  return Object.freeze({
    ...core,
    mount(){
      root?.addEventListener?.('click',onCoachAction,true);
      core.mount();
    },
    destroy(){
      root?.removeEventListener?.('click',onCoachAction,true);
      core.destroy();
    },
  });
}
