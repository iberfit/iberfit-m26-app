import {roleApplicationLabel} from './multi-role.js';
import {enhanceCoachLaunchSelfMarkup} from './route-render.js';

const escape=(value)=>String(value??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');

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
  .m26-main { scroll-padding-bottom: calc(5rem + env(safe-area-inset-bottom)); }
  .m26-main :is(input,textarea,select,[contenteditable="true"]) { scroll-margin-bottom: calc(6.5rem + env(safe-area-inset-bottom)); }
  .m26-shell:has(.m26-main :is(input,textarea,select,[contenteditable="true"]):focus) .m26-mobile-nav { transform: translateY(calc(100% + env(safe-area-inset-bottom))); opacity: 0; pointer-events: none; }
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

export function enhanceRc39ShellMarkup(markup,vm){
  if(vm?.mode!=='authenticated')return markup;
  let out=String(markup||'');
  if(vm.identity?.role==='coach'&&vm.activeArea==='hoy'&&vm.coachLaunchJourney){
    out=enhanceCoachLaunchSelfMarkup(out,vm);
  }
  out=enhanceMobileNavigationMarkup(out,vm);
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