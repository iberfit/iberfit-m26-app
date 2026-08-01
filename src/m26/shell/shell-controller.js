import { guardClientSelection, resolveM26Route } from './route-guard.js';
import { createShellViewModel } from './shell-view-model.js';
import { renderM26Shell } from './shell-render.js';

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

  function renderNow(state = store.getState()) {
    const viewModel = createShellViewModel(state);
    const routeMarkup = viewModel.mode === 'authenticated' ? renderRoute(viewModel, state) : '';
    const markup=renderM26Shell(viewModel, routeMarkup);
    if(markup===lastMarkup)return false;
    root.innerHTML = markup;lastMarkup=markup;return true;
  }

  function scheduleRender(state=store.getState()){
    queuedState=state;if(renderQueued)return;renderQueued=true;const token=generation;
    queueMicrotask(()=>{renderQueued=false;if(token!==generation)return;const next=queuedState;queuedState=null;renderNow(next);});
  }

  function focusMain(){queueMicrotask(()=>root.querySelector?.('#m26-main')?.focus?.({preventScroll:false}));}

  function onClick(event) {
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
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    unsubscribe = store.subscribe(scheduleRender);
    renderNow();
  }

  function destroy() {
    generation+=1;renderQueued=false;queuedState=null;
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    unsubscribe?.();
    unsubscribe = null;lastMarkup='';
  }

  return Object.freeze({ mount, destroy, render:renderNow, scheduleRender });
}
