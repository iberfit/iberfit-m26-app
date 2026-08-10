function txt(value,fallback=''){const clean=String(value??'').trim();return clean||fallback;}
function normalizedLevel(value){const level=txt(value,'normal').toLowerCase();return ['hold','reduced','simplified','normal'].includes(level)?level:'normal';}
function processKind(stage){return stage==='active'?'clear':'process';}
function frozenAction(baseAction={},overrides={}){return Object.freeze({...baseAction,...overrides});}

export function deriveAdaptiveExperience({experience={},baseAction={},adaptiveContext=null,role='coach'}={}){
  const normalizedRole=txt(role,'coach').toLowerCase();
  const stage=txt(experience?.stage,'active');
  const level=normalizedLevel(adaptiveContext?.decision?.level);
  const evidence=adaptiveContext?.evidence||{};
  const structuralOnly=stage!=='active';

  if(structuralOnly){
    return Object.freeze({
      level:'structural',
      kind:processKind(stage),
      label:txt(experience?.stageLabel,'Recorrido pendiente'),
      reason:txt(baseAction?.reason,experience?.stageLabel||'El recorrido tiene un paso pendiente.'),
      coachReviewRequired:false,
      source:'experience-core',
      dataQuality:txt(evidence?.dataQuality,'limitada'),
      action:frozenAction(baseAction),
    });
  }

  if(level==='hold'){
    if(normalizedRole==='client'){
      return Object.freeze({
        level,kind:'critical',label:'Revisión antes de entrenar',
        reason:'Tu contexto reciente requiere revisión de tu Coach antes de ajustar el entrenamiento.',
        coachReviewRequired:true,source:'adaptive-context',dataQuality:txt(evidence?.dataQuality,'limitada'),
        action:frozenAction(baseAction,{key:'review_wellbeing',label:'Revisar cómo estás hoy',area:'actividad',reason:'Tu Coach debe revisar el contexto reciente antes de modificar la sesión.'}),
      });
    }
    if(normalizedRole==='admin'){
      return Object.freeze({
        level,kind:'critical',label:'Revisión del Coach pendiente',
        reason:'El seguimiento del cliente requiere revisión profesional del Coach.',
        coachReviewRequired:true,source:'adaptive-context',dataQuality:txt(evidence?.dataQuality,'limitada'),
        action:frozenAction(baseAction,{key:'confirm_coach_review',label:'Confirmar revisión del Coach',area:'admin-clientes',reason:'El seguimiento del cliente requiere revisión del Coach.'}),
      });
    }
    return Object.freeze({
      level,kind:'critical',label:'Revisar antes de entrenar',
      reason:'El contexto adaptativo requiere revisión profesional antes de modificar la sesión.',
      coachReviewRequired:true,source:'adaptive-context',dataQuality:txt(evidence?.dataQuality,'limitada'),
      action:frozenAction(baseAction,{key:'review_before_training',label:'Revisar antes de entrenar',area:'expediente',reason:'El contexto reciente requiere revisión antes de modificar la sesión.'}),
    });
  }

  if(level==='reduced'||level==='simplified'){
    const label=level==='reduced'?'Revisar ajuste de sesión':'Revisar adherencia y sesión';
    if(normalizedRole==='client'){
      return Object.freeze({
        level,kind:'warning',label:'Seguimiento a revisar',
        reason:'Tu contexto reciente puede requerir un ajuste; tu Coach mantiene la decisión final.',
        coachReviewRequired:true,source:'adaptive-context',dataQuality:txt(evidence?.dataQuality,'limitada'),
        action:frozenAction(baseAction,{reason:'Tu contexto reciente puede requerir un ajuste; tu Coach mantiene la decisión final.'}),
      });
    }
    if(normalizedRole==='admin'){
      return Object.freeze({
        level,kind:'warning',label:'Revisión del Coach pendiente',
        reason:'El seguimiento del cliente requiere una revisión del Coach.',
        coachReviewRequired:true,source:'adaptive-context',dataQuality:txt(evidence?.dataQuality,'limitada'),
        action:frozenAction(baseAction,{key:'confirm_coach_review',label:'Confirmar revisión del Coach',area:'admin-clientes',reason:'El seguimiento del cliente requiere una revisión del Coach.'}),
      });
    }
    return Object.freeze({
      level,kind:'warning',label,
      reason:level==='reduced'?'El contexto reciente aconseja revisar el volumen o esfuerzo antes de confirmar la sesión.':'La adherencia reciente aconseja simplificar y revisar la siguiente sesión.',
      coachReviewRequired:true,source:'adaptive-context',dataQuality:txt(evidence?.dataQuality,'limitada'),
      action:frozenAction(baseAction,{key:level==='reduced'?'review_session_adjustment':'review_adherence_session',label,area:'expediente',reason:level==='reduced'?'Revisar volumen, esfuerzo y contexto antes de confirmar la sesión.':'Revisar adherencia y siguiente sesión antes de confirmar cambios.'}),
    });
  }

  return Object.freeze({
    level:'normal',
    kind:'clear',
    label:'Seguimiento al día',
    reason:txt(baseAction?.reason,'Mantener el seguimiento previsto.'),
    coachReviewRequired:false,
    source:'adaptive-context',
    dataQuality:txt(evidence?.dataQuality,'limitada'),
    action:frozenAction(baseAction),
  });
}
