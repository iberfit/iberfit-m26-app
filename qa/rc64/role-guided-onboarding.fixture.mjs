import {
  createGuidedTourController,
  guidedOnboardingScopeKey,
  guidedOnboardingTrack,
} from '../../src/m26/onboarding/guided-tour.js';

const params=new URLSearchParams(globalThis.location.search);
const requestedRole=String(params.get('role')||'coach').toLowerCase();
const role=new Set(['coach','admin']).has(requestedRole)?requestedRole:'coach';
const userId=`qa-role-genie-${role}`;
const root=document.querySelector('#qa-root');
if(!root)throw new Error('ROLE_GENIE_QA_ROOT_MISSING');

const track=guidedOnboardingTrack(role);
if(!track)throw new Error(`ROLE_GENIE_QA_TRACK_MISSING:${role}`);

const labels={
  hoy:'Hoy',clientes:'Clientes',planificacion:'Planificación',progreso:'Progreso',agenda:'Agenda',ajustes:'Ajustes',
  'admin-inicio':'Inicio','admin-usuarios':'Usuarios','admin-equipo':'Equipo','admin-clientes':'Clientes',
  'admin-operaciones':'Operaciones','admin-auditoria':'Auditoría','admin-configuracion':'Configuración',
};
const uniqueAreas=[...new Set(track.steps.map((step)=>step.area))];
const nav=uniqueAreas.map((area,index)=>`<button type="button" class="m26-secondary-action" data-m26-area="${area}"${index===0?' aria-current="page"':''}>${labels[area]||area}</button>`).join('');

root.innerHTML=`
  <div class="m26-shell m26-role-genie-qa-shell" data-m26-role="${role}" data-m26-interactive="ready">
    <header class="m26-role-genie-qa-head">
      <p class="m26-eyebrow">IBERFIT QA</p>
      <h1>${role==='coach'?'Coach':'Admin'} · Genio IBERFIT</h1>
      <p>Superficie current-source determinista para certificar el recorrido operativo sin autenticación ni mutaciones.</p>
    </header>
    <nav class="m26-role-genie-qa-nav" aria-label="Áreas ${role}">${nav}</nav>
    <main id="m26-main" class="m26-role-genie-qa-surface">
      ${role==='coach'?'<section data-m26-coach-action-center><h2>Action Center</h2><p>Prioridades operativas del Coach.</p></section>':'<section><h2>Centro Admin</h2><p>Control, gestión y trazabilidad.</p></section>'}
      <button type="button" class="m26-text-action" data-progressive-onboarding-launcher>Guía</button>
    </main>
  </div>`;

root.addEventListener('click',(event)=>{
  const target=event.target?.closest?.('[data-m26-area]');
  if(!target)return;
  for(const item of root.querySelectorAll('[data-m26-area][aria-current="page"]'))item.removeAttribute('aria-current');
  target.setAttribute('aria-current','page');
});

const openChanges=[];
const controller=createGuidedTourController({
  root,
  identityProvider:()=>({role,userId}),
  storage:globalThis.localStorage,
  scope:globalThis,
  onOpenChange:(open)=>openChanges.push(Boolean(open)),
});

controller.mount();

globalThis.__IBERFIT_ROLE_GENIE_QA__=Object.freeze({
  mounted:true,
  role,
  userId,
  trackLength:track.steps.length,
  scopeKey:guidedOnboardingScopeKey({userId,role}),
  state:()=>controller.getState(),
  open:()=>controller.open(),
  openChanges:()=>[...openChanges],
});
