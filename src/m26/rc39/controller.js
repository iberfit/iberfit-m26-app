import {buildClientConfirmAppointmentCommand} from './agenda-extension.js';
import {appointmentCalendarEvent,downloadIcs} from './calendar.js';
import {createRc62AgendaCalendarController} from '../agenda/fullcalendar-agenda.js';

const recordBody=(record)=>record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)?record.body:record;
const field=(record,...keys)=>{
  const body=recordBody(record)||{};
  for(const key of keys){
    const value=record?.[key]??body?.[key];
    if(value!==undefined&&value!==null&&value!=='')return value;
  }
  return null;
};
const appointmentById=(state,id)=>(state.collections?.appointments||[]).find((item)=>
  String(field(item,'id','entityId','entity_id')||'')===String(id||'')
);
const toast=(message)=>{try{globalThis.dispatchEvent(new CustomEvent('m26:toast',{detail:{message}}));}catch{}};

export function createRc39Controller({
  root,
  store,
  commandBus,
  transport,
  getToken=()=>null,
  refreshState=async()=>{},
  render=()=>{},
}={}){
  if(!root?.addEventListener||!store?.getState)throw new Error('M26_RC39_CONTROLLER_CONTEXT_REQUIRED');
  const agendaCalendar=createRc62AgendaCalendarController({root,store});
  let busy=false;
  async function execute(command,success){
    if(busy)return;
    if(!commandBus?.execute)throw new Error('M26_RC39_COMMAND_BUS_REQUIRED');
    busy=true;
    try{
      const result=await commandBus.execute(command);
      if(!result?.ok)throw new Error(`M26_RC39_COMMAND_${String(result?.kind||'FAILED').toUpperCase()}`);
      toast(success);
      render();
    }finally{busy=false;}
  }
  function openChangeForm(button){
    const card=button.closest?.('[data-rc39-session]');
    const form=card?.querySelector?.('[data-rc39-change-form]');
    if(form){form.hidden=false;form.querySelector?.('textarea')?.focus?.();}
  }
  function closeChangeForm(button){
    const form=button.closest?.('[data-rc39-change-form]');
    if(form)form.hidden=true;
  }
  async function onClick(event){
    const button=event.target.closest?.('[data-rc39-action]');
    if(!button)return;
    const action=button.getAttribute('data-rc39-action');
    const id=button.getAttribute('data-appointment-id');
    if(action==='open-change-request'){openChangeForm(button);return;}
    if(action==='close-change-request'){closeChangeForm(button);return;}
    const appointment=appointmentById(store.getState(),id);
    if(!appointment){toast('La cita ya no está disponible. Actualiza la agenda.');return;}
    if(action==='download-calendar'){
      try{downloadIcs(appointmentCalendarEvent(appointment));}
      catch{toast('No fue posible crear el archivo de calendario.');}
      return;
    }
    if(action==='confirm-attendance'){
      const command=buildClientConfirmAppointmentCommand({
        clientId:String(field(appointment,'clientId','client_id')||''),
        appointmentId:String(field(appointment,'id','entityId','entity_id')||''),
        startAt:field(appointment,'startAt','start_at','scheduledAt','scheduled_at','date'),
      },Number(field(appointment,'revision')||0));
      await execute(command,'Asistencia confirmada.');
      return;
    }
    if(action==='resolve-change-request'){
      const requestId=button.getAttribute('data-request-id');
      const resolution=button.getAttribute('data-resolution');
      if(!transport?.resolveAppointmentChange)throw new Error('M26_APPOINTMENT_CHANGE_BACKEND_REQUIRED');
      busy=true;
      try{
        await transport.resolveAppointmentChange(await getToken(),{requestId,resolution});
        await refreshState({reason:'appointment-change-resolved'});
        toast(resolution==='accepted'?'Solicitud aceptada. Reprograma ahora la cita.':'Solicitud cerrada.');
        render();
      }finally{busy=false;}
    }
  }
  async function onSubmit(event){
    const form=event.target.closest?.('[data-rc39-change-form]');
    if(!form)return;
    event.preventDefault();
    const appointment=appointmentById(store.getState(),form.getAttribute('data-rc39-change-form'));
    if(!appointment){toast('La cita ya no está disponible.');return;}
    if(!transport?.requestAppointmentChange)throw new Error('M26_APPOINTMENT_CHANGE_BACKEND_REQUIRED');
    const data=new FormData(form);
    const reason=String(data.get('reason')||'').trim();
    if(reason.length<3){toast('Explica brevemente el cambio que necesitas.');return;}
    busy=true;
    try{
      await transport.requestAppointmentChange(await getToken(),{
        clientId:String(field(appointment,'clientId','client_id')||''),
        appointmentId:String(field(appointment,'id','entityId','entity_id')||''),
        reason,
      });
      await refreshState({reason:'appointment-change-requested'});
      toast('Solicitud de cambio enviada al Coach.');
      form.hidden=true;
      render();
    }finally{busy=false;}
  }
  function mount(){agendaCalendar.mount();root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);}
  function destroy(){agendaCalendar.destroy();root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);}
  return Object.freeze({mount,destroy});
}
