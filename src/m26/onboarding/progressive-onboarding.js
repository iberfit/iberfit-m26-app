import {createGuidedTourController} from './guided-tour.js';

export const PROGRESSIVE_ONBOARDING_SCHEMA_VERSION='iberfit.progressive-onboarding.v1';
export const PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE='data-m26-guided-tour-open';

const ROLE_TRACKS=Object.freeze({
  coach:Object.freeze({
    role:'coach',
    home:'hoy',
    title:'Primer recorrido Coach',
    summary:'Conoce las áreas operativas principales a tu ritmo. Puedes ocultar esta guía y volver a abrirla cuando quieras.',
    steps:Object.freeze([
      Object.freeze({id:'coach-today',area:'hoy',label:'Revisa tu día',detail:'Empieza por prioridades, próximas sesiones y operaciones que requieren atención.'}),
      Object.freeze({id:'coach-clients',area:'clientes',label:'Abre tu cartera',detail:'Selecciona un expediente antes de entrar en trabajo contextual del cliente.'}),
      Object.freeze({id:'coach-agenda',area:'agenda',label:'Organiza la agenda',detail:'Consulta semana y día sin cambiar citas mediante arrastre o redimensionado.'}),
      Object.freeze({id:'coach-library',area:'biblioteca',label:'Explora la biblioteca',detail:'Consulta ejercicios y recursos técnicos antes de reutilizarlos en una sesión.'}),
      Object.freeze({id:'coach-verification',area:'verificacion',label:'Revisa verificación',detail:'Comprueba pendientes, conflictos y operaciones que aún no están confirmadas.'}),
    ]),
  }),
  client:Object.freeze({
    role:'client',
    home:'hoy',
    title:'Tu recorrido IBERFIT',
    summary:'Descubre las funciones que usarás con más frecuencia. La guía no bloquea ninguna sección.',
    steps:Object.freeze([
      Object.freeze({id:'client-today',area:'hoy',label:'Revisa tu día',detail:'Consulta lo más importante de tu acompañamiento desde un único punto.'}),
      Object.freeze({id:'client-plan',area:'planificacion',label:'Conoce tu planificación',detail:'Revisa el contenido que tu entrenador ha preparado y publicado para ti.'}),
      Object.freeze({id:'client-session',area:'sesion',label:'Abre tus sesiones',detail:'Accede a la ejecución guiada y a las indicaciones disponibles para tu sesión.'}),
      Object.freeze({id:'client-progress',area:'progreso',label:'Consulta tu progreso',detail:'Lee tendencias y resultados sin convertir ausencias de datos en cero.'}),
      Object.freeze({id:'client-activity',area:'actividad',label:'Revisa actividad y hábitos',detail:'Consulta registros, hábitos y datos de dispositivo cuando hayas dado permiso.'}),
    ]),
  }),
  admin:Object.freeze({
    role:'admin',
    home:'admin-inicio',
    title:'Primer recorrido Admin',
    summary:'Recorre las áreas de control global sin cambiar permisos ni ejecutar operaciones automáticamente.',
    steps:Object.freeze([
      Object.freeze({id:'admin-home',area:'admin-inicio',label:'Revisa el centro de control',detail:'Empieza por el estado general y las señales operativas disponibles.'}),
      Object.freeze({id:'admin-users',area:'admin-usuarios',label:'Conoce usuarios y accesos',detail:'Revisa identidades y accesos dentro del alcance administrativo autorizado.'}),
      Object.freeze({id:'admin-team',area:'admin-equipo',label:'Revisa equipo y asignaciones',detail:'Consulta la organización antes de cualquier cambio de alcance o asignación.'}),
      Object.freeze({id:'admin-operations',area:'admin-operaciones',label:'Abre operaciones',detail:'Separa estado confirmado, pendiente, conflicto y rechazo antes de actuar.'}),
      Object.freeze({id:'admin-audit',area:'admin-auditoria',label:'Consulta auditoría',detail:'Usa la trazabilidad para entender qué ocurrió y con qué autorización.'}),
    ]),
  }),
});

const FLEXIBLE_ONBOARDING_SELECTOR='[data-workflow-form="client-onboarding"]';
const IRI_ONLY_REQUIRED_FIELDS=Object.freeze(['sexForNorms','weeklyFrequency','sessionDurationMinutes','primaryObjective']);
const PROGRESSIVE_ONBOARDING_COMPACT_STYLE_ATTRIBUTE='data-m26-guided-tour-compact-style';
const compactStyleRegistry=new WeakMap();
const PROGRESSIVE_ONBOARDING_COMPACT_STYLE_TEXT=`
[${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-topbar{
  gap:.65rem;
  padding-block:.6rem;
  transition:padding .16s ease,gap .16s ease;
}
[${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-topbar h1{
  margin-top:.05rem;
  font-size:clamp(1.35rem,2.6vw,1.9rem);
}
[${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-main{
  padding-top:clamp(.75rem,2vw,1.35rem);
  padding-bottom:clamp(.9rem,2vw,1.5rem);
  scroll-padding-top:4.75rem;
  transition:padding .16s ease;
}
@media (min-width:901px){
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-sidebar{
    padding-block:.9rem;
    transition:padding .16s ease;
  }
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-brand{padding-bottom:.9rem;}
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-nav-group{margin-bottom:.72rem;}
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-nav-group>div{gap:.12rem;}
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-sidebar-footer{
    margin-top:1rem;
    padding-top:.75rem;
  }
}
@media (max-width:900px){
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-topbar{
    gap:.45rem;
    padding-block:.5rem;
  }
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-main{padding-top:.65rem;}
  .m26-guided-tour{
    bottom:calc(4.75rem + env(safe-area-inset-bottom));
    max-height:min(58vh,32rem);
  }
}
@media (max-width:580px){
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-topbar h1{font-size:1.35rem;}
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-topbar-actions{gap:.4rem;}
}
@media (prefers-reduced-motion:reduce){
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-topbar,
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-main,
  [${PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE}="true"] .m26-sidebar{transition:none;}
}
`;

function text(value,max=160){
  return String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);
}

function setAttributeIfChanged(node,name,value){
  const next=String(value??'');
  if(node?.getAttribute?.(name)===next)return false;
  node?.setAttribute?.(name,next);
  return true;
}

function setTextIfChanged(node,value){
  const next=String(value??'');
  if(node?.textContent===next)return false;
  node.textContent=next;
  return true;
}

function escapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

function fnv1a(value){
  let hash=0x811c9dc5;
  for(const char of String(value||'')){
    hash^=char.charCodeAt(0);
    hash=Math.imul(hash,0x01000193);
  }
  return (hash>>>0).toString(16).padStart(8,'0');
}

function named(form,name){
  return form?.elements?.namedItem?.(name)||form?.querySelector?.(`[name="${name}"]`)||null;
}

function setRequired(field,required){
  if(!field)return;
  field.required=Boolean(required);
  if(required)field.setAttribute?.('required','');
  else field.removeAttribute?.('required');
}

function guidedTourDocument(root,scope){
  return root?.ownerDocument||scope?.document||globalThis.document||null;
}

function guidedTourIsOpen(documentLike){
  return Boolean(documentLike?.querySelector?.('[data-m26-guided-tour]'));
}

function setGuidedTourOpenAttribute(root,open){
  if(open)root?.setAttribute?.(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE,'true');
  else root?.removeAttribute?.(PROGRESSIVE_ONBOARDING_TOUR_OPEN_ATTRIBUTE);
}

function notifyGuidedTourOpenChange(callback,open){
  if(typeof callback!=='function')return;
  try{callback(Boolean(open));}catch{}
}

export function createProgressiveOnboardingOpenState({
  root,
  documentLike=root?.ownerDocument||globalThis.document,
  onOpenChange,
}={}){
  let open=false;

  function apply(next){
    const normalized=Boolean(next);
    setGuidedTourOpenAttribute(root,normalized);
    if(normalized===open)return normalized;
    open=normalized;
    notifyGuidedTourOpenChange(onOpenChange,normalized);
    return normalized;
  }

  return Object.freeze({
    sync(){return apply(guidedTourIsOpen(documentLike));},
    clear(){return apply(false);},
    isOpen(){return open;},
  });
}

function retainProgressiveOnboardingCompactStyle(documentLike){
  if(!documentLike||!['object','function'].includes(typeof documentLike))return ()=>{};
  const existing=compactStyleRegistry.get(documentLike);
  if(existing){
    existing.count+=1;
    let released=false;
    return ()=>{
      if(released)return;
      released=true;
      existing.count-=1;
      if(existing.count>0)return;
      existing.node?.remove?.();
      compactStyleRegistry.delete(documentLike);
    };
  }
  let node=documentLike.querySelector?.(`[${PROGRESSIVE_ONBOARDING_COMPACT_STYLE_ATTRIBUTE}]`)||null;
  if(!node){
    node=documentLike.createElement?.('style')||null;
    if(node){
      node.setAttribute?.(PROGRESSIVE_ONBOARDING_COMPACT_STYLE_ATTRIBUTE,'');
      node.textContent=PROGRESSIVE_ONBOARDING_COMPACT_STYLE_TEXT;
      if(typeof documentLike.head?.append==='function')documentLike.head.append(node);
      else documentLike.head?.appendChild?.(node);
    }
  }
  if(!node)return ()=>{};
  const record={node,count:1};
  compactStyleRegistry.set(documentLike,record);
  let released=false;
  return ()=>{
    if(released)return;
    released=true;
    record.count-=1;
    if(record.count>0)return;
    record.node?.remove?.();
    compactStyleRegistry.delete(documentLike);
  };
}

export function onboardingAssessmentMode(form){
  const value=String(named(form,'initialAssessmentMode')?.value||'').trim().toLowerCase();
  return value==='deferred'?'deferred':'iri';
}

export function onboardingPostCreateArea(form){
  return onboardingAssessmentMode(form)==='deferred'?'expediente':'iri';
}

export function onboardingChoiceMarkup(){
  return `<section class="m26-form-section m26-panel-soft" data-onboarding-assessment-choice>
    <div class="m26-form-section-title"><span>→</span><div><h3>¿Cómo quieres empezar?</h3><p>El IRI aporta un diagnóstico más completo, pero no bloquea el inicio del trabajo. Puedes realizarlo después.</p></div></div>
    <div class="m26-field-grid">
      <label class="m26-consent"><input type="radio" name="initialAssessmentMode" value="deferred" checked> <span><strong>Empezar a trabajar</strong><small> Crea el expediente con los datos esenciales y continúa directamente con planificación, agenda y sesiones.</small></span></label>
      <label class="m26-consent"><input type="radio" name="initialAssessmentMode" value="iri"> <span><strong>Realizar evaluación IRI</strong><small> Crea el expediente y abre inmediatamente la evaluación inicial IBERFIT.</small></span></label>
    </div>
  </section>`;
}

export function ensureFlexibleOnboardingUi(form){
  if(!form)return false;
  if(!form.querySelector?.('[data-onboarding-assessment-choice]')){
    form.insertAdjacentHTML?.('afterbegin',onboardingChoiceMarkup());
  }
  const action=form.querySelector?.('[data-workflow-action="create-client-draft"]');
  if(action)action.setAttribute?.('data-onboarding-submit','');
  const copy=action?.closest?.('.m26-sticky-actions')?.querySelector?.('p');
  if(copy)copy.setAttribute?.('data-onboarding-next-copy','');
  return true;
}

export function syncFlexibleOnboardingForm(form){
  if(!form)return 'iri';
  const mode=onboardingAssessmentMode(form);
  const deferred=mode==='deferred';
  for(const name of IRI_ONLY_REQUIRED_FIELDS)setRequired(named(form,name),!deferred);
  const modality=String(named(form,'modality')?.value||'').trim().toLowerCase();
  setRequired(named(form,'trainingAddress'),!deferred&&['presencial','hibrido'].includes(modality));
  const phase=named(form,'phase');
  if(phase){
    if(deferred&&(!phase.value||phase.value==='Evaluación inicial'))phase.value='Inicio operativo';
    else if(!deferred&&phase.value==='Inicio operativo')phase.value='Evaluación inicial';
  }
  const submit=form.querySelector?.('[data-onboarding-submit]');
  if(submit)submit.textContent=deferred?'Crear expediente y empezar a trabajar':'Crear expediente y abrir evaluación IRI';
  const copy=form.querySelector?.('[data-onboarding-next-copy]');
  if(copy)copy.innerHTML=deferred
    ?'<strong>Inicio operativo.</strong> El IRI queda disponible para realizarlo más adelante sin bloquear planificación, agenda ni sesiones.'
    :'<strong>Evaluación IRI.</strong> Tras crear el expediente se abrirá la primera sesión de evaluación.';
  return mode;
}

export function progressiveOnboardingTrack(role){
  return ROLE_TRACKS[text(role,40).toLowerCase()]||null;
}

export function progressiveOnboardingScopeKey({userId,role}={}){
  const track=progressiveOnboardingTrack(role);
  const subject=text(userId,240);
  if(!track||!subject)return null;
  return `iberfit.m26.progressive-onboarding.v1:${track.role}:${fnv1a(`${subject}|${track.role}`)}`;
}

function allowedIds(track){
  return new Set(track?.steps?.map((step)=>step.id)||[]);
}

export function normalizeProgressiveOnboardingState(value={},role){
  const track=progressiveOnboardingTrack(role);
  if(!track)return null;
  const allowed=allowedIds(track);
  const visited=Array.from(new Set(
    (Array.isArray(value?.visited)?value.visited:[])
      .map((item)=>text(item,80))
      .filter((item)=>allowed.has(item))
  ));
  const completed=track.steps.every((step)=>visited.includes(step.id));
  return Object.freeze({
    schemaVersion:PROGRESSIVE_ONBOARDING_SCHEMA_VERSION,
    role:track.role,
    visited:Object.freeze(visited),
    hidden:Boolean(value?.hidden),
    completed,
  });
}

export function progressiveOnboardingProgress({role,visited=[]}={}){
  const track=progressiveOnboardingTrack(role);
  if(!track)return null;
  const state=normalizeProgressiveOnboardingState({visited},track.role);
  const completedCount=state.visited.length;
  const total=track.steps.length;
  const nextStep=track.steps.find((step)=>!state.visited.includes(step.id))||null;
  return Object.freeze({
    role:track.role,
    completedCount,
    total,
    percent:total?Math.round((completedCount/total)*100):0,
    completed:completedCount===total,
    nextStep,
  });
}

export function createProgressiveOnboardingRepository({
  storage=globalThis.localStorage,
}={}){
  const memory=new Map();

  function readRaw(key){
    if(!key)return null;
    try{
      const raw=storage?.getItem?.(key);
      if(raw)return JSON.parse(raw);
    }catch{}
    return memory.get(key)||null;
  }

  function writeRaw(key,value){
    if(!key)return false;
    const safe=Object.freeze({
      schemaVersion:PROGRESSIVE_ONBOARDING_SCHEMA_VERSION,
      role:value.role,
      visited:Object.freeze([...(value.visited||[])]),
      hidden:Boolean(value.hidden),
      completed:Boolean(value.completed),
    });
    memory.set(key,safe);
    try{storage?.setItem?.(key,JSON.stringify(safe));}catch{}
    return true;
  }

  return Object.freeze({
    read(key,role){
      return normalizeProgressiveOnboardingState(readRaw(key)||{},role);
    },
    write(key,value){
      const normalized=normalizeProgressiveOnboardingState(value,value?.role);
      return normalized?writeRaw(key,normalized):false;
    },
    reset(key,role){
      const normalized=normalizeProgressiveOnboardingState({},role);
      return normalized?writeRaw(key,normalized):false;
    },
  });
}

export function recordProgressiveOnboardingArea(state,role,area){
  const track=progressiveOnboardingTrack(role);
  const current=normalizeProgressiveOnboardingState(state||{},role);
  if(!track||!current)return current;
  const matching=track.steps.find((step)=>step.area===text(area,80));
  if(!matching||current.visited.includes(matching.id))return current;
  return normalizeProgressiveOnboardingState({
    ...current,
    visited:[...current.visited,matching.id],
  },role);
}

export function renderProgressiveOnboardingPanel({role,state}={}){
  const track=progressiveOnboardingTrack(role);
  const current=normalizeProgressiveOnboardingState(state||{},role);
  if(!track||!current)return '';
  const progress=progressiveOnboardingProgress({role,visited:current.visited});
  const steps=track.steps.map((step)=>{
    const done=current.visited.includes(step.id);
    return `<li class="m26-progressive-onboarding-step${done?' is-complete':''}"><span class="m26-progressive-onboarding-check" aria-hidden="true">${done?'✓':'•'}</span><div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.detail)}</p></div>${done?'<span class="m26-chip">Visto</span>':`<button type="button" class="m26-text-action" data-m26-area="${escapeHtml(step.area)}">Abrir</button>`}</li>`;
  }).join('');
  const next=progress.nextStep
    ?`<button type="button" class="m26-primary-action" data-m26-area="${escapeHtml(progress.nextStep.area)}">Continuar: ${escapeHtml(progress.nextStep.label)}</button>`
    :'<span class="m26-chip is-success">Recorrido completado</span>';
  return `<section class="iberfit-card m26-progressive-onboarding" data-progressive-onboarding-panel aria-labelledby="m26-progressive-onboarding-title"><div class="m26-progressive-onboarding-heading"><div><p class="m26-eyebrow">Guía progresiva</p><h2 id="m26-progressive-onboarding-title">${escapeHtml(track.title)}</h2><p>${escapeHtml(track.summary)}</p></div><button type="button" class="m26-icon-button" data-progressive-onboarding-dismiss aria-label="Ocultar guía progresiva">Ocultar</button></div><div class="m26-progressive-onboarding-meter" role="status" aria-live="polite"><span>${progress.completedCount} de ${progress.total} áreas vistas</span><progress max="${progress.total}" value="${progress.completedCount}">${progress.percent}%</progress></div><ol>${steps}</ol><div class="m26-inline-actions">${next}${progress.completed?'<button type="button" class="m26-text-action" data-progressive-onboarding-reset>Reiniciar guía</button>':''}</div><p class="m26-progressive-onboarding-note">Esta guía solo registra localmente qué áreas has visitado. No almacena datos de salud ni ejecuta acciones por ti.</p></section>`;
}

export function createProgressiveOnboardingController({
  root,
  identityProvider=()=>({}),
  storage=globalThis.localStorage,
  scope=globalThis,
  onOpenChange,
}={}){
  if(!root?.addEventListener)throw new Error('M26_PROGRESSIVE_ONBOARDING_ROOT_REQUIRED');

  const documentLike=guidedTourDocument(root,scope);
  const repository=createProgressiveOnboardingRepository({storage});
  const guidedTour=createGuidedTourController({root,identityProvider,storage,scope});
  const tourOpenState=createProgressiveOnboardingOpenState({root,documentLike,onOpenChange});
  let observer=null;
  let tourObserver=null;
  let releaseCompactStyle=null;
  let mounted=false;
  let scheduled=false;
  let renderedPanel=null;
  let renderedPanelKey=null;
  let pendingClientStartArea=null;

  function identity(){
    const value=identityProvider?.()||{};
    const role=text(value.role,40).toLowerCase();
    const userId=text(value.userId,240);
    const track=progressiveOnboardingTrack(role);
    const key=progressiveOnboardingScopeKey({userId,role});
    return track&&key?Object.freeze({role,userId,track,key}):null;
  }

  function activeArea(){
    return text(
      root.querySelector?.('[data-m26-area][aria-current="page"]')?.getAttribute?.('data-m26-area'),
      80
    );
  }

  function flexibleClientStartForm(){
    return root.querySelector?.(FLEXIBLE_ONBOARDING_SELECTOR)||null;
  }

  function syncFlexibleClientStart(){
    const form=flexibleClientStartForm();
    if(!form)return false;
    ensureFlexibleOnboardingUi(form);
    syncFlexibleOnboardingForm(form);
    return true;
  }

  function syncTourOpenState(){
    if(!mounted){
      tourOpenState.clear();
      return false;
    }
    return tourOpenState.sync();
  }

  function scheduleTourOpenStateSync(){
    queueMicrotask(syncTourOpenState);
  }

  function onDocumentTourClick(event){
    if(!event.target?.closest?.('[data-m26-guided-tour]'))return;
    scheduleTourOpenStateSync();
  }

  function onDocumentTourKeydown(event){
    if(event?.key!=='Escape')return;
    scheduleTourOpenStateSync();
  }

  function removeOwned(){
    root.querySelector?.('[data-progressive-onboarding-launcher]')?.remove?.();
    root.querySelector?.('[data-progressive-onboarding-panel]')?.remove?.();
    renderedPanel=null;
    renderedPanelKey=null;
  }

  function ensureLauncher(context,state){
    const host=root.querySelector?.('.m26-topbar-actions');
    if(!host)return;
    let launcher=root.querySelector?.('[data-progressive-onboarding-launcher]');
    if(!launcher){
      launcher=host.ownerDocument?.createElement?.('button');
      if(!launcher)return;
      launcher.type='button';
      launcher.className='m26-text-action m26-progressive-onboarding-launcher';
      launcher.setAttribute('data-progressive-onboarding-launcher','');
      launcher.setAttribute('data-progressive-onboarding-open','');
      host.prepend?.(launcher);
    }
    setAttributeIfChanged(launcher,'data-m26-area',context.track.home);
    setTextIfChanged(launcher,state.completed?'Guía completada':'Guía');
    setAttributeIfChanged(launcher,'aria-label',state.completed?'Abrir guía progresiva completada':'Abrir guía progresiva');
  }

  function panelRenderKey(context,state){
    return JSON.stringify([
      PROGRESSIVE_ONBOARDING_SCHEMA_VERSION,
      context.role,
      Boolean(state.hidden),
      Boolean(state.completed),
      ...(state.visited||[]),
    ]);
  }

  function ensurePanel(context,state,area){
    const existing=root.querySelector?.('[data-progressive-onboarding-panel]');
    if(area!==context.track.home||state.hidden){
      existing?.remove?.();
      renderedPanel=null;
      renderedPanelKey=null;
      return;
    }
    const main=root.querySelector?.('#m26-main');
    if(!main)return;
    const key=panelRenderKey(context,state);
    const markup=renderProgressiveOnboardingPanel({role:context.role,state});
    if(existing){
      if(existing===renderedPanel&&renderedPanelKey===key)return;
      existing.outerHTML=markup;
      renderedPanel=root.querySelector?.('[data-progressive-onboarding-panel]')||null;
      renderedPanelKey=renderedPanel?key:null;
      return;
    }
    main.insertAdjacentHTML?.('afterbegin',markup);
    renderedPanel=root.querySelector?.('[data-progressive-onboarding-panel]')||null;
    renderedPanelKey=renderedPanel?key:null;
  }

  function render(){
    scheduled=false;
    if(!mounted)return;
    syncFlexibleClientStart();
    const context=identity();
    if(!context){
      removeOwned();
      guidedTour.refresh?.();
      scheduleTourOpenStateSync();
      return;
    }
    const area=activeArea()||context.track.home;
    let state=repository.read(context.key,context.role);
    const nextState=recordProgressiveOnboardingArea(state,context.role,area);
    if(nextState!==state){
      repository.write(context.key,nextState);
      state=nextState;
    }
    ensureLauncher(context,state);
    ensurePanel(context,state,area);
    guidedTour.refresh?.();
    scheduleTourOpenStateSync();
  }

  function schedule(){
    if(scheduled||!mounted)return;
    scheduled=true;
    queueMicrotask(render);
  }

  function onClick(event){
    const context=identity();
    if(!context)return;
    if(event.target?.closest?.('[data-progressive-onboarding-open]')){
      const state=repository.read(context.key,context.role);
      repository.write(context.key,{...state,hidden:false});
      schedule();
      return;
    }
    if(event.target?.closest?.('[data-progressive-onboarding-dismiss]')){
      event.preventDefault?.();
      const state=repository.read(context.key,context.role);
      repository.write(context.key,{...state,hidden:true});
      schedule();
      return;
    }
    if(event.target?.closest?.('[data-progressive-onboarding-reset]')){
      event.preventDefault?.();
      repository.reset(context.key,context.role);
      guidedTour.open?.();
      syncTourOpenState();
      schedule();
    }
  }

  function onFlexibleInput(event){
    if(!event.target?.closest?.(FLEXIBLE_ONBOARDING_SELECTOR))return;
    syncFlexibleClientStart();
    queueMicrotask(syncFlexibleClientStart);
  }

  function onFlexibleSubmit(event){
    const form=event.target?.closest?.(FLEXIBLE_ONBOARDING_SELECTOR);
    if(!form)return;
    ensureFlexibleOnboardingUi(form);
    syncFlexibleOnboardingForm(form);
    pendingClientStartArea=onboardingPostCreateArea(form);
  }

  function onWorkflowError(event){
    if(event?.detail?.action==='create-client-draft')pendingClientStartArea=null;
  }

  function onWorkflowToast(event){
    if(pendingClientStartArea!=='expediente')return;
    const message=String(event?.detail?.message||'');
    if(!/^Expediente de .+ creado\./u.test(message))return;
    pendingClientStartArea=null;
    queueMicrotask(()=>{
      const target=root.querySelector?.('[data-m26-area="expediente"]');
      target?.click?.();
    });
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      root.addEventListener('click',onClick);
      root.addEventListener('input',onFlexibleInput);
      root.addEventListener('change',onFlexibleInput);
      root.addEventListener('submit',onFlexibleSubmit);
      root.addEventListener('m26:workflow-error',onWorkflowError);
      root.addEventListener('m26:toast',onWorkflowToast);
      documentLike?.addEventListener?.('click',onDocumentTourClick,true);
      documentLike?.addEventListener?.('keydown',onDocumentTourKeydown,true);
      if(typeof scope?.MutationObserver==='function'){
        observer=new scope.MutationObserver(schedule);
        observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current']});
        if(documentLike?.body){
          tourObserver=new scope.MutationObserver(syncTourOpenState);
          tourObserver.observe(documentLike.body,{childList:true});
        }
      }
      guidedTour.mount?.();
      releaseCompactStyle=retainProgressiveOnboardingCompactStyle(documentLike);
      syncTourOpenState();
      schedule();
    },
    destroy(){
      mounted=false;
      scheduled=false;
      pendingClientStartArea=null;
      root.removeEventListener('click',onClick);
      root.removeEventListener('input',onFlexibleInput);
      root.removeEventListener('change',onFlexibleInput);
      root.removeEventListener('submit',onFlexibleSubmit);
      root.removeEventListener('m26:workflow-error',onWorkflowError);
      root.removeEventListener('m26:toast',onWorkflowToast);
      documentLike?.removeEventListener?.('click',onDocumentTourClick,true);
      documentLike?.removeEventListener?.('keydown',onDocumentTourKeydown,true);
      observer?.disconnect?.();
      observer=null;
      tourObserver?.disconnect?.();
      tourObserver=null;
      guidedTour.destroy?.();
      tourOpenState.clear();
      releaseCompactStyle?.();
      releaseCompactStyle=null;
      removeOwned();
    },
    refresh(){
      schedule();
      guidedTour.refresh?.();
      scheduleTourOpenStateSync();
    },
    isTourOpen(){
      return tourOpenState.isOpen();
    },
  });
}

export const __progressiveOnboardingInternals=Object.freeze({
  ROLE_TRACKS,
  text,
  escapeHtml,
  fnv1a,
  named,
  setRequired,
  guidedTourIsOpen,
  PROGRESSIVE_ONBOARDING_COMPACT_STYLE_TEXT,
});