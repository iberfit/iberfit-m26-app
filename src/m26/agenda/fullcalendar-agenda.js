export const FULLCALENDAR_STANDARD_VERSION='7.0.2';
export const FULLCALENDAR_SOURCE_KIND='npm-registry-pinned-7.0.2';
export const RC62_AGENDA_TIME_ZONE='America/Santiago';

const ASSETS=Object.freeze({
  core:'/src/m26/vendor/fullcalendar-7.0.2/all.global.js',
  skeleton:'/src/m26/vendor/fullcalendar-7.0.2/skeleton.css',
  themeScript:'/src/m26/vendor/fullcalendar-7.0.2/monarch.global.js',
  themeCss:'/src/m26/vendor/fullcalendar-7.0.2/monarch.theme.css',
  palette:'/src/m26/vendor/fullcalendar-7.0.2/monarch.purple.css',
  locale:'/src/m26/vendor/fullcalendar-7.0.2/es.global.js',
});

let assetPromise=null;

function text(value,max=240){
  return String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);
}

function field(record,...keys){
  const body=record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?record.body
    :{};
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
}

function safeDate(value){
  const time=value?new Date(value).getTime():NaN;
  return Number.isFinite(time)?new Date(time).toISOString():null;
}

function safeClass(value){
  return text(value,80).toLowerCase().replace(/[^a-z0-9_-]+/gu,'-').replace(/^-+|-+$/gu,'');
}

export function agendaRoleEligible(role){
  return text(role,40).toLowerCase()==='coach';
}

export function buildRc62AgendaEvents(records=[]){
  return Object.freeze(
    (Array.isArray(records)?records:[])
      .map((record)=>{
        const id=text(field(record,'id','entityId','entity_id'),160);
        const start=safeDate(field(record,'startAt','start_at','scheduledAt','scheduled_at','date'));
        const end=safeDate(field(record,'endAt','end_at'));
        if(!id||!start||!end||new Date(end).getTime()<=new Date(start).getTime())return null;
        const status=safeClass(field(record,'status','estado'))||'sin-estado';
        const modality=safeClass(field(record,'modality','modalidad'))||'sin-modalidad';
        return Object.freeze({
          id,
          title:text(field(record,'title','titulo','name','nombre')||'Sesión IBERFIT',180),
          start,
          end,
          classNames:Object.freeze([
            `m26-fc-status-${status}`,
            `m26-fc-modality-${modality}`,
          ]),
          extendedProps:Object.freeze({
            appointmentId:id,
            status,
            modality,
          }),
        });
      })
      .filter(Boolean)
  );
}

function addStyle(documentLike,path){
  if(documentLike.querySelector?.(`link[data-rc62-fullcalendar="${path}"]`))return;
  const link=documentLike.createElement('link');
  link.rel='stylesheet';
  link.href=path;
  link.dataset.rc62Fullcalendar=path;
  documentLike.head.append(link);
}

function addScript(documentLike,path){
  return new Promise((resolve,reject)=>{
    const existing=documentLike.querySelector?.(`script[data-rc62-fullcalendar="${path}"]`);
    if(existing){
      if(existing.dataset.loaded==='true'){resolve();return;}
      existing.addEventListener?.('load',resolve,{once:true});
      existing.addEventListener?.('error',()=>reject(new Error('M26_RC62_FULLCALENDAR_ASSET_FAILED')),{once:true});
      return;
    }
    const script=documentLike.createElement('script');
    script.src=path;
    script.async=false;
    script.dataset.rc62Fullcalendar=path;
    script.addEventListener('load',()=>{
      script.dataset.loaded='true';
      resolve();
    },{once:true});
    script.addEventListener('error',()=>reject(new Error('M26_RC62_FULLCALENDAR_ASSET_FAILED')),{once:true});
    documentLike.head.append(script);
  });
}

export async function loadFullCalendarStandard({
  scope=globalThis,
  documentLike=globalThis.document,
}={}){
  if(scope?.FullCalendar?.Calendar)return scope.FullCalendar;
  if(!documentLike?.createElement||!documentLike?.head)throw new Error('M26_RC62_FULLCALENDAR_DOCUMENT_REQUIRED');
  if(assetPromise)return assetPromise;
  assetPromise=(async()=>{
    addStyle(documentLike,ASSETS.skeleton);
    addStyle(documentLike,ASSETS.themeCss);
    addStyle(documentLike,ASSETS.palette);
    await addScript(documentLike,ASSETS.core);
    await addScript(documentLike,ASSETS.themeScript);
    await addScript(documentLike,ASSETS.locale);
    if(!scope?.FullCalendar?.Calendar)throw new Error('M26_RC62_FULLCALENDAR_UNAVAILABLE');
    return scope.FullCalendar;
  })().catch((error)=>{
    assetPromise=null;
    throw error;
  });
  return assetPromise;
}

function fallbackCard(root,appointmentId){
  const id=text(appointmentId,160);
  if(!id)return null;
  for(const node of root?.querySelectorAll?.('[data-appointment-card]')||[]){
    if(String(node.getAttribute?.('data-appointment-card')||'')===id)return node;
  }
  return null;
}

export function fullCalendarCoachOptions({
  events=[],
  onAppointmentFocus=()=>{},
}={}){
  return Object.freeze({
    initialView:'timeGridWeek',
    locale:'es',
    timeZone:RC62_AGENDA_TIME_ZONE,
    themeSystem:'monarch',
    firstDay:1,
    allDaySlot:false,
    nowIndicator:true,
    expandRows:true,
    height:'auto',
    slotMinTime:'06:00:00',
    slotMaxTime:'22:00:00',
    editable:false,
    selectable:false,
    eventStartEditable:false,
    eventDurationEditable:false,
    eventInteractive:true,
    navLinks:false,
    headerToolbar:Object.freeze({
      left:'prev,next today',
      center:'title',
      right:'timeGridWeek,timeGridDay',
    }),
    buttonText:Object.freeze({
      today:'Hoy',
      week:'Semana',
      day:'Día',
    }),
    events,
    eventClick(info){
      info?.jsEvent?.preventDefault?.();
      onAppointmentFocus(info?.event?.id||info?.event?.extendedProps?.appointmentId||'');
    },
  });
}

export function createRc62AgendaCalendarController({
  root,
  store,
  scope=globalThis,
}={}){
  if(!root?.querySelector||!store?.getState)throw new Error('M26_RC62_AGENDA_CONTEXT_REQUIRED');

  let observer=null;
  let mediaQuery=null;
  let calendar=null;
  let calendarHost=null;
  let generation=0;
  let mounted=false;

  function destroyCalendar(){
    generation++;
    try{calendar?.destroy?.();}catch{}
    calendar=null;
    calendarHost=null;
  }

  function desktopEligible(){
    try{
      const result=scope?.matchMedia?.('(min-width: 720px)');
      return !result||result.matches!==false;
    }catch{
      return true;
    }
  }

  async function refresh(){
    const state=store.getState();
    const role=text(state?.identity?.role,40).toLowerCase();
    const host=root.querySelector('[data-rc62-agenda-calendar]');
    if(!agendaRoleEligible(role)||!host||!desktopEligible()){
      destroyCalendar();
      return;
    }

    const events=buildRc62AgendaEvents(state?.collections?.appointments||[]);
    if(calendar&&calendarHost===host){
      calendar.removeAllEvents?.();
      calendar.addEventSource?.(events);
      return;
    }

    destroyCalendar();
    const request=++generation;
    try{host.dataset.calendarStatus='loading';}catch{}
    try{
      const FullCalendar=await loadFullCalendarStandard({scope,documentLike:scope?.document||globalThis.document});
      if(request!==generation||host.isConnected===false)return;
      const focusAppointment=(appointmentId)=>{
        const card=fallbackCard(root,appointmentId);
        card?.scrollIntoView?.({block:'center',behavior:'auto'});
        card?.focus?.({preventScroll:true});
      };
      calendar=new FullCalendar.Calendar(
        host,
        fullCalendarCoachOptions({events,onAppointmentFocus:focusAppointment})
      );
      calendarHost=host;
      calendar.render();
      try{host.dataset.calendarStatus='ready';}catch{}
    }catch{
      if(request!==generation)return;
      try{host.dataset.calendarStatus='fallback';}catch{}
      calendar=null;
      calendarHost=null;
    }
  }

  function scheduleRefresh(){
    const run=()=>{void refresh();};
    if(typeof scope?.requestAnimationFrame==='function')scope.requestAnimationFrame(run);
    else queueMicrotask(run);
  }

  function onMediaChange(){scheduleRefresh();}

  return Object.freeze({
    mount(){
      if(mounted)return;
      try{
        mediaQuery=scope?.matchMedia?.('(min-width: 720px)')||null;
        mediaQuery?.addEventListener?.('change',onMediaChange);
      }catch{
        mediaQuery=null;
      }
      if(typeof scope?.MutationObserver==='function'){
        observer=new scope.MutationObserver(()=>scheduleRefresh());
        observer.observe(root,{childList:true,subtree:true});
      }
      mounted=true;
      scheduleRefresh();
    },
    destroy(){
      if(!mounted)return;
      observer?.disconnect?.();
      observer=null;
      mediaQuery?.removeEventListener?.('change',onMediaChange);
      mediaQuery=null;
      destroyCalendar();
      mounted=false;
    },
    refresh:()=>refresh(),
  });
}