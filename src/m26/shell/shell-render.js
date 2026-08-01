import {enhanceRc39ShellMarkup} from '../rc39/shell-enhancer.js';
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function navItem(item, activeArea) {
  const active = item.key === activeArea;
  return `<button class="m26-nav-item${active ? ' is-active' : ''}" type="button" data-m26-area="${escapeHtml(item.key)}"${active?' aria-current="page"':''}><span>${escapeHtml(item.label)}</span></button>`;
}

function navGroup(label, items, activeArea, className = '') {
  if (!items?.length) return '';
  return `<section class="m26-nav-group ${escapeHtml(className)}"><h2>${escapeHtml(label)}</h2><div>${items.map((item) => navItem(item, activeArea)).join('')}</div></section>`;
}

function clientSelector(vm) {
  if (!vm.selectedClient && !vm.canChangeClient) return '';
  if (!vm.canChangeClient) {
    return `<div class="m26-client-context"><span>Tu acompañamiento</span><strong>${escapeHtml(vm.selectedClient?.name || 'Sin expediente disponible')}</strong>${vm.selectedClient?.modality ? `<small>${escapeHtml(vm.selectedClient.modality)}</small>` : ''}</div>`;
  }
  const options = vm.clientOptions.map((client) => `<option value="${escapeHtml(client.id)}"${client.id === vm.selectedClient?.id ? ' selected' : ''}>${escapeHtml(client.name)}</option>`).join('');
  return `<label class="m26-client-selector"><span>Expediente activo</span><select data-m26-client-select aria-label="Seleccionar expediente"><option value="">Selecciona un cliente</option>${options}</select></label>`;
}

function operationStatus(operations) {
  const labels = [];
  if (operations.pending) labels.push(`${operations.pending} pendiente${operations.pending === 1 ? '' : 's'}`);
  if (operations.conflicts) labels.push(`${operations.conflicts} conflicto${operations.conflicts === 1 ? '' : 's'}`);
  if (operations.rejected) labels.push(`${operations.rejected} por revisar`);
  const text = labels.length ? labels.join(' · ') : 'Sin operaciones pendientes';
  return `<div class="m26-operation-status is-${escapeHtml(operations.kind)}" role="status" aria-live="polite" aria-atomic="true"><span class="m26-status-dot" aria-hidden="true"></span><span>${escapeHtml(text)}</span></div>`;
}

export function renderM26AccessFrame(vm) {
  const state = vm.hydration?.status === 'error' ? 'No fue posible confirmar el acceso.' : 'Confirmando identidad y permisos…';
  return `<main class="m26-access-frame" aria-busy="${vm.hydration?.status==='error'?'false':'true'}"><section><img src="/public/isotipo-iberfit.png" alt="" class="m26-access-mark"><p class="m26-eyebrow">IBERFIT</p><h1>Entrenamiento personal con criterio</h1><p>Diagnóstico, planificación, control y seguimiento.</p><div class="m26-access-status" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(state)}</div></section></main>`;
}

function renderM26ShellBase(vm, routeMarkup = '') {
  if (vm.mode !== 'authenticated') return renderM26AccessFrame(vm);
  const selectedClientName = vm.selectedClient?.name || 'Sin expediente seleccionado';
  const contextual = vm.selectedClient ? navGroup(selectedClientName, vm.navigation.context, vm.activeArea, 'm26-context-nav') : '';
  const routeContent = routeMarkup || `<section class="m26-route-placeholder" aria-live="polite"><p class="m26-eyebrow">${escapeHtml(vm.page.label)}</p><h2>${escapeHtml(vm.page.title)}</h2><p>Esta sección no está disponible. Regresa al menú principal.</p></section>`;
  const allMobileItems = [...vm.navigation.primary, ...vm.navigation.context, ...vm.navigation.tools].filter((item, index, items) => items.findIndex((candidate) => candidate.key === item.key) === index);
  const quickMobileItems = vm.navigation.mobile.slice(0, 4);
  const moreMobileItems = allMobileItems.filter((item) => !quickMobileItems.some((quick) => quick.key === item.key));
  const mobileMore = moreMobileItems.length ? `<details class="m26-mobile-more"><summary>Más</summary><div class="m26-mobile-more-menu">${moreMobileItems.map((item) => navItem(item, vm.activeArea)).join('')}</div></details>` : '';

  return `<div class="m26-shell" data-m26-role="${escapeHtml(vm.identity.role)}"><a class="m26-skip-link" href="#m26-main">Saltar al contenido</a>
    <aside class="m26-sidebar" aria-label="Navegación IBERFIT">
      <div class="m26-brand"><img src="/public/isotipo-iberfit.png" alt="" aria-hidden="true"><div><strong>IBERFIT</strong><span>Entrenamiento personal con criterio</span></div></div>
      ${navGroup('Trabajo', vm.navigation.primary, vm.activeArea)}
      ${contextual}
      ${navGroup('Control', vm.navigation.tools, vm.activeArea)}
      <div class="m26-sidebar-footer"><span>${escapeHtml(vm.identity.roleLabel)}</span><strong>${escapeHtml(vm.identity.name)}</strong></div>
    </aside>
    <section class="m26-workspace">
      <header class="m26-topbar">
        <div><p class="m26-eyebrow">${escapeHtml(vm.identity.roleLabel)}</p><h1 id="m26-page-title">${escapeHtml(vm.page.title)}</h1></div>
        <div class="m26-topbar-actions">${clientSelector(vm)}${operationStatus(vm.operations)}<button type="button" class="m26-icon-button" data-m26-action="logout">Cerrar sesión</button></div>
      </header>
      <main id="m26-main" class="m26-main" tabindex="-1" aria-labelledby="m26-page-title">${routeContent}</main>
      <nav class="m26-mobile-nav" aria-label="Navegación rápida y completa">${quickMobileItems.map((item) => navItem(item, vm.activeArea)).join('')}${mobileMore}</nav>
    </section>
  </div>`;
}

/* M26_RC39_SHELL_RENDER_WRAPPER */
export function renderM26Shell(vm,routeMarkup=''){
  return enhanceRc39ShellMarkup(renderM26ShellBase(vm,routeMarkup),vm);
}
