export const CLIENT_EXPERIENCE_STAGES=Object.freeze({
  onboarding:Object.freeze({
    key:'onboarding',
    label:'Alta incompleta',
    priority:1,
  }),
  evaluation:Object.freeze({
    key:'evaluation',
    label:'Evaluación pendiente',
    priority:2,
  }),
  planning:Object.freeze({
    key:'planning',
    label:'Planificación pendiente',
    priority:3,
  }),
  scheduling:Object.freeze({
    key:'scheduling',
    label:'Próxima cita pendiente',
    priority:4,
  }),
  active:Object.freeze({
    key:'active',
    label:'Seguimiento activo',
    priority:5,
  }),
});

function bodyOf(record){
  return record?.body&&typeof record.body==='object'&&!Array.isArray(record.body)
    ?record.body
    :{};
}

function value(record,...keys){
  const body=bodyOf(record);
  for(const key of keys){
    const candidate=record?.[key]??body?.[key];
    if(candidate!==undefined&&candidate!==null&&candidate!==''){
      return candidate;
    }
  }
  return null;
}

function objectHasData(value){
  return Boolean(
    value&&
    typeof value==='object'&&
    !Array.isArray(value)&&
    Object.keys(value).length
  );
}

function hasProfileEvidence(summary){
  const profile=summary?.profile;
  const completeness=Number(profile?.completeness);

  if(Number.isFinite(completeness)){
    return completeness>=100;
  }

  if(objectHasData(profile))return true;

  const body=bodyOf(summary?.iri);
  return objectHasData(
    body.personProfile||
    body.person_profile
  );
}

function iriReadiness(record){
  if(!record){
    return Object.freeze({
      exists:false,
      confirmed:false,
      inProgress:false,
    });
  }

  const status=String(
    value(record,'status','estado')||''
  ).toLowerCase();

  const completedAt=value(
    record,
    'firstSessionCompletedAt',
    'first_session_completed_at'
  );

  const confirmed=
    Boolean(completedAt)||
    /(?:complet|confirmad|confirmed|complete)/i.test(status);

  return Object.freeze({
    exists:true,
    confirmed,
    inProgress:!confirmed,
  });
}

function action(key,label,area,reason){
  return Object.freeze({key,label,area,reason});
}

export function deriveClientExperience(summary={}){
  const profileReady=hasProfileEvidence(summary);
  const iri=iriReadiness(summary?.iri);
  const cycleReady=Boolean(summary?.cycle);
  const nextAppointmentReady=Boolean(summary?.nextAppointment);
  const executions=Math.max(
    0,
    Number(summary?.counts?.executions||0)
  );

  let stage;

  if(!profileReady){
    stage=CLIENT_EXPERIENCE_STAGES.onboarding;
  }else if(!iri.confirmed){
    stage=CLIENT_EXPERIENCE_STAGES.evaluation;
  }else if(!cycleReady){
    stage=CLIENT_EXPERIENCE_STAGES.planning;
  }else if(!nextAppointmentReady){
    stage=CLIENT_EXPERIENCE_STAGES.scheduling;
  }else{
    stage=CLIENT_EXPERIENCE_STAGES.active;
  }

  const attention=[];

  if(!profileReady)attention.push('profile');
  if(!iri.exists)attention.push('iri_missing');
  else if(!iri.confirmed)attention.push('iri_incomplete');
  if(!cycleReady)attention.push('planning');
  if(!nextAppointmentReady)attention.push('appointment');

  const processSteps=[
    profileReady,
    iri.confirmed,
    cycleReady,
    nextAppointmentReady,
  ];

  const completedSteps=
    processSteps.filter(Boolean).length;

  return Object.freeze({
    stage:stage.key,
    stageLabel:stage.label,
    priority:stage.priority,
    readiness:Object.freeze({
      profile:profileReady,
      iriExists:iri.exists,
      iriConfirmed:iri.confirmed,
      cycle:cycleReady,
      nextAppointment:nextAppointmentReady,
      executions,
    }),
    process:Object.freeze({
      completedSteps,
      totalSteps:processSteps.length,
      percentage:Math.round(
        completedSteps/processSteps.length*100
      ),
    }),
    attention:Object.freeze(attention),
  });
}

export function experienceNextAction(
  experience,
  {role='coach'}={}
){
  const current=experience||
    deriveClientExperience();

  const normalizedRole=
    String(role||'coach').trim().toLowerCase();

  if(normalizedRole==='client'){
    if(current.readiness.nextAppointment){
      return action(
        'view_next_appointment',
        'Ver próxima cita',
        'agenda',
        'Tienes una próxima cita confirmada.'
      );
    }

    if(current.readiness.cycle){
      return action(
        'review_plan',
        'Revisar tu planificación',
        'planificacion',
        'Tu planificación está disponible.'
      );
    }

    return action(
      'daily_checkin',
      'Registrar cómo estás hoy',
      'actividad',
      'Tu contexto diario ayuda a personalizar el seguimiento.'
    );
  }

  if(normalizedRole==='admin'){
    if(current.stage==='scheduling'){
      return action(
        'schedule_appointment',
        'Programar próxima cita',
        'admin-agenda',
        'El cliente no tiene próxima cita.'
      );
    }

    return action(
      `review_${current.stage}`,
      'Revisar situación del cliente',
      'admin-clientes',
      current.stageLabel
    );
  }

  if(current.stage==='onboarding'){
    return action(
      'complete_profile',
      'Completar expediente',
      'expediente',
      'Faltan datos base antes de continuar.'
    );
  }

  if(current.stage==='evaluation'){
    return action(
      current.readiness.iriExists
        ?'continue_iri'
        :'start_iri',
      current.readiness.iriExists
        ?'Continuar diagnóstico IRI'
        :'Iniciar diagnóstico IRI',
      'iri',
      'La evaluación debe quedar confirmada antes de planificar.'
    );
  }

  if(current.stage==='planning'){
    return action(
      'prepare_plan',
      'Preparar planificación',
      'planificacion',
      'La evaluación está lista y falta una planificación.'
    );
  }

  if(current.stage==='scheduling'){
    return action(
      'schedule_appointment',
      'Programar próxima cita',
      'agenda',
      'Existe planificación pero no una próxima cita.'
    );
  }

  return action(
    'review_follow_up',
    'Revisar seguimiento',
    'expediente',
    'El cliente tiene su recorrido operativo preparado.'
  );
}
