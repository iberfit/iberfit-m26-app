const runtime=globalThis.__IBERFIT_M26_RUNTIME__||Object.freeze({
  enabled:false,
  qaOnly:true,
});

const root=document.querySelector('#app');
if(!root)throw new Error('M26_APP_ROOT_REQUIRED');

let fullAppPromise=null;

function scheduleQualityRuntimeObservability(){
  const start=async()=>{
    const {installQualityRuntimeObservability}=await import('/src/m26/quality/runtime-observability.js');
    const collector=installQualityRuntimeObservability({scope:globalThis});
    globalThis.__IBERFIT_M26_QUALITY_OBSERVABILITY__=collector;
    return collector;
  };

  const ready=new Promise((resolve,reject)=>{
    const run=()=>start().then(resolve,reject);
    if(typeof globalThis.requestIdleCallback==='function'){
      globalThis.requestIdleCallback(run,{timeout:2000});
    }else{
      globalThis.setTimeout(run,0);
    }
  });

  globalThis.__IBERFIT_M26_QUALITY_OBSERVABILITY_READY__=ready;
}

scheduleQualityRuntimeObservability();

async function activateFullStyles(){
  const links=[...document.querySelectorAll('link[data-iberfit-full-style]')];

  await Promise.all(links.map((link)=>new Promise((resolve,reject)=>{
    const pendingHref=link.getAttribute('data-href');
    const activeHref=link.getAttribute('href');
    const targetHref=activeHref||pendingHref;
    if(!targetHref){
      reject(new Error('M26_STYLE_HREF_REQUIRED'));
      return;
    }

    let settled=false;
    const finish=(error)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      link.removeEventListener('load',onLoad);
      link.removeEventListener('error',onError);
      if(error)reject(error);
      else resolve();
    };
    const onLoad=()=>finish();
    const onError=()=>finish(new Error(`M26_STYLE_LOAD_FAILED:${targetHref}`));
    const timer=setTimeout(()=>{
      if(link.sheet)finish();
      else finish(new Error(`M26_STYLE_LOAD_TIMEOUT:${targetHref}`));
    },5000);

    link.addEventListener('load',onLoad,{once:true});
    link.addEventListener('error',onError,{once:true});
    if(!activeHref)link.setAttribute('href',targetHref);
    link.media='all';
    if(link.sheet)queueMicrotask(()=>finish());
  })));
}

function ensureAdaptiveLayoutStyle(){
  const existing=document.querySelector('link[data-iberfit-adaptive-style]');
  if(existing)return existing;

  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/src/m26/design/adaptive-layout.css';
  link.media='not all';
  link.setAttribute('data-iberfit-full-style','');
  link.setAttribute('data-iberfit-adaptive-style','true');
  document.head.append(link);

  return link;
}

const SESSION_VALUE_STYLE_ID='m28-session-value-loop-styles';
const SESSION_VALUE_STYLES=`
.m28-training-value{display:flex;flex-wrap:wrap;gap:.38rem;margin:.18rem 0 .08rem}
.m28-training-value>span{display:inline-flex;align-items:center;min-height:1.65rem;padding:.28rem .48rem;border:1px solid rgba(169,133,52,.2);border-radius:999px;background:rgba(216,185,111,.055);color:var(--m26-text-muted,#6b675f);font-size:.64rem;font-weight:700;line-height:1.2}
.m28-training-value>span[data-entry-state="normal"]{border-color:rgba(60,116,84,.24);color:var(--m26-success,#356f50)}
.m28-training-value>span[data-entry-state="hold"],.m28-training-value>span[data-entry-state="reduced"],.m28-training-value>span[data-entry-state="simplified"],.m28-training-value>span[data-entry-state="unknown"]{border-color:rgba(169,133,52,.3);color:var(--m26-gold,#8f7028)}
.m28-post-session-value{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.55rem;margin:.72rem 0}
.m28-post-session-value>article{display:grid;gap:.2rem;padding:.68rem .74rem;border:1px solid rgba(216,185,111,.16);border-radius:.78rem;background:rgba(216,185,111,.045)}
.m28-post-session-value span{color:var(--m26-gold,#8f7028);font-size:.61rem;font-weight:800;letter-spacing:.075em;text-transform:uppercase}
.m28-post-session-value strong{color:var(--m26-text,#17231d);font-size:.86rem;line-height:1.3}
.m28-post-session-value small{color:var(--m26-text-muted,#6b675f);font-size:.68rem;line-height:1.42}
@media (max-width:560px){.m28-post-session-value{grid-template-columns:1fr}}
`;

function installSessionValueStyles(document){
  if(!document?.head||document.getElementById(SESSION_VALUE_STYLE_ID))return;
  const style=document.createElement('style');
  style.id=SESSION_VALUE_STYLE_ID;
  style.textContent=SESSION_VALUE_STYLES;
  document.head.append(style);
}

function sessionRecordBody(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?record.body
    :record||{};
}

function sessionRecordClientId(record){
  const body=sessionRecordBody(record);
  return String(record?.clientId||record?.client_id||body?.clientId||body?.client_id||'').trim();
}

function sessionRecordId(record){
  const body=sessionRecordBody(record);
  return String(record?.id||body?.id||'').trim();
}

function sessionDisplaySnapshot(state,clientId,sessionId){
  const record=(state?.collections?.sessions||[]).find((item)=>
    sessionRecordId(item)===sessionId&&sessionRecordClientId(item)===clientId
  );
  if(!record)return null;
  const body=sessionRecordBody(record);
  const title=String(body?.title||body?.name||'').trim().slice(0,120)||null;
  const rawDuration=Number(body?.durationMinutes??body?.duration_minutes);
  const durationMinutes=Number.isFinite(rawDuration)&&rawDuration>=5&&rawDuration<=300
    ?Math.round(rawDuration)
    :null;
  const goal=String(body?.goal||body?.objective||'').trim().replace(/\s+/gu,' ').slice(0,180)||null;
  if(!title&&!durationMinutes&&!goal)return null;
  return Object.freeze({title,durationMinutes,goal});
}

function createTextNode(document,tag,className,text){
  const node=document.createElement(tag);
  if(className)node.className=className;
  node.textContent=String(text||'');
  return node;
}

function readinessLabel(level){
  return ({
    normal:'Contexto de hoy: listo para empezar',
    hold:'Contexto de hoy: revisar antes de empezar',
    reduced:'Contexto de hoy: revisar antes de empezar',
    simplified:'Contexto de hoy: revisar antes de empezar',
  })[level]||'Contexto de hoy: revisar antes de empezar';
}

async function installSessionValueLoop({root,getState}={}){
  if(!root?.addEventListener||typeof getState!=='function')throw new Error('M26_SESSION_VALUE_LOOP_CONTEXT_REQUIRED');
  const [continuity,appointments,civilDates,selectors]=await Promise.all([
    import('/src/m26/engagement/progress-continuity.js'),
    import('/src/m26/domain/appointment.js'),
    import('/src/m26/domain/civil-date.js'),
    import('/src/m26/modules/domain-selectors.js'),
  ]);
  const {buildAdherenceWindows}=continuity;
  const {isClientVisibleAppointment,normalizeAppointmentRecord}=appointments;
  const {civilDateInTimeZone,formatIberfitDate}=civilDates;
  const {recordsForClient}=selectors;
  installSessionValueStyles(root.ownerDocument||document);

  function clientId(state){
    const role=String(state?.identity?.role||'').trim().toLowerCase();
    if(role!=='client')return '';
    return String(state?.identity?.clientId||'').trim();
  }

  function enhanceTrainingToday(state,id){
    const card=root.querySelector?.('[data-m27-client-home] [data-home-kind="train-now"]');
    const button=card?.querySelector?.('[data-workflow-action="start-published-session"]');
    const sessionId=String(button?.getAttribute?.('data-entity-id')||'').trim();
    if(!card||!button||!sessionId)return false;
    const value=sessionDisplaySnapshot(state,id,sessionId);
    if(!value)return false;

    const heading=card.querySelector?.('strong');
    if(heading&&value.title)heading.textContent=value.title;

    card.querySelector?.('[data-m28-training-value]')?.remove?.();
    const meta=root.ownerDocument.createElement('div');
    meta.className='m28-training-value';
    meta.setAttribute('data-m28-training-value','true');
    if(value.durationMinutes){
      meta.append(createTextNode(root.ownerDocument,'span','',`Duración prevista · ${value.durationMinutes} min`));
    }
    if(value.goal){
      meta.append(createTextNode(root.ownerDocument,'span','',`Objetivo · ${value.goal}`));
    }
    const level=String(button.getAttribute('data-session-entry-level')||'unknown').trim().toLowerCase()||'unknown';
    const readiness=createTextNode(root.ownerDocument,'span','',readinessLabel(level));
    readiness.setAttribute('data-entry-state',level);
    meta.append(readiness);
    card.insertBefore(meta,button);
    return true;
  }

  function syncFeedbackRequirements(){
    const panel=root.querySelector?.('[data-session-live-state="feedback"] [data-session-live-feedback]');
    if(!panel)return false;
    const comment=panel.querySelector?.('[data-session-feedback-comment]');
    const pain=panel.querySelector?.('[data-session-feedback-pain]');
    const painNotes=panel.querySelector?.('[data-session-feedback-pain-notes]');
    if(comment&&!comment.getAttribute('placeholder')){
      comment.setAttribute('placeholder','Qué fue bien, qué costó o qué debería saber tu Entrenador.');
    }
    if(painNotes&&!painNotes.getAttribute('placeholder')){
      painNotes.setAttribute('placeholder','Indica dónde apareció la molestia, en qué momento o ejercicio y cualquier detalle útil.');
    }
    if(painNotes){
      const required=Boolean(pain?.checked);
      painNotes.required=required;
      painNotes.setAttribute('aria-required',required?'true':'false');
      if(required)painNotes.setAttribute('required','');
      else painNotes.removeAttribute('required');
    }
    return true;
  }

  function nextConfirmedAppointment(state,id,now){
    const today=civilDateInTimeZone(now);
    return recordsForClient(state,'appointments',id)
      .filter((record)=>isClientVisibleAppointment(record))
      .map((record)=>normalizeAppointmentRecord(record))
      .filter((appointment)=>appointment.status==='confirmada')
      .filter((appointment)=>{
        const date=civilDateInTimeZone(appointment.startAt);
        return Boolean(date&&today&&date>today);
      })
      .sort((a,b)=>(new Date(a.startAt).getTime()||0)-(new Date(b.startAt).getTime()||0))[0]||null;
  }

  function continuationSnapshot(state,id,{now=new Date()}={}){
    const window=buildAdherenceWindows(state,id,{now}).find((item)=>item.days===28)||null;
    const next=nextConfirmedAppointment(state,id,now);
    return Object.freeze({
      constancy:window,
      nextAppointment:next,
    });
  }

  function enhanceCompleted(state,id){
    const completed=root.querySelector?.('[data-session-live-state="completed"]');
    const continuityNode=completed?.querySelector?.('[data-m27-session-continuity]');
    if(!completed||!continuityNode)return false;
    completed.querySelector?.('[data-m28-post-session-value]')?.remove?.();

    const confirmed=continuityNode.getAttribute('data-m27-session-continuity')==='confirmed';
    const snapshot=continuationSnapshot(state,id,{now:new Date()});
    const panel=root.ownerDocument.createElement('div');
    panel.className='m28-post-session-value';
    panel.setAttribute('data-m28-post-session-value',confirmed?'confirmed':'pending');
    panel.setAttribute('aria-label','Valor y siguiente paso después del entrenamiento');

    const constancy=root.ownerDocument.createElement('article');
    constancy.append(createTextNode(root.ownerDocument,'span','','Constancia confirmada · 28 días'));
    if(!confirmed){
      constancy.append(
        createTextNode(root.ownerDocument,'strong','','Pendiente de sincronización'),
        createTextNode(root.ownerDocument,'small','','Esta sesión no se suma al progreso confirmado hasta que la sincronización termine.'),
      );
    }else if(Number.isFinite(snapshot.constancy?.adherence)){
      const percent=Math.round(snapshot.constancy.adherence*100);
      constancy.append(
        createTextNode(root.ownerDocument,'strong','',`${percent}% de constancia`),
        createTextNode(root.ownerDocument,'small','',`${snapshot.constancy.completedSessions} de ${snapshot.constancy.plannedSessions} sesiones confirmadas en la ventana disponible.`),
      );
    }else{
      constancy.append(
        createTextNode(root.ownerDocument,'strong','','Ventana todavía insuficiente'),
        createTextNode(root.ownerDocument,'small','','IBERFIT mostrará la constancia cuando exista planificación confirmada suficiente; no convierte ausencia de datos en cero.'),
      );
    }

    const next=root.ownerDocument.createElement('article');
    next.append(createTextNode(root.ownerDocument,'span','','Siguiente paso'));
    if(snapshot.nextAppointment){
      const date=formatIberfitDate(snapshot.nextAppointment.startAt,{locale:'es-CL',includeTime:true})||'Próxima cita confirmada';
      next.append(
        createTextNode(root.ownerDocument,'strong','',date),
        createTextNode(root.ownerDocument,'small','',String(snapshot.nextAppointment.title||'Próximo entrenamiento confirmado')),
      );
    }else{
      next.append(
        createTextNode(root.ownerDocument,'strong','','Revisa tu planificación'),
        createTextNode(root.ownerDocument,'small','','Cuando exista otro entrenamiento confirmado aparecerá aquí. Cliente 360 mantiene el seguimiento de esta sesión.'),
      );
    }

    panel.append(constancy,next);
    const actions=completed.querySelector?.('.m26-session-live-actions');
    if(actions)completed.querySelector?.('.m26-session-live-hero')?.insertBefore(panel,actions);
    else continuityNode.insertAdjacentElement?.('afterend',panel);
    return true;
  }

  function refresh(){
    try{
      const state=getState()||{};
      const id=clientId(state);
      if(!id)return false;
      const a=enhanceTrainingToday(state,id);
      const b=syncFeedbackRequirements();
      const c=enhanceCompleted(state,id);
      return Boolean(a||b||c);
    }catch(error){
      try{console.error('[IBERFIT:session-value-loop] M26_SESSION_VALUE_LOOP_REFRESH_FAILED');}catch{}
      return false;
    }
  }

  function onShellRendered(){refresh();}
  function onChange(event){
    if(event.target?.matches?.('[data-session-feedback-pain]'))syncFeedbackRequirements();
  }

  root.addEventListener('m26:shell-rendered',onShellRendered);
  root.addEventListener('change',onChange);
  refresh();

  return Object.freeze({
    refresh,
    destroy(){
      root.removeEventListener('m26:shell-rendered',onShellRendered);
      root.removeEventListener('change',onChange);
    },
  });
}

async function loadFullApplication(){
  if(fullAppPromise)return fullAppPromise;

  fullAppPromise=(async()=>{
    ensureAdaptiveLayoutStyle();
    await activateFullStyles();
    const {createM26Application}=await import('/src/m26/app/application.js');
    const app=await createM26Application();
    await app.mount();
    try{
      globalThis.__IBERFIT_M26_SESSION_VALUE_LOOP__?.destroy?.();
      globalThis.__IBERFIT_M26_SESSION_VALUE_LOOP__=await installSessionValueLoop({
        root,
        getState:()=>app.getState(),
      });
    }catch{
      globalThis.__IBERFIT_M26_SESSION_VALUE_LOOP__=null;
    }
    globalThis.__IBERFIT_M26_APP__=app;
    return app;
  })();

  try{
    return await fullAppPromise;
  }catch(error){
    fullAppPromise=null;
    throw error;
  }
}

if(runtime.enabled){
  await loadFullApplication();
}else{
  async function elevateDisabledAuth(event){
    const action=event.target.closest?.('[data-auth-action]')?.getAttribute?.('data-auth-action');
    if(action!=='forgot-password')return;

    event.preventDefault();
    event.stopImmediatePropagation();
    root.removeEventListener('click',elevateDisabledAuth,true);

    try{
      await loadFullApplication();
      root.querySelector?.('[data-auth-action="forgot-password"]')?.click();
    }catch(error){
      root.addEventListener('click',elevateDisabledAuth,true);
      throw error;
    }
  }

  root.addEventListener('click',elevateDisabledAuth,true);

  globalThis.__IBERFIT_M26_APP__=Object.freeze({
    runtime,
    mount:async()=>false,
    resume:async()=>false,
    login:async()=>{throw new Error('M26_BACKEND_DISABLED');},
    getState:()=>Object.freeze({}),
    destroy:()=>root.removeEventListener('click',elevateDisabledAuth,true),
  });
}
