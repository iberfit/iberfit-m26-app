import {roleApplicationLabel} from './multi-role.js';
import {enhanceCoachLaunchSelfMarkup} from './route-render.js';

const escape=(value)=>String(value??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');

const SHELL_DISCLOSURE_SELECTOR='.m26-mobile-more[open],.m26-settings-menu[open],.m26-role-switcher[open]';
const SHELL_DISCLOSURE_BOUND_DOCUMENTS=new WeakSet();
const COACH_COMMAND_BOUND_DOCUMENTS=new WeakSet();
const COACH_COMMAND_CONTEXTS=new WeakMap();
const COACH_COMMAND_LIMIT=12;

function queueFocus(callback){
  if(typeof globalThis.queueMicrotask==='function')globalThis.queueMicrotask(callback);
  else callback();
}

function closeDetailsDisclosure(details,{restoreFocus=true}={}){
  if(!details)return false;
  details.removeAttribute?.('open');
  if(restoreFocus){
    queueFocus(()=>details.querySelector?.('summary')?.focus?.({preventScroll:true}));
  }
  return true;
}

export function dismissOpenMobileOverflow(documentLike,{restoreFocus=true}={}){
  return closeDetailsDisclosure(
    documentLike?.querySelector?.('.m26-mobile-more[open]'),
    {restoreFocus},
  );
}

export function dismissOpenShellDisclosure(documentLike,{restoreFocus=true}={}){
  return closeDetailsDisclosure(
    documentLike?.querySelector?.(SHELL_DISCLOSURE_SELECTOR),
    {restoreFocus},
  );
}

export function bindShellDisclosureDismissSupport(documentLike=globalThis.document){
  if(!documentLike?.addEventListener||SHELL_DISCLOSURE_BOUND_DOCUMENTS.has(documentLike))return false;
  documentLike.addEventListener('keydown',(event)=>{
    if(event?.key!=='Escape')return;
    if(dismissOpenShellDisclosure(documentLike))event.preventDefault?.();
  });
  documentLike.addEventListener('click',(event)=>{
    const details=documentLike?.querySelector?.(SHELL_DISCLOSURE_SELECTOR);
    if(!details)return;
    if(typeof details.contains==='function'&&details.contains(event?.target))return;
    closeDetailsDisclosure(details,{restoreFocus:false});
  });
  SHELL_DISCLOSURE_BOUND_DOCUMENTS.add(documentLike);
  return true;
}

export function bindMobileOverflowEscapeSupport(documentLike=globalThis.document){
  return bindShellDisclosureDismissSupport(documentLike);
}

function normalizeCommandText(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu,'')
    .toLowerCase()
    .trim();
}

function commandScopeLabel(item,vm){
  const scope=String(item?.scope||'global');
  if(scope==='global')return 'Sección';
  const client=vm?.selectedClient?.name;
  return client?`Cliente · ${client}`:'Requiere cliente activo';
}

function commandRouteDisabled(item,vm){
  if(String(vm?.identity?.role||'')!=='coach')return false;
  return !vm?.selectedClient&&['selected-client','client-context'].includes(String(item?.scope||''));
}

export function coachCommandItems(vm,query=''){
  if(vm?.mode!=='authenticated'||!['coach','admin'].includes(String(vm?.identity?.role||'')))return Object.freeze([]);
  const navigation=vm.navigation||{};
  const seen=new Set();
  const items=[];
  for(const item of [...(navigation.primary||[]),...(navigation.context||[]),...(navigation.tools||[])]){
    if(!item?.key||seen.has(item.key))continue;
    seen.add(item.key);
    items.push(Object.freeze({
      type:'area',
      key:`area:${item.key}`,
      area:item.key,
      label:item.label||item.title||item.key,
      detail:commandScopeLabel(item,vm),
      disabled:commandRouteDisabled(item,vm),
    }));
  }
  if(vm.canChangeClient){
    for(const client of vm.clientOptions||[]){
      if(!client?.id)continue;
      items.push(Object.freeze({
        type:'client',
        key:`client:${client.id}`,
        clientId:client.id,
        label:client.name||'Cliente',
        detail:['Cliente',client.modality].filter(Boolean).join(' · '),
        disabled:false,
      }));
    }
  }
  const needle=normalizeCommandText(query);
  const filtered=needle
    ? items.filter((item)=>normalizeCommandText(`${item.label} ${item.detail}`).includes(needle))
    : items;
  if(!needle&&vm.canChangeClient){
    const clients=filtered.filter((item)=>item.type==='client');
    if(clients.length){
      const clientLimit=Math.min(clients.length,Math.max(1,Math.floor(COACH_COMMAND_LIMIT/3)));
      const areas=filtered.filter((item)=>item.type!=='client').slice(0,COACH_COMMAND_LIMIT-clientLimit);
      return Object.freeze([...areas,...clients.slice(0,clientLimit)]);
    }
  }
  return Object.freeze(filtered.slice(0,COACH_COMMAND_LIMIT));
}

function editableCommandTarget(target){
  const tag=String(target?.tagName||'').toLowerCase();
  if(['input','textarea','select'].includes(tag)||target?.isContentEditable)return true;
  return Boolean(target?.closest?.('input,textarea,select,[contenteditable="true"]'));
}

export function shouldOpenCoachCommandShortcut(event){
  const key=String(event?.key||'').toLowerCase();
  return key==='k'
    &&Boolean(event?.ctrlKey||event?.metaKey)
    &&!event?.altKey
    &&!event?.shiftKey
    &&!editableCommandTarget(event?.target);
}

function commandElements(documentLike){
  return {
    launcher:documentLike?.querySelector?.('[data-coach-command-open]')||null,
    palette:documentLike?.querySelector?.('[data-coach-command-palette]')||null,
    search:documentLike?.querySelector?.('[data-coach-command-search]')||null,
    status:documentLike?.querySelector?.('[data-coach-command-status]')||null,
    results:documentLike?.querySelector?.('[data-coach-command-results]')||null,
  };
}

function createCommandResult(documentLike,item){
  const button=documentLike?.createElement?.('button');
  if(!button)return null;
  button.type='button';
  button.className='m26-coach-command-result';
  button.dataset.coachCommandResult='true';
  button.dataset.coachCommandKey=item.key;
  if(item.type==='area')button.dataset.m26Area=item.area;
  if(item.type==='client')button.dataset.m26SelectClient=item.clientId;
  if(item.disabled){
    button.disabled=true;
    button.setAttribute?.('aria-disabled','true');
  }
  const label=documentLike.createElement('span');
  label.textContent=item.label;
  const detail=documentLike.createElement('small');
  detail.textContent=item.detail;
  button.append?.(label,detail);
  return button;
}

export function renderCoachCommandResults(documentLike=globalThis.document,query=''){
  const vm=COACH_COMMAND_CONTEXTS.get(documentLike);
  const {results,status}=commandElements(documentLike);
  if(!vm||!results)return Object.freeze([]);
  const items=coachCommandItems(vm,query);
  const nodes=items.map((item)=>createCommandResult(documentLike,item)).filter(Boolean);
  if(!nodes.length&&documentLike?.createElement){
    const empty=documentLike.createElement('div');
    empty.className='m26-coach-command-empty';
    empty.textContent='No hay resultados disponibles.';
    nodes.push(empty);
  }
  results.replaceChildren?.(...nodes);
  if(status){
    status.textContent=items.length
      ? `${items.length} ${items.length===1?'resultado disponible':'resultados disponibles'}`
      : 'Sin resultados';
  }
  return items;
}

export function openCoachCommandPalette(documentLike=globalThis.document){
  const vm=COACH_COMMAND_CONTEXTS.get(documentLike);
  const {launcher,palette,search}=commandElements(documentLike);
  if(!vm||!launcher||!palette||!search)return false;
  dismissOpenShellDisclosure(documentLike,{restoreFocus:false});
  palette.hidden=false;
  launcher.setAttribute?.('aria-expanded','true');
  search.value='';
  renderCoachCommandResults(documentLike,'');
  queueFocus(()=>search.focus?.({preventScroll:true}));
  return true;
}

export function closeCoachCommandPalette(documentLike=globalThis.document,{restoreFocus=true}={}){
  const {launcher,palette}=commandElements(documentLike);
  if(!palette||palette.hidden)return false;
  palette.hidden=true;
  launcher?.setAttribute?.('aria-expanded','false');
  if(restoreFocus&&launcher)queueFocus(()=>launcher.focus?.({preventScroll:true}));
  return true;
}

function openCommandResultButtons(palette){
  return [...(palette?.querySelectorAll?.('[data-coach-command-result]:not([disabled])')||[])];
}

function focusCommandResult(documentLike,direction){
  const {palette,search}=commandElements(documentLike);
  if(!palette||palette.hidden)return false;
  const buttons=openCommandResultButtons(palette);
  if(!buttons.length)return false;
  const active=documentLike?.activeElement;
  const index=buttons.indexOf(active);
  const next=direction>0
    ? (index<0?0:(index+1)%buttons.length)
    : (index<0?buttons.length-1:(index-1+buttons.length)%buttons.length);
  buttons[next]?.focus?.({preventScroll:true});
  if(active===search&&direction<0)buttons[buttons.length-1]?.focus?.({preventScroll:true});
  return true;
}

function trapCoachCommandTab(documentLike,event){
  const {palette}=commandElements(documentLike);
  if(!palette||palette.hidden)return false;
  const focusables=[...(palette.querySelectorAll?.('[data-coach-command-close],[data-coach-command-search],[data-coach-command-result]:not([disabled])')||[])];
  if(!focusables.length)return false;
  const active=documentLike?.activeElement;
  const first=focusables[0];
  const last=focusables[focusables.length-1];
  if(event?.shiftKey&&active===first){event.preventDefault?.();last.focus?.({preventScroll:true});return true;}
  if(!event?.shiftKey&&active===last){event.preventDefault?.();first.focus?.({preventScroll:true});return true;}
  return false;
}

export function bindCoachCommandPaletteSupport(documentLike=globalThis.document,vm=null){
  if(!documentLike?.addEventListener)return false;
  if(vm)COACH_COMMAND_CONTEXTS.set(documentLike,vm);
  if(COACH_COMMAND_BOUND_DOCUMENTS.has(documentLike))return false;
  documentLike.addEventListener('click',(event)=>{
    const launcher=event?.target?.closest?.('[data-coach-command-open]');
    if(launcher){
      event.preventDefault?.();
      openCoachCommandPalette(documentLike);
      return;
    }
    const close=event?.target?.closest?.('[data-coach-command-close]');
    if(close){
      event.preventDefault?.();
      closeCoachCommandPalette(documentLike);
      return;
    }
    const result=event?.target?.closest?.('[data-coach-command-result]');
    if(result){
      closeCoachCommandPalette(documentLike,{restoreFocus:false});
      return;
    }
    const {palette}=commandElements(documentLike);
    if(palette&&!palette.hidden&&event?.target===palette){
      closeCoachCommandPalette(documentLike);
    }
  });
  documentLike.addEventListener('input',(event)=>{
    const search=event?.target?.closest?.('[data-coach-command-search]');
    if(search)renderCoachCommandResults(documentLike,search.value);
  });
  documentLike.addEventListener('keydown',(event)=>{
    const {palette,search}=commandElements(documentLike);
    const isOpen=Boolean(palette&&!palette.hidden);
    if(isOpen&&event?.key==='Escape'){
      event.preventDefault?.();
      closeCoachCommandPalette(documentLike);
      return;
    }
    if(isOpen&&event?.key==='ArrowDown'){
      if(focusCommandResult(documentLike,1))event.preventDefault?.();
      return;
    }
    if(isOpen&&event?.key==='ArrowUp'){
      if(focusCommandResult(documentLike,-1))event.preventDefault?.();
      return;
    }
    if(isOpen&&event?.key==='Enter'&&event?.target===search){
      const first=openCommandResultButtons(palette)[0];
      if(first){event.preventDefault?.();first.click?.();}
      return;
    }
    if(isOpen&&event?.key==='Tab'){
      trapCoachCommandTab(documentLike,event);
      return;
    }
    if(shouldOpenCoachCommandShortcut(event)){
      event.preventDefault?.();
      openCoachCommandPalette(documentLike);
    }
  });
  COACH_COMMAND_BOUND_DOCUMENTS.add(documentLike);
  return true;
}

const MOBILE_SHELL_POLISH=`
.m26-mobile-more.is-active > summary { color: var(--m26-cream-100); border-color: rgba(228,205,152,.24); background: linear-gradient(135deg, rgba(200,166,93,.19), rgba(200,166,93,.07)); box-shadow: inset 0 -2px 0 rgba(214,182,109,.5); }
.m26-mobile-more-menu .m26-nav-item.is-disabled { opacity: .38; cursor: not-allowed; }
.m26-nav-group.is-active-group > h2 { color: rgba(228,205,152,.9); }
@media (min-width: 901px) {
  .m26-sidebar { position: sticky; top: 0; height: 100dvh; max-height: 100dvh; overscroll-behavior: contain; }
  .m26-nav-group.is-active-group { position: relative; }
}
@media (max-width: 900px) {
  .m26-mobile-nav { padding-bottom: max(.55rem, env(safe-area-inset-bottom)); transition: transform .16s ease, opacity .16s ease; }
  .m26-mobile-nav .m26-nav-item, .m26-mobile-more > summary { min-height: 3.25rem; touch-action: manipulation; }
  .m26-mobile-more-menu { overscroll-behavior: contain; }
  .m26-mobile-more[open] > summary { position: fixed; inset: 0; z-index: 999; min-height: 0; padding: 0; border: 0; border-radius: 0; color: transparent; background: rgba(2,10,7,.58); box-shadow: none; font-size: 0; cursor: pointer; backdrop-filter: blur(2px); }
  .m26-mobile-more[open] > summary:focus-visible { outline: none; }
  .m26-mobile-more[open] .m26-mobile-more-menu { max-height: calc(100dvh - 5.75rem - max(1rem, env(safe-area-inset-top))); overscroll-behavior: contain; -webkit-overflow-scrolling: touch; scrollbar-gutter: stable; }
  .m26-main { scroll-padding-bottom: calc(5rem + env(safe-area-inset-bottom)); }
  .m26-main :is(input,textarea,select,[contenteditable="true"]) { scroll-margin-bottom: calc(6.5rem + env(safe-area-inset-bottom)); }
  .m26-shell:has(.m26-main :is(input,textarea,select,[contenteditable="true"]):focus) .m26-mobile-nav { transform: translateY(calc(100% + env(safe-area-inset-bottom))); opacity: 0; pointer-events: none; }
}
@media (max-width: 580px) {
  .m26-topbar { gap: .65rem; padding: .75rem; }
  .m26-topbar > div:first-child { min-width: 0; }
  .m26-topbar h1 { font-size: clamp(1.35rem, 7vw, 1.75rem); line-height: 1.08; overflow-wrap: anywhere; }
  .m26-topbar-actions { width: 100%; display: grid; grid-template-columns: minmax(0,1fr) auto auto auto; gap: .45rem; align-items: center; justify-content: stretch; }
  .m26-topbar-actions .m26-client-selector, .m26-topbar-actions .m26-client-context { grid-column: 1 / -1; order: -2; width: 100%; max-width: none; min-width: 0; }
  .m26-topbar-actions .m26-coach-command-launcher { grid-column: 1; width: 100%; min-width: 0; max-width: 100%; overflow: hidden; white-space: nowrap; }
  .m26-topbar-actions .m26-coach-command-launcher > span { overflow: hidden; text-overflow: ellipsis; }
  .m26-topbar-actions .m26-coach-command-launcher kbd { display: none; }
  .m26-topbar-actions .m26-settings-menu, .m26-topbar-actions .m26-role-switcher, .m26-topbar-actions [data-m26-action="logout"] { margin: 0; min-width: 0; }
  .m26-topbar-actions [data-m26-action="logout"] { white-space: nowrap; padding-inline: .65rem; font-size: .82rem; }
  .m26-shell[data-m26-role="client"] .m26-topbar-actions { grid-template-columns: minmax(0,1fr) auto auto; }
  .m26-shell[data-m26-role="client"] .m26-topbar-actions .m26-settings-menu { justify-self: end; }
}
@media (prefers-reduced-motion: reduce) {
  .m26-mobile-nav { transition: none; }
}
`;

function roleButtons(vm){
  const roles=vm.identity?.authorizedRoles||[];
  return roles.filter((role)=>['coach','admin'].includes(role)).map((role)=>
    `<button type="button" data-m26-switch-role="${escape(role)}"${role===vm.identity.role?' aria-current="true"':''}><strong>${escape(roleApplicationLabel(role))}</strong><span>${role==='coach'?'Clientes, agenda, planificación y sesiones.':'Usuarios, permisos, auditoría y configuración.'}</span></button>`
  ).join('');
}

function mobileOverflowItems(vm){
  const navigation=vm.navigation||{};
  const source=[...(navigation.primary||[]),...(navigation.context||[]),...(navigation.tools||[])];
  const all=[];
  const seen=new Set();
  for(const item of source){
    if(!item?.key||seen.has(item.key))continue;
    seen.add(item.key);
    all.push(item);
  }
  const quick=new Set((navigation.mobile||[]).slice(0,4).map((item)=>item?.key).filter(Boolean));
  return all.filter((item)=>!quick.has(item.key));
}

function disableMobileContextItem(markup,item){
  const key=String(item?.key||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!key)return markup;
  const matcher=new RegExp(`<button class="m26-nav-item([^\"]*)" type="button" data-m26-area="${key}"(?: aria-current="page")?>`,'g');
  return markup.replace(matcher,'<button class="m26-nav-item$1 is-disabled" type="button" disabled aria-disabled="true">');
}

function enhanceMobileNavigationMarkup(markup,vm){
  let out=String(markup||'');
  const overflow=mobileOverflowItems(vm);
  if(!overflow.length||!out.includes('class="m26-mobile-more"'))return out;
  if(overflow.some((item)=>item.key===vm.activeArea)){
    out=out.replace(
      '<details class="m26-mobile-more"><summary>',
      '<details class="m26-mobile-more is-active" data-m26-more-active="true"><summary>'
    );
  }
  if(vm.identity?.role==='coach'&&!vm.selectedClient){
    for(const item of overflow){
      if(['selected-client','client-context'].includes(String(item.scope||''))){
        out=disableMobileContextItem(out,item);
      }
    }
  }
  return out;
}

function markActiveNavigationGroup(markup){
  return String(markup||'').replace(/<section class="m26-nav-group">[\s\S]*?<\/section>/gu,(section)=>
    section.includes('aria-current="page"')
      ? section.replace('<section class="m26-nav-group">','<section class="m26-nav-group is-active-group">')
      : section
  );
}

function enhanceCoachCommandMarkup(markup){
  let out=String(markup||'');
  out=out.replace(
    'data-coach-command-open aria-haspopup="dialog"',
    'data-coach-command-open aria-haspopup="dialog" aria-controls="m26-coach-command-palette" aria-expanded="false"'
  );
  out=out.replace(
    '<section class="m26-coach-command-backdrop" data-coach-command-palette role="dialog"',
    '<section id="m26-coach-command-palette" class="m26-coach-command-backdrop" data-coach-command-palette role="dialog"'
  );
  return out;
}

export function enhanceRc39ShellMarkup(markup,vm){
  if(vm?.mode!=='authenticated')return markup;
  bindShellDisclosureDismissSupport();
  bindCoachCommandPaletteSupport(globalThis.document,vm);
  let out=String(markup||'');
  if(vm.identity?.role==='coach'&&vm.activeArea==='hoy'&&vm.coachLaunchJourney){
    out=enhanceCoachLaunchSelfMarkup(out,vm);
  }
  out=enhanceMobileNavigationMarkup(out,vm);
  out=enhanceCoachCommandMarkup(out);
  out=markActiveNavigationGroup(out);
  if(out.includes('<style data-m26-workspace-v2>')){
    out=out.replace('</style>',`${MOBILE_SHELL_POLISH}</style>`);
  }
  const switcher=vm.canSwitchApplication?`<details class="m26-role-switcher"><summary>${escape(roleApplicationLabel(vm.identity.role))}</summary><div class="m26-role-switcher-menu" role="menu" aria-label="Cambiar aplicación">${roleButtons(vm)}</div></details>`:'';
  if(switcher){
    out=out.replace(
      /(<button\b[^>]*data-m26-action="logout"[^>]*>)/u,
      `${switcher}$1`
    );
  }
  if(vm.needsRoleChoice){
    out+=`<section class="m26-role-choice" role="dialog" aria-modal="true" aria-labelledby="m26-role-choice-title"><div><p class="m26-eyebrow">IBERFIT</p><h2 id="m26-role-choice-title">¿Cómo quieres acceder?</h2><p>Tu cuenta tiene más de una aplicación autorizada.</p><div class="m26-role-choice-grid">${roleButtons(vm)}</div></div></section>`;
  }
  return out;
}