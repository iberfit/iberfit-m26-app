export const PROGRESSIVE_ONBOARDING_SCHEMA_VERSION='iberfit.progressive-onboarding.v1';

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

function text(value,max=160){
  return String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);
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
}={}){
  if(!root?.addEventListener)throw new Error('M26_PROGRESSIVE_ONBOARDING_ROOT_REQUIRED');

  const repository=createProgressiveOnboardingRepository({storage});
  let observer=null;
  let mounted=false;
  let scheduled=false;

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

  function removeOwned(){
    root.querySelector?.('[data-progressive-onboarding-launcher]')?.remove?.();
    root.querySelector?.('[data-progressive-onboarding-panel]')?.remove?.();
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
    launcher.setAttribute('data-m26-area',context.track.home);
    launcher.textContent=state.completed?'Guía completada':'Guía';
    launcher.setAttribute('aria-label',state.completed?'Abrir guía progresiva completada':'Abrir guía progresiva');
  }

  function ensurePanel(context,state,area){
    const existing=root.querySelector?.('[data-progressive-onboarding-panel]');
    if(area!==context.track.home||state.hidden){
      existing?.remove?.();
      return;
    }
    const main=root.querySelector?.('#m26-main');
    if(!main)return;
    const markup=renderProgressiveOnboardingPanel({role:context.role,state});
    if(existing){
      if(existing.outerHTML!==markup)existing.outerHTML=markup;
      return;
    }
    main.insertAdjacentHTML?.('afterbegin',markup);
  }

  function render(){
    scheduled=false;
    if(!mounted)return;
    const context=identity();
    if(!context){
      removeOwned();
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
      schedule();
    }
  }

  return Object.freeze({
    mount(){
      if(mounted)return;
      mounted=true;
      root.addEventListener('click',onClick);
      if(typeof scope?.MutationObserver==='function'){
        observer=new scope.MutationObserver(schedule);
        observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-current']});
      }
      schedule();
    },
    destroy(){
      if(!mounted)return;
      mounted=false;
      scheduled=false;
      root.removeEventListener('click',onClick);
      observer?.disconnect?.();
      observer=null;
      removeOwned();
    },
    refresh:schedule,
  });
}

export const __progressiveOnboardingInternals=Object.freeze({
  ROLE_TRACKS,
  text,
  escapeHtml,
  fnv1a,
});