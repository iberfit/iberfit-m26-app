export const M26_NATIVE_WORKSPACE_VERSION='m26-native-workspace-v3';

const STYLE_ID='m26-native-workspace-v3-styles';

const NATIVE_WORKSPACE_CSS=`
.m26-shell{--m26-native-gold:#d8b96f;--m26-native-gold-soft:rgba(216,185,111,.12);--m26-native-cream:#f8f2e7;--m26-native-muted:#b8b3a7;--m26-native-green:#071c13;--m26-native-green-2:#0b281c;--m26-native-line:rgba(216,185,111,.16)}
.m26-topbar{padding:.9rem clamp(1rem,2vw,1.6rem)!important;gap:1rem!important;background:rgba(5,20,13,.93)!important;border-bottom:1px solid var(--m26-native-line)!important;box-shadow:0 8px 30px rgba(0,0,0,.14)}
.m26-topbar>div:first-child{min-width:9.5rem}.m26-topbar>div:first-child .m26-eyebrow{font-size:.65rem;letter-spacing:.16em}.m26-topbar>div:first-child h1{margin:.18rem 0 0!important;font-family:Inter,ui-sans-serif,system-ui,sans-serif!important;font-size:clamp(1.08rem,1.5vw,1.34rem)!important;font-weight:760!important;letter-spacing:-.025em!important;line-height:1.12!important}
.m26-topbar-actions{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:.6rem!important;flex-wrap:nowrap!important;min-width:0!important}
.m26-coach-command-launcher,.m26-client-selector,.m26-operation-status,.m26-settings-menu>summary{min-height:3.35rem!important;border:1px solid var(--m26-native-line)!important;border-radius:1rem!important;background:rgba(255,255,255,.025)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important}
.m26-coach-command-launcher{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:.8rem!important;min-width:9.2rem!important;padding:.58rem .72rem .58rem .9rem!important;color:var(--m26-native-cream)!important;font-weight:720!important}.m26-coach-command-launcher:hover{border-color:rgba(216,185,111,.38)!important;background:rgba(216,185,111,.075)!important}.m26-coach-command-launcher:before{content:'⌕';display:grid;place-items:center;width:1.65rem;height:1.65rem;border-radius:.52rem;color:var(--m26-native-gold);background:var(--m26-native-gold-soft);font-size:1.12rem}.m26-coach-command-launcher kbd{margin-left:auto;padding:.27rem .43rem;border:1px solid rgba(216,185,111,.17);border-radius:.46rem;color:#c9c1b1;background:#04110b;font-size:.66rem;font-weight:700}
.m26-client-selector{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:.2rem!important;min-width:min(25rem,33vw)!important;padding:.47rem .72rem!important}.m26-client-selector>span{color:var(--m26-native-gold)!important;font-size:.62rem!important;font-weight:780!important;letter-spacing:.12em!important;text-transform:uppercase!important}.m26-client-selector select{width:100%!important;min-height:1.8rem!important;padding:0 1.5rem 0 0!important;border:0!important;outline:0!important;color:var(--m26-native-cream)!important;background:transparent!important;font:inherit!important;font-size:.88rem!important;font-weight:690!important}.m26-client-selector select:focus-visible{outline:2px solid rgba(216,185,111,.7)!important;outline-offset:4px!important;border-radius:.3rem!important}.m26-client-selector select[aria-busy='true']{opacity:.64}
.m26-shell[data-m26-client-switching='true'] .m26-client-selector{border-color:rgba(216,185,111,.42)!important;background:rgba(216,185,111,.07)!important}.m26-shell[data-m26-client-switching='true'] .m26-client-selector:after{content:'Abriendo expediente…';color:var(--m26-native-muted);font-size:.65rem}
.m26-operation-status{min-height:3.35rem!important;padding:.55rem .78rem!important;white-space:nowrap!important;color:#c9c4b9!important;font-size:.76rem!important}.m26-status-dot{width:.58rem!important;height:.58rem!important;box-shadow:0 0 0 4px rgba(104,203,151,.08)}
.m26-settings-menu{position:relative!important}.m26-settings-menu>summary{display:flex!important;align-items:center!important;gap:.5rem!important;padding:.55rem .78rem!important;color:var(--m26-native-cream)!important;font-weight:710!important;cursor:pointer!important}.m26-settings-menu>summary:hover{border-color:rgba(216,185,111,.38)!important;background:rgba(216,185,111,.075)!important}.m26-settings-menu>summary>span:first-child{display:grid;place-items:center;width:1.65rem;height:1.65rem;border-radius:.52rem;color:var(--m26-native-gold);background:var(--m26-native-gold-soft)}.m26-language-mini{margin-left:.05rem;padding-left:.45rem;border-left:1px solid var(--m26-native-line);font-size:.84rem!important}
.m26-settings-popover{right:0!important;top:calc(100% + .7rem)!important;width:min(34rem,calc(100vw - 2rem))!important;max-height:min(82vh,46rem)!important;padding:0!important;overflow:auto!important;border:1px solid rgba(216,185,111,.22)!important;border-radius:1.35rem!important;background:linear-gradient(165deg,#0c2a1d,#071b12)!important;box-shadow:0 28px 80px rgba(0,0,0,.52),inset 0 1px 0 rgba(255,255,255,.03)!important}.m26-settings-popover>header{padding:1.2rem 1.2rem .95rem;border-bottom:1px solid var(--m26-native-line)}.m26-settings-popover>header h2{margin:.25rem 0 .28rem!important;font-size:1.32rem!important}.m26-settings-popover>header p:last-child{margin:0!important;color:#aaa599!important;font-size:.84rem!important;line-height:1.45!important}.m26-settings-block{padding:1rem 1.2rem!important;border-top:0!important;border-bottom:1px solid rgba(216,185,111,.11)!important}.m26-settings-block>div:first-child strong,.m26-settings-block label>strong{font-size:.86rem!important}.m26-settings-block p,.m26-settings-block label small{font-size:.76rem!important;line-height:1.4!important}
.m26-language-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:.55rem!important}.m26-language-option{position:relative!important;display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;align-items:center!important;gap:.62rem!important;min-height:3.5rem!important;padding:.7rem .78rem!important;border:1px solid rgba(216,185,111,.13)!important;border-radius:.9rem!important;background:rgba(255,255,255,.022)!important}.m26-language-option:hover{border-color:rgba(216,185,111,.34)!important;background:rgba(216,185,111,.055)!important}.m26-language-option.is-active{border-color:rgba(216,185,111,.48)!important;background:rgba(216,185,111,.09)!important;box-shadow:inset 0 0 0 1px rgba(216,185,111,.06)}.m26-language-option input[type='radio']{position:absolute!important;inline-size:1px!important;block-size:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important;opacity:0!important;pointer-events:none!important;appearance:none!important}.m26-language-flag{display:grid!important;place-items:center!important;width:2rem!important;height:2rem!important;border-radius:.65rem!important;background:rgba(0,0,0,.18)!important;font-size:1.05rem!important}.m26-language-option>span:last-child{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:.5rem!important}.m26-language-option strong{font-size:.82rem!important}.m26-language-option small{color:var(--m26-native-gold)!important}.m26-settings-block select{min-height:2.8rem!important;border-radius:.8rem!important;background:#04160e!important}.m26-settings-hint{margin:.8rem 1.2rem!important}.m26-settings-popover>.m26-primary-action{margin:0 1.2rem 1rem!important;width:calc(100% - 2.4rem)!important;min-height:2.9rem!important}.m26-settings-session{display:grid;gap:.55rem;padding:1rem 1.2rem 1.2rem;border-top:1px solid var(--m26-native-line);background:rgba(0,0,0,.12)}.m26-settings-session-copy{display:grid;gap:.12rem;margin-bottom:.2rem}.m26-settings-session-copy strong{font-size:.82rem}.m26-settings-session-copy small{color:#a9a397;font-size:.72rem}.m26-settings-session .m26-icon-button,.m26-settings-session .m26-danger-action{width:100%!important;min-height:2.75rem!important;justify-content:center!important}.m26-settings-session .m26-danger-action{color:#efd5cd!important;background:rgba(118,52,38,.13)!important;border-color:rgba(218,134,112,.2)!important}
.m26-coach-command-backdrop{position:fixed!important;inset:0!important;z-index:120!important;display:grid!important;place-items:start center!important;padding:clamp(4.5rem,10vh,7rem) 1rem 1rem!important;background:rgba(1,8,5,.72)!important;backdrop-filter:blur(12px)!important}.m26-coach-command-backdrop[hidden]{display:none!important}.m26-coach-command-dialog{width:min(42rem,100%)!important;max-height:min(72vh,42rem)!important;overflow:hidden!important;border:1px solid rgba(216,185,111,.23)!important;border-radius:1.35rem!important;background:linear-gradient(165deg,#0d2b1f,#071a12)!important;box-shadow:0 32px 95px rgba(0,0,0,.58)!important}.m26-coach-command-header{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:1rem!important;padding:1.1rem 1.15rem .8rem!important;border-bottom:1px solid var(--m26-native-line)!important}.m26-coach-command-header h2{margin:.24rem 0 0!important;font-size:1.25rem!important}.m26-coach-command-search{display:grid!important;gap:.4rem!important;padding:.95rem 1.15rem .65rem!important;color:#bdb7aa!important;font-size:.72rem!important;font-weight:650!important}.m26-coach-command-search input{min-height:3.2rem!important;padding:.7rem .9rem!important;border:1px solid rgba(216,185,111,.18)!important;border-radius:.92rem!important;color:var(--m26-native-cream)!important;background:#04150d!important;font-size:.95rem!important}.m26-coach-command-search input:focus{border-color:rgba(216,185,111,.5)!important;outline:3px solid rgba(216,185,111,.12)!important}.m26-coach-command-status{margin:0!important;padding:0 1.15rem .55rem!important;color:#938f85!important;font-size:.69rem!important}.m26-coach-command-results{display:grid!important;gap:.35rem!important;max-height:27rem!important;overflow:auto!important;padding:.2rem .75rem .85rem!important}.m26-coach-command-result{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:1rem!important;min-height:3.25rem!important;padding:.7rem .8rem!important;border:1px solid transparent!important;border-radius:.85rem!important;color:var(--m26-native-cream)!important;background:transparent!important;text-align:left!important}.m26-coach-command-result:hover,.m26-coach-command-result:focus-visible{border-color:rgba(216,185,111,.2)!important;background:rgba(216,185,111,.07)!important}.m26-coach-command-result span{font-weight:680!important}.m26-coach-command-result small{color:#aaa499!important;font-size:.68rem!important}.m26-coach-command-empty{padding:1rem!important;color:#aaa499!important;text-align:center!important}
.m26-settings-route{width:min(72rem,100%);margin-inline:auto!important;gap:1.1rem!important}.m26-settings-route>.m26-route-intro{padding:1.35rem!important;border:1px solid rgba(216,185,111,.15)!important;border-radius:1.25rem!important;background:linear-gradient(135deg,rgba(216,185,111,.07),rgba(12,42,29,.62))!important}.m26-settings-route>.m26-route-intro h2{max-width:22ch!important;margin:.28rem 0 .45rem!important;font-size:clamp(1.55rem,2.7vw,2.15rem)!important;letter-spacing:-.025em!important}.m26-settings-route>.m26-route-intro p:last-child{max-width:66ch!important;color:#bcb5a8!important;line-height:1.55!important}.m26-settings-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:.85rem!important;align-items:start!important}.m26-settings-grid>.m26-panel{display:grid!important;gap:.72rem!important;min-width:0!important;padding:1.05rem!important;border:1px solid rgba(216,185,111,.13)!important;border-radius:1rem!important;background:linear-gradient(160deg,rgba(15,49,34,.72),rgba(7,27,18,.84))!important;box-shadow:0 12px 30px rgba(0,0,0,.08)!important}.m26-settings-grid>.m26-panel h3{margin:.05rem 0!important;font-size:1rem!important}.m26-settings-grid>.m26-panel>label:not(.m26-consent){display:grid!important;gap:.4rem!important;color:#c8c1b4!important;font-size:.76rem!important;font-weight:650!important}.m26-settings-grid select{min-height:2.85rem!important;padding:.55rem .7rem!important;border:1px solid rgba(216,185,111,.16)!important;border-radius:.78rem!important;color:var(--m26-native-cream)!important;background:#061a11!important}.m26-settings-grid .m26-consent{display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;align-items:start!important;gap:.68rem!important;padding:.68rem .72rem!important;border:1px solid rgba(216,185,111,.1)!important;border-radius:.8rem!important;background:rgba(255,255,255,.018)!important}.m26-settings-grid .m26-consent input[type='checkbox'],.m26-settings-grid input[type='radio']{inline-size:1.08rem!important;block-size:1.08rem!important;min-inline-size:1.08rem!important;min-block-size:1.08rem!important;margin:.13rem 0 0!important;padding:0!important;accent-color:#d8b96f!important;appearance:auto!important}.m26-settings-grid .m26-consent span{display:grid!important;gap:.16rem!important}.m26-settings-grid .m26-consent strong{font-size:.82rem!important}.m26-settings-grid .m26-consent small,.m26-settings-grid .m26-data-footnote{color:#a8a297!important;font-size:.7rem!important;line-height:1.45!important}.m26-settings-grid .m26-notice{margin:.15rem 0 0!important;font-size:.72rem!important}
.m26-admin-route{width:min(78rem,100%);margin-inline:auto!important;gap:.9rem!important}.m26-admin-route .m26-admin-hero{padding:1.3rem!important;border-color:rgba(216,185,111,.13)!important;border-radius:1.2rem!important;background:linear-gradient(135deg,rgba(216,185,111,.075),rgba(9,36,24,.72))!important}.m26-admin-route .m26-admin-hero h2{font-size:clamp(1.35rem,2.5vw,2rem)!important;letter-spacing:-.025em!important}.m26-admin-route .m26-admin-panel{border-color:rgba(216,185,111,.11)!important}.m26-admin-route .m26-admin-form{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:.65rem!important;margin:0!important;padding:1rem!important;border-color:rgba(216,185,111,.14)!important;border-radius:1rem!important;background:rgba(3,18,11,.26)!important}.m26-admin-route .m26-admin-form>*{min-width:0!important}.m26-admin-route .m26-admin-form textarea,.m26-admin-route .m26-admin-form button,.m26-admin-route .m26-admin-form .m26-admin-form-heading{grid-column:1/-1!important}.m26-admin-route .m26-admin-form input,.m26-admin-route .m26-admin-form select,.m26-admin-route .m26-admin-form textarea{min-height:2.8rem!important;padding:.58rem .7rem!important;border:1px solid rgba(216,185,111,.13)!important;border-radius:.72rem!important;color:var(--m26-native-cream)!important;background:#061a11!important}.m26-admin-route .m26-admin-form textarea{min-height:5.2rem!important;resize:vertical!important}.m26-admin-route .m26-admin-form button[type='submit']{min-height:2.9rem!important;border-color:rgba(216,185,111,.38)!important;color:#102318!important;background:linear-gradient(135deg,#dfbf74,#c89d4d)!important;font-weight:790!important}.m26-admin-intake-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:1rem;padding:1.05rem 1.1rem;border:1px solid rgba(216,185,111,.21);border-radius:1.05rem;background:linear-gradient(135deg,rgba(216,185,111,.1),rgba(13,52,35,.68));box-shadow:0 14px 34px rgba(0,0,0,.09)}.m26-admin-intake-card h3{margin:.18rem 0 .3rem!important;font-size:1.08rem!important}.m26-admin-intake-card p{max-width:64ch;margin:0!important;color:#bcb5a8!important;font-size:.8rem!important;line-height:1.48!important}.m26-admin-intake-card button{min-width:9.2rem!important;border-color:rgba(216,185,111,.38)!important;background:rgba(216,185,111,.1)!important}.m26-admin-intake-steps{display:flex;gap:.45rem;flex-wrap:wrap;margin-top:.65rem}.m26-admin-intake-steps span{padding:.3rem .5rem;border:1px solid rgba(216,185,111,.13);border-radius:999px;color:#bdb6a8;background:rgba(0,0,0,.12);font-size:.66rem}.m26-admin-intake-form{margin-top:.65rem!important}.m26-admin-form-heading{display:grid;gap:.15rem;padding-bottom:.2rem;border-bottom:1px solid rgba(216,185,111,.1)}.m26-admin-form-heading strong{font-size:.88rem}.m26-admin-form-heading small{color:#a7a195;font-size:.7rem;line-height:1.4}.m26-admin-route .m26-admin-table{border-radius:1rem!important}.m26-admin-route .m26-admin-table th{position:sticky;top:0;background:#092218;z-index:1}
@media(max-width:1180px){.m26-topbar{align-items:flex-start!important}.m26-topbar-actions{display:grid!important;grid-template-columns:minmax(9rem,.7fr) minmax(15rem,1.35fr) auto auto!important;width:min(100%,55rem)!important}.m26-client-selector{min-width:0!important}.m26-operation-status span:last-child{display:none!important}.m26-operation-status{padding-inline:.7rem!important}.m26-settings-menu>summary>span:nth-child(2){display:none!important}.m26-language-mini{border-left:0!important;padding-left:0!important}}
@media(max-width:820px){.m26-topbar{display:grid!important}.m26-topbar-actions{grid-template-columns:minmax(0,1fr) auto auto!important;width:100%!important}.m26-coach-command-launcher{min-width:0!important}.m26-client-selector{grid-column:1/-1;grid-row:2}.m26-operation-status{grid-column:2}.m26-settings-menu{grid-column:3}.m26-settings-grid{grid-template-columns:1fr!important}.m26-admin-intake-card{grid-template-columns:1fr}.m26-admin-intake-card button{width:100%!important}.m26-admin-route .m26-admin-form{grid-template-columns:1fr!important}.m26-admin-route .m26-admin-form>*{grid-column:1!important}}
@media(max-width:620px){.m26-topbar-actions{grid-template-columns:minmax(0,1fr) auto!important}.m26-coach-command-launcher kbd,.m26-operation-status{display:none!important}.m26-settings-menu{grid-column:2!important}.m26-client-selector{grid-column:1/-1!important}.m26-settings-popover{position:fixed!important;left:.65rem!important;right:.65rem!important;top:4.4rem!important;width:auto!important;max-height:calc(100dvh - 5.1rem)!important}.m26-language-grid{grid-template-columns:1fr!important}.m26-settings-route>.m26-route-intro{padding:1rem!important}.m26-settings-grid>.m26-panel{padding:.9rem!important}.m26-coach-command-backdrop{padding:3.8rem .65rem .65rem!important}.m26-coach-command-dialog{border-radius:1.05rem!important}.m26-admin-route{padding-bottom:calc(5.5rem + env(safe-area-inset-bottom))}.m26-admin-intake-steps{display:grid;grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.m26-coach-command-launcher,.m26-settings-menu>summary,.m26-admin-intake-card button{transition:none!important}}
`;

function ownerDocument(root){return root?.ownerDocument||globalThis.document||null;}

export function ensureNativeWorkspaceStyles(doc=globalThis.document){
  if(!doc?.head||!doc?.createElement)return false;
  if(doc.getElementById?.(STYLE_ID))return true;
  const style=doc.createElement('style');
  style.id=STYLE_ID;
  style.setAttribute('data-m26-native-workspace',M26_NATIVE_WORKSPACE_VERSION);
  style.textContent=NATIVE_WORKSPACE_CSS;
  doc.head.append(style);
  return true;
}

function textLabel(control){
  return String(control?.getAttribute?.('placeholder')||control?.getAttribute?.('name')||'Campo').trim();
}

function enhanceSearch(root){
  const launcher=root.querySelector?.('[data-coach-command-open]');
  launcher?.setAttribute?.('title','Buscar clientes, secciones y acciones');
  const input=root.querySelector?.('[data-coach-command-search]');
  if(input&&!input.getAttribute('placeholder'))input.setAttribute('placeholder','Busca un cliente, sección o acción…');
}

function enhanceSettings(root,viewModel){
  const menu=root.querySelector?.('.m26-settings-menu');
  const popover=menu?.querySelector?.('.m26-settings-popover');
  if(!menu||!popover)return;
  menu.setAttribute('data-m26-native-settings','true');
  const doc=ownerDocument(root);
  let session=popover.querySelector?.('[data-m26-settings-session]');
  if(!session&&doc?.createElement){
    session=doc.createElement('section');
    session.className='m26-settings-session';
    session.setAttribute('data-m26-settings-session','true');
    const copy=doc.createElement('div');
    copy.className='m26-settings-session-copy';
    const strong=doc.createElement('strong');
    strong.textContent=viewModel?.identity?.name||'Cuenta IBERFIT';
    const small=doc.createElement('small');
    small.textContent=`${viewModel?.identity?.roleLabel||'IBERFIT'} · sesión en este dispositivo`;
    copy.append(strong,small);
    session.append(copy);
    popover.append(session);
  }
  const logout=root.querySelector?.('[data-m26-action="logout"]');
  const clear=root.querySelector?.('[data-m26-action="logout-clear-device"]');
  if(session&&logout&&logout.parentElement!==session)session.append(logout);
  if(session&&clear&&clear.parentElement!==session)session.append(clear);
}

function enhanceAdminIntake(root,viewModel){
  if(String(viewModel?.identity?.role||'')!=='admin'||String(viewModel?.activeArea||'')!=='admin-clientes')return;
  const form=root.querySelector?.('[data-admin-form="lead-create"]');
  if(!form||form.dataset.m26NativeIntake==='true')return;
  const doc=ownerDocument(root);
  if(!doc?.createElement)return;
  form.dataset.m26NativeIntake='true';
  form.classList.add('m26-admin-intake-form');
  form.hidden=true;
  for(const control of form.querySelectorAll?.('input,select,textarea')||[]){
    if(!control.getAttribute?.('aria-label'))control.setAttribute?.('aria-label',textLabel(control));
  }
  const submit=form.querySelector?.('button[type="submit"]');
  if(submit)submit.textContent='Guardar datos iniciales';
  const heading=doc.createElement('div');
  heading.className='m26-admin-form-heading';
  const headingStrong=doc.createElement('strong');
  headingStrong.textContent='Paso 1 · Datos esenciales';
  const headingSmall=doc.createElement('small');
  headingSmall.textContent='Guarda identidad, contacto y objetivo sin activar una cuenta ni conceder acceso.';
  heading.append(headingStrong,headingSmall);
  form.prepend(heading);
  const card=doc.createElement('section');
  card.className='m26-admin-intake-card';
  card.setAttribute('data-admin-intake-card','true');
  const content=doc.createElement('div');
  const eyebrow=doc.createElement('p');
  eyebrow.className='m26-eyebrow';
  eyebrow.textContent='Alta de cliente';
  const title=doc.createElement('h3');
  title.textContent='Nueva alta, sin perder información';
  const copy=doc.createElement('p');
  copy.textContent='Empieza por los datos esenciales. Se conserva el contacto como entrada administrativa y la activación de acceso permanece separada y auditada.';
  const steps=doc.createElement('div');
  steps.className='m26-admin-intake-steps';
  for(const label of ['1 · Datos esenciales','2 · Validar expediente','3 · Asignar Coach']){
    const chip=doc.createElement('span');chip.textContent=label;steps.append(chip);
  }
  content.append(eyebrow,title,copy,steps);
  const open=doc.createElement('button');
  open.type='button';
  open.textContent='Empezar alta';
  open.setAttribute('data-admin-intake-open','true');
  open.setAttribute('aria-expanded','false');
  card.append(content,open);
  form.before(card);
}

export function openNativeAdminIntake(root){
  const form=root?.querySelector?.('[data-admin-form="lead-create"]');
  const button=root?.querySelector?.('[data-admin-intake-open]');
  if(!form)return false;
  form.hidden=false;
  button?.setAttribute?.('aria-expanded','true');
  if(button)button.textContent='Alta en curso';
  queueMicrotask(()=>form.querySelector?.('input[name="name"]')?.focus?.({preventScroll:false}));
  return true;
}

export function enhanceNativeWorkspace({root,viewModel}={}){
  if(!root)return false;
  ensureNativeWorkspaceStyles(ownerDocument(root));
  enhanceSearch(root);
  enhanceSettings(root,viewModel);
  enhanceAdminIntake(root,viewModel);
  return true;
}

export const __nativeWorkspaceInternals=Object.freeze({
  STYLE_ID,
  NATIVE_WORKSPACE_CSS,
  enhanceSearch,
  enhanceSettings,
  enhanceAdminIntake,
  textLabel,
});
