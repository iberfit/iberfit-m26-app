import {enhanceAdminShellMarkup} from '../admin/shell-enhancer.js';
import {enhanceRc39ShellMarkup} from '../rc39/shell-enhancer.js';
import {areaIconName,renderIberfitIcon} from '../design/icons.js';
import {applyIberfitDocumentLanguage,iberfitTranslate} from '../ui/i18n.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function tx(key,fallback=''){
  return iberfitTranslate(key,{fallback});
}

const ROLE_NAV_GROUPS=Object.freeze({
  admin:Object.freeze([
    Object.freeze({labelKey:'nav.admin.direction',keys:Object.freeze(['admin-inicio','admin-analitica'])}),
    Object.freeze({labelKey:'nav.admin.people',keys:Object.freeze(['admin-usuarios','admin-equipo','admin-clientes','admin-agenda'])}),
    Object.freeze({labelKey:'nav.admin.operation',keys:Object.freeze(['admin-operaciones','admin-comunicacion','admin-automatizaciones'])}),
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

function groupedNavigation(vm){
  const map=allNavigationItems(vm);
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
  const palette=`<section class="m26-coach-command-backdrop" data-coach-command-palette role="dialog" aria-modal="true" aria-labelledby="m26-coach-command-title" hidden><div class="m26-coach-command-dialog"><header class="m26-coach-command-header"><div><p class="m26-eyebrow">IBERFIT</p><h2 id="m26-coach-command-title">${escapeHtml(tx('common.search','Buscar y abrir'))}</h2></div><button type="button" class="m26-icon-button" data-coach-command-close aria-label="${escapeHtml(tx('common.close','Cerrar'))}">${escapeHtml(tx('common.close','Cerrar'))}</button></header><label class="m26-coach-command-search">${escapeHtml(tx('common.search','Buscar'))}<input type="search" data-coach-command-search autocomplete="off" spellcheck="false" aria-describedby="m26-coach-command-status"></label><p id="m26-coach-command-status" data-coach-command-status class="m26-coach-command-status" role="status" aria-live="polite"></p><div class="m26-coach-command-results" data-coach-command-results></div></div></section>`;
  return Object.freeze({launcher,palette});
}

function operationStatus(operations) {
  const labels = [];
  if (operations.pending) labels.push(`${operations.pending} pendiente${operations.pending === 1 ? '' : 's'}`);
  if (operations.conflicts) labels.push(`${operations.conflicts} conflicto${operations.conflicts === 1 ? '' : 's'}`);
  if (operations.rejected) labels.push(`${operations.rejected} por revisar`);
  const text = labels.length ? labels.join(' · ') : tx('common.pendingClear','Sin cambios locales pendientes');
  return `<div class="m26-operation-status is-${escapeHtml(operations.kind)}" role="status" aria-live="polite" aria-atomic="true"><span class="m26-status-dot" aria-hidden="true"></span><span>${escapeHtml(text)}</span></div>`;
}

function settingsMenu(vm){
  const languageOptions=(vm.languageOptions||[]).map((item)=>{
    const active=item.value===vm.language;
    return `<label class="m26-language-option${active?' is-active':''}"><input type="radio" name="m26-ui-language" value="${escapeHtml(item.value)}" data-m26-ui-language${active?' checked':''}><span class="m26-language-flag" aria-hidden="true">${escapeHtml(item.flag||'')}</span><span><strong>${escapeHtml(item.label)}</strong><small>${active?'✓':''}</small></span></label>`;
  }).join('');
  const localeOptions=(vm.localeOptions||[]).map((item)=>`<option value="${escapeHtml(item.value)}"${item.value===vm.locale?' selected':''}>${escapeHtml(item.label)}</option>`).join('');
  const settingsArea=vm.identity.role==='admin'?'admin-configuracion':'ajustes';
  return `<details class="m26-settings-menu"><summary class="m26-icon-button" aria-label="${escapeHtml(tx('settings.open','Ajustes'))}"><span aria-hidden="true">⚙</span><span>${escapeHtml(tx('settings.open','Ajustes'))}</span><span class="m26-language-mini">${escapeHtml((vm.languageOptions||[]).find((item)=>item.value===vm.language)?.flag||'')}</span></summary><section class="m26-settings-popover"><header><p class="m26-eyebrow">IBERFIT</p><h2>${escapeHtml(tx('settings.title','Ajustes'))}</h2><p>${escapeHtml(tx('settings.subtitle','Personaliza tu experiencia IBERFIT'))}</p></header><div class="m26-settings-block"><div><strong>${escapeHtml(tx('settings.language','Idioma de la aplicación'))}</strong><p>${escapeHtml(tx('settings.languageCopy','Elige el idioma de la aplicación.'))}</p></div><div class="m26-language-grid" role="radiogroup" aria-label="${escapeHtml(tx('settings.language','Idioma'))}">${languageOptions}</div></div><div class="m26-settings-block"><label><strong>${escapeHtml(tx('settings.region','Región y formato'))}</strong><small>${escapeHtml(tx('settings.regionCopy','Ajusta formatos regionales.'))}</small><select data-m26-ui-locale>${localeOptions}</select></label></div><p class="m26-settings-hint">${escapeHtml(tx('settings.savedLocal','La preferencia se guarda en este dispositivo.'))}</p><button type="button" class="m26-primary-action" data-m26-area="${escapeHtml(settingsArea)}">${escapeHtml(tx('settings.fullSettings','Abrir todos los ajustes'))}</button></section></details>`;
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
  return `<section class="m26-workspace-home" aria-label="${escapeHtml(tx(isAdmin?'workspace.admin.eyebrow':'workspace.coach.eyebrow','Centro de trabajo'))}"><div class="m26-workspace-hero"><div><p class="m26-eyebrow">${escapeHtml(tx(isAdmin?'workspace.admin.eyebrow':'workspace.coach.eyebrow','IBERFIT'))}</p><h2>${escapeHtml(tx(isAdmin?'workspace.admin.title':'workspace.coach.title','IBERFIT'))}</h2><p>${escapeHtml(tx(isAdmin?'workspace.admin.copy':'workspace.coach.copy',''))}</p></div><img src="/public/isotipo-iberfit.png" alt="" aria-hidden="true"></div><div class="m26-workspace-section-title"><strong>${escapeHtml(tx(isAdmin?'workspace.admin.primary':'workspace.coach.primary','Acceso rápido'))}</strong></div><div class="m26-workspace-actions">${cards}</div></section>`;
}

function shellStyles(){
  return `<style data-m26-workspace-v2>
  .m26-shell{--m26-v2-gold:#d6b66d;--m26-v2-cream:#f7f1e4;--m26-v2-green:#0e2d20;--m26-v2-green-2:#153b2b;--m26-v2-line:rgba(214,182,109,.2)}
  .m26-sidebar{overflow-y:auto;scrollbar-width:thin}
  .m26-nav-group{margin:.25rem 0 1rem}.m26-nav-group h2{margin:.35rem .65rem .45rem;color:rgba(247,241,228,.58);font-size:.69rem;letter-spacing:.11em;text-transform:uppercase;font-weight:760}
  .m26-nav-group>div{display:grid;gap:.18rem}.m26-nav-item{border-radius:.8rem;transition:background .16s ease,color .16s ease,transform .16s ease}.m26-nav-item:hover:not(:disabled){transform:translateX(2px)}.m26-nav-item.is-disabled{opacity:.38;cursor:not-allowed}.m26-nav-item.is-active{box-shadow:inset 3px 0 0 var(--m26-v2-gold)}
  .m26-topbar{position:sticky;top:0;z-index:20;backdrop-filter:blur(18px);background:color-mix(in srgb,#07150f 88%,transparent);border-bottom:1px solid rgba(214,182,109,.12)}
  .m26-topbar-actions{align-items:center}.m26-settings-menu{position:relative}.m26-settings-menu>summary{list-style:none;display:flex;align-items:center;gap:.45rem}.m26-settings-menu>summary::-webkit-details-marker{display:none}.m26-language-mini{font-size:1.05rem}
  .m26-settings-popover{position:absolute;right:0;top:calc(100% + .65rem);width:min(31rem,calc(100vw - 2rem));max-height:min(78vh,44rem);overflow:auto;padding:1.1rem;border:1px solid rgba(214,182,109,.24);border-radius:1.1rem;background:#0c2419;box-shadow:0 24px 70px rgba(0,0,0,.42);z-index:80}.m26-settings-popover header h2{margin:.2rem 0 .3rem}.m26-settings-popover header p:last-child{margin:.25rem 0 0;color:rgba(247,241,228,.68)}
  .m26-settings-block{display:grid;gap:.75rem;padding:1rem 0;border-top:1px solid rgba(214,182,109,.14)}.m26-settings-block:first-of-type{margin-top:.85rem}.m26-settings-block p{margin:.2rem 0 0;color:rgba(247,241,228,.64);font-size:.86rem}.m26-language-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem}.m26-language-option{position:relative;display:flex;align-items:center;gap:.65rem;min-height:4.25rem;padding:.7rem;border:1px solid rgba(214,182,109,.16);border-radius:.85rem;background:rgba(255,255,255,.025);cursor:pointer}.m26-language-option:hover{border-color:rgba(214,182,109,.42);background:rgba(214,182,109,.06)}.m26-language-option.is-active{border-color:rgba(214,182,109,.62);background:rgba(214,182,109,.1)}.m26-language-option input{position:absolute;opacity:0;pointer-events:none}.m26-language-flag{font-size:1.55rem;line-height:1}.m26-language-option>span:last-child{display:flex;justify-content:space-between;align-items:center;gap:.5rem;min-width:0;flex:1}.m26-language-option small{color:var(--m26-v2-gold);font-weight:800}.m26-settings-block label{display:grid;gap:.5rem}.m26-settings-block label small{color:rgba(247,241,228,.64)}.m26-settings-block select{min-height:44px;padding:.6rem .75rem;border:1px solid rgba(214,182,109,.18);border-radius:.75rem;color:var(--m26-v2-cream);background:#071b13}.m26-settings-hint{color:rgba(247,241,228,.55);font-size:.78rem}
  .m26-workspace-home{display:grid;gap:1rem;margin:0 0 1.15rem}.m26-workspace-hero{position:relative;overflow:hidden;display:flex;justify-content:space-between;gap:1rem;padding:clamp(1.2rem,2vw,1.75rem);border:1px solid rgba(214,182,109,.2);border-radius:1.25rem;background:linear-gradient(135deg,rgba(214,182,109,.11),rgba(21,59,43,.7))}.m26-workspace-hero:after{content:"";position:absolute;right:-6rem;top:-7rem;width:18rem;height:18rem;border-radius:50%;background:radial-gradient(circle,rgba(214,182,109,.14),transparent 68%);pointer-events:none}.m26-workspace-hero h2{max-width:24ch;margin:.22rem 0 .45rem;font-family:Georgia,"Times New Roman",serif;font-size:clamp(1.65rem,3vw,2.35rem);font-weight:560;line-height:1.08}.m26-workspace-hero p:last-child{max-width:66ch;margin:0;color:rgba(247,241,228,.74);line-height:1.55}.m26-workspace-hero img{width:4rem;height:4rem;object-fit:contain;opacity:.88}.m26-workspace-section-title{display:flex;align-items:center;justify-content:space-between;color:rgba(247,241,228,.78);font-size:.82rem;text-transform:uppercase;letter-spacing:.09em}.m26-workspace-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem}.m26-workspace-action{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:.75rem;text-align:left;padding:1rem;border:1px solid rgba(214,182,109,.16);border-radius:1rem;color:var(--m26-v2-cream);background:rgba(13,45,31,.52);cursor:pointer;min-height:8.5rem}.m26-workspace-action:hover:not(:disabled){border-color:rgba(214,182,109,.45);background:rgba(214,182,109,.07);transform:translateY(-1px)}.m26-workspace-action:disabled{opacity:.42;cursor:not-allowed}.m26-workspace-action-icon{display:grid;place-items:center;width:2.1rem;height:2.1rem;border-radius:.65rem;color:var(--m26-v2-gold);background:rgba(214,182,109,.1)}.m26-workspace-action span:nth-child(2){display:grid;gap:.35rem}.m26-workspace-action strong{font-size:.95rem}.m26-workspace-action small{color:rgba(247,241,228,.62);line-height:1.4}.m26-workspace-action b{color:var(--m26-v2-gold);font-size:1.1rem}
  @media(max-width:1180px){.m26-workspace-actions{grid-template-columns:repeat(2,minmax(0,1fr))}.m26-settings-menu>summary>span:nth-child(2){display:none}}
  @media(max-width:720px){.m26-workspace-actions{grid-template-columns:1fr}.m26-workspace-action{min-height:0}.m26-workspace-hero img{width:3rem;height:3rem}.m26-language-grid{grid-template-columns:1fr}.m26-settings-popover{position:fixed;left:1rem;right:1rem;top:4.5rem;width:auto}.m26-topbar-actions .m26-danger-action{display:none}}
  </style>`;
}

export function renderM26AccessFrame(vm) {
  const state = vm.hydration?.status === 'error' ? 'No fue posible confirmar el acceso.' : 'Confirmando identidad y permisos…';
  return `<main class="m26-access-frame" aria-busy="${vm.hydration?.status==='error'?'false':'true'}"><section><img src="/public/isotipo-iberfit.png" alt="" class="m26-access-mark"><p class="m26-eyebrow">IBERFIT</p><h1>Entrenamiento personal con criterio</h1><p>Diagnóstico, planificación, control y seguimiento.</p><div class="m26-access-status" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(state)}</div></section></main>`;
}

function renderM26ShellBase(vm, routeMarkup = '') {
  if (vm.mode !== 'authenticated') return renderM26AccessFrame(vm);
  applyIberfitDocumentLanguage(vm.language);
  const routeContent = routeMarkup || `<section class="m26-route-placeholder" aria-live="polite"><p class="m26-eyebrow">${escapeHtml(areaText(vm.page,'label'))}</p><h2>${escapeHtml(areaText(vm.page,'title'))}</h2></section>`;
  const allMobileItems = [...vm.navigation.primary, ...vm.navigation.context, ...vm.navigation.tools].filter((item, index, items) => items.findIndex((candidate) => candidate.key === item.key) === index);
  const quickMobileItems = vm.navigation.mobile.slice(0, 4);
  const moreMobileItems = allMobileItems.filter((item) => !quickMobileItems.some((quick) => quick.key === item.key));
  const mobileMore = moreMobileItems.length ? `<details class="m26-mobile-more"><summary>${escapeHtml(tx('common.more','Más'))}</summary><div class="m26-mobile-more-menu">${moreMobileItems.map((item) => navItem(item, vm.activeArea)).join('')}</div></details>` : '';
  const productivity=coachProductivityShell(vm);
  const pageTitle=tx(`area.${vm.activeArea}.title`,vm.page.title);

  return `${shellStyles()}<div class="m26-shell" data-m26-role="${escapeHtml(vm.identity.role)}"><a class="m26-skip-link" href="#m26-main">Saltar al contenido</a>
    <aside class="m26-sidebar" aria-label="IBERFIT">
      <div class="m26-brand"><img src="/public/isotipo-iberfit.png" alt="" aria-hidden="true"><div><strong>IBERFIT</strong><span>Entrenamiento personal con criterio</span></div></div>
      ${groupedNavigation(vm)}
      <div class="m26-sidebar-footer"><span>${escapeHtml(vm.identity.roleLabel)}</span><strong>${escapeHtml(vm.identity.name)}</strong></div>
    </aside>
    <section class="m26-workspace">
      <header class="m26-topbar">
        <div><p class="m26-eyebrow">${escapeHtml(vm.identity.roleLabel)}</p><h1 id="m26-page-title">${escapeHtml(pageTitle)}</h1></div>
        <div class="m26-topbar-actions">${productivity.launcher}${clientSelector(vm)}${operationStatus(vm.operations)}${settingsMenu(vm)}<button type="button" class="m26-icon-button" data-m26-action="logout">${escapeHtml(tx('common.logout','Cerrar sesión'))}</button><button type="button" class="m26-danger-action" data-m26-action="logout-clear-device">${escapeHtml(tx('common.logoutClear','Cerrar sesión y borrar datos de este dispositivo'))}</button></div>
      </header>
      <main id="m26-main" class="m26-main" tabindex="-1" aria-labelledby="m26-page-title">${workspaceHome(vm)}${routeContent}</main>
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
