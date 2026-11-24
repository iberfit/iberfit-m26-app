import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveClientExperience,
  experienceNextAction,
} from '../src/m26/experience/client-experience.js';

test('una persona evaluada sin entrenamiento completa IRI sin obligaciones de plan o agenda',()=>{
  const experience=deriveClientExperience({
    client:{trainingServiceStatus:'none'},
    profile:{phone:'ok'},
    iri:{status:'confirmed',body:{firstSessionCompletedAt:'2026-07-30T20:00:00Z'}},
    cycle:null,
    nextAppointment:null,
  });
  assert.equal(experience.serviceKind,'none');
  assert.equal(experience.stage,'evaluation');
  assert.equal(experience.process.percentage,100);
  assert.equal(experience.attention.includes('planning'),false);
  assert.equal(experience.attention.includes('appointment'),false);
  const next=experienceNextAction(experience,{role:'coach'});
  assert.equal(next.key,'review_iri');
  assert.equal(next.area,'iri');
});

test('Experience Core detecta alta incompleta',()=>{
  const experience=deriveClientExperience({
    profile:null,
    iri:null,
    cycle:null,
    nextAppointment:null,
  });

  assert.equal(experience.stage,'onboarding');
  assert.equal(experience.priority,1);
  assert.equal(experience.process.percentage,0);

  const next=experienceNextAction(
    experience,
    {role:'coach'}
  );

  assert.equal(next.key,'complete_profile');
  assert.equal(next.area,'expediente');
});

test('IRI iniciado pero no confirmado no bloquea planificación con entrenamiento activo',()=>{
  const experience=deriveClientExperience({
    client:{trainingServiceStatus:'active'},
    profile:{phone:'ok'},
    iri:{status:'draft'},
    cycle:null,
    nextAppointment:null,
  });

  assert.equal(experience.stage,'planning');
  assert.equal(experience.readiness.iriExists,true);
  assert.equal(experience.readiness.iriConfirmed,false);
  assert.equal(experience.readiness.iriRequired,false);
  assert.equal(experience.readiness.iriBlocking,false);
  assert.equal(experience.attention.includes('iri_incomplete'),true);

  const next=experienceNextAction(
    experience,
    {role:'coach'}
  );

  assert.equal(next.key,'prepare_plan');
  assert.equal(next.area,'planificacion');
});

test('IRI confirmado sin ciclo conduce a planificación',()=>{
  const experience=deriveClientExperience({
    profile:{phone:'ok'},
    iri:{status:'confirmed'},
    cycle:null,
    nextAppointment:null,
  });

  assert.equal(experience.stage,'planning');

  const next=experienceNextAction(
    experience,
    {role:'coach'}
  );

  assert.equal(next.key,'prepare_plan');
});

test('plan sin próxima cita entra en scheduling',()=>{
  const experience=deriveClientExperience({
    profile:{phone:'ok'},
    iri:{status:'confirmed'},
    cycle:{id:'cycle-1'},
    nextAppointment:null,
  });

  assert.equal(experience.stage,'scheduling');

  const adminNext=experienceNextAction(
    experience,
    {role:'admin'}
  );

  assert.equal(adminNext.area,'admin-agenda');
});

test('recorrido completo entra en seguimiento activo',()=>{
  const experience=deriveClientExperience({
    profile:{phone:'ok'},
    iri:{status:'confirmed'},
    cycle:{id:'cycle-1'},
    nextAppointment:{id:'appointment-1'},
    counts:{executions:4},
  });

  assert.equal(experience.stage,'active');
  assert.equal(experience.process.percentage,100);
  assert.equal(experience.readiness.executions,4);
});

test('Cliente nunca recibe como siguiente acción completar el IRI del Coach',()=>{
  const experience=deriveClientExperience({
    profile:{phone:'ok'},
    iri:null,
    cycle:null,
    nextAppointment:null,
  });

  const next=experienceNextAction(
    experience,
    {role:'client'}
  );

  assert.equal(next.area,'actividad');
  assert.doesNotMatch(next.label,/IRI/i);
});

test('Paused service with a cached appointment is not active, nor an unfinished scheduling task',()=>{
  for(const nextAppointment of [{id:'old-appointment'},null]){
    const e=deriveClientExperience({client:{trainingServiceStatus:'paused'},profile:{completeness:100},
      cycle:{id:'cycle'},nextAppointment,autonomousSessionReady:true,counts:{executions:8}});
    assert.equal(e.stage,'paused');
    assert.equal(e.stageLabel,'Entrenamiento en pausa');
    assert.equal(e.readiness.nextAppointment,false);
    assert.equal(e.readiness.autonomousSession,false);
    assert.equal(e.readiness.executions,8);
    assert.ok(!e.attention.includes('appointment'));
    assert.ok(!e.attention.includes('planning'));
    for(const role of ['coach','admin','client']){
      const next=experienceNextAction(e,{role});
      assert.notEqual(next.key,'schedule_appointment');
      assert.notEqual(next.key,'view_next_appointment');
      assert.notEqual(next.key,'open_autonomous_workout');
    }
    assert.equal(experienceNextAction(e,{role:'client'}).area,'progreso');
  }
});
