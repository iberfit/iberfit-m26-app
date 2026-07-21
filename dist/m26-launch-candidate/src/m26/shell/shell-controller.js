import { guardClientSelection, resolveM26Route } from './route-guard.js';
import { createShellViewModel } from './shell-view-model.js';
import { renderM26Shell } from './shell-render.js';

export function createShellController({ root, store, renderRoute = () => '' }) {
  if (!root?.addEventListener) throw new Error('M26_SHELL_ROOT_REQUIRED');
  if (!store?.getState || !store?.subscribe || !store?.navigate || !store?.selectClient) {
    throw new Error('M26_SHELL_STORE_REQUIRED');
  }

  let unsubscribe = null;

  function render(state = store.getState()) {
    const viewModel = createShellViewModel(state);
    const routeMarkup = viewModel.mode === 'authenticated' ? renderRoute(viewModel, state) : '';
    root.innerHTML = renderM26Shell(viewModel, routeMarkup);
  }

  function onClick(event) {
    const clientButton = event.target.closest?.('[data-m26-select-client]');
    if (clientButton) {
      try {
        const clientId = guardClientSelection(store.getState(), clientButton.getAttribute('data-m26-select-client'));
        store.selectClient(clientId);
        store.navigate('expediente');
        queueMicrotask(() => root.querySelector?.('#m26-main')?.focus?.());
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
      queueMicrotask(() => root.querySelector?.('#m26-main')?.focus?.());
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
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    unsubscribe = store.subscribe(render);
    render();
  }

  function destroy() {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    unsubscribe?.();
    unsubscribe = null;
  }

  return Object.freeze({ mount, destroy, render });
}
