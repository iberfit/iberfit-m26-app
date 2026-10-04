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
      title:'Hombros: patrón que se repite',
      evidence:Object.freeze([`Frontal ${front}°`,`Posterior ${back}°`]),
      meaning:'La misma dirección aparece tanto de frente como de espaldas, así que merece que la tengamos en cuenta.',
      action:'La observaremos también durante empujes, tracciones y ejercicios con carga antes de decidir si necesita alguna adaptación.',
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
      title:'Pelvis: patrón que se repite',
      evidence:Object.freeze(evidence),
      meaning:movementSupport
        ?'El hallazgo visual coincide con información obtenida en una tarea de movimiento, lo que aumenta su utilidad para explorar el patrón.'
        :'El hallazgo se repite en frontal y posterior, pero todavía es evidencia estática.',
      action:'La revisaremos durante sentadillas, zancadas y otras tareas funcionales. La fotografía por sí sola no justifica limitar ejercicios.',
    });
  }

  const ankleDifference=finite(mobility?.ankle?.asymmetryCm);
  if(ankleDifference!==null&&ankleDifference>0){
    add({
      id:'ankle-asymmetry-context',
      domain:'mobility',
      support:'functional_measurement',
      title:'Diferencia entre ambos tobillos',
      evidence:Object.freeze([`${ankleDifference.toFixed(1)} cm de diferencia en rodilla a pared`]),
      meaning:'Hay una diferencia medida entre ambos lados que puede ayudarnos a entender mejor cómo se mueve la persona.',
      action:'La volveremos a medir con el mismo protocolo y comprobaremos si realmente influye en sentadillas, zancadas o ejercicios a una pierna.',
    });
  }

  const lateralHeadLeft=finite(byId['left.headOffset']?.value);
  const lateralHeadRight=finite(byId['right.headOffset']?.value);
  const lateralTrunkLeft=finite(byId['left.trunkInclination']?.value);
  const lateralTrunkRight=finite(byId['right.trunkInclination']?.value);
  const lateralHeadDifference=lateralHeadLeft!==null&&lateralHeadRight!==null?Number(Math.abs(lateralHeadLeft-lateralHeadRight).toFixed(1)):null;
  const lateralTrunkDifference=lateralTrunkLeft!==null&&lateralTrunkRight!==null?Number(Math.abs(lateralTrunkLeft-lateralTrunkRight).toFixed(1)):null;
  if((lateralHeadDifference!==null&&lateralHeadDifference>0)||(lateralTrunkDifference!==null&&lateralTrunkDifference>0)){
    const evidence=[];
    if(lateralHeadDifference!==null)evidence.push(`Cabeza-hombro: ${lateralHeadDifference.toFixed(1)}° de diferencia`);
    if(lateralTrunkDifference!==null)evidence.push(`Tronco: ${lateralTrunkDifference.toFixed(1)}° de diferencia`);
    add({
      id:'lateral-view-difference',
      domain:'sagittal_geometry',
      support:'bilateral_visual',
      title:'Diferencias entre ambos lados',
      evidence:Object.freeze(evidence),
      meaning:'Las dos vistas laterales no son idénticas. Lo guardamos como referencia de partida, sin asumir que por sí solo sea un problema.',
      action:'En futuras evaluaciones repetiremos la captura de la misma forma para comprobar si estas diferencias se mantienen o simplemente varían con la postura del momento.',
    });
  }

  const trainingConsiderations=[
    'Tomar decisiones con el conjunto de la evaluación: movimiento, fuerza, síntomas y evolución pesan más que una foto aislada.',
    'En próximas evaluaciones repetiremos las fotos con la misma distancia, altura de cámara y posición de los pies para poder comparar de verdad.',
    'Usar estas medidas como punto de partida personal para seguir la evolución, no como una nota estética ni como un modelo universal de postura.',
  ];

  return Object.freeze({
    schema:'iri-photogrammetry-decision-support-v2',
    available:true,
    reviewRequired:findings.length>0,
    findings:Object.freeze(findings),
    trainingConsiderations:Object.freeze(trainingConsiderations),
    limitations:Object.freeze([
      'Estas medidas ayudan a orientar el entrenamiento, pero no son un diagnóstico médico.',
      'Una diferencia observada en una foto no demuestra por sí sola la causa de dolor, lesión o rendimiento.',
      'Una observación gana importancia cuando también aparece en el movimiento, la fuerza, los síntomas o evaluaciones repetidas y el Coach la confirma.',
    ]),
    medicalDiagnosis:null,
  });
}
