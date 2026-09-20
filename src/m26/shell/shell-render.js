import {enhanceAdminShellMarkup} from '../admin/shell-enhancer.js';
import {enhanceRc39ShellMarkup} from '../rc39/shell-enhancer.js';
import {areaIconName,renderIberfitIcon} from '../design/icons.js';
import {applyIberfitDocumentLanguage} from '../ui/i18n.js';
import {iberfitShellTranslate} from '../ui/i18n-shell.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function tx(key,fallback='',params={}){
  return iberfitShellTranslate(key,{fallback,params});
}

const ROLE_NAV_GROUPS=Object.freeze({
  admin:Object.freeze([
    Object.freeze({labelKey:'nav.admin.direction',keys:Object.freeze(['admin-inicio','admin-analitica'])}),
    Object.freeze({labelKey:'nav.admin.people',keys:Object.freeze(['admin-usuarios','admin-equipo','admin-clientes','admin-agenda'])}),
    Object.freeze({labelKey:'nav.admin.operation',keys:Object.freeze(['admin-operaciones','admin-comunicacion','admin-automatizaciones','biblioteca'])}),
    Object.freeze({labelKey:'nav.admin.control',keys:Object.freeze(['admin-auditoria','admin-configuracion'])}),
  ]),
  coach:Object.freeze([
    Object.freeze({labelKey:'nav.coach.day',keys:Object.freeze(['hoy','agenda'])}),
    Object.freeze({labelKey:'nav.coach.clients',keys:Object.freeze(['clientes','expediente','iri','planificacion','sesion','progreso','actividad','informes','notas','inteligencia'])}),
    Object.freeze({labelKey:'nav.coach.resources',keys:Object.freeze(['mensajes','biblioteca','retos'])}),
    Object.freeze({labelKey:'nav.coach.control',keys:Object.freeze(['verificacion','ajustes'])}),
  ]),
  client:Object.freeze([
    Object.freeze({labelKey:'nav.client.main',keys:Object.freeze(['hoy','planificacion','sesion'])}),
    Object.freeze({labelKey:'nav.client.followup',keys:Object.freeze(['progreso','informes','actividad','mensajes','retos'])}),
    Object.freeze({labelKey:'nav.client.account',keys:Object.freeze(['ajustes'])}),
  ]),
});

function areaText(item,kind='label'){
  return tx(`area.${item?.key}.${kind}`,item?.[kind]||item?.label||'IBERFIT');
}

function navItem(item, activeArea,{disabled=false}={}) {
  const active = item.key === activeArea;
  const icon = renderIberfitIcon(areaIconName(item.key),{className:'m26-nav-icon'});
  const label=areaText(item,'label');
  if(disabled){
    return `<button class="m26-nav-item is-disabled" type="button" disabled aria-disabled="true" title="${escapeHtml(tx('common.clientRequired','Selecciona un cliente para abrir esta función'))}">${icon}<span>${escapeHtml(label)}</span></button>`;
  }
  return `<button class="m26-nav-item${active ? ' is-active' : ''}" type="button" data-m26-area="${escapeHtml(item.key)}"${active?' aria-current="page"':''}>${icon}<span>${escapeHtml(label)}</span></button>`;
}

function allNavigationItems(vm){
  const source=[...vm.navigation.primary,...vm.navigation.context,...vm.navigation.tools];
  const map=new Map();
  for(const item of source){if(item?.key&&!map.has(item.key))map.set(item.key,item);}
  return map;
}

function settingsAreaForRole(role){
  return role==='admin'?'admin-configuracion':'ajustes';
}

function groupedNavigation(vm){
  const map=allNavigationItems(vm);
  map.delete(settingsAreaForRole(vm.identity.role));
  const groups=ROLE_NAV_GROUPS[vm.identity.role]||[];
  const used=new Set();
  const markup=groups.map((group)=>{
    const items=group.keys.map((key)=>map.get(key)).filter(Boolean);
    items.forEach((item)=>used.add(item.key));
    if(!items.length)return '';
    return `<section class="m26-nav-group"><h2>${escapeHtml(tx(group.labelKey,group.labelKey))}</h2><div>${items.map((item)=>{
      const needsClient=vm.identity.role==='coach'&&!vm.selectedClient&&['selected-client','client-context'].includes(String(item.scope||''));
      return navItem(item,vm.activeArea,{disabled:needsClient});
    }).join('')}</div></section>`;
  }).join('');
  const remaining=[...map.values()].filter((item)=>!used.has(item.key));
  return markup+(remaining.length?`<section class="m26-nav-group"><h2>${escapeHtml(tx('common.allTools','Todas las herramientas'))}</h2><div>${remaining.map((item)=>navItem(item,vm.activeArea)).join('')}</div></section>`:'');
}

function clientSelector(vm) {
  if(String(vm?.identity?.role||'')==='client')return '';
  if (!vm.selectedClient && !vm.canChangeClient) return '';
  if (!vm.canChangeClient) {
    return `<div class="m26-client-context"><span>${escapeHtml(tx('common.selectedClient','Expediente activo'))}</span><strong>${escapeHtml(vm.selectedClient?.name || tx('common.noClient','Sin expediente disponible'))}</strong>${vm.selectedClient?.modality ? `<small>${escapeHtml(vm.selectedClient.modality)}</small>` : ''}</div>`;
  }
  const options = vm.clientOptions.map((client) => `<option value="${escapeHtml(client.id)}"${client.id === vm.selectedClient?.id ? ' selected' : ''}>${escapeHtml(client.name)}</option>`).join('');
  return `<label class="m26-client-selector"><span>${escapeHtml(tx('common.selectedClient','Expediente activo'))}</span><select data-m26-client-select aria-label="${escapeHtml(tx('common.selectClient','Seleccionar expediente'))}"><option value="">${escapeHtml(tx('common.selectClient','Selecciona un cliente'))}</option>${options}</select></label>`;
}

function coachProductivityShell(vm){
  if(!['coach','admin'].includes(String(vm.identity?.role||'')))return Object.freeze({launcher:'',palette:''});
  const launcher=`<button type="button" class="m26-coach-command-launcher" data-coach-command-open aria-haspopup="dialog"><span>${escapeHtml(tx('common.search','Buscar y acciones'))}</span><kbd aria-hidden="true">Ctrl/⌘ K</kbd></button>`;
  const palette=`<section class="m26-coach-command-backdrop" data-coach-command-palette role="dialog" aria-modal="true" aria-labelledby="m26-coach-command-title" hidden><div class="m26-coach-command-dialog"><header class="m26-coach-command-header"><div><p class="m26-eyebrow">IBERFIT</p><h2 id="m26-coach-command-title">${escapeHtml(tx('common.search','Buscar y abrir'))}</h2></div><button type="button" class="m26-icon-button" data-coach-command-close aria-label="${escapeHtml(tx('common.close','Cerrar'))}">${escapeHtml(tx('common.close','Cerrar'))}</button></header><label class="m26-coach-command-search">${escapeHtml(tx('common.search','Buscar'))}<input type="search" data-coach-command-search autocomplete="off" spellcheck="false" aria-describedby="m26-coach-command-status"></label><p id="m26-coach-command-status" data-coach-command-status class="m26-coach-command-status" role="status" aria-live="polite"></p>${String(vm.identity?.role||'')==='coach'?'<p class="m26-coach-command-insights" data-coach-command-insights>El tiempo de estos atajos se medirá solo en este dispositivo, sin guardar nombres ni datos de salud.</p>':''}<div class="m26-coach-command-results" data-coach-command-results></div></div></section>`;
  return Object.freeze({launcher,palette});
}

function operationStatus(operations) {
  if(!operations?.pending&&!operations?.conflicts&&!operations?.rejected)return '';
  const labels = [];
  if (operations.pending) labels.push(tx(`shell.operations.pending.${operations.pending===1?'one':'other'}`,`${operations.pending} pendiente${operations.pending === 1 ? '' : 's'}`,{count:operations.pending}));
  if (operations.conflicts) labels.push(tx(`shell.operations.conflicts.${operations.conflicts===1?'one':'other'}`,`${operations.conflicts} conflicto${operations.conflicts === 1 ? '' : 's'}`,{count:operations.conflicts}));
  if (operations.rejected) labels.push(tx(`shell.operations.rejected.${operations.rejected===1?'one':'other'}`,`${operations.rejected} por revisar`,{count:operations.rejected}));
  const text = labels.length ? labels.join(' · ') : tx('common.pendingClear','Sin cambios locales pendientes');
  return `<div class="m26-operation-status is-${escapeHtml(operations.kind)}" role="status" aria-live="polite" aria-atomic="true"><span class="m26-status-dot" aria-hidden="true"></span><span>${escapeHtml(text)}</span></div>`;
}

function settingsMenu(vm){
  const languageOptions=(vm.languageOptions||[]).map((item)=>{
    const active=item.value===vm.language;
    return `<label class="m26-language-option${active?' is-active':''}"><input type="radio" name="m26-ui-language" value="${escapeHtml(item.value)}" data-m26-ui-language${active?' checked':''}><span class="m26-language-flag" aria-hidden="true">${escapeHtml(item.flag||'')}</span><span><strong>${escapeHtml(item.label)}</strong><small>${active?'✓':''}</small></span></label>`;
  }).join('');
  const localeOptions=(vm.localeOptions||[]).map((item)=>`<option value="${escapeHtml(item.value)}"${item.value===vm.locale?' selected':''}>${escapeHtml(item.label)}</option>`).join('');
  const settingsArea=settingsAreaForRole(vm.identity.role);
  return `<details class="m26-settings-menu"><summary class="m26-icon-button m26-settings-trigger" aria-label="${escapeHtml(tx('settings.open','Ajustes'))}"><span class="m26-settings-trigger-icon" aria-hidden="true">${renderIberfitIcon(areaIconName(settingsArea),{className:'m26-nav-icon'})}</span><span class="m26-settings-trigger-label">${escapeHtml(tx('settings.open','Ajustes'))}</span></summary><section class="m26-settings-popover"><header><p class="m26-eyebrow">IBERFIT</p><h2>${escapeHtml(tx('settings.title','Ajustes'))}</h2><p>${escapeHtml(tx('settings.subtitle','Personaliza tu experiencia IBERFIT'))}</p></header><div class="m26-settings-block"><div><strong>${escapeHtml(tx('settings.language','Idioma de la aplicación'))}</strong><p>${escapeHtml(tx('settings.languageCopy','Elige el idioma de la aplicación.'))}</p></div><div class="m26-language-grid" role="radiogroup" aria-label="${escapeHtml(tx('settings.language','Idioma'))}">${languageOptions}</div></div><div class="m26-settings-block"><label><strong>${escapeHtml(tx('settings.region','Región y formato'))}</strong><small>${escapeHtml(tx('settings.regionCopy','Ajusta formatos regionales.'))}</small><select data-m26-ui-locale>${localeOptions}</select></label></div><p class="m26-settings-hint">${escapeHtml(tx('settings.savedLocal','La preferencia se guarda en este dispositivo.'))}</p><button type="button" class="m26-primary-action" data-m26-area="${escapeHtml(settingsArea)}">${escapeHtml(tx('settings.fullSettings','Abrir todos los ajustes'))}</button></section></details>`;
}

function sidebarAccount(vm){
  const identityRoleLabel=tx(`shell.role.${vm.identity.role}`,vm.identity.roleLabel);
  const guide=String(vm?.identity?.role||'')==='client'
    ?`<button type="button" class="m26-sidebar-guide" data-m26-client-context-guide-open aria-label="Abrir guía contextual de esta pantalla">Guía IBERFIT</button>`
    :'';
  return `<div class="m26-sidebar-footer">
    <div class="m26-sidebar-identity">
      <span>${escapeHtml(identityRoleLabel)}</span>
      <strong>${escapeHtml(vm.identity.name)}</strong>
    </div>
    ${guide}
    ${settingsMenu(vm)}
    <button type="button" class="m26-sidebar-logout" data-m26-action="logout">${escapeHtml(tx('common.logout','Cerrar sesión'))}</button>
  </div>`;
}

const QUICK_ACTIONS=Object.freeze({
  admin:Object.freeze([
    Object.freeze({area:'admin-clientes',title:'workspace.action.clients',copy:'workspace.action.clients.copy'}),
    Object.freeze({area:'admin-agenda',title:'workspace.action.agenda',copy:'workspace.action.agenda.copy'}),
    Object.freeze({area:'admin-equipo',title:'workspace.action.team',copy:'workspace.action.team.copy'}),
    Object.freeze({area:'admin-analitica',title:'workspace.action.analytics',copy:'workspace.action.analytics.copy'}),
  ]),
  coach:Object.freeze([
    Object.freeze({area:'clientes',title:'workspace.action.clients',copy:'workspace.action.clients.copy'}),
    Object.freeze({area:'agenda',title:'workspace.action.agenda',copy:'workspace.action.agenda.copy'}),
    Object.freeze({area:'planificacion',title:'workspace.action.plan',copy:'workspace.action.plan.copy',client:true}),
    Object.freeze({area:'mensajes',title:'workspace.action.messages',copy:'workspace.action.messages.copy'}),
  ]),
});

function workspaceHome(vm){
  const role=vm.identity.role;
  const visible=role==='admin'?vm.activeArea==='admin-inicio':role==='coach'&&vm.activeArea==='hoy';
  if(!visible)return '';
  const isAdmin=role==='admin';
  const actions=QUICK_ACTIONS[role]||[];
  const cards=actions.map((action)=>{
    const blocked=Boolean(action.client&&!vm.selectedClient);
    return `<button type="button" class="m26-workspace-action"${blocked?' disabled aria-disabled="true"':` data-m26-area="${escapeHtml(action.area)}"`}><span class="m26-workspace-action-icon">${renderIberfitIcon(areaIconName(action.area),{className:'m26-nav-icon'})}</span><span><strong>${escapeHtml(tx(action.title,action.area))}</strong><small>${escapeHtml(blocked?tx('common.clientRequired','Selecciona un cliente para continuar'):tx(action.copy,''))}</small></span><b aria-hidden="true">→</b></button>`;
  }).join('');
  const shortcuts=isAdmin
    ?`<div class="m26-workspace-section-title"><strong>${escapeHtml(tx('workspace.admin.primary','Acceso rápido'))}</strong></div><div class="m26-workspace-actions">${cards}</div>`
    :`<details class="m26-workspace-shortcuts" data-m26-workspace-shortcuts="coach"><summary><strong>${escapeHtml(tx('workspace.coach.primary','Atajos de trabajo'))}</strong><span class="m26-workspace-shortcuts-toggle" aria-hidden="true">＋</span></summary><div class="m26-workspace-actions">${cards}</div></details>`;
  const hero=isAdmin
    ?`<div class="m26-workspace-hero"><div><p class="m26-eyebrow">${escapeHtml(tx('workspace.admin.eyebrow','IBERFIT'))}</p><h2>${escapeHtml(tx('workspace.admin.title','IBERFIT'))}</h2><p>${escapeHtml(tx('workspace.admin.copy',''))}</p></div><img src="/public/isotipo-iberfit.png" alt="" aria-hidden="true"></div>`
    :'';
  return `<section class="m26-workspace-home" aria-label="${escapeHtml(tx(isAdmin?'workspace.admin.eyebrow':'workspace.coach.eyebrow','Centro de trabajo'))}" data-m26-workspace-role="${escapeHtml(role)}">${hero}${shortcuts}</section>`;
}

function shellStyles(){return '';}

export function renderM26AccessFrame(vm) {
  applyIberfitDocumentLanguage();
  const isError=vm.hydration?.status==='error';
  const state=isError?'error':'loading';
  const statusCopy=isError
    ? tx('shell.access.error','No se pudo confirmar la identidad y los permisos.')
    : tx('shell.access.confirming','Confirmando identidad y permisos…');
  return `<main class="m26-access-frame" data-ux-state="${state}" aria-busy="${isError?'false':'true'}"><section><p class="m26-eyebrow">IBERFIT</p><h1>${escapeHtml(tx('shell.access.title','Entrenamiento personal con criterio'))}</h1><p>${escapeHtml(tx('shell.access.subtitle','Diagnóstico, planificación, control y seguimiento.'))}</p><div class="m26-access-status" role="${isError?'alert':'status'}" aria-live="${isError?'assertive':'polite'}" aria-atomic="true">${escapeHtml(statusCopy)}</div></section></main>`;
}

function renderM26ShellBase(vm, routeMarkup = '') {
  if (vm.mode !== 'authenticated') return renderM26AccessFrame(vm);
  applyIberfitDocumentLanguage(vm.language);
  const routeContent = routeMarkup || `<section class="m26-route-placeholder" data-content-state="empty" role="status" aria-live="polite"><p class="m26-eyebrow">${escapeHtml(areaText(vm.page,'label'))}</p><h2>${escapeHtml(areaText(vm.page,'title'))}</h2></section>`;
  const allMobileItems = [...vm.navigation.primary, ...vm.navigation.context, ...vm.navigation.tools].filter((item, index, items) => items.findIndex((candidate) => candidate.key === item.key) === index);
  const quickMobileItems = vm.navigation.mobile.slice(0, 4);
  const moreMobileItems = allMobileItems.filter((item) => !quickMobileItems.some((quick) => quick.key === item.key));
  const mobileMoreActive=moreMobileItems.some((item)=>item.key===vm.activeArea);
  const mobileAccountSlot='<div class="m26-mobile-more-account"></div>';
  const mobileMore = moreMobileItems.length ? `<details class="m26-mobile-more${mobileMoreActive?' is-active':''}"${mobileMoreActive?' data-m26-more-active="true"':''}><summary aria-expanded="false" aria-controls="m26-mobile-more-menu" aria-haspopup="menu">${escapeHtml(tx('common.more','Más'))}</summary><div id="m26-mobile-more-menu" class="m26-mobile-more-menu" role="menu">${moreMobileItems.map((item) => navItem(item, vm.activeArea)).join('')}${mobileAccountSlot}</div></details>` : '';
  const productivity=coachProductivityShell(vm);
  const pageTitle=tx(`area.${vm.activeArea}.label`,vm.page.label);
  const workspace=workspaceHome(vm);
  const coachToday=vm.identity?.role==='coach'&&vm.activeArea==='hoy';
  const mainContent=coachToday?`${routeContent}${workspace}`:`${workspace}${routeContent}`;

  return `${shellStyles()}<div class="m26-shell" data-m26-role="${escapeHtml(vm.identity.role)}"><a class="m26-skip-link" href="#m26-main">${escapeHtml(tx('shell.skipToContent','Saltar al contenido'))}</a>
    <aside class="m26-sidebar" aria-label="${escapeHtml(tx('shell.accessibility.navigation','Navegación IBERFIT'))}">
      <div class="m26-brand"><img src="/public/isotipo-iberfit.png" alt="" aria-hidden="true"><div><strong>IBERFIT</strong><span>${escapeHtml(tx('shell.product','Entrenamiento personal con criterio'))}</span></div></div>
      <div class="m26-sidebar-navigation">${groupedNavigation(vm)}</div>
      ${sidebarAccount(vm)}
    </aside>
    <section class="m26-workspace">
      <header class="m26-topbar">
        <div class="m26-topbar-heading"><h1 id="m26-page-title">${escapeHtml(pageTitle)}</h1></div>
        <div class="m26-topbar-actions">${productivity.launcher}${clientSelector(vm)}${operationStatus(vm.operations)}</div>
      </header>
      <main id="m26-main" class="m26-main" tabindex="-1" aria-labelledby="m26-page-title">${mainContent}</main>
      <nav class="m26-mobile-nav" aria-label="IBERFIT">${quickMobileItems.map((item) => navItem(item, vm.activeArea)).join('')}${mobileMore}</nav>
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