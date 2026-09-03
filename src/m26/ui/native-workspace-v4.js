import { enhanceNativeWorkspace as enhanceV3, openNativeAdminIntake as openV3 } from './native-workspace.js';

export const M26_NATIVE_WORKSPACE_VERSION='m26-native-workspace-v4';
export const openNativeAdminIntake=openV3;

const STYLE_ID='m26-native-workspace-v4';

function ensureStyles(){
  if(typeof document==='undefined'||document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
:root{--m26-v4-ink:#102a22;--m26-v4-green:#123d31;--m26-v4-green-2:#18513f;--m26-v4-cream:#f6f1e7;--m26-v4-paper:#fffdf8;--m26-v4-gold:#b89553;--m26-v4-line:rgba(18,61,49,.14);--m26-v4-muted:#68766f;--m26-v4-danger:#9a3c36;--m26-v4-shadow:0 12px 36px rgba(17,50,40,.08)}
.m26-native-workspace-v4{background:linear-gradient(180deg,#fbf8f1 0,#f7f2e9 100%);color:var(--m26-v4-ink)}
.m26-native-workspace-v4 .m26-route{animation:m26-v4-enter .18s ease-out}
.m26-native-workspace-v4 .m26-route-header{align-items:flex-start;gap:18px;margin-bottom:22px}.m26-native-workspace-v4 .m26-route-header h1{font-size:clamp(1.55rem,2.5vw,2.3rem);letter-spacing:-.035em;line-height:1.05}.m26-native-workspace-v4 .m26-route-header>div>span{color:var(--m26-v4-gold);font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:.7rem}
.m26-native-workspace-v4 .m26-card,.m26-native-workspace-v4 .m26-metric-card,.m26-native-workspace-v4 .m26-list-row,.m26-native-workspace-v4 .m26-action-card,.m26-native-workspace-v4 .m26-admin-section{background:rgba(255,253,248,.94);border:1px solid var(--m26-v4-line);border-radius:18px;box-shadow:0 5px 18px rgba(17,50,40,.045)}
.m26-native-workspace-v4 .m26-button{min-height:42px;border-radius:12px;font-weight:750;transition:transform .15s ease,box-shadow .15s ease,background .15s ease}.m26-native-workspace-v4 .m26-button:active{transform:scale(.985)}.m26-native-workspace-v4 .m26-button-primary{background:var(--m26-v4-green);border-color:var(--m26-v4-green);color:#fff}.m26-native-workspace-v4 .m26-button-primary:hover{background:var(--m26-v4-green-2);box-shadow:0 8px 20px rgba(18,61,49,.16)}
.m26-native-workspace-v4 .m26-nav-item{border-radius:12px;transition:background .15s ease,transform .15s ease}.m26-native-workspace-v4 .m26-nav-item[data-active="true"]{background:rgba(184,149,83,.13);box-shadow:inset 3px 0 0 var(--m26-v4-gold)}.m26-native-workspace-v4 .m26-native-nav-divider{margin:14px 10px 7px;color:var(--m26-v4-muted);font-size:.67rem;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
.m26-native-workspace-v4 .m26-client-context select{border-radius:12px;border-color:rgba(184,149,83,.36);background:#fffdf8;font-weight:720}.m26-native-workspace-v4 [data-client-card]{position:relative;padding-left:58px!important;min-height:68px;transition:transform .15s ease,box-shadow .15s ease}.m26-native-workspace-v4 [data-client-card]:hover{transform:translateY(-1px);box-shadow:var(--m26-v4-shadow)}.m26-native-workspace-v4 .m26-client-avatar{position:absolute;left:14px;top:50%;translate:0 -50%;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--m26-v4-green);color:#fff;font-size:.72rem;font-weight:850;letter-spacing:.04em}.m26-native-workspace-v4 .m26-client-chevron{margin-left:auto;color:var(--m26-v4-gold);font-size:1.1rem}
.m26-native-workspace-v4 .m26-native-daily-brief{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(2,minmax(140px,.55fr));gap:12px;margin:0 0 18px}.m26-native-workspace-v4 .m26-native-brief-main,.m26-native-workspace-v4 .m26-native-brief-stat{padding:17px 18px;border:1px solid var(--m26-v4-line);border-radius:18px;background:linear-gradient(145deg,#fffdf8,#f4ede0)}.m26-native-workspace-v4 .m26-native-brief-main small,.m26-native-workspace-v4 .m26-native-brief-stat small{display:block;color:var(--m26-v4-muted);font-weight:750}.m26-native-workspace-v4 .m26-native-brief-main strong{display:block;margin-top:5px;font-size:1.08rem}.m26-native-workspace-v4 .m26-native-brief-stat strong{display:block;margin-top:4px;font-size:1.45rem;color:var(--m26-v4-green)}
.m26-native-workspace-v4 .m26-command-panel{border:1px solid rgba(184,149,83,.28)!important;border-radius:22px!important;box-shadow:0 26px 70px rgba(7,31,24,.24)!important;overflow:hidden}.m26-native-workspace-v4 .m26-native-search-context{padding:0 20px 14px;color:var(--m26-v4-muted);font-size:.78rem}.m26-native-workspace-v4 .m26-command-result{border-radius:13px!important;margin:4px 10px!important;transition:background .12s ease,transform .12s ease}.m26-native-workspace-v4 .m26-command-result:hover{background:rgba(184,149,83,.1)!important;transform:translateX(2px)}
.m26-native-workspace-v4 .m26-settings-map{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px;padding:12px;border:1px solid var(--m26-v4-line);border-radius:16px;background:rgba(255,253,248,.78)}.m26-native-workspace-v4 .m26-settings-map span{padding:7px 10px;border-radius:999px;background:#eee8dd;color:#52635c;font-size:.72rem;font-weight:760}.m26-native-workspace-v4 .m26-settings-grid{gap:14px!important}.m26-native-workspace-v4 .m26-settings-card{border-radius:18px!important;border-color:var(--m26-v4-line)!important;background:#fffdf8!important;box-shadow:none!important}.m26-native-workspace-v4 .m26-settings-session-section{margin-top:8px!important;padding-top:18px!important;border-top:1px solid var(--m26-v4-line)!important}
.m26-native-workspace-v4 .m26-admin-task-center{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:0 0 18px}.m26-native-workspace-v4 .m26-admin-task{display:flex;align-items:center;gap:10px;min-height:58px;padding:12px 14px;border:1px solid var(--m26-v4-line);border-radius:16px;background:#fffdf8;color:var(--m26-v4-ink);text-align:left;font:inherit;font-weight:780;cursor:pointer}.m26-native-workspace-v4 .m26-admin-task::before{content:'+';display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:var(--m26-v4-green);color:#fff}.m26-native-workspace-v4 .m26-admin-task:hover{border-color:rgba(184,149,83,.5);box-shadow:0 8px 22px rgba(17,50,40,.07)}.m26-native-workspace-v4 .m26-admin-section-head span{opacity:.42;font-size:.68rem}.m26-native-workspace-v4 .m26-admin-advanced{margin-top:14px;border:1px dashed var(--m26-v4-line);border-radius:14px;padding:10px 14px;background:rgba(255,253,248,.56)}.m26-native-workspace-v4 .m26-admin-advanced summary{cursor:pointer;font-weight:760;color:var(--m26-v4-muted)}
.m26-native-workspace-v4 .m26-route-agenda{--fc-border-color:rgba(18,61,49,.12);--fc-page-bg-color:#fffdf8;--fc-neutral-bg-color:#f5efe4;--fc-button-bg-color:#123d31;--fc-button-border-color:#123d31;--fc-button-hover-bg-color:#18513f;--fc-button-active-bg-color:#0f342a;--fc-event-bg-color:#e6efe9;--fc-event-border-color:#c9dbd0;--fc-event-text-color:#17382e}.m26-native-workspace-v4 [data-rc62-agenda-calendar]{margin:16px 0 20px;padding:16px;border:1px solid var(--m26-v4-line);border-radius:20px;background:#fffdf8;box-shadow:var(--m26-v4-shadow);overflow:hidden}.m26-native-workspace-v4 [data-rc62-agenda-calendar][data-calendar-status="loading"]{min-height:280px;opacity:.72}.m26-native-workspace-v4 .fc .fc-toolbar-title{color:var(--m26-v4-green);font-size:1.14rem!important;text-transform:capitalize}.m26-native-workspace-v4 .fc .fc-button{border-radius:10px!important;box-shadow:none!important;font-weight:760!important;text-transform:none!important}.m26-native-workspace-v4 .fc .fc-button-primary:not(:disabled).fc-button-active{background:var(--m26-v4-gold)!important;border-color:var(--m26-v4-gold)!important;color:#112d24!important}.m26-native-workspace-v4 .fc-theme-monarch td,.m26-native-workspace-v4 .fc-theme-monarch th{border-color:rgba(18,61,49,.1)!important}.m26-native-workspace-v4 .fc-timegrid-slot-label,.m26-native-workspace-v4 .fc-col-header-cell-cushion{color:#5f6e67!important;font-size:.74rem!important}.m26-native-workspace-v4 .fc-event{border-radius:9px!important;padding:2px 4px!important;box-shadow:0 2px 8px rgba(18,61,49,.08)!important}.m26-native-workspace-v4 .m26-appointment-row{border-left:3px solid var(--m26-v4-gold)}.m26-native-workspace-v4 .m26-appointment-row[data-state="danger"]{border-left-color:var(--m26-v4-danger)}
.m26-native-workspace-v4 [data-native-busy="true"],.m26-native-workspace-v4 [aria-busy="true"]{cursor:progress}.m26-native-workspace-v4 [data-native-busy="true"]::after{content:'';display:inline-block;width:12px;height:12px;margin-left:8px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:m26-v4-spin .65s linear infinite}
@keyframes m26-v4-enter{from{opacity:.4;transform:translateY(4px)}to{opacity:1;transform:none}}@keyframes m26-v4-spin{to{transform:rotate(360deg)}}
@media(max-width:840px){.m26-native-workspace-v4 .m26-native-daily-brief{grid-template-columns:1fr 1fr}.m26-native-workspace-v4 .m26-native-brief-main{grid-column:1/-1}.m26-native-workspace-v4 [data-rc62-agenda-calendar]{padding:8px;border-radius:16px}.m26-native-workspace-v4 .fc .fc-toolbar{gap:8px;align-items:flex-start;flex-wrap:wrap}.m26-native-workspace-v4 .fc .fc-toolbar-chunk:nth-child(2){order:-1;width:100%}}
@media(max-width:560px){.m26-native-workspace-v4 .m26-native-daily-brief{grid-template-columns:1fr}.m26-native-workspace-v4 .m26-native-brief-main{grid-column:auto}.m26-native-workspace-v4 .m26-admin-task-center{grid-template-columns:1fr}.m26-native-workspace-v4 .m26-settings-map{overflow:auto;flex-wrap:nowrap}.m26-native-workspace-v4 .m26-settings-map span{white-space:nowrap}}
@media(prefers-reduced-motion:reduce){.m26-native-workspace-v4 *{animation-duration:.001ms!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}
`;
  document.head.append(style);
}

function initials(label=''){return String(label).trim().split(/\s+/u).filter(Boolean).slice(0,2).map((part)=>part[0]?.toUpperCase()||'').join('')||'IB';}
function textOf(node){return String(node?.textContent||'').replace(/\s+/gu,' ').trim();}

function enhanceNavigation(root){
  const nav=root.querySelector('.m26-nav');
  if(!nav||nav.querySelector('.m26-native-nav-divider'))return;
  const items=[...nav.querySelectorAll('[data-route]')];
  const primary=new Set(['inicio','agenda','clientes','entrenos','progreso']);
  const firstSecondary=items.find((item)=>!primary.has(String(item.dataset.route||'').toLowerCase()));
  if(firstSecondary){const divider=document.createElement('div');divider.className='m26-native-nav-divider';divider.textContent='Más';firstSecondary.before(divider);}
}

function enhanceHome(root,viewModel){
  const route=root.querySelector('.m26-route-inicio');
  if(!route||route.querySelector('.m26-native-daily-brief'))return;
  const summary=viewModel?.content?.summary||{};
  const session=viewModel?.content?.session||null;
  const brief=document.createElement('section');
  brief.className='m26-native-daily-brief';
  brief.setAttribute('aria-label','Resumen de hoy');
  const title=session?.title||session?.name||session?.subject||'Tu jornada IBERFIT';
  const readiness=summary?.readiness?.score??'—';
  const adherence=summary?.adherence?.week??'—';
  brief.innerHTML=`<article class="m26-native-brief-main"><small>Ahora</small><strong>${String(title).replace(/[<>]/gu,'')}</strong></article><article class="m26-native-brief-stat"><small>Readiness</small><strong>${String(readiness).replace(/[<>]/gu,'')}</strong></article><article class="m26-native-brief-stat"><small>Adherencia</small><strong>${String(adherence).replace(/[<>]/gu,'')}</strong></article>`;
  const anchor=route.querySelector('.m26-metrics-grid,.m26-metric-grid,.m26-card-grid');
  (anchor||route.querySelector('.m26-route-header'))?.after(brief);
}

function enhanceClients(root){
  root.querySelectorAll('[data-client-card]').forEach((card)=>{
    if(card.querySelector('.m26-client-avatar'))return;
    const label=textOf(card.querySelector('strong,h2,h3')||card).slice(0,80);
    const avatar=document.createElement('span');avatar.className='m26-client-avatar';avatar.setAttribute('aria-hidden','true');avatar.textContent=initials(label);
    const chevron=document.createElement('span');chevron.className='m26-client-chevron';chevron.setAttribute('aria-hidden','true');chevron.textContent='›';
    card.prepend(avatar);card.append(chevron);
  });
}

function enhanceSearch(root){
  const panel=root.querySelector('.m26-command-panel');
  if(!panel||panel.querySelector('.m26-native-search-context'))return;
  const context=document.createElement('div');context.className='m26-native-search-context';context.textContent='Clientes · Ejercicios · Sesiones · Planes · Acciones';
  const input=panel.querySelector('input,[role="searchbox"]');
  (input?.parentElement||panel).after(context);
}

function enhanceSettings(root){
  const route=root.querySelector('.m26-settings-route');
  if(!route||route.querySelector('.m26-settings-map'))return;
  const map=document.createElement('nav');map.className='m26-settings-map';map.setAttribute('aria-label','Secciones de Ajustes');
  ['Cuenta','Apariencia','Notificaciones','Entrenamiento','Seguridad','Datos','Ayuda'].forEach((label)=>{const chip=document.createElement('span');chip.textContent=label;map.append(chip);});
  const header=route.querySelector('.m26-route-header');header?.after(map);
}

function enhanceAdmin(root){
  const route=root.querySelector('.m26-admin-route');
  if(!route)return;
  if(!route.querySelector('.m26-admin-task-center')){
    const center=document.createElement('section');center.className='m26-admin-task-center';center.setAttribute('aria-label','Acciones rápidas de administración');
    const tasks=[['ADMIN_LEAD_CREAR','Añadir cliente','intake'],['ADMIN_USER_CREATE','Añadir coach','jump'],['ADMIN_ASSIGNMENT_CREATE','Asignar cliente','jump'],['ADMIN_CLIENT_STATUS_SET','Gestionar cliente','jump'],['ADMIN_SETTING_SET','Parámetros','jump']];
    for(const [command,label,mode] of tasks){
      const section=route.querySelector(`.m26-admin-section[data-command="${command}"]`);if(!section)continue;
      const button=document.createElement('button');button.type='button';button.className='m26-admin-task';button.textContent=label;
      if(mode==='intake')button.dataset.adminIntakeOpen='true';
      else button.addEventListener('click',()=>{section.scrollIntoView?.({behavior:'smooth',block:'start'});section.querySelector('input,select,button')?.focus?.({preventScroll:true});});
      center.append(button);
    }
    const hero=route.querySelector('.m26-admin-hero');hero?.after(center);
  }
  const runtime=route.querySelector('.m26-admin-runtime');
  if(runtime&&!runtime.closest('.m26-admin-advanced')){const details=document.createElement('details');details.className='m26-admin-advanced';const summary=document.createElement('summary');summary.textContent='Avanzado · Runtime y diagnóstico';runtime.before(details);details.append(summary,runtime);}
}

function enhanceAgenda(root){
  const route=root.querySelector('.m26-route-agenda');
  if(!route)return;
  route.querySelectorAll('.m26-appointment-row').forEach((row)=>{row.setAttribute('tabindex','0');});
  const copy=route.querySelector('.m26-route-copy');if(copy)copy.textContent='Tu semana de sesiones, clara y operativa. Cambia entre Semana y Día para enfocarte sin perder contexto.';
}

export function enhanceNativeWorkspace({root,viewModel}={}){
  enhanceV3({root,viewModel});
  if(!root?.querySelector)return;
  ensureStyles();
  root.classList.add('m26-native-workspace-v4');
  root.dataset.nativeWorkspaceVersion=M26_NATIVE_WORKSPACE_VERSION;
  enhanceNavigation(root);
  enhanceHome(root,viewModel);
  enhanceClients(root);
  enhanceSearch(root);
  enhanceSettings(root);
  enhanceAdmin(root);
  enhanceAgenda(root);
}
