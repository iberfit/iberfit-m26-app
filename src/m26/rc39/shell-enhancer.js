import {roleApplicationLabel} from './multi-role.js';

const escape=(value)=>String(value??'')
  .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
  .replaceAll('"','&quot;').replaceAll("'",'&#039;');

function roleButtons(vm){
  const roles=vm.identity?.authorizedRoles||[];
  return roles.filter((role)=>['coach','admin'].includes(role)).map((role)=>
    `<button type="button" data-m26-switch-role="${escape(role)}"${role===vm.identity.role?' aria-current="true"':''}><strong>${escape(roleApplicationLabel(role))}</strong><span>${role==='coach'?'Clientes, agenda, planificación y sesiones.':'Usuarios, permisos, auditoría y configuración.'}</span></button>`
  ).join('');
}
export function enhanceRc39ShellMarkup(markup,vm){
  if(vm?.mode!=='authenticated')return markup;
  let out=String(markup||'');
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
