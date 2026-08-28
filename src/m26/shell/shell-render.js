import {enhanceAdminShellMarkup} from '../admin/shell-enhancer.js';
import {enhanceRc39ShellMarkup} from '../rc39/shell-enhancer.js';
import {areaIconName,renderIberfitIcon} from '../design/icons.js';
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
  const icon = renderIberfitIcon(areaIconName(item.key),{className:'m26-nav-icon'});
  return `<button class="m26-nav-item${active ? ' is-active' : ''}" type="button" data-m26-area="${escapeHtml(item.key)}"${active?' aria-current="page"':''}>${icon}<span>${escapeHtml(item.label)}</span></button>`;
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

function coachProductivityShell(vm){
  if(!['coach','admin'].includes(String(vm.identity?.role||'')))return Object.freeze({launcher:'',palette:''});
  const launcher=`<button type="button" class="m26-coach-command-launcher" data-coach-command-open aria-haspopup="dialog"><span>Buscar y acciones</span><kbd aria-hidden="true">Ctrl/⌘ K</kbd></button>`;
  const palette=`<section class="m26-coach-command-backdrop" data-coach-command-palette role="dialog" aria-modal="true" aria-labelledby="m26-coach-command-title" hidden><div class="m26-coach-command-dialog"><header class="m26-coach-command-header"><div><p class="m26-eyebrow">Productividad Coach</p><h2 id="m26-coach-command-title">Buscar y abrir</h2><p>Busca módulos o clientes dentro de tu alcance actual.</p></div><button type="button" class="m26-icon-button" data-coach-command-close aria-label="Cerrar búsqueda">Cerrar</button></header><label class="m26-coach-command-search">Buscar acción o cliente<input type="search" data-coach-command-search autocomplete="off" spellcheck="false" aria-describedby="m26-coach-command-status" placeholder="Ej. clientes, agenda, nombre del cliente"></label><p id="m26-coach-command-status" data-coach-command-status class="m26-coach-command-status" role="status" aria-live="polite"></p><div class="m26-coach-command-results" data-coach-command-results></div></div></section>`;
  return Object.freeze({launcher,palette});
}
function operationStatus(operations) {
  const labels = [];
  if (operations.pending) labels.push(`${operations.pending} pendiente${operations.pending === 1 ? '' : 's'}`);
  if (operations.conflicts) labels.push(`${operations.conflicts} conflicto${operations.conflicts === 1 ? '' : 's'}`);
  if (operations.rejected) labels.push(`${operations.rejected} por revisar`);
  const text = labels.length ? labels.join(' · ') : 'Sin cambios locales pendientes';
  return `<div class="m26-operation-status is-${escapeHtml(operations.kind)}" role="status" aria-live="polite" aria-atomic="true"><span class="m26-status-dot" aria-hidden="true"></span><span>${escapeHtml(text)}</span></div>`;
}

export function renderM26AccessFrame(vm) {
  const state = vm.hydration?.status === 'error' ? 'No fue posible confirmar el acceso.' : 'Confirmando identidad y permisos…';
  return `<main class="m26-access-frame" aria-busy="${vm.hydration?.status==='error'?'false':'true'}"><section><img src="/public/isotipo-iberfit.png" alt="" class="m26-access-mark"><p class="m26-eyebrow">IBERFIT</p><h1>Entrenamiento personal con criterio</h1><p>Diagnóstico, planificación, control y seguimiento.</p><div class="m26-access-status" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(state)}</div></section></main>`;
}

function renderM26ShellBase(vm, routeMarkup = '') {
  if (vm.mode !== 'authenticated') return renderM26AccessFrame(vm);
  const selectedClientName = vm.selectedClient?.name || 'Sin expediente seleccionado';
  const contextual = vm.identity.role==='admin'
    ? navGroup('Operación',vm.navigation.context,vm.activeArea,'m26-context-nav')
    : vm.selectedClient
      ? navGroup(selectedClientName,vm.navigation.context,vm.activeArea,'m26-context-nav')
      : '';
  const routeContent = routeMarkup || `<section class="m26-route-placeholder" aria-live="polite"><p class="m26-eyebrow">${escapeHtml(vm.page.label)}</p><h2>${escapeHtml(vm.page.title)}</h2><p>Esta sección no está disponible. Regresa al menú principal.</p></section>`;
  const allMobileItems = [...vm.navigation.primary, ...vm.navigation.context, ...vm.navigation.tools].filter((item, index, items) => items.findIndex((candidate) => candidate.key === item.key) === index);
  const quickMobileItems = vm.navigation.mobile.slice(0, 4);
  const moreMobileItems = allMobileItems.filter((item) => !quickMobileItems.some((quick) => quick.key === item.key));
  const mobileMore = moreMobileItems.length ? `<details class="m26-mobile-more"><summary>Más</summary><div class="m26-mobile-more-menu">${moreMobileItems.map((item) => navItem(item, vm.activeArea)).join('')}</div></details>` : '';
  const productivity=coachProductivityShell(vm);

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
        <div class="m26-topbar-actions">${productivity.launcher}${clientSelector(vm)}${operationStatus(vm.operations)}${(vm.identity.role==='client'||vm.selectedClient)?`<button type="button" class="m26-icon-button" data-m26-area="retos">Retos</button>`:''}<button type="button" class="m26-icon-button" data-m26-area="ajustes">Ajustes</button><button type="button" class="m26-icon-button" data-m26-action="logout">Cerrar sesión</button><button type="button" class="m26-danger-action" data-m26-action="logout-clear-device">Cerrar sesión y borrar datos de este dispositivo</button></div>
      </header>
      <main id="m26-main" class="m26-main" tabindex="-1" aria-labelledby="m26-page-title">${routeContent}</main>
      <nav class="m26-mobile-nav" aria-label="Navegación rápida y completa">${quickMobileItems.map((item) => navItem(item, vm.activeArea)).join('')}${mobileMore}</nav>
    </section>
    ${productivity.palette}
  </div>`;
}

/* M26_RC39_SHELL_RENDER_WRAPPER */
export function renderM26Shell(vm,routeMarkup=''){
  return enhanceAdminShellMarkup(
    enhanceRc39ShellMarkup(renderM26ShellBase(vm,routeMarkup),vm),
    vm
  );
}
