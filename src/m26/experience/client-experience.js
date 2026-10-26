import {isIriDeferred} from '../domain/initial-assessment.js';
import {
  hasTrainingService,
  trainingServiceKindFrom,
  trainingServiceStatusFrom,
} from '../domain/training-service.js';

export const CLIENT_EXPERIENCE_STAGES=Object.freeze({
  onboarding:Object.freeze({
    key:'onboarding',
    label:'Alta incompleta',
    priority:1,
  }),
  evaluation:Object.freeze({
    key:'evaluation',
    label:'Evaluación IRI',
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

  // Only an actually completed first-session record establishes the baseline.
  // Never infer confirmation from editable/negated presentation labels.
  const confirmed=Boolean(completedAt);

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
  const serviceSource=summary.client||summary;
  const trainingServiceStatus=trainingServiceStatusFrom(serviceSource);
  const trainingService=hasTrainingService(serviceSource);
  const profileReady=hasProfileEvidence(summary);
  const iri=iriReadiness(summary?.iri);
  const iriDeferred=isIriDeferred(summary);
  const iriRecommended=!iriDeferred;
  const iriBlocking=false;
  const cycleReady=Boolean(summary?.cycle);
  const nextAppointmentReady=Boolean(summary?.nextAppointment);
  // A published, executable autonomous workout does not require a fabricated appointment.
  // Paused services never satisfy execution readiness even when old sessions remain published.
  const autonomousSessionReady=trainingServiceStatus==='active'&&Boolean(summary?.autonomousSessionReady);
  const nextTrainingReady=nextAppointmentReady||autonomousSessionReady;
  const executions=Math.max(
    0,
    Number(summary?.counts?.executions||0)
  );

  let stage;

  if(!profileReady){
    stage=CLIENT_EXPERIENCE_STAGES.onboarding;
  }else if(!trainingService){
    stage=CLIENT_EXPERIENCE_STAGES.evaluation;
  }else if(!cycleReady){
    stage=CLIENT_EXPERIENCE_STAGES.planning;
  }else if(!nextTrainingReady){
    stage=CLIENT_EXPERIENCE_STAGES.scheduling;
  }else{
    stage=CLIENT_EXPERIENCE_STAGES.active;
  }

  const attention=[];

  if(!profileReady)attention.push('profile');
  if(iriDeferred&&!iri.confirmed)attention.push('iri_deferred');
  else if(!iri.exists)attention.push('iri_missing');
  else if(!iri.confirmed)attention.push('iri_incomplete');
  if(trainingService&&!cycleReady)attention.push('planning');
  if(trainingService&&!nextTrainingReady)attention.push('appointment');

  const processSteps=trainingService
    ?[profileReady,cycleReady,nextTrainingReady]
    :[profileReady,iri.confirmed];

  const completedSteps=
    processSteps.filter(Boolean).length;

  return Object.freeze({
    serviceKind:trainingServiceKindFrom(serviceSource),
    trainingServiceStatus,
    stage:stage.key,
    stageLabel:stage.label,
    priority:stage.priority,
    readiness:Object.freeze({
      profile:profileReady,
      iriExists:iri.exists,
      iriConfirmed:iri.confirmed,
      iriDeferred,
      iriRecommended,
      iriRequired:false,
      iriBlocking,
      cycle:cycleReady,
      nextAppointment:nextAppointmentReady,
      autonomousSession:autonomousSessionReady,
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

  if(current.serviceKind!=='training'){
    return action(
      'review_iri',
      current.readiness.iriConfirmed?'Ver informe IRI':'Completar evaluación IRI',
      'iri',
      'La evaluación IRI es independiente del servicio de entrenamiento.'
    );
  }

  if(normalizedRole==='client'){
    if(current.readiness.nextAppointment){
      return action(
        'view_next_appointment',
        'Ver próxima cita en tu plan',
        'planificacion',
        'Consulta la fecha y el estado de tu próxima cita en Tu plan.'
      );
    }

    if(current.readiness.autonomousSession){
      return action(
        'open_autonomous_workout',
        'Ver entrenamiento disponible',
        'sesion',
        'Tu Coach ha publicado una sesión autónoma que puedes realizar desde IBERFIT.'
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

  if(current.stage==='planning'){
    return action(
      'prepare_plan',
      'Preparar planificación',
      'planificacion',
      current.readiness.iriConfirmed
        ?'El servicio de entrenamiento está activo y el IRI ya aporta contexto inicial.'
        :'El servicio de entrenamiento está activo. El IRI puede completarse en paralelo sin bloquear la planificación.'
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
