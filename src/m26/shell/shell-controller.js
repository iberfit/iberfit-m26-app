import { guardClientSelection, resolveM26Route } from './route-guard.js';
import { createShellViewModel } from './shell-view-model.js';
import { renderM26Shell } from './shell-render.js';

export function resolveAdaptiveLayout({
  width = 1440,
  coarsePointer = false,
  touchPoints = 0,
} = {}) {
  const viewportWidth = Number(width);
  const coarse = Boolean(coarsePointer) || Number(touchPoints || 0) > 0;

  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return 'expanded-pointer';
  }

  if (viewportWidth <= 640) {
    return 'compact-touch';
  }

  if (viewportWidth <= 1179) {
    return 'medium-touch';
  }

  if (coarse) {
    return 'expanded-touch';
  }

  return 'expanded-pointer';
}

export function createShellController({ root, store, renderRoute = () => '' }) {
  if (!root?.addEventListener) throw new Error('M26_SHELL_ROOT_REQUIRED');
  if (!store?.getState || !store?.subscribe || !store?.navigate || !store?.selectClient) {
    throw new Error('M26_SHELL_STORE_REQUIRED');
  }

  let unsubscribe = null;
  let renderQueued=false;
  let queuedState=null;
  let generation=0;
  let lastMarkup='';
  let adaptiveWindow=null;

  function syncAdaptiveLayout(){
    const target=
      adaptiveWindow||
      root.ownerDocument?.defaultView||
      globalThis.window||
      null;

    const width=
      Number(target?.innerWidth)||
      Number(root?.clientWidth)||
      1440;

    const coarsePointer=
      Boolean(
        target?.matchMedia?.('(pointer: coarse)')?.matches
      );

    const touchPoints=
      Number(target?.navigator?.maxTouchPoints||0);

    const layout=
      resolveAdaptiveLayout({
        width,
        coarsePointer,
        touchPoints,
      });

    if(root?.dataset){
      root.dataset.m26Layout=layout;
      root.dataset.m26Input=
        coarsePointer||touchPoints>0
          ?'touch'
          :'pointer';
    }

    return layout;
  }

  function renderNow(state = store.getState()) {
    const viewModel = createShellViewModel(state);
    const routeMarkup = viewModel.mode === 'authenticated' ? renderRoute(viewModel, state) : '';
    const markup=renderM26Shell(viewModel, routeMarkup);
    if(markup===lastMarkup)return false;
    root.innerHTML = markup;
    lastMarkup=markup;
    syncAdaptiveLayout();
    return true;
  }

  function scheduleRender(state=store.getState()){
    queuedState=state;if(renderQueued)return;renderQueued=true;const token=generation;
    queueMicrotask(()=>{renderQueued=false;if(token!==generation)return;const next=queuedState;queuedState=null;renderNow(next);});
  }

  function focusMain(){queueMicrotask(()=>root.querySelector?.('#m26-main')?.focus?.({preventScroll:false}));}

  function onClick(event) {
    const expedienteTab=
      event.target.closest?.('[data-m26-expediente-tab]');

    if(expedienteTab){
      const host=
        expedienteTab.closest?.('[data-m26-expediente]');

      const view=
        String(
          expedienteTab.getAttribute('data-m26-expediente-tab')||''
        ).trim();

      if(
        host&&
        ['resumen','contexto','perfil','plan'].includes(view)
      ){
        host.dataset.m26ExpedienteView=view;

        for(
          const tab of host.querySelectorAll?.(
            '[data-m26-expediente-tab]'
          )||[]
        ){
          const selected=
            tab.getAttribute('data-m26-expediente-tab')===view;

          tab.setAttribute(
            'aria-selected',
            selected?'true':'false'
          );

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
      try {
        const clientId = guardClientSelection(store.getState(), clientButton.getAttribute('data-m26-select-client'));
        store.selectClient(clientId);
        store.navigate('expediente');
        focusMain();
      } catch (error) {
        root.dispatchEvent(new CustomEvent('m26:access-denied', { bubbles: true, detail: { code: error.message } }));
      }
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
    if (actionButton?.getAttribute('data-m26-action') === 'logout') {
      root.dispatchEvent(new CustomEvent('m26:logout', { bubbles: true }));
    }
  }

  function onChange(event) {
    const selector = event.target.closest?.('[data-m26-client-select]');
    if (!selector) return;
    try {
      const clientId = guardClientSelection(store.getState(), selector.value);
      store.selectClient(clientId);
      focusMain();
    } catch (error) {
      selector.value = store.getState().selectedClientId || '';
      root.dispatchEvent(new CustomEvent('m26:access-denied', {
        bubbles: true,
        detail: { code: error.message },
      }));
    }
  }

  function mount() {
    if (unsubscribe) return;

    generation+=1;

    adaptiveWindow=
      root.ownerDocument?.defaultView||
      globalThis.window||
      null;

    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);

    adaptiveWindow?.addEventListener?.(
      'resize',
      syncAdaptiveLayout,
      {passive:true}
    );

    adaptiveWindow?.addEventListener?.(
      'orientationchange',
      syncAdaptiveLayout,
      {passive:true}
    );

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

    adaptiveWindow?.removeEventListener?.(
      'resize',
      syncAdaptiveLayout
    );

    adaptiveWindow?.removeEventListener?.(
      'orientationchange',
      syncAdaptiveLayout
    );

    adaptiveWindow=null;

    unsubscribe?.();
    unsubscribe=null;
    lastMarkup='';
  }

  return Object.freeze({ mount, destroy, render:renderNow, scheduleRender });
}
