import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {renderRc39Route} from '../src/m26/rc39/route-render.js';

const coachVm=({
  appointments=[],
  projections=[],
  clients=[{
    id:'CLI-AGENDA-V2',
    name:'Cliente Agenda',
    modality:'Híbrido',
    profile:{
      modality:'hibrido',
      trainingAddress:'Av. IBERFIT 123',
      commune:'Las Condes',
    },
  }],
  selectedClientId='CLI-AGENDA-V2',
  confirmationOpen=0,
  changeRequests=0,
  needsPreparation=0,
}={})=>({
  kind:'agenda',
  role:'coach',
  clients,
  selectedClientId,
  selectedClient:{id:selectedClientId,modality:'hibrido'},
  rc39:{
    role:'coach',
    appointments,
    sessionProjections:projections,
    confirmationOpen,
    changeRequests,
    needsPreparation,
  },
});

test('Agenda V2 unifica calendario, decisiones y propuesta real del Coach',()=>{
  const html=renderRc39Route(coachVm({
    appointments:[{
      id:'APT-PROPOSAL',
      clientId:'CLI-AGENDA-V2',
      title:'Entrenamiento presencial',
      startAt:'2026-09-15T14:00:00-03:00',
      endAt:'2026-09-15T15:00:00-03:00',
      modality:'presencial',
      location:'Av. IBERFIT 123',
      status:'propuesta',
      confirmation:{state:'not_confirmed',label:'Pendiente'},
    }],
    confirmationOpen:1,
    changeRequests:2,
    needsPreparation:3,
  }));

  assert.match(html,/data-agenda-workbench-v2/);
  assert.match(html,/data-agenda-role="coach"/);
  assert.match(html,/data-rc62-agenda-calendar/);
  assert.match(html,/m30-agenda-decision-strip/);
  assert.match(html,/Confirmaciones abiertas/);
  assert.match(html,/Cambios solicitados/);
  assert.match(html,/Por preparar/);

  assert.match(html,/id="m26-agenda-proposal-form"/);
  assert.match(html,/data-workflow-form="appointment"/);
  assert.match(html,/data-workflow-action="create-appointment"/);
  assert.match(html,/name="clientId"/);
  assert.match(html,/data-training-address="Av\. IBERFIT 123 · Las Condes"/);
  assert.match(html,/name="modality"/);
  assert.match(html,/name="startAt"/);
  assert.match(html,/name="endAt"/);
  assert.match(html,/name="location"/);
  assert.doesNotMatch(html,/name="location"[^>]*required/);
  assert.match(html,/La propuesta permanece interna hasta que la cita sea confirmada/);

  assert.match(
    html,
    /data-workflow-action="confirm-appointment"[^>]*data-entity-id="APT-PROPOSAL"/
  );
  assert.match(html,/Al confirmar será visible para el cliente/);
});

test('Agenda V2 no filtra controles internos ni calendario Coach al Cliente',()=>{
  const html=renderRc39Route({
    kind:'agenda',
    role:'client',
    clients:[],
    selectedClient:{modality:'hibrido'},
    rc39:{
      role:'client',
      appointments:[{
        id:'APT-CONFIRMED',
        clientId:'CLI-AGENDA-V2',
        title:'Sesión confirmada',
        startAt:'2026-09-16T14:00:00-03:00',
        endAt:'2026-09-16T15:00:00-03:00',
        modality:'presencial',
        location:'Las Condes',
        status:'confirmada',
        confirmation:{state:'confirmed',label:'Confirmada'},
      }],
      sessionProjections:[],
      confirmationOpen:0,
      changeRequests:0,
      needsPreparation:0,
    },
  });

  assert.match(html,/data-agenda-role="client"/);
  assert.match(html,/Tu agenda/);
  assert.match(html,/Tus próximas sesiones/);
  assert.match(html,/Próxima cita/);
  assert.match(html,/Citas y sesiones/);
  assert.doesNotMatch(html,/data-rc62-agenda-calendar/);
  assert.doesNotMatch(html,/data-workflow-form="appointment"/);
  assert.doesNotMatch(html,/create-appointment/);
  assert.doesNotMatch(html,/confirm-appointment/);
  assert.doesNotMatch(html,/m30-agenda-decision-strip/);
  assert.doesNotMatch(html,/Propuestas permanecen internas/i);
});

test('cita enlazada conserva confirmación Coach y acciones de sesión existentes',()=>{
  const appointment={
    id:'APT-LINKED',
    clientId:'CLI-AGENDA-V2',
    sessionId:'SESSION-LINKED',
    title:'Fuerza guiada',
    startAt:'2026-09-17T14:00:00-03:00',
    endAt:'2026-09-17T15:00:00-03:00',
    modality:'presencial',
    status:'propuesta',
  };
  const projection={
    id:'SESSION-LINKED',
    clientId:'CLI-AGENDA-V2',
    appointmentId:'APT-LINKED',
    title:'Fuerza guiada',
    startAt:appointment.startAt,
    endAt:appointment.endAt,
    modality:'presencial',
    ownership:'coach_led',
    visibility:'full',
    visible:true,
    canClientExecute:false,
    calendarVisible:true,
    location:'Las Condes',
    confirmation:{state:'not_confirmed',label:'Pendiente'},
    session:{
      id:'SESSION-LINKED',
      title:'Fuerza guiada',
      status:'publicado',
      blocks:[{name:'Sentadilla',sets:3,reps:'8',restSeconds:75}],
    },
    appointment,
  };

  const html=renderRc39Route(coachVm({
    appointments:[appointment],
    projections:[projection],
  }));

  assert.match(
    html,
    /data-workflow-action="confirm-appointment"[^>]*data-entity-id="APT-LINKED"/
  );
  assert.match(html,/data-workflow-action="start-published-session"/);
  assert.match(html,/Google Calendar/);
  assert.match(html,/data-rc39-action="download-calendar"/);
  assert.match(html,/Ver entrenamiento completo/);
});

test('acciones Cliente de confirmación, cambio y Live Workout siguen disponibles cuando corresponde',()=>{
  const appointment={
    id:'APT-CLIENT',
    clientId:'CLI-AGENDA-V2',
    title:'Trabajo autónomo',
    startAt:'2026-09-18T14:00:00-03:00',
    endAt:'2026-09-18T15:00:00-03:00',
    modality:'guiada_en_app',
    status:'confirmada',
  };
  const projection={
    id:'SESSION-CLIENT',
    clientId:'CLI-AGENDA-V2',
    appointmentId:'APT-CLIENT',
    title:'Trabajo autónomo',
    startAt:appointment.startAt,
    endAt:appointment.endAt,
    modality:'guiada_en_app',
    ownership:'guided_in_app',
    visibility:'full',
    visible:true,
    canClientExecute:true,
    calendarVisible:true,
    location:'',
    confirmation:{
      state:'open',
      label:'Confirma tu asistencia',
      canConfirm:true,
      canRequestChange:true,
    },
    changeRequestAvailable:true,
    session:{
      id:'SESSION-CLIENT',
      status:'publicado',
      blocks:[{name:'Remo',sets:3,reps:'10',restSeconds:60}],
    },
    appointment,
  };

  const html=renderRc39Route({
    kind:'agenda',
    role:'client',
    selectedClient:{modality:'hibrido'},
    rc39:{
      role:'client',
      appointments:[appointment],
      sessionProjections:[projection],
    },
  });

  assert.match(html,/data-rc39-action="confirm-attendance"/);
  assert.match(html,/data-rc39-action="open-change-request"/);
  assert.match(html,/data-rc39-change-form="APT-CLIENT"/);
  assert.match(html,/data-workflow-action="start-published-session"/);
  assert.match(html,/Comenzar Live Workout/);
});

test('Agenda V2 conserva el vacío y los landmarks históricos',()=>{
  const html=renderRc39Route(coachVm());

  assert.match(html,/m30-agenda-route/);
  assert.match(html,/m30-agenda-calendar/);
  assert.match(html,/m30-agenda-list/);
  assert.match(html,/Agenda vacía/);
  assert.match(html,/Crear propuesta de cita/);
});

test('Agenda V2 adapta el workbench a escritorio tablet y móvil sin ocultar capacidades',()=>{
  const css=fs.readFileSync(
    new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),
    'utf8'
  );
  const start=css.indexOf('AGENDA_WORKBENCH_V2_BEGIN');
  assert.ok(start>=0);
  const added=css.slice(start);

  for(const selector of [
    '.m30-agenda-workbench-v2',
    '.m30-agenda-decision-strip',
    '.m30-agenda-decision-metrics',
    '.m30-agenda-list-panel',
    '.m30-agenda-proposal',
  ]) assert.ok(added.includes(selector),selector);

  assert.match(added,/@media \(max-width:1180px\)/);
  assert.match(added,/@media \(max-width:900px\)/);
  assert.match(added,/@media \(max-width:620px\)/);
  assert.match(added,/@media \(max-width:390px\)/);
  assert.doesNotMatch(added,/display\s*:\s*none|visibility\s*:\s*hidden/iu);
  assert.doesNotMatch(added,/pointer-events\s*:\s*none/iu);
});
