import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAppointmentCommand,
} from '../src/m26/workflows/agenda-workflow.js';
import {
  appointmentStatusLabel,
  isClientVisibleAppointment,
  normalizeAppointmentRecord,
} from '../src/m26/domain/appointment.js';
import {
  projectCollectionsForRole,
} from '../src/m26/security/role-projection.js';
import {
  createProductionState,
} from '../src/m26/production-state.js';
import {
  createRouteViewModel,
} from '../src/m26/modules/route-view-model.js';
import {
  renderAgendaRoute,
} from '../src/m26/modules/route-render.js';
import {
  syncAppointmentFormState,
} from '../src/m26/app/workflow-controller.js';

const own='CLI-RC31-A';
const client={
  id:'USR-RC31-A',
  role:'client',
  clientId:own,
  name:'Cliente RC31',
};

function stateWith({
  role='client',
  appointments=[],
}={}){
  const base=createProductionState();

  return createProductionState({
    identity:role==='client'
      ? client
      : {id:'USR-COACH-RC31',role:'coach',name:'Coach RC31'},
    activeArea:role==='client'?'hoy':'agenda',
    selectedClientId:own,
    collections:{
      ...base.collections,
      clients:[{id:own,name:'Cliente RC31',status:'activo'}],
      appointments,
    },
  });
}

test('crear una cita genera una propuesta privada y conserva modalidad online',()=>{
  const command=buildAppointmentCommand({
    clientId:own,
    startAt:'2026-08-01T12:00:00.000Z',
    endAt:'2026-08-01T13:00:00.000Z',
    modality:'online',
    location:'',
  });

  assert.equal(command.type,'CITA_CREAR');
  assert.equal(command.payload.appointment.modality,'online');
  assert.equal(command.payload.appointment.status,'propuesta');
  assert.equal(command.payload.appointment.visibleToClient,false);
});

test('normalización lee modalidad y estado aunque vengan dentro de body',()=>{
  const record=normalizeAppointmentRecord({
    id:'A-RC31',
    body:{
      client_id:own,
      modality:'online',
      status:'propuesta',
      start_at:'2026-08-01T12:00:00.000Z',
    },
  });

  assert.equal(record.clientId,own);
  assert.equal(record.modality,'online');
  assert.equal(record.modalityLabel,'En línea');
  assert.equal(record.status,'propuesta');
  assert.equal(record.statusLabel,'Propuesta');
});

test('solo las citas confirmadas o realizadas son visibles para el Cliente',()=>{
  const source={
    appointments:[
      {id:'draft',clientId:own,status:'borrador'},
      {id:'proposal',clientId:own,status:'propuesta'},
      {id:'pending',clientId:own,status:'pendiente'},
      {id:'confirmed',clientId:own,status:'confirmada',modality:'online'},
      {id:'completed',clientId:own,status:'realizada',modality:'presencial',location:'Las Condes'},
      {id:'explicit-hidden',clientId:own,status:'confirmada',visibleToClient:false},
      {id:'other',clientId:'CLI-RC31-B',status:'confirmada'},
    ],
  };

  const projected=projectCollectionsForRole(source,client);

  assert.deepEqual(
    projected.appointments.map((item)=>item.id),
    ['confirmed','completed']
  );

  assert.equal(
    projected.appointments[0].modality,
    'online'
  );

  assert.equal(
    isClientVisibleAppointment(source.appointments[1]),
    false
  );

  assert.equal(
    isClientVisibleAppointment(source.appointments[3]),
    true
  );
});

test('Hoy del Cliente excluye propuestas incluso si el estado no fue proyectado antes',()=>{
  const state=stateWith({
    appointments:[
      {
        id:'proposal',
        clientId:own,
        status:'propuesta',
        modality:'online',
        startAt:'2026-08-01T12:00:00.000Z',
        endAt:'2026-08-01T13:00:00.000Z',
      },
      {
        id:'confirmed',
        clientId:own,
        status:'confirmada',
        modality:'online',
        startAt:'2026-08-01T14:00:00.000Z',
        endAt:'2026-08-01T15:00:00.000Z',
      },
    ],
  });

  const vm=createRouteViewModel(
    {activeArea:'hoy',identity:client},
    state,
    new Date('2026-08-01T10:00:00.000Z')
  );

  assert.deepEqual(
    vm.upcoming.map((item)=>item.id),
    ['confirmed']
  );

  assert.equal(vm.upcoming[0].modality,'En línea');
  assert.equal(vm.upcoming[0].status,'Confirmada');
});

test('Agenda Coach muestra modalidad y estado desde registros anidados',()=>{
  const state=stateWith({
    role:'coach',
    appointments:[
      {
        id:'nested',
        body:{
          client_id:own,
          modality:'online',
          status:'propuesta',
          start_at:'2026-08-01T12:00:00.000Z',
          end_at:'2026-08-01T13:00:00.000Z',
        },
      },
    ],
  });

  const vm=createRouteViewModel(
    {
      activeArea:'agenda',
      identity:{id:'USR-COACH-RC31',role:'coach'},
    },
    state,
    new Date('2026-08-01T10:00:00.000Z')
  );

  assert.equal(vm.appointments[0].clientId,own);
  assert.equal(vm.appointments[0].modality,'En línea');
  assert.equal(vm.appointments[0].status,'Propuesta');
  assert.equal(appointmentStatusLabel('scheduled'),'Confirmada');
});

test('el formulario elimina el error anterior y ajusta ubicación según modalidad',()=>{
  const statusNode={
    textContent:'Revisa los campos obligatorios.',
    dataset:{status:'error'},
  };

  const location={
    required:true,
    attributes:new Map([['required','']]),
    setAttribute(name,value){this.attributes.set(name,value);},
    removeAttribute(name){this.attributes.delete(name);},
  };

  const modality={value:'online'};
  const help={textContent:''};

  const form={
    ownerDocument:null,
    elements:{
      namedItem(name){
        if(name==='modality')return modality;
        if(name==='location')return location;
        return null;
      },
    },
    querySelector(selector){
      if(selector==='#m26-location-help')return help;
      return null;
    },
  };

  const root={
    querySelector(selector){
      return selector==='[data-workflow-status="appointment"]'
        ? statusNode
        : null;
    },
  };

  let state=syncAppointmentFormState(form,root);

  assert.equal(state.modality,'online');
  assert.equal(state.locationRequired,false);
  assert.equal(location.required,false);
  assert.equal(statusNode.textContent,'');
  assert.equal(statusNode.dataset.status,undefined);

  modality.value='presencial';
  state=syncAppointmentFormState(form,root);

  assert.equal(state.locationRequired,true);
  assert.equal(location.required,true);
  assert.match(help.textContent,/Obligatoria/);
});

test('la pantalla Coach diferencia propuesta de cita confirmada',()=>{
  const html=renderAgendaRoute({
    appointments:[],
    clients:[{id:own,name:'Cliente RC31'}],
    selectedClientId:own,
  });

  assert.match(html,/Crear propuesta de cita/);
  assert.match(html,/permanece interna/);
  assert.match(html,/cliente solo recibe citas confirmadas/i);
  assert.match(
    html,
    /name="location"[^>]*required/
  );
});
