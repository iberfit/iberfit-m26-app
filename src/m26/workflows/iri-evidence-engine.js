function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function text(value,max=500){
  return String(value??'').replace(/\s+/gu,' ').trim().slice(0,max);
}
function meaningful(value){
  const normalized=text(value,300).toLocaleLowerCase('es');
  return Boolean(normalized)&&!['no','ninguno','ninguna','sin alteraciones','sin hallazgos','normal'].includes(normalized);
}
function metricMap(measurements={}){
  return Object.fromEntries((Array.isArray(measurements?.metrics)?measurements.metrics:[])
    .filter((item)=>item?.id)
    .map((item)=>[item.id,item]));
}
function sameSignedDirection(a,b){
  const first=finite(a),second=finite(b);
  return first!==null&&second!==null&&first!==0&&second!==0&&Math.sign(first)===Math.sign(second);
}
export function buildIriPhotogrammetryDecisionSupport({measurements={},quality={},draft={}}={}){
  const unavailable=quality?.level!=='completa'||quality?.validated!==true;
  if(unavailable){
    return Object.freeze({
      schema:'iri-photogrammetry-decision-support-v2',
      available:false,
      reviewRequired:false,
      findings:Object.freeze([]),
      trainingConsiderations:Object.freeze([]),
      limitations:Object.freeze(['La lectura integrada se habilita únicamente con cuatro vistas y análisis validado por el Coach.']),
      medicalDiagnosis:null,
    });
  }
  const byId=metricMap(measurements);
  const mobility=draft?.mobility||{};
  const squat=mobility?.assistedSquat||{};
  const findings=[];
  const add=(finding)=>findings.push(Object.freeze(finding));

  if(sameSignedDirection(byId['front.shoulderTilt']?.value,byId['back.shoulderTilt']?.value)){
    const front=Number(Math.abs(byId['front.shoulderTilt'].value).toFixed(1));
    const back=Number(Math.abs(byId['back.shoulderTilt'].value).toFixed(1));
    add({
      id:'shoulder-tilt-reproduced',
      domain:'postural_geometry',
      support:'repeated_visual',
      title:'Inclinación de hombros reproducida',
      evidence:Object.freeze([`Frontal ${front}°`,`Posterior ${back}°`]),
      meaning:'La misma dirección aparece en dos vistas independientes de la captura.',
      action:'Revisar control escapular y comportamiento durante patrones de empuje, tracción y carga antes de decidir una corrección.',
    });
  }

  if(sameSignedDirection(byId['front.pelvisTilt']?.value,byId['back.pelvisTilt']?.value)){
    const evidence=[`Frontal ${Math.abs(byId['front.pelvisTilt'].value).toFixed(1)}°`,`Posterior ${Math.abs(byId['back.pelvisTilt'].value).toFixed(1)}°`];
    const movementSupport=meaningful(squat?.lateralShift)||meaningful(squat?.knees)||meaningful(squat?.trunk);
    if(movementSupport)evidence.push('La sentadilla contiene una observación de control/compensación');
    add({
      id:'pelvis-tilt-reproduced',
      domain:'lumbopelvic_control',
      support:movementSupport?'multi_source':'repeated_visual',
      title:'Inclinación pélvica reproducida',
      evidence:Object.freeze(evidence),
      meaning:movementSupport
        ?'El hallazgo visual coincide con información obtenida en una tarea de movimiento, lo que aumenta su utilidad para explorar el patrón.'
        :'El hallazgo se repite en frontal y posterior, pero todavía es evidencia estática.',
      action:'Explorar control lumbopélvico y simetría durante tareas funcionales; no restringir ejercicios sólo por la fotografía.',
    });
  }

  const ankleDifference=finite(mobility?.ankle?.asymmetryCm);
  if(ankleDifference!==null&&ankleDifference>0){
    add({
      id:'ankle-asymmetry-context',
      domain:'mobility',
      support:'functional_measurement',
      title:'Diferencia bilateral de tobillo registrada',
      evidence:Object.freeze([`${ankleDifference.toFixed(1)} cm de diferencia en rodilla a pared`]),
      meaning:'Existe una diferencia funcional cuantificada que puede ayudar a contextualizar compensaciones observadas.',
      action:'Repetir con el mismo protocolo y comprobar su efecto real en sentadilla, zancadas y tareas unilaterales.',
    });
  }

  const lateralHead=finite(measurements?.summaries?.lateralHeadAsymmetryPercent);
  const lateralTrunk=finite(measurements?.summaries?.lateralTrunkAsymmetryPercent);
  if((lateralHead!==null&&lateralHead>0)||(lateralTrunk!==null&&lateralTrunk>0)){
    const evidence=[];
    if(lateralHead!==null)evidence.push(`Diferencia relativa cabeza-hombro ${lateralHead.toFixed(1)}%`);
    if(lateralTrunk!==null)evidence.push(`Diferencia relativa de tronco ${lateralTrunk.toFixed(1)}%`);
    add({
      id:'lateral-view-difference',
      domain:'sagittal_geometry',
      support:'bilateral_visual',
      title:'Diferencias entre vistas laterales',
      evidence:Object.freeze(evidence),
      meaning:'Las vistas laterales no son idénticas; la magnitud se conserva como dato descriptivo, no como umbral de patología.',
      action:'Repetir la captura con pies y cámara estandarizados antes de atribuir importancia a cambios pequeños.',
    });
  }

  const trainingConsiderations=[
    'Priorizar decisiones que estén apoyadas también por movimiento, fuerza, síntomas o repetibilidad; la foto aislada no manda el plan.',
    'Repetir futuras capturas con la misma distancia, altura de cámara, posición de pies y referencia de calibración.',
    'Usar las medidas como línea de base individual para seguimiento, no como puntuación estética ni estándar universal de postura.',
  ];

  return Object.freeze({
    schema:'iri-photogrammetry-decision-support-v2',
    available:true,
    reviewRequired:findings.length>0,
    findings:Object.freeze(findings),
    trainingConsiderations:Object.freeze(trainingConsiderations),
    limitations:Object.freeze([
      'Motor de apoyo a decisiones de entrenamiento; no emite diagnóstico médico.',
      'No infiere causalidad entre una asimetría estática y dolor, lesión o rendimiento.',
      'La relevancia aumenta cuando distintas fuentes de evidencia apuntan al mismo patrón y el Coach lo valida.',
    ]),
    medicalDiagnosis:null,
  });
}
